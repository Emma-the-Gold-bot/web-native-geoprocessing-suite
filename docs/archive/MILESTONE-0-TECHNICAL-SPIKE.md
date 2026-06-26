# Milestone 0 Technical Spike Plan — Web-native geoprocessing suite

## Purpose

Prove that the core loop of the browser-native spatial workbench can stand up under real implementation pressure.

Milestone 0 is not a product launch and not a polished prototype. It is a **feasibility spike** focused on the minimum integrated backbone:

1. load data
2. inspect it
3. render it on a map
4. browse it in a table
5. run a query
6. materialize a result as a new artifact

If this spine is brittle, everything else is theater.

---

## Milestone 0 goal

Demonstrate, end-to-end, that a browser app can:
- load at least one modern geospatial format and one simpler compatibility-friendly path
- show imported data in a map and table
- run an in-browser query over it
- produce a derived spatial result
- display that result as a first-class artifact in the same workspace shell

### Required success statement
A user can go from raw local file to derived map-visible result **without a backend**, while the app remains responsive and the artifact model remains legible.

---

## Scope boundary

## In scope
- one project workspace shell
- local file import for a minimal set of formats
- map rendering
- table preview
- query execution
- derived result materialization
- minimal source vs derived labeling
- minimal history/provenance events
- basic warning handling

## Out of scope
- full project persistence
- export polish
- advanced CRS remediation UX
- geometry operations beyond what is needed to prove a meaningful query/result loop
- collaboration
- plugin model
- raster/COG workflows
- point clouds
- complete warning taxonomy implementation

### Principle
Do the smallest thing that can falsify or validate the core thesis.

---

## Spike questions to answer

The spike should answer these technical questions, not merely produce a demo.

## Data / import questions
- Can we reliably load **GeoJSON** and **GeoParquet** in-browser with enough metadata retained for the workbench model?
- How expensive is preflight inspection relative to full import?
- What internal representation should be used after import?

## Query questions
- Can DuckDB-WASM query imported data cleanly enough for the intended SQL workbench experience?
- What is the easiest path to spatial-ish query output in Milestone 0?
- How should query results be materialized back into map-renderable artifacts?

## UI integration questions
- Can map, table, and query views stay synchronized without ugly state duplication?
- Does the shell model actually feel coherent under implementation?

## Performance questions
- Does the app remain responsive when importing and querying moderately sized files?
- Where do serialization costs and memory pressure show up first?

## Provenance/model questions
- Can a minimal history model explain source vs derived artifacts without becoming elaborate too early?

---

## Spike deliverables

## Deliverable 1 — Running browser prototype
A working prototype that supports:
- import local GeoJSON
- import local GeoParquet
- render imported spatial data on a map
- inspect rows in a table panel
- run a simple query
- materialize a result as a derived artifact
- show minimal source/derived distinction

## Deliverable 2 — Technical findings memo
A short engineering write-up capturing:
- what worked
- what was harder than expected
- bottlenecks encountered
- recommended architectural adjustments
- whether the chosen stack still looks correct

## Deliverable 3 — Implementation notes / backlog recommendations
A list of what Milestone 1 should prioritize based on spike outcomes.

---

## Recommended spike stack

This is not final architecture doctrine, just the most pragmatic stack to prove the thesis.

## Frontend shell
- **TypeScript**
- **React** preferred for speed of prototyping and ecosystem depth
- one-page shell with left rail / center map / bottom dock / right details pane

## Map
- **MapLibre GL JS**

Reason:
- fast path to a credible interactive map surface
- strong ecosystem familiarity
- enough capability for vector-first MVP work

## Table / grid
- lightweight React table/grid solution

Reason:
- table is necessary, but not where we should spend custom engineering in the spike

## Query engine
- **DuckDB-WASM**

Reason:
- central to the thesis
- if this is awkward, we need to know now

## Format loading
- **GeoJSON**: native JS/TS path
- **GeoParquet**: likely DuckDB-WASM and/or loaders.gl-assisted path depending what is easiest to integrate cleanly

