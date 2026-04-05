# Spatial Engine Architecture Brief

**Purpose:** Define the spatial engine boundary before GEOS/PROJ feature work proceeds.
**Stack:** DuckDB-WASM + GEOS-WASM + PROJ-WASM
**Date:** 2026-03-18

---

## 1. Module and Interface Structure

### Core Interfaces

```typescript
// src/lib/spatial/geometry-engine.ts
export interface GeometryEngine {
  readonly initialized: boolean;
  initialize(): Promise<void>;
  buffer(input: GeometryOperationInput, distance: number, units: 'kilometers' | 'miles'): Promise<GeometryOperationResult>;
  centroid(input: GeometryOperationInput): Promise<GeometryOperationResult>;
  dissolve(input: GeometryOperationInput, groupByField?: string): Promise<GeometryOperationResult>;
  clip(input: GeometryOperationInput, clipGeometry: GeoJSON.Geometry): Promise<GeometryOperationResult>;
  getCapabilities(): GeometryCapabilities;
}

export interface GeometryCapabilities {
  supportsBuffer: boolean;
  supportsCentroid: boolean;
  supportsDissolve: boolean;
  supportsClip: boolean;
  maxFeatureCount: number;
}
```

```typescript
// src/lib/spatial/crs-engine.ts
export interface CrsEngine {
  readonly initialized: boolean;
  initialize(): Promise<void>;
  getCRSInfo(epsgCode: string): Promise<CrsInfo | null>;
  transform(
    input: GeometryOperationInput,
    sourceEpsg: string,
    targetEpsg: string
  ): Promise<GeometryOperationResult>;
  assignCRS(input: GeometryOperationInput, epsgCode: string): Promise<GeometryOperationResult>;
  getSupportedTransforms(): Promise<TransformPair[]>;
}

export interface CrsInfo {
  name: string;
  epsg: string;
  proj4: string;
  areaOfUse?: string;
}
```

### Request/Response Types

```typescript
// src/lib/spatial/types.ts
export interface GeometryOperationInput {
  type: 'feature-collection' | 'geometry';
  data: GeoJSON.FeatureCollection | GeoJSON.Geometry;
  crs?: string;
}

export interface GeometryOperationResult {
  success: boolean;
  output?: GeoJSON.FeatureCollection;
  outputCrs?: string;
  warnings: WarningRef[];
  errors: GeometryError[];
}

export interface GeometryError {
  code: string;
  message: string;
  featureIndex?: number;
}

export interface TransformPair {
  source: string;
  target: string;
  available: boolean;
}
```

### Capability Reporting

```typescript
// src/lib/spatial/index.ts
export interface SpatialEngineCapabilities {
  geometry: GeometryCapabilities;
  crs: CrsCapabilities;
  initialized: boolean;
}

export interface CrsCapabilities {
  supportedProjections: string[];
  autoTransform: boolean;
}
```

### Warning/Failure Model

- **Warnings** are returned in `GeometryOperationResult.warnings` — these are non-fatal and may propagate
- **Errors** are returned in `GeometryOperationResult.errors` — these indicate partial/total failure
- **Result success** is determined by: `result.success = errors.length === 0 && output !== undefined`
- Warnings attach to derived artifacts; errors prevent materialization
- CRS ambiguity always produces a warning (never silent pass-through)

---

## 2. Worker Model Recommendations

### Recommendation: Separate Workers for GEOS and PROJ

| Engine | Worker Strategy |
|--------|-----------------|
| **GEOS-WASM** | Dedicated worker — geometry ops are CPU-intensive |
| **PROJ-WASM** | Separate worker — CRS transforms can block; PROJ data files load separately |
| **Main Thread** | UI shell orchestration only |

### Rationale
- GEOS can be memory-intensive; isolating prevents UI freeze
- PROJ requires `.proj` data file loading which is I/O-heavy; separate worker avoids blocking geometry ops
- If performance testing shows overhead, consolidate later — but start separated

### Communication Pattern

```typescript
// UI shell → spatial engines via typed message passing
// src/lib/spatial/worker-bus.ts

export class SpatialWorkerBus {
  private geometryWorker: Worker;
  private crsWorker: Worker;

  async buffer(input: GeometryOperationInput, distance: number): Promise<GeometryOperationResult> {
    return this.geometryWorker.postMessage({
      type: 'buffer',
      payload: { input, distance, units: 'kilometers' }
    });
  }

  async transform(input: GeometryOperationInput, source: string, target: string): Promise<GeometryOperationResult> {
    return this.crsWorker.postMessage({
      type: 'transform',
      payload: { input, sourceEpsg: source, targetEpsg: target }
    });
  }
}
```

---

## 3. Data Conversion Strategy

### Product Truth vs Runtime Truth

| Layer | Data Format | Owner |
|-------|-------------|-------|
| **Artifact (product)** | GeoJSON FeatureCollection | Artifact Store |
| **Engine boundary (runtime)** | GeoJSON or WKB | Spatial Engine |
| **Engine internals** | GEOS native / PROJ native | Engine workers |
| **DuckDB** | WKB stored in tables | Query Service |

### Conversion Boundaries

1. **Artifact → Engine Input**
   - Artifact `data` (GeoJSON) → `GeometryOperationInput`
   - Extract CRS from artifact `crs` field
   - No automatic CRS inference — require explicit user assignment if unknown

