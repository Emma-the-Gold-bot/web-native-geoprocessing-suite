# Milestone 1 Priorities — Web-native geoprocessing suite

## Purpose

Set the first practical priorities for **Milestone 1 — usable vector workbench alpha**.

Milestone 0 proved the spine:
- local import
- map/table shell
- DuckDB-backed query
- derived artifact materialization
- basic provenance shell
- verified GeoParquet path for one honest supported flow

Milestone 1 should not try to become the whole product.
It should turn the verified spike into a browser workbench that a real analyst can use for a small-to-medium vector workflow without leaving the browser.

---

## Milestone 1 goal

Make the workbench **usable, saveable, exportable, and composable** for real vector analysis.

That means prioritizing the things that convert a convincing demo loop into a repeatable analyst workflow:
- persistence
- getting useful work back out of the system
- query reuse
- a minimal operation toolkit
- a slightly broader import wedge
- tighter workspace coherence
- history that is useful, not decorative

---

## Planning corrections from Milestone 0 review

This revision incorporates three hard lessons:

1. **Persistence still comes first.** A usable alpha cannot evaporate on refresh.
2. **Export moves up.** If users can create value but cannot take it out of the workbench, the alpha fails its own usefulness test.
3. **Geometry ops are riskier than they look.** They likely require a real geometry runtime integration step rather than a thin UI pass.

### Explicit Milestone 1 scope guards
- Keep the geometry-op set intentionally small.
- Treat FlatGeobuf as the only new format addition in this milestone.
- Do **not** promise full CRS remediation here.
- Do **not** let map/table sync bloat into desktop-GIS interaction cosplay.

---

## Priority order

## Priority 1 — Project persistence

### Why first
Milestone 0 proved the runtime loop, but everything still evaporates.
A usable alpha needs project state to survive reloads and reopen cleanly.

### What to deliver
- serializable project model for:
  - artifacts
  - history/events
  - saved query definitions
  - selected/active workspace state where useful
- open/save/reopen project flow
- clear saved/unsaved project state in the shell
- recovery from reload without silent data loss

### Notes
Keep runtime adapters out of persisted truth.
Persist project truth, then reconstruct DuckDB/map/runtime adapters from it.

### Exit signal
A user can import data, create derived artifacts, save the project, reopen it, and recover a coherent workspace.

---

## Priority 2 — Export to GeoJSON / JSON

### Why second
Once users can create derived artifacts, they need a way to take them back out of the workbench.
Without export, alpha usefulness is sharply capped.

### What to deliver
- export selected spatial artifact to GeoJSON
- export selected artifact to honest JSON where GeoJSON is not the right fit
- preserve enough metadata/provenance context to avoid dishonest outputs
- communicate export fidelity caveats where needed
- keep true GeoParquet export explicitly deferred until it is real

### Notes
Export polish can stay narrow.
The important thing is that outputs are real and trustworthy.
This should land early because it directly determines whether the alpha produces portable value.

### Exit signal
A user can create a derived artifact and export it in at least one practical workflow format without ambiguity.

---

## Priority 3 — Saved SQL queries

### Why third
The query pane is already real. The next leap is making analytical work reusable instead of disposable.

### What to deliver
- save named SQL queries in project state
- re-open and rerun saved queries
- show query-to-artifact relationship clearly
- preserve query text as part of derived artifact provenance
- basic query list / management UI

### Notes
Do not overbuild notebooks or workflow graphs yet.
Milestone 1 only needs query reuse strong enough to support iterative analysis.

### Exit signal
A user can keep a small stable set of saved queries inside the project and rerun them without rebuilding context from scratch.

---

## Priority 4 — Spatial engine foundation + basic geometry operations

### Why fourth
Milestone 1 needs at least a minimal “do work, not just inspect” geometry toolkit.
Without this, the product still feels mostly like a query viewer.

But this project is not optimizing for placeholders. The geometry/CRS runtime should be built as real infrastructure now so future work does not have to rip out a temporary engine later.

### Runtime decision
Milestone 1 geometry and CRS work should build on a clean spatial engine stack:
- **DuckDB-WASM** for query/runtime tabular compute
- **GEOS-WASM** for geometry operations
- **PROJ-WASM** for CRS/reprojection work

A short Turf.js spike was explored and is useful as investigative evidence, but it should **not** become the canonical geometry foundation for the product.

### Required first steps inside this priority
1. **Back out Turf spike residue** unless it is fully sealed behind a stable engine boundary. Do not let Turf-specific semantics leak into the app.
2. **Define the spatial engine boundary** so the product talks to engine interfaces, not library-specific calls.
3. **Spike GEOS-WASM integration** for first target ops.
4. **Spike PROJ-WASM integration** for CRS visibility / assignment / reprojection architecture.
5. Then ship the first narrow operation set on top of that real engine path.