### Important note
The spike should prefer the path that best proves product feasibility, not ideological purity.

## Provenance/history
- hand-rolled minimal local event model in app state

Reason:
- enough to prove the UX model
- avoids overbuilding a durable schema too early

---

## Candidate implementation strategy

## Strategy A — DuckDB-centered path
Use DuckDB-WASM as the main ingestion/query engine for GeoParquet and possibly for GeoJSON after normalization.

### Pros
- keeps query model close to intended product center
- reduces duplicate data engines
- good test of the actual core thesis

### Cons
- may complicate map rendering path
- may require conversion steps to make results easy to display

## Strategy B — Split ingest/render/query path
Use straightforward JS parsing for display, and register imported data separately into DuckDB for querying.

### Pros
- likely easier for early UI
- faster path to visible results

### Cons
- risks duplicated state and impedance mismatch
- may hide real integration pain until later

## Recommendation
Use a **hybrid but DuckDB-biased** approach:
- import into app-level artifact model
- register imported datasets into DuckDB for querying
- render from a map-friendly representation generated from the artifact model or query results

This is honest enough to expose integration pain without overcommitting to one internal representation too early.

---

## Minimal artifact model for the spike

Each artifact in the spike should carry:
- `id`
- `name`
- `kind` = source | derived
- `format`
- `spatial` boolean
- `geometryType` if spatial
- `rowCount` if known
- `crs` string or unknown
- `warnings[]`
- `originEventId`
- `tableName` if registered in DuckDB
- `mapLayerConfig` or render adapter reference

### Why this matters
Even the spike should preserve the project ontology. Otherwise the demo cheats and teaches us nothing.

---

## Minimal history model for the spike

Each event should include:
- `id`
- `type` = import | query
- `timestamp`
- `summary`
- `inputArtifactIds[]`
- `outputArtifactIds[]`
- `warnings[]`
- `details` (lightweight object)

### Must-have UX behavior
- import creates source artifact + import event
- query materialization creates derived artifact + query event
- selected artifact can show whether it is source or derived

That is enough for Milestone 0.

---

## Required user flows for the spike

## Flow A — Import GeoJSON
1. User opens app
2. Imports a GeoJSON file
3. App shows basic metadata + warnings if any
4. Data appears on map and in table
5. Source artifact appears in left rail

## Flow B — Import GeoParquet
1. User imports a GeoParquet file
2. App resolves enough schema/geometry metadata to show a useful artifact summary
3. Data appears on map and in table
4. Source artifact appears in left rail

## Flow C — Run query and materialize result
1. User opens SQL pane
2. Runs a query against imported table(s)
3. Result preview appears
4. User saves/materializes as derived artifact
5. Derived artifact appears in left rail + map + history

### Example query class
Keep it simple but spatially meaningful if feasible:
- attribute filter over spatial dataset
- select subset of columns + geometry
- optional bbox or simple spatial condition if available

Do not make the spike depend on advanced spatial SQL if that becomes the bottleneck.

---

## Technical tasks

## Task 1 — Bootstrap prototype shell
Build:
- left rail placeholder
- center map pane
- bottom dock with table + SQL tabs
- right panel placeholder/details

### Exit criteria
UI shell exists and can host state from imported/derived artifacts.

## Task 2 — Implement artifact store
Build in-memory app state for:
- artifacts
- selected artifact
- history events
- query draft/result state

### Exit criteria
Source and derived artifacts can be represented cleanly even before data loading is finished.

## Task 3 — GeoJSON import path
Implement:
- local file open
- parse
- basic metadata extraction
- map rendering
- table preview
- source artifact + event creation

### Exit criteria
GeoJSON path is reliable enough to use as baseline reference.

## Task 4 — GeoParquet import path
Implement:
- local file open
- metadata extraction
- table registration/queryability
- map-renderable representation
- source artifact + event creation

### Exit criteria
A real GeoParquet file can be loaded and meaningfully explored.

