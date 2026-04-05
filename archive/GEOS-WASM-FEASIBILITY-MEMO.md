# GEOS-WASM Feasibility Spike Memo

**Date:** 2026-03-18  
**Author:** Coder subagent  
**Project:** web-native-geoprocessing-suite  
**Status:** ✅ PASSED - Proof-of-life validated

---

## 1. Recommended GEOS-WASM Package/Path

**Package:** `geos-wasm` (npm)  
**Version:** 3.1.1  
**GEOS Version:** 3.13.0

**Installation:**
```bash
npm install geos-wasm
```

**Why this package:**
- Official WebAssembly build of GEOS (C++ topology library)
- Active maintenance (last update 2024+)
- Works in browser, Node.js, Bun, Deno
- Provides helper functions for GeoJSON conversion
- Exposes low-level GEOS C-API for full functionality
- TypeScript type definitions included

**Alternatives considered:** None - this is the primary WASM build of GEOS.

---

## 2. Startup/Initialization Model

**Code pattern:**
```typescript
import initGeosJs from 'geos-wasm';

const geos = await initGeosJs();
// geos is ready to use
```

**Observations:**
- Initialization is async and returns a Promise
- WASM file loads from CDN or bundled (handled by package)
- Build passed with bundled WASM (~1.5MB JS bundle)
- No additional configuration required for basic usage

---

## 3. Worker Recommendation

**Recommendation:** Use a **dedicated worker** for GEOS operations, consistent with the architecture brief.

**Rationale:**
1. **CPU-intensive operations:** GEOS geometry operations (buffer, centroid, etc.) can be computationally heavy
2. **Memory management:** GEOS uses manual memory allocation; running in worker prevents UI blocking during heavy operations
3. **Isolation:** Worker provides clean separation for error handling and memory lifecycle

**Implementation path:**
- Create `src/workers/geometry.worker.ts`
- Import and initialize GEOS in worker
- Use `postMessage` for communication (as per architecture brief's `SpatialWorkerBus`)
- Note: `geos-wasm` works in workers; no special bundler config needed for Vite

**Alternative (simpler):** For MVP/small datasets, main-thread initialization also works. Can optimize to worker later.

---

## 4. Geometry Conversion Strategy

**Boundary format:** GeoJSON (as specified in architecture brief)

**Conversion utilities provided by package:**
```typescript
import { geojsonToGeosGeom, geosGeomToGeojson } from 'geos-wasm/helpers';

// GeoJSON → GEOS (returns pointer number)
const geomPtr = geojsonToGeosGeom(geojsonGeometry, geos);

// GEOS → GeoJSON (returns GeoJSON object)
const resultGeoJson = geosGeomToGeojson(geomPtr, geos);
```

**Memory management (required):**
```typescript
// Allocate for strings when needed
const size = wktString.length + 1;
const ptr = geos.Module._malloc(size);
geos.Module.stringToUTF8(wktString, ptr, size);

// Always clean up
geos.GEOSGeom_destroy(geomPtr);
geos.Module._free(ptr);
```

**Strategy for this project:**
- Input: GeoJSON FeatureCollection (product truth format)
- Engine boundary: GeoJSON (using helper functions)
- Internal: GEOS geometry pointers
- Output: GeoJSON (for artifact creation)

---

## 5. Proof-of-Life Result

**Validation performed:** ✅ PASSED

Test executed in Node.js (representative of browser behavior):

```
Input: Polygon around San Francisco (0.05° x 0.05° square)

Buffer test (2km / 8 segments):
✓ Input: Polygon coordinates
✓ Output: Buffered Polygon with rounded corners
✓ Coordinates correctly expanded

Centroid test:
✓ Input: Polygon  
✓ Output: Point at center [-122.375, 37.775]
```

**Code verified:**
- `geos-wasm` package loads correctly
- `initGeosJs()` initializes successfully
- Helper functions work for GeoJSON ↔ GEOS conversion
- Buffer operation produces valid GeoJSON output
- Centroid operation produces valid GeoJSON Point

**Build validation:** ✅ `npm run build` passes  
**TypeScript:** ✅ No type errors

---

## 6. Major Risks/Limitations

### Risk 1: Manual Memory Management
**Severity:** Medium  
**Description:** GEOS-WASM requires manual pointer allocation/deallocation.  
**Mitigation:**封装 helper functions that handle memory automatically. The helper functions (`geojsonToGeosGeom`/`geosGeomToGeojson`) don't require manual cleanup, but direct GEOS calls do.

### Risk 2: Geodesic Buffer Accuracy
**Severity:** Medium  
**Description:** Buffer operates in coordinate units (degrees by default). True geodesic buffers require projection to a local coordinate system.  
**Mitigation:** For MVP, use degree-based approximation (1° ≈ 111km at equator). For production, implement D3 Geo projection workflow (see official GEOS-WASM buffer example uses `d3-geo`).

### Risk 3: Bundle Size
**Severity:** Low  
**Description:** GEOS-WASM adds ~1.5MB to JS bundle.  
**Mitigation:** Use dynamic import to load GEOS only when needed (geometry operations). Already code-split by Vite.

### Risk 4: Error Handling
**Severity:** Low  
**Description:** GEOS returns null pointers on failure; errors aren't thrown.  
**Mitigation:** Always check return values; translate null results to typed errors in engine interface.

### Risk 5: Worker Communication Overhead
**Severity:** Low  
**Description:** Serializing GeoJSON between main thread and worker has overhead.  
**Mitigation:** For small/medium datasets, acceptable. For very large datasets, consider transferring ArrayBuffers or using WKB internally.

---

## 7. Recommended Next Implementation Step

**Step 1: Create spatial engine scaffolding**

Create `src/lib/spatial/geometry-engine.ts` with:
- `GeometryEngine` interface (from architecture brief)
- Implementation wrapping `GeosWasmEngine`
- Proper error/warning result types

**Step 2: Add buffer UI vertical slice**

Using existing artifact model:
- Add "Buffer" action to artifact context menu
- Input: distance + units
- Output: new derived artifact with buffered geometry

**Step 3: Extend to centroid (same pattern)**

After buffer is proven:
- Add "Centroid" action
- Same artifact derivation pattern

**Why this order:** Buffer is more complex but has clear visual feedback. Centroid validates the simpler operation pattern.

---

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Added `geos-wasm` dependency |
| `src/lib/spatial/index.ts` | Created - module exports |
| `src/lib/spatial/geos-spike.ts` | Created - proof-of-life implementation |

---

## Validation Summary

| Check | Result |
|-------|--------|
| Package installs | ✅ Pass |
| Package loads | ✅ Pass |
| Initialization works | ✅ Pass |
| Buffer operation | ✅ Pass |
| Centroid operation | ✅ Pass |
| TypeScript compiles | ✅ Pass |
| Production build | ✅ Pass |

---

## Conclusion

**Recommendation:** Proceed with `geos-wasm` for the spatial engine. The package is viable, builds correctly, and operations work as expected.

The architecture brief's recommendation for separate workers is appropriate for production but the package works fine on main thread for MVP exploration. The GeoJSON helper functions simplify the boundary conversion significantly.

**Next milestone:** Implement buffer vertical slice following the artifact/derivation model.