### Recommended operation set
Keep this deliberately small and explicit:
- buffer ✅ landed
- dissolve ✅ landed as **global dissolve only** with explicit support-envelope warnings
- centroid ✅ landed
- convex hull ✅ landed on the narrow v1 single-input polygon/multipolygon contract with known stored CRS only and no source-attribute preservation
- envelope ✅ landed on the narrow v1 single-input polygon/multipolygon bounding-box contract with known stored CRS only, same-stored-CRS polygon output, and no source-attribute preservation
- simplify ✅ landed on the narrow v1 single-input polygon/multipolygon contract with known stored CRS only, user-provided tolerance interpreted in source CRS units, stored CRS preserved, source attributes preserved, and no auto-transform or topology-preserving claim
- area ✅ landed on the narrow v1 single-input polygon/multipolygon measurement contract with known stored CRS only, no auto-transform, no geodesic claim, measurement-table output, one row per input feature, `area_value` / `area_unit`, and square-meter output only on the current trusted planar-meter CRS allowlist
- clip ✅ landed on the narrow polygon-mask v1 contract
- intersect ✅ landed on the narrow polygon/polygonal-overlay v1 contract

Everything else waits, and intersect should not be broadened past its shipped v1 contract without explicitly earning that expansion.

### CRS stance for Milestone 1
Do **not** promise full CRS repair/remediation here.
Instead:
- preserve CRS visibility
- keep warnings explicit
- refuse dishonest operations where CRS ambiguity would make the output untrustworthy
- establish the PROJ-backed architecture now so CRS work does not remain decorative
- distinguish clearly between `missing`, `unknown`, and `known` CRS state in behavior, not just type signatures
- keep `assign CRS` and `reproject geometry` as separate concepts both in the code and in the product language

### Notes
Choose operations that:
- are analytically common
- fit the artifact model cleanly
- can produce understandable derived artifacts with lineage

Avoid turning this into a giant geoprocessing menu.

### Exit signal
A user can perform a few basic geometry transformations and treat the outputs as first-class derived artifacts, and those operations clearly sit on the project’s intended long-term spatial engine foundation rather than a provisional placeholder runtime.

---

## Priority 5 — Import set expansion for the alpha

### Why fifth
Milestone 1 needs a slightly broader import wedge than Milestone 0, but still not compatibility maximalism.

### What to deliver
- keep GeoJSON export honest and keep the GeoParquet import path solid
- add FlatGeobuf import
- improve import review language for supported paths
- support practical rename/select/import choices where needed

### Notes
Milestone 1 should prefer formats that reinforce the product’s intended center of gravity.
This is not the moment for shapefile archaeology yet.
FlatGeobuf is the only new import path that belongs in this milestone by default.

### Exit signal
The alpha supports a small, deliberate vector format set well enough that real users can bring work in without special pleading.

---

## Priority 6 — Map + table synchronization

### Why sixth
The workbench stops feeling trustworthy if map and table act like strangers.
But this is less alpha-critical than persistence, export, query reuse, and the first real transformation/export loop.

### What to deliver
- consistent artifact selection across left rail, map, table, and details
- row/feature selection sync where feasible
- stable fit/focus behavior on selection
- clearer non-spatial vs spatial table behavior
- visibility/state coherence when switching artifacts

### Notes
Do not chase full desktop-GIS behavior yet.
Milestone 1 needs obvious, trustworthy synchronization — not infinite map interaction features.

### Exit signal
A user can move between table and map without losing orientation or wondering which object is active.

---

## Priority 7 — Operation history v1

### Why seventh
History already exists, but Milestone 1 needs it to become useful in practice rather than merely present.

### What to deliver
- clearer event detail for import/query/operation/export events
- stronger linkage between artifacts and producing events
- better warning carry-forward semantics
- a history model that helps explain “what produced this?” and “what happened here?”

### Notes
Still avoid full rerun/fork semantics in Milestone 1 unless a very narrow version falls out naturally.
History v1 should improve trust and orientation first.

### Exit signal
A user can inspect a project and understand how its current artifacts came to exist.

---

## What not to prioritize yet

These matter, but they should not dominate the first Milestone 1 pass:
- full compatibility matrix (shapefile / GPKG / KML / GPX)
- deep CRS remediation workflows
- advanced provenance graph / rerun engine
- collaboration / sync / multi-user state
- raster workflows
- 3D / point cloud support
- broad styling system
- major performance heroics unless they block the alpha

---

## Recommended implementation sequence

1. project persistence
2. GeoJSON / GeoParquet export
3. saved SQL queries
4. spike geometry runtime integration if needed, then ship the minimal geometry-op set
5. FlatGeobuf import
6. map + table synchronization
7. operation history v1 hardening

---

## Alpha exit criteria

Milestone 1 is done when a real analyst can:
- import supported vector data
- inspect it in a coherent workspace
- run and save queries
- perform a few basic geometry operations
- generate derived artifacts with understandable lineage
- save and reopen the project
- export useful results

without leaving the browser or losing trust in what the system thinks is true.
