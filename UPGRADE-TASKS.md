# GIS Suite Upgrade — Task Breakdown

**Created:** 2026-06-25 23:48 PDT  
**Spec:** `UPGRADE-SPEC.md`  
**Plan:** `UPGRADE-PLAN.md`  
**Phase:** Phase 3 — TASKS (awaiting human review)

---

## Slice 16 — [Unit 1A] NL Pipeline Tests (M)

### Task 16.1: Test plan-executor execution branches
- **Input:** `src/lib/nl/plan-executor.ts` (274 lines), existing test patterns from `plan-builder.test.ts`
- **Action:** Create `src/lib/__tests__/plan-executor.test.ts`. Test all `executeStep` branches: buffer, centroid, convex hull, envelope, simplify, dissolve, clip, intersect, reproject, attribute-join (the bug — assert it returns UNSUPPORTED error), and the `executeAttributeJoinStep` function. Mock the spatial engine and DuckDB where needed.
- **Output:** Test file with ≥20 tests covering every execution branch
- **Verification:** `npx vitest run src/lib/__tests__/plan-executor.test.ts` passes, `npm test` total increases

### Task 16.2: Test query-resolver trigger matching + parameter extraction
- **Input:** `src/lib/nl/query-resolver.ts` (226 lines), `ResolutionCandidate` interface
- **Action:** Create `src/lib/__tests__/query-resolver.test.ts`. Test: trigger matching for each operation type, parameter extraction (distance + unit for buffer, tolerance for simplify, mask/overlay for clip/intersect, join keys for attribute-join), confidence scoring (high/medium/low triggers, position penalty, length ratio), chain resolution, edge cases (empty query, unknown operation, ambiguous triggers). Include the 5 canonical queries as integration tests.
- **Output:** Test file with ≥25 tests
- **Verification:** `npx vitest run src/lib/__tests__/query-resolver.test.ts` passes, canonical queries documented as test cases

---

## Slice 17 — [Unit 1B] Validation Core Tests (L)

### Task 17.1: Test validation rules and honest-claim enforcement
- **Input:** `src/lib/operation-validation-core.ts` (2,644 lines)
- **Action:** Create `src/lib/__tests__/operation-validation-core.test.ts`. This is the biggest file — focus on the exported functions and key validation paths: CRS validation (allowlist, projected vs geographic), geometry type validation (per-operation allowed types), parameter validation (distance > 0, tolerance > 0, valid join keys), refusal conditions (no overlap, empty result), warning code generation. Group tests by operation family.
- **Output:** Test file with ≥30 tests covering validation rules, refusals, and warning generation
- **Verification:** `npx vitest run src/lib/__tests__/operation-validation-core.test.ts` passes

---

## Slice 18 — [Unit 1C] Operation Execution Tests (M)

### Task 18.1: Test topology execution (buffer, centroid, hull, envelope, simplify)
- **Input:** `src/lib/operations/topology-execution.ts` (182 lines)
- **Action:** Create `src/lib/operations/__tests__/topology-execution.test.ts`. Mock `GeometryEngine` interface. Test: buffer with valid input, buffer with missing distance, centroid of polygon, convex hull of multi-point, envelope of line, simplify with tolerance. Assert correct output artifact structure and CRS propagation.
- **Output:** Test file with ≥12 tests
- **Verification:** `npx vitest run` passes for this file

### Task 18.2: Test measurement execution (area, perimeter, compactness)
- **Input:** `src/lib/operations/measurement-execution.ts` (287 lines)
- **Action:** Create `src/lib/operations/__tests__/measurement-execution.test.ts`. Test: area of known polygon (assert approximate value), perimeter of known polygon, compactness calculation, CRS-dependent units (meters for projected, warning for geographic), edge cases (empty geometry, null result).
- **Output:** Test file with ≥10 tests
- **Verification:** `npx vitest run` passes for this file

