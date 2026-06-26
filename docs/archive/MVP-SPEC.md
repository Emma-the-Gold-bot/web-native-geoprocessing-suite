# MVP Spec — Web-native geoprocessing suite

## Purpose

Define a concrete MVP for a browser-native spatial data workbench: a product that makes common geospatial inspection, querying, transformation, and export workflows feel native to the web while preserving technical rigor around geometry, CRS, and provenance.

This MVP is intentionally **not** a full GIS suite and **not** a desktop replacement. It is the first sharp wedge.

---

## Product thesis

Most geospatial work does not begin with advanced remote sensing, 3D globe visualization, or giant workflow graphs. It begins with:

- opening a dataset
- understanding what it is
- checking CRS/schema/geometry health
- filtering, joining, and summarizing
- making a map
- exporting a result
- preserving how that result was produced

The MVP should do those things unusually well in the browser.

### Product one-liner

A **browser-native spatial workbench** for loading, inspecting, querying, transforming, and exporting vector geospatial data with reproducible project state.

### Target users

Primary:
- GIS analysts who live in QGIS/ArcGIS for everyday vector workflows
- data analysts who want SQL + maps without standing up a server stack
- civic/open-data researchers working with public geospatial datasets
- internal product/data teams that need quick geospatial inspection and transformation

Secondary:
- developers integrating geospatial workflows into web products
- journalists, policy researchers, and public-interest investigators using spatial data

### Non-goals for MVP

- full raster science platform
- point cloud processing
- full 3D scene editing / globe tooling
- real-time multi-user collaboration
- enterprise administration suite
- universal plugin marketplace
- full parity with QGIS processing toolbox

---

## The wedge

The MVP should compete on this loop:

1. **Open data quickly**
2. **Understand it immediately**
3. **Query/transform it safely**
4. **See the result on a map and in a table**
5. **Export and preserve provenance**

If the product cannot dominate this loop, broader platform ambition is theater.

---

## MVP capabilities

## 1. Project workspace

The application centers on a persisted project workspace stored locally in the browser.

### Requirements
- Create/open/save local projects
- Persist imported datasets, derived layers, queries, and settings
- Restore session state reliably after refresh/restart
- Keep a clear list of source datasets vs derived outputs

### Suggested implementation
- OPFS / IndexedDB-backed project storage
- project manifest with dataset inventory, operation history, and UI state

### Acceptance criteria
- User can close browser and reopen project without losing imported data references or analysis state
- Project state is portable/exportable in a defined format later, even if not in v1 UI

---

## 2. Data import and inspection

### Required import targets, phase-1 first-class
- GeoJSON
- FlatGeobuf
- GeoParquet

### Required compatibility imports, best-effort or phased within MVP
- Shapefile
- GeoPackage
- KML
- GPX

### Import UX requirements
- show file summary before full commit to project when feasible
- detect geometry type(s)
- detect/propose CRS
- inspect schema and row counts
- surface warnings for invalid/missing geometry or CRS ambiguity
- support local file open first; remote URL open later if straightforward

### Acceptance criteria
- User can load representative files in supported formats and inspect schema, geometry type, extent, and feature count
- System surfaces import warnings instead of silently coercing broken data

### Notes
This is one of the hardest parts of the product and should be treated as core, not scaffolding.

---

## 3. Map + table dual view

### Map requirements
- pan/zoom/explore loaded layers
- layer visibility and order
- basic style controls for fills, strokes, points, color ramps by attribute
- fit to extent / zoom to selected features
- inspect feature attributes on click/hover

### Table requirements
- browse attributes
- sort/filter columns
- select rows and synchronize with map selection
- inspect nulls/basic statistics where possible

### Acceptance criteria
- Any loaded vector layer can be explored in both table and map form with synchronized selection state

### Suggested stack
- MapLibre for primary map surface
- deck.gl only when needed for heavy overlays or specialized rendering

---

## 4. Spatial SQL workbench

This is the heart of the MVP.

