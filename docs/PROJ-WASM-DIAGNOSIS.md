# PROJ-WASM Diagnosis and Resolution

**Project:** web-native-geoprocessing-suite  
**Last Updated:** 2026-03-20  
**Current Status:** ✅ Core reprojection path fixed and browser-verified

## Executive summary

The PROJ-WASM reprojection seam went through four distinct failures before it became trustworthy:

1. **Dependency optimization broke runtime asset loading**
   - Vite pre-bundling caused PROJ-WASM to load the wrong `proj.db` payload.
2. **Preview runtime resolved assets from the wrong path**
   - The real user path in preview reached `/node_modules/proj-wasm/dist/proj.db` and received HTML instead of SQLite.
3. **Coordinate order was wrong at the GeoJSON ↔ PROJ boundary**
   - GeoJSON `[lon, lat]` was being passed to PROJ as if it were `[lat, lon]`.
4. **Map framing treated projected coordinates as geographic display coordinates**
   - `fitBounds()` was being asked to consume projected meter coordinates as WGS84 lng/lat.

Those defects are now fixed.

What is true now:
- PROJ loads the real `proj.db` (~10.4 MB)
- PROJ initializes in `pthreads` mode with 8 workers in the hardened local runtime
- end-to-end reprojection `EPSG:4326 -> EPSG:3857` succeeds
- derived artifacts preserve truthful stored CRS metadata
- projected artifacts auto-frame on the web map through **display-only normalization** to WGS84 bounds

What is **not** true:
- the console is not perfectly quiet in headless browser runs
- some remaining MapLibre/WebGL messages are still environmental noise, not spatial-engine defects

---

## Final verified state

### Browser-verified success criteria

The current acceptance boundary is:
- import sample GeoParquet fixture
- run UI reprojection `EPSG:4326 -> EPSG:3857`
- confirm derived artifact exists: `example_reprojected_3857`
- confirm artifact details/history show `CRS: EPSG:3857`
- confirm correct `proj.db` load size in runtime logs
- confirm projected-artifact framing no longer throws `Invalid LngLat latitude value`

### Verified runtime signals

Observed in verified browser runs:
- `proj-wasm: Loaded proj.db (10412032 bytes)`
- `PROJ initialized with worker pool: pthreads`
- `[PROJ-WASM] Worker count: 8`
- `[App] Display-transformed bounds for projected CRS artifact: EPSG:3857 → WGS84`

---

## Root causes and fixes

## 1) Vite dependency optimization broke PROJ runtime assets

### Symptom
Early runtime checks showed PROJ loading a tiny bogus payload instead of the real database.

### Root cause
`optimizeDeps` pre-bundled `proj-wasm` incorrectly, which broke its runtime asset assumptions.

### Fix
In `vite.config.ts`:
- set `optimizeDeps: { exclude: ['proj-wasm'] }`
- set `base: './'`

### Why this mattered
This was the first necessary repair, but by itself it did **not** prove the real user-facing reprojection path was clean.

---

## 2) Preview runtime path loaded HTML instead of SQLite

### Symptom
In preview mode, reprojection failed with:

```text
SQLite error [ file is not a database ]
```

And logs showed:

```text
proj-wasm: Loaded proj.db (1395 bytes)
```

### Root cause
PROJ-WASM resolved runtime assets via `import.meta.url`, which pointed to:

```text
/node_modules/proj-wasm/dist/proj.db
```

Vite preview did not serve the source `node_modules/` tree, so that path returned an HTML fallback page instead of the SQLite database.

### Fix
In `vite.config.ts`:
- copy PROJ runtime files into both:
  - `dist/assets/`
  - `dist/node_modules/proj-wasm/dist/`
- allow preview serving from the copied location

### Verification
All relevant runtime copies now match the correct size:
- `public/proj.db`
- `dist/assets/proj.db`
- `dist/node_modules/proj-wasm/dist/proj.db`

And runtime logs now show the correct payload size:
- `10412032 bytes`

---

## 3) Coordinate order mismatch at the GeoJSON ↔ PROJ boundary

### Symptom
The browser emitted repeated:

```text
webmerc: Invalid latitude
```

### Root cause
GeoJSON coordinates are:
- `[longitude, latitude]`

For geographic CRS such as `EPSG:4326`, PROJ-WASM expects:
- `[latitude, longitude]`

So coordinates like `[-122.42, 37.78]` were being misread as if `-122.42` were the latitude.

### Fix
In `src/lib/spatial/proj-spike.ts`:
- swap input coordinates from GeoJSON `[lon, lat]` to PROJ `[lat, lon]` for geographic source CRS
- swap output coordinates back to GeoJSON order for geographic target CRS
- leave projected CRS coordinates untouched

### Verification
After this fix:
- reprojection still succeeded
- the `webmerc: Invalid latitude` warning storm disappeared from verified e2e runs

---

## 4) Map framing/render contract was wrong for projected artifacts

### Symptom
After reprojection was fixed, map framing still failed with:

```text
Invalid LngLat latitude value: must be between -90 and 90
```

### Root cause
MapLibre `fitBounds()` expects WGS84 lng/lat values.
Projected artifacts such as `EPSG:3857` store coordinates in meters, not degrees.

The app initially made two bad assumptions in sequence:
1. it validated projected coordinates as if they should fit geographic lon/lat ranges
2. even after removing that check, it still tried to pass projected meter coordinates into `fitBounds()`

### Final fix
A dedicated **display geometry normalization layer** was added in:

```text
src/lib/spatial/display-transform.ts
```

This layer:
- preserves the artifact’s stored CRS truth
- derives display-safe WGS84 bounds on demand for map framing
- keeps display normalization explicitly scoped to the map/display path

### Verification
After this fix:
- projected artifacts still preserve stored CRS like `EPSG:3857`
- the old `Invalid LngLat latitude value` failure disappears
- projected artifacts auto-frame on the web map via display-only normalization

---

## What remains

The remaining console noise in headless-browser verification is mostly environmental:
- `Could not compile fragment shader`
- `WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost`
- `GPU stall due to ReadPixels`
- occasional `Geometry exceeds allowed extent, reduce your vector tile buffer size`

These are tracked in:
- `docs/KNOWN-CONSOLE-MESSAGES.md`

They are not currently evidence of a broken reprojection contract.

---

## Files most relevant to the final state

- `vite.config.ts`
- `src/lib/spatial/proj-spike.ts`
- `src/lib/spatial/display-transform.ts`
- `src/lib/spatial/worker-bus.ts`
- `src/App.tsx`
- `scripts/e2e-reproject.mjs`
- `scripts/e2e-reproject-verify-map.mjs`
- `docs/KNOWN-CONSOLE-MESSAGES.md`
- `PROJ-WASM-PRODUCTION-READINESS.md`

---

## Bottom line

The important distinction is now clean:
- **stored artifact CRS truth** is preserved
- **operation truth** is preserved
- **display truth** is handled explicitly rather than implicitly

The reprojection seam is no longer “promising.” It is functioning and browser-verified.