### Task 18.3: Test aggregation execution (dissolve, grouped dissolve)
- **Input:** `src/lib/operations/aggregation-execution.ts` (264 lines)
- **Action:** Create `src/lib/operations/__tests__/aggregation-execution.test.ts`. Test: global dissolve (all features → 1), grouped dissolve by attribute, dissolve with null group field, multipart output handling.
- **Output:** Test file with ≥8 tests
- **Verification:** `npx vitest run` passes for this file

### Task 18.4: Test attribute-join execution
- **Input:** `src/lib/operations/attribute-join.ts` (222 lines)
- **Action:** Create `src/lib/operations/__tests__/attribute-join.test.ts`. Test: join by APN, field prefixing (right-fields-prefixed collision policy), missing join key, empty result on no match, warning generation for dropped fields.
- **Output:** Test file with ≥10 tests
- **Verification:** `npx vitest run` passes for this file

### Task 18.5: Test CRS policy
- **Input:** `src/lib/operations/crs-policy.ts` (182 lines)
- **Action:** Create `src/lib/operations/__tests__/crs-policy.test.ts`. Test: allowlist validation, projected vs geographic detection, transformation rules, refusal on unsupported CRS, unit determination (meters for projected, degrees for geographic).
- **Output:** Test file with ≥8 tests
- **Verification:** `npx vitest run` passes for this file

---

## Slice 19 — [Unit 1D] Spatial Engine Tests (M)

### Task 19.1: Test geometry engine interface
- **Input:** `src/lib/spatial/geometry-engine.ts` (121 lines)
- **Action:** Create `src/lib/spatial/__tests__/geometry-engine.test.ts`. Test: capability reporting (which operations are available), engine interface contract (all required methods exist), geometry type validation.
- **Output:** Test file with ≥6 tests
- **Verification:** `npx vitest run` passes for this file

### Task 19.2: Test display transform (CRS normalization for display)
- **Input:** `src/lib/spatial/display-transform.ts` (324 lines)
- **Action:** Create `src/lib/spatial/__tests__/display-transform.test.ts`. Test: WGS84 → WebMercator transform, projected CRS passthrough, bounds computation, null/empty geometry handling, CRS metadata preservation.
- **Output:** Test file with ≥10 tests
- **Verification:** `npx vitest run` passes for this file

### Task 19.3: Test CRS engine
- **Input:** `src/lib/spatial/crs-engine.ts` (68 lines)
- **Action:** Create `src/lib/spatial/__tests__/crs-engine.test.ts`. Test: CRS detection from EPSG code, validation against allowlist, unknown CRS handling, geographic vs projected classification.
- **Output:** Test file with ≥6 tests
- **Verification:** `npx vitest run` passes for this file

---

## Slice 20 — [Unit 1E] Registry Tests (S)

### Task 20.1: Test operation registry
- **Input:** `src/lib/operations/registry.ts` (496 lines)
- **Action:** Create `src/lib/operations/__tests__/registry.test.ts`. Test: registration, lookup by ID, lookup by trigger, intent metadata structure, family-based dispatch routing, all registered operations present (buffer, centroid, convex_hull, envelope, simplify, dissolve, grouped_dissolve, clip, intersect, attribute_join, area, perimeter, compactness, reproject).
- **Output:** Test file with ≥12 tests
- **Verification:** `npx vitest run` passes, all 14 operations verified registered

---

## Slice 21 — [Unit 2A] Fix Parameter Extraction (S)

### Task 21.1: Fix distance + unit extraction in query-resolver
- **Input:** `src/lib/nl/query-resolver.ts`, test file from Slice 16
- **Action:** Rewrite `extractOperationParameters()` to use operation-specific regex patterns instead of positional "first number → first param" logic. For buffer: extract `(\d+)\s*(feet|ft|meters|m|kilometers|km|miles|mi)` as distance + unit. For simplify: extract tolerance. For clip/intersect: identify mask/overlay artifact by name proximity. Add the 5 canonical queries as test cases.
- **Output:** Modified `query-resolver.ts`, updated tests
- **Verification:** "buffer parcels 500 feet" → plan with `distance=500, distance_unit=feet`. All 5 canonical queries resolve with correct parameters. `npm test` passes.

