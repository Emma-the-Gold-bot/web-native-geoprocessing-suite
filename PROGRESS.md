# Progress — Web-native geoprocessing suite

## Purpose

Track actual implementation progress, not just plans.

This file is the living status board for the project. It should answer:
- what exists right now
- what works
- what is partial or stubbed
- what broke and got fixed
- what is next
- what risks or blockers remain

---

## Current phase

- **Phase:** Milestone 1 tranche 2 — first geometry operations on the spatial engine path
- **Status:** buffer, centroid, global dissolve, narrow grouped dissolve v1, narrow convex hull v1, narrow envelope v1, narrow simplify v1, narrow area v1, narrow perimeter v1, narrow compactness v1, and narrow attribute-join v1 are landed; CRS debt-paydown, reprojection workflow, and verified local PROJ runtime hardening landed; map-pane render truth for sample GeoJSON fixed; results/materialization contradiction fixed; in-pane map-unavailable states hardened; warning/info/provenance semantics cleaned up; smoke-map assertions strengthened; final QA pass now green after DOM and harness cleanup; CRS provenance tracking added with explicit confidence badges and UI display; reprojection validation tests added (4326 fixture, round-trip, unknown-CRS warning); preview-safe browser validation harness repaired so support-envelope and operation-validation browser runs now execute against built app runtime instead of broken `/src/*` preview imports; convex hull v1 now exists as a narrow single-input polygon/multipolygon path with known stored CRS required, one derived hull output, and no source-attribute preservation; envelope v1 now also exists as a narrow single-input polygon/multipolygon bounding-box path with known stored CRS required, one derived polygon output in the same stored CRS, and no source-attribute preservation; simplify v1 now also exists as a narrow single-input polygon/multipolygon path with known stored CRS required, user-provided tolerance interpreted in source CRS units, stored CRS preserved, source attributes preserved, and no auto-transform or topology-preserving claim; area v1 now also exists as a narrow single-input polygon/multipolygon measurement path with known stored CRS required, no auto-transform, no geodesic claim, a non-spatial measurement-table output, one row per input feature, and `area_value` / `area_unit` fields with square-meter output only on the current trusted planar-meter CRS allowlist; perimeter v1 now also exists as a narrow single-input polygon/multipolygon measurement path with known stored CRS required, no auto-transform, no geodesic claim, a non-spatial measurement-table output, one row per input feature, and `perimeter_value` / `perimeter_unit` fields with meter output only on the current trusted planar-meter CRS allowlist; compactness v1 now also exists as a narrow single-input polygon/multipolygon measurement path with known stored CRS required, no auto-transform, no geodesic claim, a non-spatial measurement-table output, one row per input feature, and `compactness_value` / `compactness_unit` fields with unitless output only on the current trusted planar-meter CRS allowlist because the underlying planar area/perimeter math must remain honest; Clip v1 now exists as a narrow polygon-mask topology path with refusal guards, browser-verified non-empty success, browser-verified empty-result handling, and cleaned empty-result DuckDB registration; narrow Intersect v1 now also exists on the shared topology seam for polygon/multipolygon source + overlay with known matching CRS, source-only attributes, DuckDB registration, full two-input history/provenance, and browser-verified non-empty + empty-result handling; attribute-join v1 now also exists as a narrow exact-equality left-join path on the shared two-input seam with one key per side, explicit right-field selection, first-match-only duplicate-right behavior, null fill for unmatched left rows, `join_` collision prefixing, and preservation of the left artifact's output kind / geometry semantics, with cheap runtime proof for both spatial-left and tabular-left outputs plus DuckDB registration/queryability truth; grouped dissolve v1 now closes the intended aggregation bridge at the product level, but the validation surface is still asymmetric: registry/UI/execution truth is present, while cheap/runtime/browser proof still lags behind the stronger coverage that clip/intersect/attribute-join already have; CRS confidence/provenance semantics after reproject, clip, and intersect now keep explicit output CRS truth from inheriting stale ambiguity; operation/query lineage is now more explicit in event detail; right-panel provenance rendering is grouped; first-form map↔table synchronization is landed; contradiction-hunting across reproject, clip, intersect, query lineage, and map↔table sync came back clean; the table inspection seam has now been polished with scroll-to-row, explicit clear-focus, richer focused-feature detail, cleaner focused-row styling, and a stronger inspection-focus banner; non-spatial output handling is now tighter across export/materialization/persistence/result-summary seams so measurement tables and other tabular outputs are treated as first-class artifacts instead of inheriting geometry-only export assumptions; and the current browser QA surface is green after updating stale topology assertions, fixing the last reprojection warning-propagation leak, and replacing the weak one-click map-focus smoke with a deterministic local click-grid proof for map→table focus
- **Last updated:** 2026-03-23

---

## Current summary

Milestone 1 tranche 1 is now **honestly complete for its scoped deliverables**.

What is real:
1. **Saved SQL queries** - Save, load, delete, and persist named SQL queries. Restored on project reopen.
2. **GeoJSON export** - Spatial artifacts can be exported in valid GeoJSON format.
3. **JSON export** - Honest row-based JSON export, replacing the earlier misleading pseudo-GeoParquet claim.
4. **Project persistence with usable restoration** - Artifact geometry/data is now persisted and restored on reopen. Map renders, table shows data, and queries run against restored DuckDB tables without re-import.

What is explicitly **not** claimed:
- true GeoParquet export is **not** implemented in this tranche
- localStorage persistence is acceptable for this alpha tranche, but not a final large-project storage architecture