2. **Engine Output → Artifact**
   - `GeometryOperationResult.output` (GeoJSON) → new artifact `data`
   - Preserve input artifact IDs in `inputArtifactIds`
   - Record CRS in output artifact if transformed

3. **GeoJSON vs WKB at Boundary**
   - **GeoJSON is the product-contract format** — artifacts are GeoJSON
   - **WKB is the DuckDB/internal format** — use for storage/query optimization
   - GEOS/PROJ accept GeoJSON directly; minimal conversion needed at boundary

### What Stays Product Truth
- All `Artifact` instances
- All `HistoryEvent` instances  
- Saved queries
- Project state for persistence

### What Is Runtime Only
- Worker instances
- GEOS/PROJ in-memory state
- DuckDB connection
- MapLibre layer instances

---

## 4. Recommended Implementation Sequence

### Phase 0 — Architecture Setup (this brief)
- [x] Define engine boundaries
- [x] Define interfaces
- [x] Establish worker model
- [ ] **Create `src/lib/spatial/` directory structure**

### Phase 1 — Feasibility Spikes
1. **GEOS-WASM integration spike**
   - Verify package choice builds in browser
   - Confirm worker initialization works
   - Test single operation (buffer) with sample data
   - Document limitations and risks

2. **PROJ-WASM integration spike**
   - Verify package choice and PROJ data loading
   - Test single transform (WGS84 ↔ UTM)
   - Confirm CRS info lookup works
   - Document limitations

### Phase 2 — Engine Scaffolding
1. Create `src/lib/spatial/geometry-engine.ts` with stub implementation
2. Create `src/lib/spatial/crs-engine.ts` with stub implementation  
3. Set up worker files (`geometry.worker.ts`, `crs.worker.ts`)
4. Wire engine initialization into app startup
5. Add capability query to engine interface
6. Build adapter between artifacts and engine inputs

### Phase 3 — First Vertical Slices
1. **Buffer** — Complete flow: select artifact → set distance → preview → materialize → verify
2. **Centroid** — Same flow pattern
3. **Dissolve** — Same flow with optional groupBy
4. **CRS visibility** — Display CRS in artifact details, warn on unknown

### Phase 4 — Follow-On
- Reprojection slice
- Map/table sync improvements
- FlatGeobuf import

---

## 5. Risks and Design Constraints

### CRS Honesty
- **Never assume CRS** — require explicit CRS on artifacts or warn explicitly
- If CRS is unknown, geometry operations must warn before proceeding
- Do not silently default to WGS84 — this is a common source of silently wrong results

### Geometry Validity/Error Handling
- All geometry operations must return explicit success/failure state
- Invalid geometry should produce a clear error with feature index, not silently skip
- Large datasets should warn before blocking the worker

### Avoiding Engine-Specific Leakage
- GEOS/PROJ error codes and internal states must not surface to UI directly
- All engine errors translate to product-level warnings or errors
- CRS names and codes should come from PROJ but display names should be product-controlled

### Avoiding Placeholder Architecture
- Do not create stub interfaces that get "filled in later" — implement minimal real behavior upfront
- The engine boundary is real: artifact goes in, artifact comes out, nothing else leaks
- Every geometry operation should be traceable through the artifact/event model

### Specific Constraints
1. **No automatic CRS inference** — user must confirm or assign CRS
2. **No silent coordinate system assumptions** — warn on any CRS ambiguity
3. **Operation results always create derived artifacts** — never mutate in place
4. **Warnings persist through the artifact model** — not just runtime state

---

## 6. Concrete File/Module Targets

### New Files to Create

| Path | Purpose |
|------|---------|
| `src/lib/spatial/index.ts` | Public API exports, capability reporting |
| `src/lib/spatial/types.ts` | Shared types: OperationInput, OperationResult, errors |
| `src/lib/spatial/geometry-engine.ts` | GeometryEngine interface and implementation scaffolding |
| `src/lib/spatial/crs-engine.ts` | CrsEngine interface and implementation scaffolding |
| `src/lib/spatial/worker-bus.ts` | Worker message orchestration |
| `src/lib/spatial/adapters.ts` | Artifact ↔ engine input/output conversion |
| `src/workers/geometry.worker.ts` | GEOS-WASM worker entry point |
| `src/workers/crs.worker.ts` | PROJ-WASM worker entry point |

### Files to Modify (minimal)

- `src/types.ts` — Add `GeometryOperationInput` import from spatial module
- `src/App.tsx` — Add spatial engine initialization on startup
- `vite.config.ts` — Add worker build configuration if needed

### Suggested First Code Change
Create `src/lib/spatial/index.ts` with type exports only (no implementation). Verify build passes.

---

## Summary

This brief defines a clean boundary between product truth (artifacts, events, queries) and compute truth (GEOS, PROJ, DuckDB). The architecture:

1. **Keeps GeoJSON as the product-contract format** — artifacts are always GeoJSON
2. **Uses separate workers** for GEOS and PROJ to prevent UI blocking
3. **Requires explicit CRS** — no silent assumptions
4. **Returns structured results** with warnings and errors, not just geometry
5. **Creates derived artifacts** for all operation outputs

The implementation should proceed: architecture setup → GEOS spike → PROJ spike → scaffolding → first ops.

*This brief is design-only. No implementation code beyond this document.*
