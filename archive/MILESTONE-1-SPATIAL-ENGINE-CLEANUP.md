# Milestone 1 Spatial Engine Reset - Cleanup Note

**Date:** 2026-03-18  
**Task:** Turf.js cleanup and repo preparation for GEOS-WASM + PROJ-WASM architecture

---

## Summary of Turf-Related Findings

| Item | Status |
|------|--------|
| Turf in `package.json` | ❌ Not present (correct) |
| Turf imports in source | ❌ None found |
| Turf in `node_modules` | ⚠️ Extraneous packages present |
| Investigation memo | ✅ Exists (now updated as historical) |

The Turf spike investigation was completed but never wired into the runtime. Extraneous packages were discovered in `node_modules/@turf/` but were not referenced anywhere in the codebase.

---

## Files Changed

1. **`node_modules/@turf/`** - Removed extraneous Turf packages
2. **`package-lock.json`** - Updated via `npm install` to reflect clean state
3. **`GEOMETRY-RUNTIME-MEMO.md`** - Updated to document that Turf was investigated but not chosen; marked as historical record

---

## Validation Performed

| Test | Result |
|------|--------|
| `npm install` | ✅ Passes (removed 6 Turf packages) |
| Production build (`npm run build`) | ✅ Passes |
| Source code Turf scan | ✅ No Turf imports found |

---

## Remaining Risks

1. **Investigation memo divergence**: The GEOMETRY-RUNTIME-MEMO now has updated header notes but the body still describes Turf in detail. Future implementers may need to trim it or move it to a `docs/investigations/` folder.

2. **No geometry engine yet**: The repo is clean of Turf but has no geometry operations wired. The next task (GEOS/PROJ integration) will need to add new geometry runtime code.

3. **CRS handling**: Still assumes WGS84 throughout. PROJ-WASM will need to address this.

---

## Recommendations for Next Task (GEOS/PROJ Architecture)

1. **New geometry module**: Create `src/lib/geometry.ts` (or similar) for GEOS-WASM wrapper functions
2. **CRS handling**: Plan for coordinate transformation support via PROJ-WASM
3. **Consider test geometry**: If you need test data for GEOS operations, create small GeoJSON fixtures in `test-data/`
4. **Update docs**: Consider creating `docs/architecture/spatial-engine.md` to document the new direction
5. **Chunking**: The current build warning about large bundle size (1.4MB) may worsen with GEOS-WASM; consider dynamic imports for the geometry module

---

*Cleanup complete. Repo is ready for clean GEOS/PROJ implementation.*