Validation performed:
- Production build passes
- Milestone 0 GeoParquet smoke test passes (import → query → materialize flow verified)
- Milestone 1 tranche smoke test strengthened and passes:
  - Verified save/open cycle
  - Verified GeoJSON export produces valid FeatureCollection
  - Verified JSON export produces valid data
  - Verified data restoration: map renders, table shows rows, queries work
  - Verified saved queries persist and restore

Milestone 0 remains verified; Milestone 1 tranche 1 is now honestly complete for the scope it actually ships.

---

## What was implemented in Milestone 1 tranche 1

### Saved SQL queries — implemented
- Save current query with a name
- Load saved query into SQL editor
- Delete saved queries
- Saved queries displayed in left rail
- Persisted with project

### GeoJSON export — implemented
- Export to GeoJSON for spatial artifacts
- Export dropdown appears when a spatial artifact is selected

### Project persistence — implemented for tranche scope
- Serializable `ProjectState` type with version, name, artifacts, history, savedQueries, selectedArtifactId, activeTab
- `saveProject()` serializes and stores project state to localStorage
- `loadProject()` restores project state from localStorage
- artifact data is persisted so reopened projects remain usable
- DuckDB tables are re-registered on load so queryability returns
- New/Open buttons in topbar
- Unsaved changes indicator (•)
- Project name displayed in topbar

### Export functionality
- GeoJSON export for spatial artifacts
- honest JSON export for row-based data
- misleading pseudo-GeoParquet export removed
- true Parquet encoding explicitly deferred

### Key files added/modified
- `src/types.ts` - Added `SavedQuery`, `ProjectState` types
- `src/lib/persistence.ts` - New persistence module
- `src/lib/export.ts` - New export module
- `src/App.tsx` - Added persistence, export, and saved queries UI
- `scripts/smoke-m1-persistence.mjs` - New test for Milestone 1 features

---

## Workspace shell status

### Implemented
- top bar
- left rail
- center map pane
- bottom dock
- right panel

### Notes
The shell matches the planned Milestone 0 shape closely enough to validate state transitions:
- left rail = artifacts
- center = map
- bottom = table / SQL / results
- right = details / history

### Confidence
- **Good** for Milestone 0 shell validation

---

## Artifact model status

### Implemented
- in-memory `Artifact` type
- source vs derived distinction
- selected artifact state
- artifact metadata fields (format, row count, geometry type, CRS, warnings, origin event)

### Current limitation
- in-memory only
- no persistence yet
- no deeper lineage beyond basic input references on derived artifacts

### Confidence
- **Good** for Milestone 0

---

## History / provenance status

### Implemented
- in-memory `HistoryEvent` type
- import event creation
- query/materialization event creation
- history feed in right panel
- basic source vs derived explanation in right panel

### Partial / missing
- event detail is now inspectable from the history feed, but there is still no rerun/fork behavior
- warning scope is now distinguished as active vs inherited vs historical, but the model is still lightweight
- no filtering/searching history

### Confidence
- **Partial but honest**

---

## Import flow status

## Sample data path
### Implemented
- one-click sample GeoJSON load path
- import review overlay for sample data
- warning injection for missing CRS-like condition

### Confidence
- **Good** for shell and state-transition testing

## Local file import
### Implemented
- local file selection
- JSON parsing
- GeoJSON FeatureCollection recognition
- import review overlay
- unsupported-structure blocking state for non-FeatureCollection JSON

### Missing / partial
- no multi-layer support
- preflight scanning now has an explicit UI state, but the progress model is still simple rather than deeply staged
- warning consequence/recovery language is stronger, but partial/degraded import choices are still not implemented

### Confidence
- **Solid for Milestone 0 import honesty**

---

## Map integration status

### Implemented
- MapLibre map initialization
- source artifact rendering for polygon and point-like geometry
- selected artifact emphasis
- fit-to-extent for selected spatial artifact
- derived artifact rendering path

### Missing / partial
- no layer visibility toggles yet
- no styling controls yet
- no click/hover inspection yet
- no robust handling for all geometry families
- render failures are now surfaced explicitly, but recovery/remediation guidance is still thin

### Confidence
- **Good enough for Milestone 0 shell proof, with better truthfulness around failures**

---

## Table preview status

### Implemented
- table preview for selected artifact
- basic schema/row visibility
- query result preview table

### Missing / partial
- no sorting/filtering
- no selection sync with map
- non-spatial handling is minimal

### Confidence
- **Basic but useful**

---

## SQL / query status

### Implemented
- SQL editor tab
- run action
- running state
- error display path
- result preview state
- result materialization action
- **real DuckDB-backed query execution for registered source artifacts**
- **engine-backed derived-table registration during result materialization**
- **basic multi-source table awareness via DuckDB table-name introspection**

### Current reality
The SQL pane is now wired to DuckDB for registered artifacts, and query/materialization are less likely to lie about where results came from.

At the moment:
- imported source artifacts can be registered into DuckDB tables
- SQL runs against the registered DuckDB table(s)
- the app introspects referenced table names from DuckDB before execution
- query previews retain the referenced source artifact ids
- materialized results register themselves back into DuckDB as derived tables
- when a geometry/WKB column is present and decodable, materialized results can become spatial derived artifacts rather than only table-only previews

### Missing / partial
- complex SQL provenance beyond table-name introspection (for example CTE-heavy or indirect lineage cases)
- **result materialization now has explicit naming/confirmation step in the UX**
- GeoParquet-derived result handling across more geometry encoding variants
- richer engine-native spatial materialization beyond the current JSON-row registration loop