---

## Slice 22 — [Unit 2B] Wire Attribute-Join (S)

### Task 22.1: Replace UNSUPPORTED error with executeAttributeJoinStep call
- **Input:** `src/lib/nl/plan-executor.ts` (line 176), `executeAttributeJoinStep` function (line 250)
- **Action:** In `executeStep()`, replace the `attribute-join-v1` branch that returns UNSUPPORTED error with a call to `executeAttributeJoinStep(step, artifacts)`. Handle the return value same as other operations (success → output artifact, error → error result). Update the test from Slice 16 that asserted the UNSUPPORTED error — it should now assert successful execution.
- **Output:** Modified `plan-executor.ts`, updated test
- **Verification:** "join ownership to parcels by APN" executes without error. `npm test` passes.

---

## Slice 23 — [Unit 2C] Resolver Robustness (M)

### Task 23.1: Handle query variations and improve artifact resolution
- **Input:** `src/lib/nl/query-resolver.ts`, existing tests
- **Action:** 
  1. Add regex variants: "500ft" (no space), "500 foot buffer on parcels" (reversed), "clip parcels with floodzone" (no "by"), "dissolve by zone" (no artifact name)
  2. Improve artifact name resolution: tokenize query → match against artifact names with Levenshtein distance → disambiguate by selecting highest match → add confidence penalty for ambiguous matches
  3. Add "did you mean?" fallback for low-confidence artifact matches
- **Output:** Modified `query-resolver.ts`, new test cases
- **Verification:** All query variations resolve correctly. Ambiguous artifact names get confidence penalty. `npm test` passes with ≥40 total tests in query-resolver.test.ts

---

## Slice 24 — [Unit 3A] Extract Operation Dialogs (L)

### Task 24.1: Create OperationDialog shared wrapper
- **Input:** Existing dialog patterns in App.tsx (modal, title, close button, operation-ui components)
- **Action:** Create `src/components/operations/OperationDialog.tsx` — shared wrapper with props: `title`, `onClose`, `children`, `icon?`. Handles modal overlay, escape key, click-outside. Extract the common dialog chrome.
- **Output:** `src/components/operations/OperationDialog.tsx`
- **Verification:** Import succeeds, build passes

### Task 24.2: Extract Buffer, Centroid, ConvexHull, Envelope dialogs
- **Input:** Buffer dialog JSX in App.tsx (~lines 2200-2260), Centroid (~2270-2310), ConvexHull (~2300-2370), Envelope (~2380-2420)
- **Action:** Extract each into `src/components/operations/BufferDialog.tsx`, `CentroidDialog.tsx`, `ConvexHullDialog.tsx`, `EnvelopeDialog.tsx`. Each receives: `artifacts`, `selectedArtifact`, `onExecute`, `onClose`. Internal state (name, params) stays in component. Replace 4 `show*Dialog` state vars with single `activeDialog` state.
- **Output:** 4 component files, App.tsx reduced by ~400 lines
- **Verification:** Build passes, all tests pass, smoke test passes, dialogs render identically

### Task 24.3: Extract Simplify, Dissolve, Reproject dialogs
- **Input:** Simplify (~2430-2470), Dissolve (~2490-2550), Reproject (~2560-2650) in App.tsx
- **Action:** Same pattern as 24.2. Extract to `SimplifyDialog.tsx`, `DissolveDialog.tsx`, `ReprojectDialog.tsx`.
- **Output:** 3 component files, App.tsx reduced by ~350 lines
- **Verification:** Build passes, tests pass, smoke test passes

### Task 24.4: Extract Clip, Intersect, AttributeJoin dialogs
- **Input:** Clip (~2700-2800), Intersect (~2780-2850), AttributeJoin (~2860-2950) in App.tsx
- **Action:** Same pattern. Extract to `ClipDialog.tsx`, `IntersectDialog.tsx`, `JoinDialog.tsx`.
- **Output:** 3 component files, App.tsx reduced by ~400 lines
- **Verification:** Build passes, tests pass, smoke test passes