### Requirements
- Query loaded datasets with SQL
- Save named queries
- Materialize query results as new layers/tables
- expose common spatial predicates/operations through SQL semantics where possible
- allow joins between spatial and non-spatial tables

### Example workflows
- intersect parcels with flood zones
- aggregate points by polygon
- filter features by attribute + bbox
- create buffers around points and export result

### Suggested implementation
- DuckDB-WASM for table/query engine
- geometry columns represented in a way compatible with downstream geometry ops and visualization
- spatial function layer via built-in support where available and/or companion WASM geometry execution

### Acceptance criteria
- A moderately technical user can execute saved, repeatable spatial queries against imported project data without a backend database

---

## 5. Core geometry operations

Expose a small, trustworthy set of high-value geometry tools.

### MVP operations
- buffer
- intersection
- union
- dissolve
- clip
- simplify
- centroid
- convex hull
- validity check / repair where feasible

### UX model
Do not hide these purely behind menus. They should be invokable via:
- SQL where appropriate
- a simple operation panel for common users
- saved operation history that records parameters

### Suggested implementation
- GEOS via WASM

### Acceptance criteria
- geometry operations behave predictably on non-trivial real data and surface failures/warnings clearly

---

## 6. CRS awareness and reprojection

### MVP requirements
- detect CRS metadata when present
- let user assign CRS when missing/ambiguous
- reproject vector layers between common CRSs
- surface transformation metadata in outputs/history

### Constraints
- grid-shift-heavy precision workflows may need to be limited or clearly caveated in MVP
- offline transformation asset strategy must be explicit

### Suggested implementation
- PROJ-backed reprojection path, subsetted to realistic MVP needs

### Acceptance criteria
- user can inspect source CRS, assign/fix CRS when missing, and reproject common datasets with clear audit trail

---

## 7. Export

### MVP export targets
- GeoJSON
- FlatGeobuf
- honest JSON for row-oriented outputs
- CSV for tabular outputs

True GeoParquet export remains deferred until there is a real encoder/runtime path for it.

### Requirements
- export source layer or derived layer
- preserve CRS metadata where format supports it
- record export action in history
- warn when export loses fidelity or CRS semantics

### Acceptance criteria
- user can take a derived result and export it in a usable form without hidden surprises

---

## 8. Provenance / operation history

This is the main thing that should make the product feel more trustworthy than a pile of scripts and less opaque than desktop GIS.

### Requirements
- every import, query, transform, reprojection, and export creates a history entry
- history entry stores:
  - timestamp
  - input dataset(s)
  - operation type
  - parameters
  - warnings/errors
  - output artifact reference
- user can inspect prior steps
- user can rerun a step or fork from earlier state later (full rerun can be partial in MVP if needed)

### Acceptance criteria
- user can answer “what produced this layer?” from inside the product

---

## 9. Performance guardrails

### Requirements
- avoid main-thread blocking on heavy operations
- stream/read in batches where possible
- set practical file-size expectations in UX
- fail gracefully when memory ceilings are exceeded
- provide progress states for imports and transforms

### Acceptance criteria
- the app remains responsive during representative operations on medium-large vector datasets

---

## Out-of-scope for MVP

- raster algebra beyond lightweight display support
- COG analysis workbench
- geocoding/routing tools
- point cloud support (COPC/EPT/Potree-class workflows)
- collaborative editing and shared live sessions
- plugin SDK for untrusted third-party extensions
- enterprise auth/admin
- report/layout engine comparable to desktop print composer

---

## Proposed module breakdown

## Module A — Project runtime
Owns:
- project manifests
- persistence
- state restoration
- asset registry

## Module B — Import pipeline
Owns:
- file open
- schema/geometry inspection
- CRS detection
- validation/warnings
- conversion into internal project representations

## Module C — Query engine
Owns:
- DuckDB-WASM lifecycle
- table registration
- query execution
- result materialization

## Module D — Geometry engine
Owns:
- GEOS-backed operations
- geometry validation
- non-SQL operation execution

## Module E — CRS engine
Owns:
- CRS metadata management
- assignments and reprojection
- transformation audit info