### What was added in completion pass (2026-03-18):
- explicit naming dialog before result materialization
- full geometry fetching from derived table for better map rendering
- JSON string geometry decoding support (in addition to WKB)

### Confidence
- **Strongly improved; the result pipeline is now materially more honest about source relationships, warning inheritance, and failure cases**

---

## DuckDB status

### Implemented
- dependency installed
- initialization helper scaffolded in `src/lib/duckdb.ts`
- source artifact registration into DuckDB via registered JSON payloads
- live SQL execution through DuckDB connection/query path
- result preview extraction from real DuckDB query output

### Missing / partial
- stronger abstraction around table registration lifecycle
- result materialization is still pragmatic rather than deeply engine-native
- stronger abstraction around table registration lifecycle is still desirable later

### Confidence
- **Integrated and now verified for Milestone 0 by a real-file GeoParquet smoke test**

---

## GeoParquet status

### Implemented
- first GeoParquet import review path
- GeoParquet preflight via DuckDB `read_parquet(...)`
- schema/table preview from real GeoParquet rows
- row count extraction during preflight
- GeoParquet registration into DuckDB on import
- imported GeoParquet source artifact appears in project as a table-first artifact
- **full-file geometry decoding from registered DuckDB table after import**
- **derived artifact rendering now fetches full geometry from DuckDB table**

### Current reality
The GeoParquet path is now **a genuine map-visible workflow** with full-file geometry rendering, not just preview-row rendering.

What works now:
- select local `.parquet` / `.geoparquet`
- inspect preview rows and row count in import review
- detect likely geometry/WKB columns
- decode preview geometries from WKB when possible
- import into workspace
- **query full geometry from registered DuckDB table for map rendering**
- register as DuckDB table
- run SQL against it
- inspect table/result flow in the shell
- render full decoded geometries on the map after import

### Confidence
- **Verified for Milestone 0 by real-file smoke test using `test-data/example.parquet` and the Playwright smoke script**

---

## Warning model status

### Implemented
- warning type in app model
- warning display in import review
- warning badge in artifact UI
- warning presence in history events

### Missing / partial
- no full taxonomy/severity rules wired in
- no active vs inherited vs historical distinction
- no remediation actions yet

### Confidence
- **Minimal but aligned with the plan**

---

## Support Envelope Tests

Added 2026-03-20 to explicitly validate and document the support boundaries.

### Test Coverage

The support envelope tests validate five key scenarios:

1. **WGS84 → Reproject → Display Frame**
   - Claim: Known WGS84 (EPSG:4326) artifact can be reprojected to EPSG:3857 with display bounds computed
   - Status: Tests exist; may fail in some environments due to PROJ database loading issues

2. **Projected → Display Transformation**
   - Claim: Projected (EPSG:3857) artifact uses on-the-fly WGS84 transformation for display bounds
   - Status: Tests exist; validates `needsDisplayTransformation()` and `getDisplayBounds()` with `wasTransformed` flag

3. **Unknown CRS Warning Path**
   - Claim: Artifact with CRS="unknown" emits CRS_UNKNOWN warning, no false certainty
   - Status: Tests exist; validates warning generation for unknown CRS state

4. **Missing CRS Warning Path**
   - Claim: Artifact with no CRS (undefined) is not treated as projected
   - Status: PASS - correctly handled

5. **Malformed Geometry Handling**
   - Claim: Malformed geometry produces warnings or graceful failure, not silent success
   - Status: PASS - correctly handled

### Test Files

- `src/lib/operation-validation.ts` - Contains `runEnvelopeTests()` and `runAndLogEnvelopeTests()`
- `scripts/test-envelope.mjs` - Preview-safe browser-based test runner using runtime-exposed `window.geoValidation`
- `scripts/run-operation-validations-browser.mjs` - Preview-safe browser validation runner for migrated operations using runtime-exposed `window.geoValidation`; now includes a truthful PROJ validation signal plus area measurement metadata/runtime truth on the current validation path
- `scripts/clip-refusal-browser-check.mjs` - Preview-safe browser check for the Clip v1 refusal seam
- `scripts/clip-success-browser-check.mjs` - Preview-safe browser check for Clip v1 non-empty success and empty-result behavior
- `scripts/check-crs-confidence-browser.mjs` - Preview-safe browser check for reproject/clip CRS confidence and provenance presentation
- `scripts/intersect-success-browser-check.mjs` - Preview-safe browser check for Intersect v1 non-empty success and empty-result behavior

### CRS confidence / provenance seam status (2026-03-22)

This seam was tightened after clip landed, because the shipped narrow path had become semantically truer than the UI and derived-artifact warnings were admitting.

What is now true:
- **Reproject-derived artifacts** with explicit output CRS no longer carry forward stale `CRS_UNKNOWN` / `CRS_MISSING` ambiguity as active or inherited output truth
- **Clip-derived artifacts** on the validated narrow path now preserve known derived CRS truth instead of collapsing into generic pessimism
- The product UI now distinguishes more cleanly between:
  - **stored CRS**
  - **display CRS**
  - **confidence**
  - **provenance / lineage**
  - **user-supplied source CRS** during reprojection
- Warning labels in the details/history panes now distinguish:
  - **active on artifact**
  - **inherited from input**
  - **recorded in history**
- Clip empty-result presentation is now explicit that the result artifact is intentionally empty and that stored CRS remains unchanged

Validation added:
- regression checks for reproject confidence propagation
- regression checks for clip confidence/provenance propagation
- preview-runtime browser verification via `scripts/check-crs-confidence-browser.mjs`

