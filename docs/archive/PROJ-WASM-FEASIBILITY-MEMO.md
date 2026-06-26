# PROJ-WASM Feasibility Spike Memo

**Date:** 2026-03-18  
**Author:** Coder subagent  
**Project:** web-native-geoprocessing-suite  
**Status:** ✅ PASSED - Proof-of-life validated

---

## 1. Recommended PROJ-WASM Package/Path

**Package:** `proj-wasm` (npm)  
**Version:** 0.1.0-alpha6

**Installation:**
```bash
npm install proj-wasm
```

**Why this package:**
- Official WebAssembly build of PROJ (cartographic projections library)
- ES6 module for clean browser/Node.js integration
- Built-in worker pool for parallel transformations
- Bundled `proj.db` (10MB) with full CRS definitions
- Maintained by willcohen (same as clj-proj project)
- Follows PROJ C API closely

**Alternatives considered:**
- **proj4js** (pure JS, not WASM) - Lower performance, older codebase
- **@cpp.js/package-proj-wasm** - Less maintained, fewer features

---

## 2. Startup/Initialization Model

**Code pattern:**
```typescript
import * as proj from 'proj-wasm';

// Initialize PROJ (must be called first)
await proj.init();

// Check worker mode
console.log(proj.getWorkerMode()); // 'pthreads' or 'single-threaded'
console.log(proj.getWorkerCount()); // Number of workers (default: 8)
```

**Observations:**
- Initialization is async and returns a Promise
- WASM binary (~3.7MB) and proj.db (~10MB) are bundled
- Auto-creates worker pool with 8 workers in pthreads mode
- Falls back to single-threaded if SharedArrayBuffer unavailable
- Works in Vite without special configuration

---

## 3. Worker Recommendation

**Recommendation:** Use the **built-in worker pool** (default behavior), consistent with the architecture brief.

**Rationale:**
1. **Built-in parallelization:** PROJ-WASM creates a worker pool automatically (8 workers)
2. **I/O-heavy operations:** CRS transforms involve coordinate math; workers prevent UI blocking
3. **No extra config needed:** Works out of the box with Vite

**Implementation path:**
- Create `src/workers/crs.worker.ts` (optional - may not need separate worker)
- Or use main-thread initialization with built-in workers for lighter footprint
- Use `postMessage` for communication via architecture brief's `SpatialWorkerBus`

**Worker mode options:**
| Mode | Description | Requires |
|------|-------------|----------|
| pthreads | 8 workers with SharedArrayBuffer | Cross-Origin Isolation headers |
| single-threaded | Fallback without threading | None |

For GitHub Pages/static hosting without isolation headers, use the included `coi-serviceworker.js` or fall back to single-threaded mode.

---

## 4. CRS Definition Strategy

**For browser-local app:**

| Approach | Pros | Cons |
|----------|------|------|
| **Bundled proj.db** | Full offline support, no network | Large bundle (~10MB) |
| **Network fetch** | Smaller initial bundle | Requires internet for first use |
| **Hybrid** | Bundled minimal, fetch on demand | More complex |

**Recommended: Bundled proj.db (default)**

- The `proj-wasm` package includes `proj.db` in the bundle
- All EPSG, ESRI, PROJ, OGC definitions available offline
- No configuration needed for basic CRS operations

**Network for high-accuracy transforms:**
```typescript
// Enable network for grid file fetching (default)
const ctx = await proj.contextCreate({ network: true });

// Disable for offline mode
const ctxOffline = await proj.contextCreate({ network: false });
```

**Common CRS codes (pre-bundled):**
- `EPSG:4326` - WGS84 (GPS coordinates)
- `EPSG:3857` - Web Mercator (Google Maps, OSM)
- `EPSG:32633` - UTM Zone 33N
- `EPSG:32610` - UTM Zone 10N
- `EPSG:2263` - NAD83 / New York Long Island (ft)

---

## 5. Request/Response Model

### For CRS inspection/metadata:
```typescript
// Get available authorities (EPSG, ESRI, PROJ, etc.)
const authorities = await proj.getAuthorities({});

// Get projections for an authority
const epsgProjections = await proj.getAuthorityProjections({ authority: 'EPSG' });
```

### For assign CRS:
```typescript
// No explicit "assign" - CRS is metadata on the artifact
// The artifact's CRS field stores the EPSG code
// No PROJ call needed for assignment (metadata only)
```

### For reproject geometry/data:
```typescript
// Create transformation
const transformer = await proj.projCreateCrsToCrs({
  source_crs: 'EPSG:4326',
  target_crs: 'EPSG:3857'
});

// Prepare coordinates (must be in [lat, lon, z, t] format for EPSG:4326)
const coords = await proj.coordArray(points.length);
await proj.setCoords(coords, points.map(p => [p.lat, p.lon, p.z || 0, 0]));

// Transform
await proj.projTransArray({
  p: transformer,
  direction: 1, // PJ_FWD (forward)
  n: points.length,
  coord: coords
});

// Read results
const results = [];
for (let i = 0; i < points.length; i++) {
  const [x, y, z] = await proj.getCoords(coords, i);
  results.push({ x, y, z });
}
```

