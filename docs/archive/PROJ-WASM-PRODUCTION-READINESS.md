# PROJ-WASM Production Readiness Assessment

**Date:** 2026-03-19  
**Author:** Coder subagent (excellence spike)  
**Project:** web-native-geoprocessing-suite  
**Purpose:** Decision-grade assessment of browser-local PROJ-WASM path

> **NOTE:** Detailed deployment configuration is now documented in [DEPLOYMENT.md](./DEPLOYMENT.md). This assessment remains for historical context and technical details.

---

## Executive Summary

The current PROJ-WASM integration **can be made production-worthy**, but requires explicit infrastructure changes and carries residual risks that must be acknowledged. The path is viable but not frictionless.

Since this memo was first drafted, the repo has gained concrete local runtime hardening and direct verification:
- dev/preview now serve COOP/COEP headers
- local runtime was directly verified with `crossOriginIsolated === true`
- `SharedArrayBuffer` is available locally
- PROJ initialized in `pthreads` mode with 8 workers in the hardened local runtime
- the earlier false-positive timeout warning after successful initialization has been removed
- **Deployment configs added for Vercel, Netlify, and static hosting (coi-serviceworker)**

**Recommendation:** Proceed with browser-local PROJ path with specific hardening measures detailed below, while distinguishing clearly between what is now locally verified and what still depends on production host configuration.

---

## 1. Current State Assessment

### What Exists
- `proj-wasm` v0.1.0-alpha7 installed
- Coordinate transformation functionality verified working in proof-of-life
- Built-in worker pool (auto-creates 8 workers)
- Automatic fallback to single-threaded mode when SharedArrayBuffer unavailable

### What Was Found
| Aspect | Current State | Assessment |
|--------|---------------|------------|
| Package | proj-wasm 0.1.0-alpha7 | ✅ Viable |
| Transform logic | ✅ Works | Verified |
| Worker pool | ⚠️ Conditional | Falls back to single-threaded |
| COOP/COEP headers | ❌ Not configured | Required for full threading |
| Bundle size | ~5MB (dist) | ⚠️ Large but acceptable |
| Cross-origin isolation | ❌ Not set up | Required for pthreads |

### Build Artifacts
- Main bundle: 4.95MB (gzipped: 1.33MB)
- PROJ worker: 19.73KB
- CSS: 73.23KB

---

## 2. Runtime Contract Requirements

### For Full Pthreads Mode (8 workers)
**Required Headers:**
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Required Environment Conditions:**
- Browser must support SharedArrayBuffer
- Page must be served with isolation headers
- No cross-origin iframes without proper CORS headers

### For Fallback Mode (single-threaded)
**Required Headers:** None  
**Required Environment:** Any modern browser

### Current Behavior
Without COOP/COEP headers:
- PROJ-WASM auto-detects lack of SharedArrayBuffer
- Falls back to single-threaded execution
- Transforms still work, just sequentially
- Console warning: "PROJ: worker script starting" still appears but in single-threaded mode

---

## 3. Deployment Environment Analysis

### Vercel
- ✅ Supports custom headers via `vercel.json`
- COOP/COEP can be configured

### Netlify
- ✅ Supports custom headers via `_headers` file
- COOP/COEP can be configured

### GitHub Pages
- ⚠️ Does NOT support custom headers directly
- ✅ Solution: `coi-serviceworker.js` (see below)
- Works reliably with service worker workaround

### Self-hosted (nginx, etc.)
- ✅ Full header control
- Trivial to configure COOP/COEP

### Local Development (Vite dev server)
- ✅ COOP/COEP now configured in `vite.config.ts`
- ✅ Local hardened runtime directly verified with `crossOriginIsolated === true`
- ✅ PROJ worker pool directly observed initializing in `pthreads` mode with 8 workers

---

## 4. Solution Options

### Option A: Force Single-Threaded (Simplest)
**Changes needed:**
1. None - already works as fallback

**Pros:**
- Zero infrastructure changes
- Works everywhere immediately
- No header configuration needed

**Cons:**
- Loses parallelism benefit
- Slower for large coordinate batches
- Single-threaded performance may be acceptable for MVP workloads

**Verdict:** Acceptable for MVP if performance is acceptable

### Option B: Add COOP/COEP Headers (Recommended)
**Changes needed:**
1. Add Vite plugin or server config for headers
2. Test in target deployment environment
3. Document header requirements for deployment