Validation result:
- preview/runtime browser check: **PASS**

Confidence:
- **Good on the current shipped narrow path**

### History / lineage hardening status (2026-03-22)

After tightening artifact CRS truth, the next seam tightened was lineage readability and epistemic honesty.

What is now true:
- **Operation events** now record more explicit lineage facts, including input/output artifact identity, stored CRS transitions, CRS confidence/provenance, and warning-code lineage
- **Clip events** now record source/mask/output lineage more explicitly, including contract facts like matching stored CRS and polygonal-input requirements
- **Query previews** now retain explicit referenced-table lineage instead of collapsing everything into a single joined string
- **Query materialization events** now record a provenance-strength classification:
  - `direct-artifact-match`
  - `partial-artifact-match`
  - `table-reference-only`
- The **right panel** now groups structured event details into readable sections rather than forcing users to reconstruct meaning from a flat detail dump
- Derived-artifact lineage now speaks more explicitly about the difference between:
  - output truth
  - input assumptions
  - recorded provenance

What improved in presentation:
- grouped event sections for inputs, outputs, CRS truth, provenance interpretation, warning lineage, and uncategorized remainder
- clearer statement that a derived artifact's stored truth comes from event output while assumptions/provenance remain inspectable in the originating event
- query result preview now uses the same explicit provenance-strength vocabulary as materialized history and derived-artifact lineage instead of switching to softer prose
- provenance-strength presentation is now humanized consistently across preview and event-derived lineage facts, with aligned labels/explanations rather than raw machine strings
- browser coverage now includes `scripts/test-lineage-preview-coherence.mjs`, which verifies preview/materialization/derived-lineage vocabulary coherence on the current direct-match path

Confidence:
- **Good for current workbench-scale provenance inspection; still conservative for complex SQL lineage**

### Operation substrate status (2026-03-22)

The project has moved from operation-by-operation implementation toward a reusable operation substrate.

What is now true:
- a product-level `src/lib/operations/` namespace now exists for operation substrate concerns
- current shipped operations now have a truthful product-level registry/capability declaration surface
- single-input operation seams have been separated from engine-centric helpers via extracted:
  - artifact builders
  - provenance/history builders
  - registry-driven single-input execution entrypoints
- the first migrated proof point is **centroid**, which now routes through the substrate seam instead of only bespoke helper wiring
- the two-input topology family has been split into clearer layers:
  - `topology-contract.ts` for family contract/validation/refusal concerns
  - `topology-execution.ts` for family execution/materialization/history concerns
- **clip** now sits on that shared topology seam without broadening its v1 contract
- **intersect** is no longer refusal-only; it now ships as a narrow **`partial`** v1 topology operation on the same substrate with browser-validated success and honest-empty-result behavior
- shared runtime machinery now exists for:
  - output CRS provenance construction
  - warning carry-forward / historical scoping
  - DuckDB artifact table registration
- the real single-input execution pipeline now lives in the operations substrate rather than being duplicated in `operation-helper.ts`; the spatial helper is now mostly a thinner facade for existing callers
- CRS policy is now more declarative at the operation-contract layer via shared policy vocabulary and validation helpers
- a transform-planning / deeper CRS architecture seam now exists at the contract layer without broadening shipped behavior
- validation architecture is now explicitly bucketed into:
  - `universal_contract`
  - `validated_local_runtime`
  so runtime-sensitive PROJ/browser instability is less likely to masquerade as architectural drift
- a standalone cheap validation harness now exists through `src/lib/operation-validation-core.ts` and `scripts/run-operation-validations.mjs`
- the DuckDB environment seam has been tightened so standalone validation can now prove intersect output registration/queryability truth in Node instead of failing on browser-worker assumptions
- the reprojection/runtime validation seam has been re-verified green on the current tree:
  - reproject pass
  - reproject confidence propagation pass
  - clip confidence propagation pass
  - `runProjValidation` true

What this is not yet:
- not yet a fully unified generic execution pipeline across single-input and topology-family operations
- not yet broad registry-driven UI/support rendering
- not yet a complete transform-aware topology system
- not yet a full standalone validation story for every browser/runtime-sensitive behavior

Confidence:
- **Good as a real substrate foundation with a shipped narrow intersect v1 and materially stronger cheap proof. The project is now in a position to choose forward-moving work again rather than pure substrate rescue.**

### Map + table synchronization status (2026-03-22)

The project now has the first honest form of cross-pane inspection coherence.

What is now true:
- **Table row selection** now drives feature highlight on the map for renderable spatial artifacts
- **Map feature click** now drives table-row selection for polygon, line, and point render paths
- The table pane now carries a lightweight **inspection focus** state so the user can tell when map/table/detail context is aligned on the same artifact and feature
- Artifact-wide auto-fit now backs off when an individual feature row is selected, so row-level focus is not immediately overridden by artifact-level framing

What this is not yet:
- not a full GIS inspection model
- not yet scroll-to-row, multi-select, hover linking, or feature-detail drilldown polish
- not yet a universal sync path for non-renderable or tabular-only artifacts

Confidence:
- **Good for the narrow first synchronization seam; more polish can follow without changing the core truth**

### Validation tier read

Current browser validation should be read in tiers:
- **preview-safe browser-runtime checks** — highest-value shipped-like checks against built preview output
- **universal contract checks** — behavior that must hold across environments
- **validated-local runtime checks** — allowed to rely on hardened local runtime support
- **informational/environment-sensitive notes** — diagnostic context, not universal product-truth claims

### Known Limitations