### Task 24.5: Extract Area, Perimeter, Compactness dialogs
- **Input:** Area/Perimeter/Compactness dialogs in App.tsx (~3050-3200)
- **Action:** Same pattern. Extract to `MeasureDialog.tsx` (shared — all 3 are measurement ops with similar UI). Use `operationId` prop to differentiate.
- **Output:** 1 component file, App.tsx reduced by ~300 lines
- **Verification:** Build passes, tests pass, smoke test passes. App.tsx has lost ~1,450 lines total.

---

## Slice 25 — [Unit 3B] Extract Hooks (M)

### Task 25.1: Extract useUndoRedo hook
- **Input:** `undoStack`, `redoStack` refs, `pushArtifactSnapshot`, `undo`, `redo` in App.tsx
- **Action:** Create `src/hooks/useUndoRedo.ts`. Signature: `useUndoRedo(artifacts, setArtifacts)` returns `{ pushSnapshot, undo, redo, canUndo, canRedo }`. Move all undo/redo logic out of App.tsx.
- **Output:** `src/hooks/useUndoRedo.ts`, App.tsx imports and uses hook
- **Verification:** Build passes, undo/redo tests still pass

### Task 25.2: Extract useArtifacts hook
- **Input:** `artifacts`, `setArtifacts`, `selectedArtifactId`, `addArtifact`, `removeArtifact`, `layerSettings` in App.tsx
- **Action:** Create `src/hooks/useArtifacts.ts`. Signature: `useArtifacts()` returns `{ artifacts, setArtifacts, selectedArtifact, selectedArtifactId, setSelectedArtifactId, addArtifact, removeArtifact, layerSettings, setLayerSettings }`. Encapsulate artifact state + derived values.
- **Output:** `src/hooks/useArtifacts.ts`, App.tsx imports and uses hook
- **Verification:** Build passes, all artifact-related tests pass

### Task 25.3: Extract useMapSync hook
- **Input:** Map source/layer sync effect (~100 lines), layer settings reconciliation in App.tsx
- **Action:** Create `src/hooks/useMapSync.ts`. Signature: `useMapSync(map, artifacts, layerSettings, selectedArtifactId)` handles adding/removing/updating map sources and layers, z-order reconciliation, visibility/opacity sync.
- **Output:** `src/hooks/useMapSync.ts`, App.tsx imports and uses hook
- **Verification:** Build passes, map-sync tests pass, smoke test passes

### Task 25.4: Extract useImportExport hook
- **Input:** `handleFileImport`, `handleOpenProject`, `handleNewProject`, `handleExportGeoJson`, `handleExportJSON`, `loadProject`, `saveProject` in App.tsx
- **Action:** Create `src/hooks/useImportExport.ts`. Signature: `useImportExport(artifacts, setArtifacts, ...)` returns `{ importFile, loadSample, saveProject, openProject, newProject, exportGeoJson, exportJSON }`.
- **Output:** `src/hooks/useImportExport.ts`, App.tsx imports and uses hook
- **Verification:** Build passes, tests pass

---

## Slice 26 — [Unit 3C] Extract Panels (M)

### Task 26.1: Extract RightPanel component
- **Input:** Right panel JSX in App.tsx (~lines 4845-4900+), Details/History tab logic
- **Action:** Create `src/components/RightPanel.tsx`. Props: `selectedArtifact`, `artifacts`, `history`, `selectedHistoryEventId`, `onClose`, `onImportFile`, `onLoadSample`. Internal: `rightPanelTab` state, `rightPanelOpen` state. Includes all accordion sections, history event list, event detail view.
- **Output:** `src/components/RightPanel.tsx`, App.tsx reduced by ~300 lines
- **Verification:** Build passes, tests pass, right panel renders identically