**Vite config for dev/server:**
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

**Pros:**
- Full 8-worker parallelism
- Better performance for batch transforms
- Deterministic runtime behavior

**Cons:**
- Deployment-specific configuration needed
- May break other cross-origin integrations
- Local dev won't have headers without config

**Verdict:** Recommended for production

### Option C: Use coi-serviceworker.js (For GitHub Pages/static hosting)
**Changes needed:**
1. Add coi-serviceworker.js to project
2. Import in index.html
3. No server config needed

```html
<script src="/coi-serviceworker.js"></script>
```

**Pros:**
- Works on GitHub Pages without header config
- Service worker intercepts and adds headers

**Cons:**
- External dependency
- Adds complexity
- May have subtle issues with some browsers

**Verdict:** Good fallback for static hosting

---

## 5. Risk Analysis

### Risk 1: Alpha Package API Stability
**Severity:** Medium  
**Description:** proj-wasm 0.1.0-alpha7 - API may change  
**Mitigation:** Wrap all PROJ calls in internal adapter layer (already exists via ProjWasmEngine class) to isolate app from API changes

### Risk 2: Bundle Size
**Severity:** Low-Medium  
**Description:** ~5MB bundle is large  
**Mitigation:** Already code-split by Vite; PROJ loads async. Acceptable for desktop-focused app

### Risk 3: Cross-Origin Isolation Not Present
**Severity:** Low (for fallback path)  
**Description:** Without headers, runs single-threaded  
**Mitigation:** Graceful fallback exists; transformation still works

### Risk 4: Coordinate Order Confusion
**Severity:** Medium  
**Description:** EPSG:4326 uses [lat, lon], many APIs expect [lon, lat]  
**Mitigation:** Well-documented in code; interface uses explicit parameter names

### Risk 5: Missing proj.db Features
**Severity:** Low  
**Description:** Some CRS metadata queries (getAuthorities) not available in this build  
**Mitigation:** Core coordinate transformation works; fallback to hardcoded CRS definitions for metadata

### Risk 6: Worker Initialization Race
**Severity:** Low  
**Description:** Worker pool init is async with 5s timeout  
**Mitigation:** SpatialEngine already handles timeout gracefully; logs warning but doesn't crash

---

## 6. Recommendation

### Primary Path: Keep and Harden Browser-Local PROJ

**Recommended Approach:**
1. **Add COOP/COEP headers** to vite.config.ts for production builds
2. **Document header requirements** for target deployment environments
3. **Keep fallback path** - single-threaded mode is acceptable for development/lower environments
4. **Consider coi-serviceworker** if GitHub Pages is a target deployment

### Specific Changes Required