- PROJ-WASM database loading can fail in headless browser environments ("SQLite error: file is not a database")
- This is a deployment/configuration issue, not a code issue
- In local dev with proper CORS isolation, PROJ works correctly

### Confidence
- **Tests added; some failures expected in CI/headless environments due to PROJ DB loading**

---

## Support envelope by operation

This section is the short-form truth surface. Avoid flattening these into binary "supported" claims.

- **Buffer:** `validated_local` — implemented on the current engine seam with approximation and CRS caveats.
- **Centroid:** `validated_local` — implemented on the current engine seam for the current tested path.
- **Global dissolve:** `partial` — implemented as a narrow **global-only** aggregation path.
- **Grouped dissolve:** `partial` — implemented as a narrow v1 grouped-by-attribute aggregation path: one polygon/multipolygon source artifact, exactly one explicit grouping field, known stored CRS required, grouping-field-only attribute preservation, same stored CRS output, and no broader union semantics implied.
- **Convex hull:** `partial` — implemented as a narrow v1 single-input polygon/multipolygon path requiring known stored CRS, producing one derived hull in the same stored CRS, with no source attributes preserved.
- **Envelope:** `partial` — implemented as a narrow v1 single-input polygon/multipolygon path requiring known stored CRS, producing one derived polygon bounding box in the same stored CRS, with no source attributes preserved.
- **Simplify:** `partial` — implemented as a narrow v1 single-input polygon/multipolygon path requiring known stored CRS; user-provided tolerance is interpreted in source CRS units, stored CRS is preserved, source attributes are preserved, and there is no auto-transform or topology-preserving claim.
- **Area:** `partial` — implemented as a narrow v1 single-input polygon/multipolygon measurement path requiring known stored CRS, producing a non-spatial measurement table with one row per input feature, `area_value` and `area_unit` fields, and square-meter output only on the current trusted planar-meter CRS allowlist; it refuses misleading unit semantics instead of bluffing.
- **Perimeter:** `partial` — implemented as a narrow v1 single-input polygon/multipolygon measurement path requiring known stored CRS, producing a non-spatial measurement table with one row per input feature, `perimeter_value` and `perimeter_unit` fields, and meter output only on the current trusted planar-meter CRS allowlist; it refuses misleading unit semantics instead of bluffing.
- **Compactness:** `partial` — implemented as a narrow v1 single-input polygon/multipolygon measurement path requiring known stored CRS, producing a non-spatial measurement table with one row per input feature, `compactness_value` and `compactness_unit` fields, and unitless output only on the current trusted planar-meter CRS allowlist because the underlying planar area/perimeter math must remain honest; it refuses misleading unit semantics instead of bluffing.
- **Reproject / transform:** `verified=validated_local`, `runtimeSensitive=true` — real coordinate transformation exists, but broader runtime support depends on PROJ-WASM environment behavior.
- **Display transformation:** `environment_sensitive` — projected artifacts may be normalized to WGS84 for map display only; stored CRS metadata remains unchanged.
- **CRS assign:** `universal` — metadata-only; does not move coordinates.
- **Clip:** `partial` — implemented as a narrow polygon/multipolygon mask clip path requiring known matching CRS, with explicit refusal outside that contract and honest empty-result handling.
- **Intersect:** `partial` — narrow polygon/multipolygon source ∩ polygon/multipolygon overlay path is implemented on the shared topology seam, requires known matching CRS, preserves source attributes only, registers queryable output in DuckDB, records both inputs in history, and treats no-overlap as an honest empty result.
- **Attribute join:** `partial` — narrow exact-equality attribute join path is implemented on the shared two-input seam, left-join only, one key per side, explicit right-field selection, first-match-only on duplicate right-side keys, null fill for unmatched left rows, `join_` collision prefixing, no spatial predicates/fuzzy matching/multi-key joins, preserves the left artifact's output kind and geometry semantics, and registers queryable output in DuckDB.

Canonical contract: see `SUPPORT-ENVELOPE.md`.

---

## Validation history

## Environment / install
- `npm install` ✅

## Build history
- initial build attempts failed on TypeScript issues in `App.tsx` and a bad DuckDB helper path
- issues were fixed iteratively
- current production build passes

### Current known build note
- Vite warns that output chunks are large (>500 kB)
- not a Milestone 0 blocker
- should be revisited later with code splitting / bundle strategy

---

## What got fixed during implementation

### Fixes completed
- cleaned up TypeScript typing around parsed GeoJSON import data
- corrected artifact/import review typing
- removed broken placeholder DuckDB JSON insertion logic
- got the app back to a passing build state

### Lesson
The shell and state model are solid enough to iterate on, but the real data/runtime integration will be where the harder engineering begins.

### Archived transient docs
Some time-bound spike / cleanup / handoff notes were moved out of the project root into `archive/` on 2026-03-21 to reduce top-level clutter once their durable conclusions had been absorbed by the active docs.

---

## Current blockers / gaps

## Gap 1 — Broader geometry encoding coverage remains beyond the narrow supported path
Milestone 0 is verified for one honest supported GeoParquet path, not universal coverage. Unsupported variants must continue to fail explicitly rather than being implied to work.

## Gap 2 — Some naming/implementation surfaces still want cleanup
The completion pass improved runtime truth, but some code/documentation surfaces still use terminology loosely and could mislead future work if left unclarified.

## Gap 3 — Map rendering is still better proved by shell-state + screenshots than by purpose-built map assertions
The smoke test verified the end-to-end flow and preserved screenshots, but future testing could add stronger map-specific assertions if the app exposes stable hooks for them.

