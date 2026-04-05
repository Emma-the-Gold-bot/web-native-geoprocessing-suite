#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(projectRoot, 'tmp', 'operation-validation-standalone');
const outFile = path.join(outDir, 'operation-validation-core.bundle.mjs');

await fs.mkdir(outDir, { recursive: true });

try {
  await build({
    entryPoints: [path.join(projectRoot, 'src/lib/operation-validation-core.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: outFile,
    sourcemap: false,
    logLevel: 'silent',
    external: [
      '@duckdb/duckdb-wasm',
      'proj-wasm',
      'geos-wasm',
      'apache-arrow',
      'node:*',
    ],
  });

  const mod = await import(pathToFileURL(outFile).href);
  const results = await mod.runOperationValidations();
  await mod.runAndLogValidations();
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.error(`Validation failures: ${failed.map(f => f.operation).join(', ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
