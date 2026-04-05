# Geometry Operations Runtime Path - Implementation Memo

**Date:** 2026-03-18  
**Author:** Subagent investigation  
**Subject:** Browser-side geometry execution path for Milestone 1

---

## Recommended Runtime/Library Path

**Library:** ~~**Turf.js** (modular packages)~~ → **GEOS-WASM + PROJ-WASM** (see Milestone 1 direction)  
**Installation:** ~~`@turf/buffer`, `@turf/centroid`, `@turf/dissolve`, `@turf/bbox-clip`, `@turf/helpers`~~ (not used)

### Why Turf.js Was Investigated

> **⚠️ NOTE (2026-03-18):** This memo documents the Turf.js investigation from Milestone 0. The project has since decided **not** to use Turf.js as the canonical geometry foundation. The architecture will pursue GEOS-WASM + PROJ-WASM + DuckDB-WASM instead. This memo is retained as investigation record only.

1. **GeoJSON-native**: The codebase already stores artifacts as GeoJSON FeatureCollections. Turf.js operates directly on GeoJSON with no conversion overhead.

2. **Artifact/history model compatibility**: Geometry operations produce new GeoJSON that can be immediately wrapped in the existing `Artifact` type with proper provenance tracking (`inputArtifactIds`, `originEventId`).

3. **No WASM overhead**: Unlike DuckDB (already using WASM), Turf.js is pure JavaScript with smaller runtime cost for simple operations.

4. **Modular imports**: Only need specific packages rather than full bundle, reducing initial payload.

5. **DuckDB separation**: Geometry operations are analytical (buffer, centroid) rather than SQL-based. Keeping them client-side preserves the current DuckDB query path for tabular/attribute operations.

---

## Verified Operations (Historical - Not Used in Production)

| Operation | Package | Status |
|-----------|---------|--------|
| Buffer | `@turf/buffer` | ✅ Works - produces Polygon (spike only) |
| Centroid | `@turf/centroid` | ✅ Works - produces Point (spike only) |
| Dissolve | `@turf/dissolve` | ✅ Works - merges overlapping polygons (spike only) |
| Clip (bbox) | `@turf/bbox-clip` | ✅ Works - clips to bounding box (spike only) |

*These operations were verified during the Turf spike but are not part of the current architecture.*

---

## Likely File Touchpoints

1. **`src/lib/`** - New file: `src/lib/geometry.ts`
   - Wrapper functions for each geometry operation
   - Standardized error handling
   - Input validation

2. **`src/App.tsx`** - UI integration points:
   - New "Geometry" tab or button in SQL/query panel
   - Operation selector (dropdown: Buffer, Centroid, Dissolve, Clip)
   - Parameter inputs (distance for buffer, bbox for clip)
   - "Run" button triggering geometry operation
   - Result materialization flow (reuse existing `confirmMaterialize` pattern)

3. **`src/types.ts`** - May need to extend `EventType`:
   - Current: `'import' | 'query'`
   - Proposed: `'import' | 'query' | 'geometry'`

4. **`src/lib/wkb.ts`** - Unlikely to need changes; geometry ops work on GeoJSON, not WKB.

---

## Supported Assumptions

- **Input format**: GeoJSON FeatureCollection (existing artifact data format)
- **Coordinate system**: WGS84 (consistent with current CRS assumption)
- **Geometry types**:
  - Buffer: works on Point, LineString, Polygon, Multi*
  - Centroid: works on any geometry type
  - Dissolve: requires Polygon/MultiPolygon with overlapping geometry
  - Clip: bbox-based only (not arbitrary polygon clip)

- **Output**: New GeoJSON FeatureCollection, registered as derived artifact with provenance

---

## Unsupported / Known Limitations

1. **Clip is bbox-only**: `@turf/bbox-clip` only supports bounding-box clipping. True polygon-on-polygon clip is not available in Turf.js; would need JSTS for that.

2. **Dissolve edge cases**: Complex polygon boundaries may not merge correctly. The operation is simple and may fail on:
   - Non-overlapping polygons (no-op, returns original)
   - Disconnected boundaries
   - Complex topology

3. **No CRS transformation**: Turf.js assumes WGS84. Non-WGS84 inputs will produce incorrect results.

4. **Large datasets**: Turf.js runs on main thread. Large FeatureCollections (>10k features) may cause UI freeze.

5. **No curved geometries**: Turf.js doesn't handle geodesic (great circle) buffers; uses planar approximation.

---

## Major Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bundle size (1.5MB) | Medium | Use dynamic imports for geometry module; only load when needed |
| Performance on large data | Medium | Consider Web Worker for geometry ops; add loading state |
| Dissolve failures | Low | Document expected input; provide clear error messages |
| Clip limited to bbox | Medium | Document limitation; note future enhancement path (JSTS) |

---

## Recommended Next Implementation Step

**Phase 1 (Minimal viable):**

1. Create `src/lib/geometry.ts` with wrapper functions for buffer, centroid, dissolve
2. Add a simple "Geometry Operations" section in the SQL tab (or new tab)
3. Hardcode bbox clip for initial release (or skip if not critical)
4. Wire into existing artifact materialization flow

**Phase 2 (enhancements):**
- Add Web Worker for large dataset handling
- Dynamic import of Turf packages
- True polygon clip via JSTS if needed

---

## Validation (Historical)

- ✅ Turf.js packages installed and verified functional (spike)
- ✅ Production build passes (post-cleanup)
- ✅ All 4 target operations work in Node test environment (spike only)

*Post-cleanup: Extraneous Turf packages removed. Build still passes. Project ready for GEOS/PROJ path.*

---

*This memo represents investigation findings. Full implementation follows in subsequent workstreams.*