## Task 5 — DuckDB registration and query execution
Implement:
- register imported datasets as tables
- basic SQL editor + run button
- results preview

### Exit criteria
User can execute a basic query and inspect result rows.

## Task 6 — Result materialization
Implement:
- save current result as derived artifact
- render result on map if spatial
- add derived artifact to left rail
- create query event in history

### Exit criteria
Result stops being ephemeral and becomes a first-class object.

## Task 7 — Minimal provenance UI
Implement:
- source/derived badge in left rail
- simple history feed
- right-panel summary showing origin event and basic lineage

### Exit criteria
User can answer “what produced this?” for the spike result.

---

## Suggested sample data strategy

Use a deliberately small but meaningful set.

## Sample A — Small GeoJSON
Should be:
- spatial
- easy to render
- simple schema

Purpose:
- de-risk shell + parsing + map/table sync

## Sample B — Real GeoParquet
Should be:
- spatial
- moderate size, not toy-small
- realistic enough to expose columnar/query issues

Purpose:
- test the actual modern-format thesis

## Optional Sample C — GeoJSON with known warning
Example:
- missing CRS metadata
- mixed geometry types

Purpose:
- prove minimal warning plumbing

---

## Acceptance criteria

Milestone 0 is complete if all of these are true:

## Functional acceptance
- local GeoJSON import works
- local GeoParquet import works
- imported data can be viewed on a map
- imported data can be viewed in a table
- a SQL query can run against imported data
- a query result can be materialized into a derived artifact
- source vs derived is visible in UI
- minimal history records import and query-result creation

## UX acceptance
- shell remains coherent during these flows
- user does not lose context between import, query, and result creation
- warnings, if present, are visible rather than hidden
- derived result feels like a real object, not a console side effect

## Technical acceptance
- app remains responsive during normal spike flows
- no catastrophic main-thread freezes during representative file operations
- no fatal state-model contradictions between map/table/query/artifact views

---

## Non-goals and traps

## Trap 1 — overbuilding persistence
Do not spend the spike inventing the perfect project storage layer.

## Trap 2 — overbuilding provenance schema
Minimal but honest > comprehensive but imaginary.

## Trap 3 — chasing advanced spatial SQL too early
The spike needs meaningful querying, not full PostGIS cosplay.

## Trap 4 — spending too long on table/grid polish
The table just needs to be good enough to validate the workbench model.

## Trap 5 — building a general-purpose import framework
Build only enough import abstraction to support the chosen spike formats cleanly.

---

## Risks to watch during the spike

## Risk: GeoParquet rendering friction
If moving from GeoParquet/DuckDB result to map-renderable features is awkward, this is a key architectural signal.

## Risk: duplicated data representations
If app state, map state, and DuckDB state drift apart, we need to know early.

## Risk: UI shell complexity vs implementation speed
If the shell feels too heavy for the spike, it may indicate we should trim some UI ambitions for Milestone 1.

## Risk: memory blowups on import/query
This would validate the need for stricter streaming/columnar pathways earlier.

---

## Suggested execution order

1. shell + artifact/history state
2. GeoJSON import
3. map/table sync
4. DuckDB query path
5. result materialization
6. GeoParquet import
7. tighten provenance shell behavior
8. write findings memo

### Why this order
It gets a visible spine working early, then introduces the real modern-format difficulty before declaring victory.

---

## Exit memo questions

When the spike is done, answer these explicitly:
- Is DuckDB-WASM still the right center of gravity?
- What internal data representation felt least painful?
- Where did map/query/artifact state drift?
- What import path caused the most friction?
- What must change before Milestone 1?
- What should be cut or deferred from the MVP if the spike reveals too much complexity?

---

## Recommendation

Treat Milestone 0 as a falsification test of the product’s core claim.

If we can:
- load GeoJSON and GeoParquet
- query them in-browser
- materialize a derived artifact
- keep map/table/query/history coherent

then the workbench thesis is alive.

If that loop is clumsy, fragile, or too expensive, we should narrow or reframe before building the cathedral.