---

## Immediate next tasks

The support-envelope honesty pass is now approved: tiered support language is in place, dissolve scope is explicitly global-only, reprojection/runtime claims are constrained to validated truth, and display-runtime behavior is surfaced without mutating durable artifact state.

With that seam tightened, the next work should stay disciplined:
- Clip v1 has now landed on the narrow contract path: polygon/multipolygon source clipped by polygon/multipolygon mask, requiring known matching CRS, with browser-verified refusal/success/empty-result behavior
- intersect v1 is now shipped on the narrow honest contract; preserve that clean state rather than broadening it casually
- preserve the current clean state before adding another topology expansion
- do a phase checkpoint on the shipped operation matrix and substrate instead of treating momentum as a reason to add another operation
- pay down the remaining orchestration/UI seam before broadening the support envelope: the next highest-leverage work is to make registry/contract truth drive execution and dialogs more uniformly across single-input geometry, topology, measurement-table, and aggregation paths
- specifically, migrate the remaining bespoke paths (especially global dissolve and measurement-family handling in `App.tsx`) toward shared operation-form / execution plumbing so new capability does not continue to multiply product-surface duplication
- then continue with FlatGeobuf import, map + table synchronization, and history v1 hardening

## Phase checkpoint — 2026-03-23

### Shipped operation matrix (honest read)

#### Single-input geometry
- **Buffer** — real, but only on the `validated_local` path and still approximation-sensitive
- **Centroid** — real on the `validated_local` path
- **Convex hull v1** — narrow `partial` path, polygon/multipolygon only, known stored CRS required, one derived hull, no source-attribute preservation
- **Envelope v1** — narrow `partial` path, polygon/multipolygon only, known stored CRS required, one derived bounding polygon, no source-attribute preservation
- **Simplify v1** — narrow `partial` path, polygon/multipolygon only, known stored CRS required, tolerance interpreted in source CRS units, source attributes preserved, no topology-preserving claim

#### Topology
- **Clip v1** — narrow `partial` polygon-mask path on shared topology substrate, known matching CRS required, source attributes preserved, honest empty-result semantics
- **Intersect v1** — narrow `partial` polygon-overlay path on shared topology substrate, known matching CRS required, source attributes only, honest empty-result semantics
- **Attribute join v1** — narrow `partial` exact-equality left-join path on the shared two-input seam, one key per side, explicit right-field selection, first-match-only duplicate-right behavior, null fill for unmatched left rows, `join_` collision prefixing, and preserved left output kind / geometry semantics

#### Aggregation
- **Global dissolve** — shipped, but still semantically the least mature family member: global-only scope is honest, yet the path still reads more like a special case than a fully substrate-shaped operation

#### Measurement
- **Area v1** — narrow `partial` measurement-table path, polygon/multipolygon only, known stored CRS required, square meters only on trusted planar-meter CRS allowlist
- **Perimeter v1** — narrow `partial` measurement-table path, polygon/multipolygon only, known stored CRS required, meters only on trusted planar-meter CRS allowlist
- **Compactness v1** — narrow `partial` measurement-table path, polygon/multipolygon only, known stored CRS required, unitless output only on trusted planar-meter CRS allowlist

#### CRS / display
- **Reproject** — real and meaningful, but still honestly `validated_local` / runtime-sensitive rather than universal
- **Display transformation** — useful display-only normalization, not durable CRS mutation
- **CRS assign** — universal metadata-only truth

#### Output kinds / export / materialization
- **Spatial artifacts** — first-class, map-visible, query-registerable, persistable, GeoJSON-exportable
- **Measurement tables / non-spatial outputs** — now genuinely first-class enough to persist, materialize, inspect, and export as JSON without pretending they are failed geometry paths
- **True Parquet / GeoParquet export** — still not shipped and correctly not claimed

### Substrate state (where the architecture is genuinely strong)
- **Support-envelope truth is now unusually clean.** Registry, support docs, browser checks, and product wording mostly agree.
- **CRS semantics are materially better than before.** Known vs unknown vs missing, assign vs transform, stored vs display CRS, and output confidence/provenance are no longer casually blurred together.
- **Topology has a real family seam.** Clip and intersect share contract validation, execution/materialization logic, empty-result semantics, DuckDB registration, and lineage vocabulary.
- **Validation architecture is credible.** The split between universal contract checks, preview-safe browser checks, and validated-local runtime checks reduces bluffing and makes failures easier to interpret.
- **Non-spatial outputs are no longer second-class accidents.** Measurement results now fit the artifact/persistence/export model well enough that the product can honestly support multiple output kinds.

### Where the architecture is still uneven or carrying semantic debt
- **Execution is not yet one substrate; it is three adjacent ones.** Single-input geometry, topology, and measurement each have their own execution path. That is much better than pure bespoke code, but it is not yet one generic operation pipeline.
- **UI orchestration is still heavily bespoke in `App.tsx`.** The registry describes operation truth, but dialogs, local state, and run flows are still repeated by operation family. That means each new capability still pays a full-stack duplication tax.
- **Aggregation is the shakiest shipped family.** Global dissolve is honest about scope, but it still looks more grandfathered than substrate-native.
- **Support maturity is asymmetric.** Buffer/centroid remain broader `validated_local` seams while newer operations are narrow `partial` seams with stricter contracts. That is acceptable, but it means the operation menu is not yet one coherent support story.
- **Transform-aware planning exists architecturally, not operationally.** The contract layer knows about future eligibility, but execution still stops at same-CRS topology and refusal-first measurement honesty.

