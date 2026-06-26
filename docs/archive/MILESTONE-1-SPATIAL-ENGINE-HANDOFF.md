# Milestone 1 Spatial Engine Handoff — GEOS-WASM + PROJ-WASM + DuckDB-WASM

## Purpose

Translate the revised Milestone 1 geometry/CRS direction into clean, coder-sized handoff chunks.

This document assumes a deliberate architecture choice:
- **DuckDB-WASM** remains the query/runtime tabular engine
- **GEOS-WASM** becomes the geometry engine
- **PROJ-WASM** becomes the CRS/reprojection engine
- **Turf.js is not the canonical geometry path**

The goal is to build the real spatial engine foundation now instead of layering Milestone 1 features on a temporary runtime.

---

## Architectural stance

### Product truth vs compute truth
- **Artifacts and events** remain product truth
- **DuckDB / GEOS / PROJ** remain compute truth
- adapters mediate between product state and runtime engines

### Guardrails
- Do not let provisional engine-specific semantics leak into UI or persistence
- Do not promise CRS repair/remediation beyond what the engine path can honestly support
- Do not let geometry feature tickets bypass the engine boundary
- Prefer worker-based execution for heavy geometry/CRS work

---

## Immediate reset tasks

### Handoff 1 — Remove or quarantine Turf spike residue
**Goal:** leave the repo clean enough that Turf does not become accidental architecture.

#### Deliver
- remove Turf dependencies from package manifests if they are not fully quarantined
- remove Turf-specific code paths if any landed beyond the investigation spike
- preserve the investigative memo only as recorded context
- verify the app still builds cleanly after cleanup

#### Acceptance
- no Turf dependency remains in product runtime code unless explicitly hidden behind a stable engine abstraction
- build passes

---

### Handoff 2 — Spatial engine architecture brief
**Goal:** define the real engine boundary before any geometry-op UI work proceeds.

#### Deliver
A concise design brief covering:
- `GeometryEngine` interface
- `CrsEngine` interface
- request/response types for geometry operations and reprojection
- worker model
- conversion boundaries between product artifacts and engine inputs/outputs
- where GEOS and PROJ initialize and live
- failure/warning model
- capabilities model

#### Acceptance
- clear internal API proposal exists
- file/module targets for implementation are named
- product semantics are separated from backend semantics

---

## Implementation tranches

## Tranche A — Engine boundary and runtime feasibility

### Handoff 3 — GEOS-WASM feasibility spike
**Goal:** prove the browser integration path for GEOS-WASM in this codebase.

#### Deliver
- viable package/runtime choice
- startup/initialization model
- worker or main-thread recommendation
- proof-of-life for at least buffer and centroid
- conversion strategy (GeoJSON/WKB/etc.)
- risks and limitations memo

#### Acceptance
- build passes if code changes are made
- memo written into project docs
- recommendation is concrete enough to implement against

### Handoff 4 — PROJ-WASM feasibility spike
**Goal:** prove the CRS/runtime path for browser-side reprojection and CRS metadata handling.

#### Deliver
- viable package/runtime choice
- asset/definition loading strategy
- support stance for common CRS transforms
- architecture for assign vs reproject workflows
- warning/failure model for ambiguous or unsupported CRS cases
- risks and limitations memo

#### Acceptance
- memo written into project docs
- path is concrete enough to design `CrsEngine` around

### Handoff 5 — Spatial engine scaffolding
**Goal:** implement the engine boundary and minimal runtime plumbing without yet shipping a full geometry toolbox.

#### Deliver
- engine interfaces/types
- worker scaffolding if chosen
- engine capability reporting
- geometry/crs request and result types
- adapter layer between artifacts and engine payloads
- no fake UI promises

#### Acceptance
- build passes
- current import/query/materialize/save/open flow still works
- future op tickets can target the new boundary directly

---

## Tranche B — First geometry operations on the real engine path

### Handoff 6 — Buffer vertical slice on GEOS-WASM
**Status:** completed