## Module F — Map/table presentation
Owns:
- rendering
- styling
- selection state
- synchronization between spatial and tabular views

## Module G — Provenance engine
Owns:
- operation history
- warnings/errors ledger
- rerun/fork metadata model

## Module H — Export pipeline
Owns:
- output generation
- metadata preservation
- export warnings

---

## Proposed technical architecture

### Frontend shell
- TypeScript
- React or Svelte
- componentized UI around project, map, table, query, history panes

### Workers
At minimum:
- import worker
- query worker
- geometry/CRS worker

Potentially later:
- export worker
- raster worker

### Core libraries / runtimes
- MapLibre
- DuckDB-WASM
- GEOS-WASM
- PROJ-backed WASM path
- targeted format readers/writers
- Arrow / GeoArrow friendly internal pipelines wherever possible

### Storage
- OPFS/IndexedDB for local persistence
- structured manifest + artifact references

### Data model
Each dataset/layer should carry:
- identity
- source kind
- schema
- geometry metadata
- CRS metadata
- storage reference
- lineage/provenance pointer
- visualization defaults

---

## Milestones

## Milestone 0 — feasibility spike
Goal: prove the spine works.

Deliver:
- load GeoParquet/GeoJSON
- render on map
- browse rows in table
- run a simple DuckDB query
- materialize result as a layer

Exit criteria:
- end-to-end demo with one modern format and one legacy-friendly format

## Milestone 1 — usable vector workbench alpha
Deliver:
- project persistence
- imports for GeoJSON / FlatGeobuf / GeoParquet
- map + table sync
- saved SQL queries
- basic geometry ops
- export to GeoJSON / honest JSON
- operation history v1

Exit criteria:
- a real analyst can do a small-to-medium vector workflow without leaving the browser

## Milestone 2 — compatibility hardening
Deliver:
- shapefile / GPKG / KML / GPX import paths
- CRS assign/fix UX
- validation and repair warnings
- better failure handling and progress reporting

Exit criteria:
- product survives messier real-world data instead of only curated demo files

## Milestone 3 — reproducibility and polish
Deliver:
- richer provenance model
- rerun/fork semantics
- export audit metadata
- performance tuning
- packaging improvements

Exit criteria:
- product feels trustworthy, not just impressive

---

## Major risks

## 1. Data ingestion complexity
Risk:
- real-world files are broken, weird, or huge

Mitigation:
- treat import as a product surface, not a background helper
- prioritize validation and warnings early

## 2. CRS/projection correctness
Risk:
- wrong answers destroy trust faster than crashes

Mitigation:
- make CRS visible everywhere
- log transformations explicitly
- constrain unsupported transformation paths instead of bluffing

## 3. Browser memory/resource ceilings
Risk:
- naive object materialization kills responsiveness

Mitigation:
- columnar/streaming data flow
- worker isolation
- chunked processing
- realistic UX limits

## 4. WASM packaging/distribution complexity
Risk:
- multiple runtimes, optional drivers, large binaries, codec variation

Mitigation:
- aggressively curate feature sets
- lazy-load heavy modules
- define supported import/export matrix clearly

## 5. Scope creep
Risk:
- trying to be QGIS, PostGIS, and a data platform simultaneously

Mitigation:
- keep MVP vector-first and workflow-centered
- maintain explicit non-goals

## 6. Provenance model under-design
Risk:
- history becomes decorative rather than operational

Mitigation:
- define operation model early, not as UI afterthought

---

## Success metrics

### Product metrics
- user can go from raw file to derived export inside one local project
- common workflows require no backend infrastructure
- history explains outputs clearly
- app remains responsive on representative medium-large datasets

### Strategic metrics
- analysts prefer this for quick vector workflows over opening desktop GIS
- developers see it as embeddable architecture, not only a standalone tool
- the product’s internal model can later support collaboration and more data types without rewrite

---

## Next recommended documents

1. reference architecture / data flow doc
2. format support matrix
3. operation history / provenance schema
4. import-validation UX spec
5. technical spike plan for Milestone 0