### Workflow grammar checkpoint — 2026-03-23

#### Current honest composition graph

**1. Spatial artifact → spatial artifact**
- single-input geometry ops compose cleanly with other spatial-first seams: `buffer`, `centroid`, `convex-hull-v1`, `envelope-v1`, `simplify-v1`, and `reproject` all emit derived artifacts that remain queryable, persistable, and available for later operations according to their support contracts
- `clip-v1` and `intersect-v1` also return first-class spatial artifacts, so topology outputs can flow back into measurement, query/materialization, export, persistence, and further same-contract topology work

**2. Spatial artifact → measurement table → tabular workflows**
- `area-v1`, `perimeter-v1`, and `compactness-v1` produce honest non-spatial measurement tables
- those measurement tables are not dead ends: they persist, export as JSON, register in DuckDB, participate in SQL, and can be used in `attribute-join-v1`

**3. Tabular / measurement artifact → spatial artifact (via left-preserving join)**
- the strongest cross-kind seam now is: **measure or query something tabular, then join it back onto a spatial artifact**
- because `attribute-join-v1` preserves the **left artifact's** output kind and geometry semantics, a workflow like:
  - spatial source
  - measurement-table or query-derived table
  - attribute join with the spatial artifact on the left
  yields an enriched spatial artifact that can go straight back to map, topology, query, export, and persistence

**4. Query/materialization as a bridge layer**
- DuckDB-backed query and materialization now compose across source artifacts, derived spatial artifacts, topology outputs, measurement tables, and other non-spatial tables
- materialization grammar is reasonably clean:
  - if geometry survives and is decodable, the output can become a spatial artifact
  - otherwise it becomes a first-class non-spatial artifact
- this makes SQL a real bridge between artifact kinds rather than a side preview pane

**5. Export / persistence as terminal seams**
- spatial artifacts: persist + query + GeoJSON export + JSON export
- non-spatial and measurement artifacts: persist + query + JSON export
- this is honest and much cleaner than before, but export is still mostly a terminal seam rather than a compositional one

#### Where the workflow grammar is clean
- **Left-preserving attribute join is a real bridge.** It gives the product a usable spatial ↔ tabular enrichment loop instead of trapping measurements and queries in table-only dead ends.
- **Query/materialize grammar is coherent.** Preview, materialization, persisted artifact kind, and provenance language now mostly agree.
- **Topology outputs behave like normal artifacts.** Clip/intersect results are not special-case ghosts; they re-enter the same artifact system.
- **Non-spatial outputs are first-class enough to matter.** Measurement tables now participate in persistence, export, SQL, and join workflows without pretending to be geometry.

#### Where the grammar is still awkward or asymmetrical
- **Attribute join is intentionally left-biased.** That is good for preserving truth, but it means workflow direction matters a lot:
  - spatial-left + measurement-right => enriched spatial output
  - measurement-left + spatial-right => still non-spatial output
  This is honest, but users must understand the grammar rather than assume joins are symmetric.
- **Grouped dissolve now exists, but its proof surface is thinner than its workflow importance.** The product can now consume query- or join-derived grouping semantics and emit a first-class grouped spatial artifact, but that bridge is not yet backed by the same cheap/runtime/browser evidence depth that clip/intersect/attribute-join already have.
- **Topology attribute semantics remain narrow.** `intersect-v1` preserves source attributes only, so overlay-driven enrichment workflows still stall unless the needed attributes are reconstructed some other way.
- **Measurement output kind is composable but not directly spatial.** The join-back path exists, but there is no more direct "measure then style/aggregate by the result" grammar beyond SQL + join.
- **Export is asymmetrical by kind.** Spatial artifacts get GeoJSON + JSON; non-spatial artifacts get JSON only. Honest, but not yet a broad persistence/exchange grammar.

#### Strongest workflow seams right now
1. **Spatial → measurement table → attribute join back to spatial**
   - This is the best current proof that the suite has more than isolated operations.
2. **Spatial / topology / tabular → SQL query → materialized artifact**
   - SQL now acts as a real bridge between artifact kinds.
3. **Spatial → topology → measurement / query / export**
   - Clip/intersect outputs re-enter the workbench cleanly enough to support chained workflows.

#### Weakest or blocked seams right now
1. **Grouped aggregation validation and product-surface proof**
   - The bridge now exists, but it has not yet earned the same confidence level as the adjacent workflow seams because grouped-dissolve-specific runtime/browser checks are still missing.
2. **Overlay-driven topology enrichment**
   - Intersect cannot carry overlay attributes on the shipped path, so some otherwise-natural overlay workflows still collapse into source-only outputs.
3. **Symmetric cross-kind composition**
   - Join preserves the left artifact kind by design, which is honest but makes some bidirectional workflows feel awkward unless the user picks the left/right orientation carefully.

### Recommended next move before any more capability growth
Do **not** add a random new operation just to widen the menu.

The next highest-leverage move is to make **aggregation a real compositional bridge**, not a special case:
- pay down the orchestration/UI seam so aggregation consumes the same registry/contract truth as the other families
- then use that cleanup to turn **global dissolve** into the proof point for a more workflow-native aggregation path
- grouped dissolve by attribute has now landed as the next earned aggregation slice, closing the workflow loop the grammar already pointed toward:
  - query or measure
  - optionally join attributes back to spatial features
  - aggregate spatially by a chosen field

Why this move beats "just add another op":
- it leverages the current strong seams instead of bypassing them
- it gives the query/materialization + attribute-join surface a more meaningful downstream spatial consumer
- it upgrades the weakest shipped family into something that actually participates in multi-step workflows