Buffer is now landed as a real vertical slice with:
- explicit operation entry point
- parameter input
- explicit output naming
- derived artifact creation
- operation history/provenance event
- persistence/reopen coherence
- explicit warnings around CRS ambiguity and approximation

### Handoff 7 — Centroid vertical slice on GEOS-WASM
**Status:** completed

Centroid is now landed using the same cleaned spatial seam and shared operation flow as buffer.

### Handoff 8 — Dissolve vertical slice on GEOS-WASM
**Status:** completed with hardening follow-up

Dissolve is now landed as:
- **global dissolve only**
- explicit warning that grouped dissolve is not supported
- tightened honesty around supported geometry families

Current honest support envelope:
- primary support: `Polygon`, `MultiPolygon`
- limited / cautionary support: `LineString`, `MultiLineString`
- not meaningfully supported: `Point`, `MultiPoint`

### Handoff 9 — Clip/intersect decision ticket
**Goal:** decide whether Milestone 1 should expose clip, intersect, or a narrower version based on the real GEOS path and current CRS architecture.

#### Deliver
- recommendation memo plus implementation if the path is honest

#### Acceptance
- no misleading “clip” shipped if semantics are weaker than users would reasonably expect
- support envelope must be stated more tightly than the truth, never looser

---

## Tranche C — CRS architecture enters the product surface

### Handoff 10 — CRS visibility and engine integration pass
**Status:** partially completed

What is now real:
- CRS state is modeled explicitly as `known`, `unknown`, or `missing`
- that distinction now survives into runtime behavior instead of existing only in type signatures
- assign-vs-transform semantics are separated at the engine layer

Remaining product-surface work:
- clearer CRS display in artifact/details UI
- fuller wiring to `CrsEngine` capabilities/state
- operation guards where CRS state should move from warning to refusal

### Handoff 11 — Reprojection vertical slice
**Status:** landed locally and locally runtime-verified; production deployment still depends on explicit host configuration

What is now real:
- a narrow PROJ-backed coordinate transformation path exists at the engine layer for common GeoJSON geometry families
- assign CRS and reproject geometry are now explicitly different concepts in code
- operation-derived artifacts are now registered into DuckDB and participate as first-class queryable artifacts
- a first-class reprojection workflow now exists on the product surface
- hardened local dev/runtime verification confirmed:
  - `crossOriginIsolated === true`
  - `SharedArrayBuffer` available
  - PROJ pthread worker pool initialized with 8 workers
  - no false-positive timeout warning after successful CRS engine initialization

What remains:
- production-host header strategy must still be applied per deployment target for full worker mode
- sharper product copy so reprojection availability and deployment/runtime assumptions are described precisely
- clear refusal behavior for unsupported transforms and unsupported geometry families

#### Acceptance
- one real reprojection workflow exists and is auditable without relying on hidden caveats or operator memory
- runtime claims must distinguish what is locally verified from what is still deployment-dependent

---

## Tranche D — Follow-on Milestone 1 work after engine foundation

After the spatial engine foundation is real, continue with:
1. FlatGeobuf import
2. map + table synchronization
3. history v1 hardening

These should now build on a cleaner architecture instead of competing with unresolved geometry/CRS substrate questions.

---

## Suggested coder dispatch order

1. remove/quarantine Turf residue
2. spatial engine architecture brief
3. GEOS-WASM feasibility spike
4. PROJ-WASM feasibility spike
5. spatial engine scaffolding
6. buffer vertical slice
7. centroid
8. dissolve
9. clip/intersect decision ticket
10. CRS visibility pass
11. reprojection vertical slice
12. FlatGeobuf import
13. map/table sync
14. history v1 hardening

---

## Management note

Do not hand coders a vague instruction like “implement geometry ops.”

Hand them bounded tasks that each do one of these:
- prove the engine path
- define the interface
- ship one vertical slice
- harden one trust-critical surface

That is how we avoid accidental placeholder architecture.
