# Production Deployment Guide

## Overview

This document describes the deployment requirements and options for the web-native geoprocessing suite, with specific focus on enabling the full PROJ-WASM multi-threaded coordinate transformation capability.

## Runtime Modes

### Full Mode (Multi-threaded PROJ)
- **Workers:** 8 parallel workers
- **Headers Required:**
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- **Capability:** Full parallel coordinate transformations
- **Detection:** `crossOriginIsolated === true` in browser
- **Locally verified:** yes, in the hardened local dev/runtime path

### Fallback Mode (Single-threaded)
- **Workers:** None (main thread only)
- **Headers Required:** None
- **Capability:** Coordinate transformations work but sequentially
- **Detection:** Automatic when SharedArrayBuffer unavailable

Both modes are fully functional. Full mode provides better performance for batch coordinate transformations.

## Deployment Options

### Option 1: Vercel (Recommended)

**Status:** ✅ Verified - Native header support

Files required (already included):
- `vercel.json` - Configures COOP/COEP headers at edge

Deploy:
```bash
npm run build
npx vercel deploy --prod
```

The `vercel.json` already contains the required header configuration.

---

### Option 2: Netlify

**Status:** ✅ Verified - Native header support

Files required (already included):
- `public/_headers` - Configures COOP/COEP headers

Deploy:
```bash
npm run build
npx netlify deploy --prod
```

The `_headers` file already contains the required header configuration.

---

### Option 3: Self-hosted (nginx/apache)

**Status:** ✅ Verified - Native header support

Configure your server to add these headers:

**nginx:**
```nginx
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
```

**Apache (.htaccess):**
```apache
Header set Cross-Origin-Opener-Policy "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
```

---

### Option 4: GitHub Pages / Static Hosting (Service Worker Fallback)

**Status:** ⚠️ Fallback - Limited reliability, not verified

Files required (already included):
- `public/coi-serviceworker.js` - Service worker that injects headers
- `index.html` - Already includes the service worker script

**Important limitations:**
- ⚠️ Not verified - this path has known browser compatibility issues
- Requires HTTPS (standard for GitHub Pages)
- First page load may trigger a reload to activate headers
- Some browsers in private/incognito mode block service workers
- Headers are injected at runtime rather than server-side, which may not work in all scenarios

**How it works:**
1. The service worker intercepts all requests
2. Injects COOP/COEP headers into responses
3. Falls back gracefully if already cross-origin isolated

---

### Option 5: Any Static Host with No Customization

**Status:** ⚠️ Fallback - Single-threaded only, verified

If you cannot configure headers and the service worker doesn't work:
- PROJ-WASM automatically detects lack of SharedArrayBuffer
- Falls back to single-threaded execution
- All coordinate transformations still work correctly
- Performance is reduced for large batch operations

## Verification

### Check Runtime Mode

Open browser console and check for these messages:

**Full Mode:**
```
[PROJ-WASM] Worker mode: pthreads
[PROJ-WASM] Worker count: 8
[ SpatialEngine] CRS engine ready (PROJ-WASM)
```

In the hardened local runtime, this mode has been directly verified together with:
- `crossOriginIsolated === true`
- `SharedArrayBuffer` available
- all 8 workers reaching `{status: ready}`
- no false-positive timeout warning after successful init

**Fallback Mode:**
```
[ SpatialEngine] CRS engine ready (PROJ-WASM)
```
(Note: No worker mode message in fallback)

### Programmatic Check

```javascript
console.log('crossOriginIsolated:', window.crossOriginIsolated);
console.log('SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');
```

## Files Reference

| File | Purpose | Deployment Target |
|------|---------|-------------------|
| `vite.config.ts` | COOP/COEP for dev/preview | Local development |
| `vercel.json` | COOP/COEP for Vercel | Vercel |
| `public/_headers` | COOP/COEP for Netlify | Netlify |
| `public/coi-serviceworker.js` | Header injection via SW | GitHub Pages, static hosts |
| `index.html` | Loads coi-serviceworker | All (safe to include everywhere) |

## Troubleshooting

### "CRS engine init timed out"
- Usually a false positive in React Strict Mode (dev only)
- First initialization actually succeeds
- Check console for "[SpatialEngine] CRS engine ready" - that's the truth

### "PROJ-WASM worker error"
- Headers not configured correctly
- Or running in browser that doesn't support SharedArrayBuffer
- Check: `window.crossOriginIsolated` should be `true`

### Transforms work but are slow
- Running in fallback (single-threaded) mode
- Configure headers for your deployment target
- Or accept fallback mode for reduced complexity

### Service worker won't register
- Requires secure context (HTTPS)
- Some browsers block in private mode
- Consider using a hosting provider with header support instead
