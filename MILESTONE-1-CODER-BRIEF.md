# Milestone 1 Coder Brief — Web-native geoprocessing suite

## Goal

Turn the verified Milestone 0 spike into a **usable vector workbench alpha**.

The alpha should let a real analyst:
- import supported vector data
- inspect it in a coherent workspace
- run and save queries
- perform a few basic geometry operations
- create derived artifacts
- save/reopen the project
- export useful results

without leaving the browser or losing trust in system truth.

---

## Priority order

## 1. Project persistence

### Deliver
- serializable project model
- save / reopen flow
- recovery of:
  - artifacts
  - history/events
  - saved queries
  - relevant active workspace state

### Constraints
- persist project truth, not runtime adapters
- DuckDB/map runtime should be reconstructed, not serialized raw

### Acceptance
- user can save, reload, reopen, and recover a coherent workspace

---

## 2. Export to GeoJSON / JSON

### Deliver
- export selected spatial artifact to GeoJSON
- export selected artifact to honest JSON where GeoJSON is not the right fit
- honest fidelity caveats where needed
- keep true GeoParquet export explicitly deferred until it is real

### Acceptance
- user can take a derived artifact back out of the workbench in a useful format

---

## 3. Saved SQL queries

### Deliver
- save named SQL queries
- reopen and rerun them
- preserve query text as part of derived artifact provenance
- basic query list/manage UI

### Acceptance
- user can keep and reuse a working query set inside the project

---

## 4. Spatial engine foundation + minimal geometry operations

### Runtime foundation
Milestone 1 geometry work should build on the project’s intended long-term stack:
- **DuckDB-WASM** for query/runtime tabular compute
- **GEOS-WASM** for geometry operations
- **PROJ-WASM** for CRS/reprojection architecture

A Turf.js spike may exist in the repo as investigative residue, but it is **not** the intended engine foundation. Back it out unless it is fully quarantined behind a stable engine abstraction.

### Deliver only this narrow set
- buffer ✅ landed
- dissolve ✅ landed as global dissolve only
- centroid ✅ landed
- convex hull ✅ landed on the narrow v1 single-input polygon/multipolygon contract with known stored CRS only and no source-attribute preservation
- envelope ✅ landed on the narrow v1 single-input polygon/multipolygon bounding-box contract with known stored CRS only, same-stored-CRS polygon output, and no source-attribute preservation
- simplify ✅ landed on the narrow v1 single-input polygon/multipolygon contract with known stored CRS only, user-provided tolerance interpreted in source CRS units, stored CRS preserved, source attributes preserved, and no auto-transform or topology-preserving claim
- area ✅ landed on the narrow v1 single-input polygon/multipolygon measurement contract with known stored CRS only, no auto-transform, no geodesic claim, measurement-table output, one row per input feature, `area_value` / `area_unit`, and square-meter output only on the current trusted planar-meter CRS allowlist
- clip ✅ landed on the narrow polygon-mask v1 contract
- intersect ✅ landed on the narrow polygon/polygonal-overlay v1 contract; do not broaden it beyond that shipped seam without explicitly earning it

### Required sequencing inside this priority
1. remove or quarantine Turf spike residue
2. define the spatial engine boundary
3. spike GEOS-WASM integration
4. spike PROJ-WASM integration
5. implement the narrow first op set on the real engine path

### Important
- treat geometry runtime integration as real scope
- do **not** wire feature code directly to provisional libraries
- do **not** promise full CRS remediation yet
- keep CRS visibility and warnings explicit
- distinguish `missing`, `unknown`, and `known` CRS state in actual runtime behavior
- keep `assign CRS` separate from actual reprojection logic
- distinguish what is locally runtime-verified from what is still deployment-dependent
- refuse dishonest operations when CRS ambiguity would poison results
- artifacts and events remain product truth; engines remain compute truth

### Acceptance
- user can create trustworthy derived artifacts from a small set of real geometry ops
- geometry/CRS work is visibly aligned with the long-term engine architecture rather than a throwaway runtime

---

## 5. FlatGeobuf import

### Deliver
- FlatGeobuf import path
- integrate with existing import review/runtime model
- keep GeoJSON export honest and keep the GeoParquet import path solid

### Acceptance
- alpha supports GeoJSON and honest JSON export, with GeoJSON / GeoParquet / FlatGeobuf as its deliberate import wedge

---

## 6. Map + table synchronization

### Deliver
- consistent active artifact selection
- stable focus/fit behavior
- better map/table/details coherence
- row/feature sync where practical

### Acceptance
- user can move between map and table without losing orientation

---

## 7. Operation history v1

### Deliver
- clearer event detail
- stronger artifact ↔ event linkage
- better warning carry-forward semantics
- clearer “what produced this?” answers

### Acceptance
- user can inspect project state and understand how current artifacts came to exist

---

## Explicit non-goals for Milestone 1

Do not let work drift into:
- shapefile / GPKG / KML / GPX
- deep CRS remediation
- full provenance graph / rerun engine
- collaboration / sync
- raster
- 3D / point clouds
- broad styling system
- major performance heroics unless blocking

---

## Recommended implementation order

1. persistence
2. export
3. saved queries
4. geometry runtime spike + minimal ops
5. FlatGeobuf import
6. map/table sync
7. history v1 hardening

---

## Engineering posture

- keep scope narrow
- prefer truthful behavior over broad claims
- use the existing artifact/history model as product truth
- do not let runtime adapters become hidden truth
- preserve Milestone 0 honesty: if something is partial, say so in the UI