### Task 26.2: Extract BottomDock component
- **Input:** Bottom dock JSX in App.tsx (~lines 5270-5400+), command bar, bottom sheet, dock tabs
- **Action:** Create `src/components/BottomDock.tsx`. Props: `commandInput`, `onCommandChange`, `onCommandSubmit`, `artifacts`, `activeSidebar`, `onCloseSidebar`, `onPlanExecuted`, `bottomTab`, `setBottomTab`. Internal: `bottomDockExpanded`, `commandFocused`. Includes command bar, command surface (examples), NL plan sheet, empty state sheet, bottom dock with table/sql/results tabs.
- **Output:** `src/components/BottomDock.tsx`, App.tsx reduced by ~400 lines
- **Verification:** Build passes, tests pass, smoke test passes

---

## Slice 27 — [Unit 3D] Slim App.tsx (S)

### Task 27.1: Final cleanup pass on App.tsx
- **Input:** App.tsx after all extractions (target: ~1,500-2,000 lines)
- **Action:** Remove dead code, consolidate remaining state (should be ~20-30 useState down from 91), ensure App.tsx is orchestration only: top bar, sidebar rail, main map area, and composition of extracted hooks + components. Add JSDoc comments explaining the component tree.
- **Output:** App.tsx under 1,500 lines, clean and documented
- **Verification:** `wc -l src/App.tsx` < 1,500. Build passes. All tests pass. Smoke test passes.

---

## Slice 28 — [Unit 4A+B] Test Datasets + Playwright E2E (M)

### Task 28.1: Create test datasets
- **Input:** None (create from scratch)
- **Action:** Create `data/test-datasets/` with 3 small real GeoJSON files:
  - `parcels.geojson` — 50 polygons with properties: APN, zone, area_acres, owner
  - `floodzone.geojson` — 5 polygons representing flood zones
  - `ownership.csv` — 50 rows with APN + owner_name + owner_type
  - Use real Butte County-ish parcel shapes (simplified, not actual data)
  - All in EPSG:4326
- **Output:** 3 data files in `data/test-datasets/`
- **Verification:** Files parse as valid GeoJSON/CSV

### Task 28.2: Write e2e Playwright script
- **Input:** Test datasets from 28.1, existing `scripts/smoke-test.mjs` pattern
- **Action:** Create `scripts/e2e-canonical-queries.mjs`. For each of 5 queries:
  1. Navigate to app, import parcels.geojson
  2. Type NL query in command bar, press Enter
  3. Wait for plan to appear in bottom sheet
  4. Assert plan parameters are correct (operation type, distance, artifact)
  5. Click Execute
  6. Wait for result layer on map
  7. Assert history panel shows event
  8. Screenshot
  - Queries: "buffer parcels 500 feet", "intersect parcels with floodzone", "dissolve parcels by zone", "join ownership to parcels by APN", "reproject parcels to EPSG 32610"
- **Output:** `scripts/e2e-canonical-queries.mjs`, screenshots in `e2e-screenshots/`
- **Verification:** Script runs, 5/5 queries pass

---

## Slice 29 — [Unit 4C] E2E Validation Report (S)

### Task 29.1: Write E2E results report
- **Input:** E2E script results from Slice 28
- **Action:** Create `E2E-VALIDATION-REPORT.md`. Document: each canonical query, what it tests, pass/fail, screenshots, any bugs found. If bugs: create failing test cases and feed back to Unit 2.
- **Output:** `E2E-VALIDATION-REPORT.md`
- **Verification:** Report exists, all 5 queries documented

---

## Slice 30 — [Unit 5A+B] Archive + Commit (S)

### Task 30.1: Archive stale documentation
- **Input:** 59 markdown files in project root
- **Action:** Create `docs/archive/` directory. Move all files except: README.md, DEVELOPMENT.md, SUPPORT-ENVELOPE.md, UPGRADE-SPEC.md, UPGRADE-PLAN.md, UPGRADE-TASKS.md, PROGRESS.md (update this one). Move ~45 files to archive.
- **Output:** Root has <15 .md files, `docs/archive/` has the rest
- **Verification:** `ls *.md | wc -l` < 15

