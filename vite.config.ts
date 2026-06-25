import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Plugin to copy PROJ-WASM files to assets directory with correct names
function projsyncPlugin() {
  return {
    name: 'projsync-plugin',
    closeBundle() {
      const srcDir = join(__dirname, 'node_modules', 'proj-wasm', 'dist')
      const destDir = join(__dirname, 'dist', 'assets')
      
      // Ensure assets directory exists
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true })
      }
      
      // Also create the node_modules path for preview server
      const nodeModulesDir = join(__dirname, 'dist', 'node_modules', 'proj-wasm', 'dist')
      if (!existsSync(nodeModulesDir)) {
        mkdirSync(nodeModulesDir, { recursive: true })
      }
      
      // Files to copy (without hashes so the library can find them)
      const filesToCopy = [
        'proj.db',
        'proj.ini',
        'proj-worker.mjs',
        'proj-emscripten.js',
        'proj-emscripten.wasm',
        'fetch-worker.mjs'
      ]
      
      for (const file of filesToCopy) {
        const srcPath = join(srcDir, file)
        if (existsSync(srcPath)) {
          // Copy to dist/assets/ (used by some code paths)
          copyFileSync(srcPath, join(destDir, file))
          // Copy to dist/node_modules/ (used by preview server for /node_modules/ path)
          copyFileSync(srcPath, join(nodeModulesDir, file))
          console.log(`[projsync] Copied ${file} to dist/assets/ and dist/node_modules/`)
        }
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), projsyncPlugin()],
  // Ensure PROJ-WASM resources are properly available in dev and build
  base: './',
  // Exclude PROJ-WASM from optimization - it has its own worker loading
  // and the optimizer causes issues with loading the correct proj.db
  optimizeDeps: {
    exclude: ['proj-wasm'],
  },
  // Copy PROJ-WASM static files to dist during build
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // In dev, we need to serve these files from node_modules
  server: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
    headers: {
      // COOP/COEP headers enable SharedArrayBuffer for PROJ-WASM multi-threaded mode
      // Without these: PROJ-WASM falls back to single-threaded execution
      // With these: PROJ-WASM gets 8-worker pool for parallel coordinate transforms
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // Allow serving files from node_modules for PROJ-WASM resources
      allow: ['..'],
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Serve PROJ-WASM from dist/node_modules in preview mode
    fs: {
      allow: ['..', 'dist'],
    },
  },
})
