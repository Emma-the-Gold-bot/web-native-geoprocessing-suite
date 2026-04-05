# Spatial Engine Scaffolding Repair Notes

**Date:** 2026-03-18  
**Status:** Build passes ✅

## Summary

Repaired TypeScript build failures in `src/lib/spatial/worker-bus.ts` that were preventing the project from compiling. The scaffolding now builds cleanly and the type contracts are honest.

## Issues Fixed

### 1. Loose Geometry Typing (SimpleGeometry → GeoJsonGeometry)

**File:** `src/lib/spatial/worker-bus.ts`

**Problem:** The `SimpleGeometry` type used `type: string` which is too loose to be compatible with `GeoJSON.Geometry`. This caused TypeScript errors when passing extracted geometries to the GEOS engine's `buffer()` and `centroid()` methods.

**Fix:** Replaced `SimpleGeometry` with a proper union type:
```typescript
type GeoJsonGeometry = GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon | 
  GeoJSON.MultiPoint | GeoJSON.MultiLineString | GeoJSON.MultiPolygon | 
  GeoJSON.Geometry;
```

Also updated `extractGeometry()` to properly cast the FeatureCollection data.

### 2. assignCRS Return Type Narrowing

**File:** `src/lib/spatial/worker-bus.ts`, line 244

**Problem:** TypeScript couldn't narrow `input.data` to `GeoJSON.FeatureCollection` inside the `if (input.type === 'feature-collection')` branch, causing a type error.

**Fix:** Added explicit type assertion:
```typescript
output = input.data as GeoJSON.FeatureCollection;
```

### 3. Removed Unnecessary FeatureCollection Check

**File:** `src/lib/spatial/worker-bus.ts`

**Problem:** The defensive check `firstGeom.type !== 'FeatureCollection'` was incompatible with the stricter typing (GeoJSON geometry types don't include FeatureCollection in their union).

**Fix:** Removed the redundant check since the type system now ensures correctness.

## Files Changed

- `src/lib/spatial/worker-bus.ts` - Fixed geometry typing and type narrowing issues

## Validation Performed

- ✅ `npm run build` passes (TypeScript compilation + Vite production build)
- ✅ No new warnings introduced
- ✅ User-facing app shell unchanged

## Remaining Caveats

The scaffolding remains honest about its capabilities:

- **Buffer/Centroid:** Implemented via GEOS-WASM ✅
- **Dissolve:** Not implemented (placeholder returns error)
- **Clip:** Not implemented (placeholder returns error)
- **CRS Transform:** Full GeoJSON reprojection not implemented (placeholder returns error)
- **CRS Query:** Basic CRS info available via hardcoded definitions

The `index.ts` exports honestly document what's implemented vs. what's pending. The GEOS and PROJ spikes are exported for validation/testing purposes but should not be considered production-ready APIs.

## Architecture Notes

The spatial engine uses:
- GEOS-WASM for geometry operations (buffer, centroid)
- PROJ-WASM for CRS operations (initialized but full coordinate transformation not wired)
- Worker bus orchestration (currently delegates to built-in worker pools)

This is still scaffolding - a clean substrate for future implementation.