---

## 6. Proof-of-Life Result

**Validation performed:** ✅ PASSED

```
[PROJ-WASM] Initializing...
proj-wasm: Loading PROJ resources...
proj-wasm: Loaded proj.db (10412032 bytes)
PROJ: worker script starting (8 workers)
PROJ initialized with worker pool: pthreads
[PROJ-WASM] Worker mode: pthreads
[PROJ-WASM] Worker count: 8

Test: EPSG:4326 -> EPSG:3857 (Boston City Hall)
✓ Input: [42.3601, -71.0589]
✓ Output: [-7910240.56, 5215074.24]
✓ Expected: [-7910240, 5215074] (within 100m tolerance)
```

**Validation summary:**
- Package installs and loads: ✅ Pass
- Initialization works: ✅ Pass
- Worker pool initializes (8 workers): ✅ Pass
- Coordinate transformation (WGS84 → Web Mercator): ✅ Pass
- TypeScript compiles: ✅ Pass
- Production build: ✅ Pass

---

## 7. Major Risks/Limitations

### Risk 1: Bundle Size
**Severity:** Medium  
**Description:** PROJ-WASM adds ~15MB total (3.7MB WASM + 10MB proj.db + 420KB JS).  
**Mitigation:** Use dynamic import to load only when CRS operations are needed. Already code-split by Vite.

### Risk 2: Alpha Package
**Severity:** Medium  
**Description:** `proj-wasm` is at version 0.1.0-alpha6 - API may change.  
**Mitigation:** Wrap PROJ calls in an abstraction layer (CrsEngine interface) so switching implementations later is manageable.

### Risk 3: Cross-Origin Isolation for Pthreads
**Severity:** Low  
**Description:** Full pthreads mode requires Cross-Origin Isolation headers.  
**Mitigation:** 
- Use `coi-serviceworker.js` for static hosting (GitHub Pages)
- Or rely on automatic fallback to single-threaded mode

### Risk 4: Coordinate Order Confusion
**Severity:** Medium  
**Description:** EPSG:4326 uses [lat, lon] but many APIs expect [lon, lat].  
**Mitigation:** Document clearly in CrsEngine interface. PROJ-WASM accepts [lat, lon] for EPSG:4326.

### Risk 5: Memory Management
**Severity:** Low  
**Description:** PROJ creates objects that must be freed.  
**Mitigation:** PROJ-WASM handles cleanup automatically in JS; no manual free needed.

### Risk 6: Network Dependency for High-Accuracy Transforms
**Severity:** Low  
**Description:** Datum transformations like NAD27→NAD83 need grid files from cdn.proj.org.  
**Mitigation:** Enable network by default; allow offline mode with reduced accuracy.

---

## 8. Recommended Next Implementation Step

**Step 1: Create CrsEngine interface**

Following the architecture brief's `CrsEngine` interface:
- `initialize()` - PROJ initialization
- `getCRSInfo(epsgCode)` - Query CRS metadata
- `transform(input, sourceEpsg, targetEpsg)` - Reproject geometry
- `assignCRS(input, epsgCode)` - Metadata-only (no PROJ call)
- `getSupportedTransforms()` - List available transforms

**Step 2: Implement GeoJSON reprojection helper**

The architecture specifies GeoJSON as the product boundary format:
```typescript
// Transform GeoJSON FeatureCollection between CRS
async function transformGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  sourceEpsg: string,
  targetEpsg: string
): Promise<GeoJSON.FeatureCollection>
```

**Step 3: Wire into existing artifact flow**

- Add CRS display in artifact details
- Add "Reproject" action to artifact context menu
- Create derived artifact with new CRS metadata

**Why this order:** Transform is the core CRS operation. GeoJSON handling comes next for boundary compliance. UI integration comes last.

---

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Added `proj-wasm` dependency |
| `src/types/proj-wasm.d.ts` | Created - TypeScript declarations |
| `src/lib/spatial/proj-spike.ts` | Created - Proof-of-life implementation |
| `src/lib/spatial/index.ts` | Updated - Export PROJ module |

---

## Validation Summary

| Check | Result |
|-------|--------|
| Package installs | ✅ Pass |
| Package loads | ✅ Pass |
| Initialization works | ✅ Pass |
| Worker pool (8 workers) | ✅ Pass |
| Transform WGS84→Mercator | ✅ Pass |
| TypeScript compiles | ✅ Pass |
| Production build | ✅ Pass |

---

## Conclusion

**Recommendation:** Proceed with `proj-wasm` for the CRS engine. The package is viable, builds correctly, and coordinate transformations work as expected.

The architecture brief's recommendation for a separate worker is satisfied by the built-in worker pool - no additional worker file needed unless we want explicit main-thread vs worker-thread control.

**Key considerations:**
- Use GeoJSON as the product boundary format (as specified in architecture)
- Wrap PROJ calls in CrsEngine interface for API stability
- Bundle proj.db for offline support
- Enable network by default for high-accuracy transforms

**Next milestone:** Implement CrsEngine interface and GeoJSON reprojection helper.