### Task 30.2: Commit or delete untracked files
- **Input:** `git status` untracked files: discovery/, add_intents.py, test-nl-resolver.js, verify*.ts/js, UX-*.md, DISCOVERY-*.md, PLUGIN-*.md
- **Action:** 
  - `git add discovery/` (real Python backend code)
  - Delete: `test-nl-resolver.js`, `verify-integration.js`, `verify.ts`, `add_intents.py` (debug scripts)
  - Archive: UX-*.md, DISCOVERY-*.md, PLUGIN-*.md → move to `docs/archive/`
  - Clean: `discovery/__pycache__/` → add to .gitignore
- **Output:** `git status` shows no untracked files
- **Verification:** `git status --short` is clean

### Task 30.3: Update DEVELOPMENT.md as single source of truth
- **Input:** Current DEVELOPMENT.md, all slice history
- **Action:** Rewrite DEVELOPMENT.md to be the authoritative status doc. Include: current state (post-Slice 31), what works, what doesn't, architecture overview, how to run tests, link to UPGRADE-SPEC/PLAN/TASKS for roadmap. Remove stale sections.
- **Output:** Updated DEVELOPMENT.md
- **Verification:** DEVELOPMENT.md reflects current reality

---

## Slice 31 — [Unit 5C] Code-Split Bundle (M)

### Task 31.1: Configure Vite manual chunks for WASM engines
- **Input:** `vite.config.ts`, current 5.2MB single bundle
- **Action:** Add `build.rollupOptions.output.manualChunks` configuration to split: GEOS-WASM, PROJ-WASM, DuckDB-WASM into separate lazy chunks. Configure dynamic imports for operation dialog components (from Slice 24). Add `<Suspense>` wrappers in App.tsx.
- **Output:** Modified `vite.config.ts`, modified `src/App.tsx` (lazy imports + Suspense)
- **Verification:** `npm run build` shows multiple chunks, main bundle <2MB, app loads and works

### Task 31.2: Verify lazy loading doesn't break functionality
- **Input:** Built app with code-splitting from 31.1
- **Action:** Run smoke test, verify all operations still accessible, verify dialogs load on demand, verify WASM engines initialize when needed. Check for race conditions in lazy module loading.
- **Output:** Smoke test pass, no console errors
- **Verification:** `node scripts/smoke-test.mjs` passes 9/9, `npm test` passes

---

## Summary

| Slice | Unit | Tasks | Size | Key Output |
|-------|------|-------|------|------------|
| 16 | 1A | 2 | M | NL pipeline test files (45+ tests) |
| 17 | 1B | 1 | L | Validation core tests (30+ tests) |
| 18 | 1C | 5 | M | 5 operation execution test files (48+ tests) |
| 19 | 1D | 3 | M | 3 spatial engine test files (22+ tests) |
| 20 | 1E | 1 | S | Registry tests (12+ tests) |
| 21 | 2A | 1 | S | Fixed parameter extraction |
| 22 | 2B | 1 | S | Attribute-join wired in executor |
| 23 | 2C | 1 | M | Resolver robustness pass |
| 24 | 3A | 5 | L | 12 operation dialog components extracted |
| 25 | 3B | 4 | M | 4 hooks extracted |
| 26 | 3C | 2 | M | RightPanel + BottomDock extracted |
| 27 | 3D | 1 | S | App.tsx <1,500 lines |
| 28 | 4A+B | 2 | M | Test datasets + e2e Playwright |
| 29 | 4C | 1 | S | E2E validation report |
| 30 | 5A+B | 3 | S | Docs archived, untracked committed |
| 31 | 5C | 2 | M | Code-split, bundle <2MB |

**Total: 16 slices, 35 tasks, ~35 new test files, ~18 new component/hook files**

## Sequenced Dispatch Order

```
Session 1 (parallel):  Slice 16, 17, 18, 19, 20
Session 2 (sequential): Slice 21 → 22 → 23
Session 3 (sequential): Slice 24 (5 sub-tasks, may need 2 dispatches)
Session 4 (sequential): Slice 25 → 26 → 27
Session 5 (sequential): Slice 28 → 29  (parallel: Slice 30)
Session 6:             Slice 31
```