Until that happens, every additional standalone operation risks increasing operation count without making the workflow language much richer.
---

## Risks to watch right now

- artifact state drifting from query/runtime state
- GeoParquet becoming awkward to render after query ingestion
- fake confidence if the UI looks more complete than the runtime really is
- overbuilding around the sample-data path instead of the real ingestion/query loop
- letting dissolve/clip/intersect claims outrun the actual topology support envelope
- overstating CRS maturity beyond what is actually verified (local runtime is clean; production-host behavior still depends on explicit deployment configuration)
- leaving product copy behind runtime reality now that reprojection is more operational locally than it was when earlier caveats were written

---

## Milestone 0 status against goals

## Clearly achieved
- shell exists
- source/derived artifact model exists
- history feed exists
- GeoJSON path exists
- map/table integration exists
- derived-artifact materialization exists
- real DuckDB-backed query execution exists for the current GeoJSON/source-artifact path
- GeoParquet import/register/query path exists
- completion-pass code for full-file geometry fetch/render and derived spatial materialization exists

## Partially achieved
- import review flow
- warning persistence
- SQL/query workbench feel
- provenance explanation
- query result → derived artifact pipeline

## Not yet achieved
- mature lineage capture for complex multi-source / CTE-heavy query patterns

---

## Bottom line

The project is no longer just theory. There is real code now, and Milestone 0 remains honestly verified.

The honest current read is:
- **Milestone 0:** verified
- **Milestone 1 tranche 1:** complete for scoped deliverables
- **Spatial engine foundation:** established around **DuckDB-WASM + GEOS-WASM + PROJ-WASM**
- **Buffer:** landed with explicit approximation / CRS caveats
- **Centroid:** landed on the cleaned spatial seam
- **Dissolve:** landed as **global dissolve only** with tightened support-envelope honesty
- **Convex hull:** landed as a narrow v1 single-input polygon/multipolygon path requiring known stored CRS, producing one derived hull and preserving no source attributes
- **Envelope:** landed as a narrow v1 single-input polygon/multipolygon bounding-box path requiring known stored CRS, producing one derived polygon output in the same stored CRS, and preserving no source attributes
- **Simplify:** landed as a narrow v1 single-input polygon/multipolygon path requiring known stored CRS, using user-provided tolerance in source CRS units, preserving stored CRS and source attributes, with no auto-transform or topology-preserving claim
- **Area:** landed as a narrow v1 single-input polygon/multipolygon measurement path requiring known stored CRS, making no geodesic claim, returning a non-spatial measurement table with one row per input feature plus `area_value` / `area_unit`, and only emitting square meters on the current trusted planar-meter CRS allowlist
- **Operation history semantics:** cleaned so geometry ops are real `operation` events, not fake queries
- **Product import routing:** cleaned so product code uses the intended spatial module surface
- **CRS state model:** now behaves distinctly for `known`, `unknown`, and `missing` instead of collapsing those states together in practice
- **CRS engine support:** actual coordinate transformation now exists at the engine layer; assign-vs-transform semantics are explicitly separated
- **Local PROJ runtime:** directly verified under hardened local dev conditions (`crossOriginIsolated`, `SharedArrayBuffer`, pthread worker pool with 8 initialized workers, no false-positive timeout warning)
- **Map pane render truth (sample GeoJSON path):** fixed — MapLibre lifecycle under `React.StrictMode` and collapsed map-container sizing were corrected, and the sample import now visibly renders with map controls, basemap, and polygons in browser-verified screenshots
- **Result/materialization state:** fixed — once a result is materialized into a derived artifact, the results pane no longer claims it is still preview-only and instead shows an explicit materialized state with artifact link
- **Map-unavailable product states:** improved — the center pane now distinguishes between empty workspace, non-renderable selected artifacts, tabular-only selected artifacts, and renderable paths; stale GeoParquet copy is also cleared when map rendering is actually available
- **Warning/info/provenance semantics:** improved — current notes, provenance notes, and active warnings are now presented separately; lineage no longer carries event-warning clutter; history/event detail carries diagnostic counts instead of embedding them in event titles
- **Smoke-map truth assertions:** improved — smoke coverage now distinguishes empty-state, renderable map state, and explicit map-unavailable state instead of relying on weak canvas-only checks
- **Final QA pass:** now green — major product flows hold (empty → render → unavailable → render, save/open restore, GeoParquet render path), saved-query card markup was corrected to remove invalid nested-button DOM, and the final QA harness now treats Notes/Warnings presence conditionally instead of requiring both in every import-review case
- **Operation-derived artifacts:** now persist/render in project state **and** are registered as DuckDB-queryable artifacts on creation, with save/open restoring that queryability through the existing re-registration path
- **True GeoParquet export:** deferred, not claimed
- **Display geometry normalization:** implemented and browser-verified — projected CRS artifacts now auto-fit on the web map via on-the-fly WGS84 display transformation, while stored artifact CRS metadata remains truthful (`EPSG:3857` stays `EPSG:3857`)
- **Support-envelope truth pass:** approved — the project now carries an explicit canonical support contract (`SUPPORT-ENVELOPE.md`), tiered support modeling instead of binary capability claims, corrected dissolve-scope warning semantics, and display-runtime truth that is surfaced ephemerally in the UI rather than persisted as artifact mutation

The project has moved beyond foundation-setting into the first honest geometry tranche — still narrow, still disciplined, and still refusing to bluff about what the engine path can actually support.