#### 1. vite.config.ts - Add header configuration
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
```

#### 2. Document deployment requirements
Add deployment-specific header configuration to README.md for:
- Vercel (vercel.json)
- Netlify (_headers)
- GitHub Pages (coi-serviceworker.js)

### What NOT to Do
- ❌ Don't switch to a different PROJ package - proj-wasm is the best maintained
- ❌ Don't implement server-side PROJ - defeats the "web-native" goal
- ❌ Don't try to polyfill SharedArrayBuffer - not feasible
- ❌ Don't delay for "perfect" solution - current path works

---

## 7. Validation Performed

| Check | Result |
|-------|--------|
| Package installation | ✅ Pass |
| TypeScript compilation | ✅ Pass |
| Production build | ✅ Pass |
| Worker pool initialization | ⚠️ Requires COOP/COEP for full mode |
| Single-threaded fallback | ✅ Works without headers |
| Coordinate transformation | ✅ Verified (WGS84→3857, 4326→UTM) |
| Bundle size | ~5MB (acceptable for desktop) |

---

## 8. Conclusion

The PROJ-WASM path is **production-viable** with the following clarifications:

1. **It works today** - even in fallback mode, transforms execute correctly
2. **Headers enable full performance** - but aren't strictly required for functionality
3. **Deployment-specific config needed** - COOP/COEP must be configured for target host
4. **The alpha package is acceptable** - wrapped behind internal adapter, isolating app from API changes
5. **Bundle size is acceptable** - already code-split, async-loaded

The project should proceed with browser-local PROJ and add the header configuration as a deployment concern. The fallback single-threaded mode is a perfectly acceptable safety net for environments where headers cannot be configured.

## 9. 2026-03-20 Review Update: Runtime, Transform, and Display Contracts

A later end-to-end review found that earlier runtime verification had been incomplete: worker startup and correct asset-size checks were not enough to prove that the actual user reprojection flow used the same runtime path in preview.

### What was wrong

In preview mode, the active PROJ-WASM runtime resolved assets relative to `import.meta.url`, which pointed the library at:

- `/node_modules/proj-wasm/dist/proj.db`

Vite preview does not normally serve the source `node_modules/` tree. As a result, the library could receive a tiny HTML fallback page instead of the real SQLite database and fail with:

- `SQLite error [ file is not a database ]`

### What was changed

`vite.config.ts` was hardened so the build now copies the PROJ runtime files into both:

- `dist/assets/`
- `dist/node_modules/proj-wasm/dist/`

Preview serving was also adjusted so the copied preview-path location is actually available at runtime.

### What was revalidated

After that fix:

- `proj.db` loaded at the correct runtime size (`10412032 bytes`)
- PROJ initialized in `pthreads` mode
- 8 workers came up
- the real UI reprojection flow created a derived artifact with the expected output CRS:
  - `example_reprojected_3857`
  - `CRS: EPSG:3857`

### What this review ultimately proved

The acceptance boundary is now the right one. Browser verification no longer relies on transient UI copy and instead asserts on product truth:

- derived artifact creation
- operation history entry
- output CRS on the derived artifact
- correct runtime `proj.db` load size
- projected-artifact framing without `Invalid LngLat latitude` failure

### Key resolved defects

1. **Preview runtime path defect**
   - PROJ originally resolved to `/node_modules/proj-wasm/dist/proj.db` in preview and received HTML instead of SQLite.
   - Build/preview now provide the expected runtime asset path and the real `proj.db` payload.

2. **GeoJSON ↔ PROJ coordinate order mismatch**
   - GeoJSON `[lon, lat]` was being passed to PROJ geographic transforms as if it were `[lat, lon]`.
   - The transform boundary now swaps coordinates correctly for geographic CRS.

3. **Projected-artifact framing/render contract bug**
   - MapLibre `fitBounds()` expects WGS84 lng/lat, not projected meter coordinates.
   - The app now uses an explicit display-normalization layer to derive WGS84 bounds for framing while preserving truthful stored artifact CRS metadata.

### Current verified state

After these fixes:
- `proj.db` loads at the correct runtime size (`10412032 bytes`)
- PROJ initializes in `pthreads` mode with 8 workers in the hardened local runtime
- reprojection `EPSG:4326 -> EPSG:3857` succeeds in browser verification
- derived artifacts retain truthful CRS metadata such as `EPSG:3857`
- projected artifacts auto-frame on the web map through display-only normalization

Implication: browser-local reprojection is working **and** the artifact/display contract is coherent. Remaining console chatter is mostly renderer/headless noise rather than a broken spatial-engine seam.

---

## Files Inspected

| File | Purpose |
|------|---------|
| `package.json` | Dependency version |
| `vite.config.ts` | Build config (no headers) |
| `src/lib/spatial/proj-spike.ts` | PROJ implementation |
| `src/lib/spatial/crs-engine.ts` | CRS interface |
| `src/lib/spatial/worker-bus.ts` | Spatial engine orchestration |
| `PROJ-WASM-FEASIBILITY-MEMO.md` | Previous spike results |
| `SPATIAL-ENGINE-ARCHITECTURE-BRIEF.md` | Architecture spec |
| `MILESTONE-1-SPATIAL-ENGINE-HANDOFF.md` | Handoff requirements |

## Changes Made

The repo has now been hardened locally and for deployment:
- `vite.config.ts` serves COOP/COEP headers in dev and preview
- `optimizeDeps.exclude` was updated to avoid breaking PROJ runtime assets
- required PROJ runtime files were added to the public asset path
- **NEW:** `vercel.json` - Vercel deployment config with COOP/COEP headers
- **NEW:** `public/_headers` - Netlify deployment config with COOP/COEP headers  
- **NEW:** `public/coi-serviceworker.js` - Service worker for static hosting fallback
- **NEW:** `index.html` - Includes coi-serviceworker script (safe for all hosts)
- **NEW:** `DEPLOYMENT.md` - Comprehensive deployment guide

These changes were sufficient to move the local runtime from merely plausible to directly verified, and provide deployment configs for all likely production hosts.

---

*Assessment completed: 2026-03-19*  
*Deployment configs added: 2026-03-19*
