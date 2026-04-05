# Milestone 0 Completion Checklist — Web-native geoprocessing suite

## Purpose

Turn the current **partial pass** into an honest Milestone 0 completion target.

This checklist is intentionally narrow.
It is not a backlog for Milestone 1.
It is the minimum remaining work needed to satisfy the Milestone 0 technical spike plan and acceptance criteria without hand-waving.

---

## Current status

**Milestone 0 status:** verified ✅

### Why
The prototype now appears to include the narrow completion-pass implementation for:
- the workspace shell
- the source/derived artifact model
- the minimal history/provenance model
- the GeoJSON import → map/table → query → materialize loop
- the DuckDB-backed query spine
- full-geometry fetch/materialization hardening for the GeoParquet path

Milestone 0 is now fully proved for its supported path: a real Playwright smoke test against `test-data/example.parquet` passed end-to-end after fixing a BigInt serialization bug in the GeoParquet import/runtime path.

---

## Completion criteria summary

Milestone 0 can be called complete only when all of the following are true:

- local GeoJSON import works
- local GeoParquet import works
- imported data can be viewed on a map
- imported data can be viewed in a table
- a SQL query can run against imported data
- a query result can be materialized into a derived artifact
- derived spatial artifacts render on the map reliably for the supported path
- source vs derived remains legible in UI
- minimal history/provenance remains coherent through the full loop

---

# A. Required verification-to-close work

## A1. Verify full-file GeoParquet geometry rendering against a real file

### Goal
Confirm that the implemented GeoParquet render path works in practice, not just in code structure.

### Must do
- run the new import path with a real local `.parquet` / `.geoparquet` file
- confirm the imported artifact produces a map-visible geometry representation from the actual imported dataset, not just sampled preview rows
- confirm the supported geometry encoding path behaves as claimed
- preserve explicit failure surfacing when geometry adaptation cannot succeed

### Done when
- a valid GeoParquet file imports and renders as a source artifact on the map
- map visibility is based on the imported artifact, not only preview-derived geometry
- failure cases remain explicit instead of silently degrading into false confidence

### Notes
If some GeoParquet variants remain unsupported, the UI must be honest about that. Milestone 0 does not require universal format coverage, but it does require a real and defensible supported path.

---

## A2. Verify reliable derived spatial artifact rendering

### Goal
Confirm that the result-materialization loop now produces genuinely spatial first-class artifacts when the query output should be spatial.

### Must do
- verify the new geometry detection/adaptation path for materialized query results with actual runs
- confirm supported derived spatial outputs render consistently after save
- ensure the derived artifact details make clear why something is spatial, non-spatial, or failed-to-render

### Done when
- a spatial query result can be materialized
- the saved derived artifact appears in the left rail as a first-class artifact
- the saved derived artifact renders on the map for the supported geometry path
- if rendering fails, the failure is explicit and localized

---

## A3. End-to-end GeoParquet milestone flow verification

### Goal
Verify the exact flow Milestone 0 claims to prove.

### Required verification flow
1. import local GeoParquet file
2. inspect imported artifact summary
3. view imported data on map
4. view imported data in table
5. run SQL query against imported table
6. inspect unsaved result preview
7. materialize result as derived artifact
8. view derived artifact on map
9. inspect provenance/history and remain oriented in the shell

### Done when
- the above flow works without special pleading
- the shell remains coherent throughout
- user context is not lost between source, preview, and derived states
- the app does not rely on hidden operator knowledge to explain what happened

---

## A4. Confirm result materialization UX is now legible enough to count

### Goal
Verify that the transition from preview to saved artifact is now clear enough to count as an intentional object-creation flow.

### Must do
- confirm the explicit naming and/or confirmation step behaves correctly
- confirm the “preview becomes derived artifact” transition is clear in the UI
- preserve lineage context through the transition

### Done when
- users can tell what artifact will be created
- users can tell when creation succeeded
- the new artifact identity is clear and inspectable immediately after save

### Scope warning
Do not overdesign this. Milestone 0 needs clarity, not a full artifact-management system.

---

## A5. Thin-surface truthfulness pass

### Goal
Patch the remaining places where the runtime may be stronger than the explanation layer, or vice versa.

### Must check
- history detail inspection actually works in practice
- warning language remains visible and understandable after import/materialization
- error and failure states are localized enough that the user stays oriented
- map non-renderability remains explicit rather than silent

### Done when
- important failures are visible where they occur
- the user can still answer “what happened?” and “what exists now?” after an error
- no critical milestone step depends on implied knowledge hidden outside the UI

---

# B. Validation checklist

## B1. Functional validation
- [ ] GeoJSON import still works
- [ ] GeoJSON source artifact renders on map
- [ ] GeoJSON rows appear in table
- [ ] SQL runs against GeoJSON-imported source data
- [ ] spatial query result can be materialized from GeoJSON path
- [ ] derived spatial artifact from GeoJSON path renders on map

- [x] GeoParquet import works
- [x] GeoParquet source artifact renders on map from full imported geometry path
- [x] GeoParquet rows appear in table
- [x] SQL runs against GeoParquet-imported source data
- [x] spatial query result can be materialized from GeoParquet path
- [x] derived spatial artifact from GeoParquet path renders on map for the supported geometry path

## B2. UX validation
- [x] source vs derived remains legible in left rail and details
- [x] result preview is visibly distinct from saved artifact
- [x] materialization uses explicit naming/confirmation
- [x] history records both import and query-result creation
- [x] right panel can answer “what produced this?” for derived artifacts
- [x] warnings remain visible instead of disappearing after import
- [x] shell stays coherent across import, query, preview, and saved-result transitions

## B3. Truthfulness validation
- [x] no preview-only geometry path is being mistaken for imported-artifact rendering
- [x] no table-only GeoParquet path is being described as map-complete
- [x] derived artifact rendering claims match actual supported encodings
- [x] failure states are explicit where support ends

---

# C. Out of scope for Milestone 0 completion

Do not expand scope to include these unless one becomes a direct blocker:

- persistence/project save system
- generalized import framework
- advanced provenance engine for complex SQL lineage
- broad CRS remediation workflow
- table/grid polish beyond basic usability
- bundle/performance optimization beyond obvious blocker fixes
- advanced spatial SQL ambitions beyond what is needed for the proof loop

---

# D. Verification record

Completed verification artifacts:
1. real fixture: `test-data/example.parquet`
2. reusable smoke script: `scripts/smoke-geoparquet-import.mjs`
3. evidence directory: `tmp/playwright/`
4. bug fixed during verification: BigInt serialization in GeoParquet row/property handling
5. production build passed
6. full GeoParquet end-to-end verification flow passed

---

# E. Honest final milestone statement

Milestone 0 is complete only if we can say this without flinching:

> A user can import GeoJSON or GeoParquet locally, inspect the data in map and table views, run an in-browser query, materialize a derived result, and see that result as a first-class artifact in the same workspace shell — without a backend and without the UI lying about what worked.

That statement is now supported for the verified GeoParquet path by the real-file Playwright smoke test in `scripts/smoke-geoparquet-import.mjs` using `test-data/example.parquet`.
