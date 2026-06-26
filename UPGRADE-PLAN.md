# GIS Suite Upgrade — Implementation Plan

**Created:** 2026-06-25 23:36 PDT  
**Spec:** `UPGRADE-SPEC.md`  
**Phase:** Phase 2 — PLAN (awaiting human review)

---

## Work Units

### Unit 1: Engine Unit Tests — `ENGINE-TESTS`

**Goal:** Vitest coverage for all of `src/lib/` — the spatial engine, operations, NL pipeline, and validation core.

**Complexity:** L — 5,290 lines of untested logic across 12 files. Browser validation scripts exist as reference but can't be directly ported (they're Playwright, not Vitest).

**Risk:** Low. Additive only — no existing code changes.

#### Sub-units:

**1A. NL Pipeline Tests** (S-M)
- `plan-executor.test.ts` — 274 lines, test all execution branches including the attribute-join bug
- `query-resolver.test.ts` — 226 lines, test trigger matching, parameter extraction, confidence scoring, edge cases
- **Verification:** `npm test` passes with new files, executor bug documented as failing test

**1B. Validation Core Tests** (L)
- `operation-validation-core.test.ts` — 2,644 lines, the biggest single file. Test validation rules, honest-claim enforcement, refusal conditions, warning codes
- **Verification:** `npm test` passes, covers the "honesty enforcement" layer

**1C. Operation Execution Tests** (M)
- `topology-execution.test.ts` (182 lines) — buffer, centroid, convex hull, envelope, simplify
- `measurement-execution.test.ts` (287 lines) — area, perimeter, compactness
- `aggregation-execution.test.ts` (264 lines) — dissolve, grouped dissolve
- `attribute-join.test.ts` (222 lines) — join logic, field prefixing, collision policy
- `crs-policy.test.ts` (182 lines) — CRS allowlist, transformation rules
- **Verification:** `npm test` passes, each operation family has happy path + edge cases

**1D. Spatial Engine Tests** (M)
- `geometry-engine.test.ts` (121 lines) — capability reporting, engine interface
- `display-transform.test.ts` (324 lines) — CRS display normalization, bounds computation
- `crs-engine.test.ts` (68 lines) — CRS detection, validation
- **Verification:** `npm test` passes, engine layer covered

**1E. Operation Registry Tests** (S)
- `registry.test.ts` (496 lines) — registration, lookup, intent metadata, family dispatch
- **Verification:** `npm test` passes, registry contracts verified

**Dependencies:** None — first unit, no prerequisites.  
**Dispatch pattern:** Complementary (implementer writes tests + MiMo tester verifies coverage). One sub-unit at a time, each is a slice.  
**Est. slices:** 5 (one per sub-unit)  
**Files created:** 12 test files

---

### Unit 2: NL Resolver Hardening — `NL-HARDEN`

**Goal:** Fix parameter drops, wire attribute-join, harden the resolver. Make the 5 canonical queries actually work.

**Complexity:** M — targeted fixes in 3 files, clear bugs with known root causes.

**Risk:** Medium — touches the core NL flow, but changes are surgical.

#### Sub-units:

**2A. Fix parameter extraction** (S)
- `query-resolver.ts` — fix `extractOperationParameters()` to reliably extract numeric values (currently drops "500" from "buffer parcels 500 feet")
- Root cause: positional extraction ("first number → first numeric param") doesn't handle "parcels" between operation and number
- Fix: regex-based extraction with operation-specific patterns (distance + unit for buffer, tolerance for simplify, etc.)
- Add tests in `query-resolver.test.ts` (from Unit 1A) for each canonical query
- **Verification:** "buffer parcels 500 feet" → plan with `distance=500, distance_unit=feet`

**2B. Wire attribute-join in executor** (S)
- `plan-executor.ts` line 176 — replace the `'UNSUPPORTED_OPERATION'` error with a call to `executeAttributeJoinStep()`
- The function already exists (line 250) — just needs to be called instead of returning an error
- Add test in `plan-executor.test.ts` (from Unit 1A) for attribute-join execution path
- **Verification:** "join ownership to parcels by APN" → executes, not errors

**2C. Resolver robustness pass** (M)
- `query-resolver.ts` — handle common variations:
  - "buffer the parcels by 500ft" (unit suffix without space)
  - "500 foot buffer on parcels" (reversed order)
  - "clip parcels with floodzone" (no "by")
  - "dissolve by zone" (no artifact name)
- Improve artifact name resolution: `name.includes(value)` → tokenized matching with disambiguation
- Add confidence penalty for ambiguous matches
- **Verification:** All 5 canonical queries resolve to correct operations with correct parameters

**Dependencies:** Unit 1A (test files must exist to verify fixes)  
**Dispatch pattern:** Complementary (implementer + tester), one sub-unit per slice  
**Est. slices:** 3  
**Files modified:** `query-resolver.ts`, `plan-executor.ts`

---

### Unit 3: App.tsx Decomposition — `DECOMPOSE`

**Goal:** Reduce App.tsx from 5,716 lines to <1,500 by extracting hooks and components.

**Complexity:** L — largest effort. 91 useState hooks, 14 inline operation dialogs, undo/redo, import/export, map-sync.

**Risk:** Medium-high — refactoring working code. Test coverage (from Unit 1) protects against regressions, but UI tests may need updating if component boundaries change.

#### Sub-units:

**3A. Extract operation dialogs** (L)
- Extract 14 operation dialogs (buffer, centroid, convex hull, envelope, simplify, dissolve, reproject, clip, intersect, attribute-join, area, perimeter, compactness) into `src/components/operations/`
- Each dialog: self-contained component receiving props (artifacts, selectedArtifact, onExecute, onClose)
- Shared wrapper: `OperationDialog.tsx` — handles modal, title, close button
- Remove ~16 `show*Dialog` state vars from App.tsx, replace with `activeDialog: string | null`
- **Verification:** Build passes, all tests pass, smoke test passes, dialogs still render

**3B. Extract hooks** (M)
- `useUndoRedo.ts` — undoStack, redoStack, pushArtifactSnapshot, undo, redo
- `useArtifacts.ts` — artifacts state, addArtifact, removeArtifact, updateArtifact, selectedArtifactId
- `useMapSync.ts` — map-source/layer sync, layer settings, visibility/opacity/z-order
- `useImportExport.ts` — file import, sample data, project save/load, export GeoJSON/JSON
- Each hook: pure state + logic, no JSX
- App.tsx imports and composes hooks
- **Verification:** Build passes, tests pass, hook behavior unchanged

**3C. Extract right panel + bottom dock** (M)
- `RightPanel.tsx` — Details/History tabs, accordion sections, history event list
- `BottomDock.tsx` — command bar, bottom sheet, bottom dock tabs (table/sql/results)
- App.tsx passes props down
- **Verification:** Build passes, tests pass, panels render identically

**3D. Slim App.tsx** (S)
- Final pass: remove dead code, consolidate remaining state, ensure App.tsx is orchestration only
- Target: <1,500 lines
- **Verification:** `wc -l src/App.tsx` < 1,500

**Dependencies:** Unit 1 (tests protect refactor). 3A → 3B → 3C → 3D (sequential, each depends on prior)  
**Dispatch pattern:** Complementary (implementer + tester), one sub-unit per slice  
**Est. slices:** 4 (one per sub-unit, 3A may need 2 dispatches due to size)  
**Files created:** ~18, **Files modified:** `src/App.tsx`

---

### Unit 4: End-to-End Validation — `E2E`

**Goal:** Prove the 5 canonical queries work end-to-end with real data.

**Complexity:** M — Playwright script + test data + assertions.

**Risk:** Low — validation only, no code changes (unless bugs found, which feed back to Unit 2).

#### Sub-units:

**4A. Create test datasets** (S)
- `data/test-datasets/parcels.geojson` — ~50 parcels with APN, zone, area fields
- `data/test-datasets/floodzone.geojson` — ~5 flood polygon features
- `data/test-datasets/ownership.csv` — ~50 rows, APN + owner name fields
- Small enough for fast tests, real enough to exercise CRS + geometry
- **Verification:** Files exist, valid GeoJSON/CSV

**4B. Write e2e Playwright script** (M)
- `scripts/e2e-canonical-queries.mjs` — for each of 5 queries:
  1. Load app, import test dataset
  2. Type NL query in command bar
  3. Verify plan appears with correct parameters
  4. Execute plan
  5. Assert map renders result layer
  6. Assert history panel shows event
  7. Screenshot evidence
- Queries: buffer, intersect, dissolve, attribute-join, reproject
- **Verification:** Script runs, 5/5 queries pass, screenshots captured

**4C. Write E2E validation report** (S)
- `E2E-VALIDATION-REPORT.md` — results, screenshots, any bugs found
- Feed bugs back to Unit 2 for fixing
- **Verification:** Report written, all 5 queries documented

**Dependencies:** Unit 2 (NL resolver must work) and Unit 3A (operation dialogs extracted, or at least not broken). Can start 4A in parallel.  
**Dispatch pattern:** Single implementer (Playwright is straightforward)  
**Est. slices:** 2 (4A+4B together, 4C after)  
**Files created:** 3 data files, 1 script, 1 report

---

### Unit 5: Documentation & Bundle Cleanup — `CLEANUP`

**Goal:** Archive stale docs, commit or delete untracked files, code-split WASM engines, single source of truth.

**Complexity:** S-M — mostly mechanical cleanup + one Vite config change.

**Risk:** Low — no functional changes.

#### Sub-units:

**5A. Archive stale docs** (S)
- Create `docs/archive/` directory
- Move ~40 stale markdown files (MILESTONE-*, ACTIVE_TODO, TOMORROW, UX-AUDIT-*, DISCOVERY-*, PLUGIN-SCHEMA*, NL-LOOP-*, etc.)
- Keep in root: README.md, DEVELOPMENT.md, SUPPORT-ENVELOPE.md, UPGRADE-SPEC.md, UPGRADE-PLAN.md
- Update DEVELOPMENT.md as single source of truth
- **Verification:** Root has <15 .md files, `docs/archive/` has the rest

**5B. Commit or delete untracked files** (S)
- `git status` shows: discovery/, add_intents.py, test-nl-resolver.js, verify*.ts/js, UX-*.md, DISCOVERY-*.md, PLUGIN-*.md
- Decision: commit discovery/ (it's real code), delete debug scripts (test-nl-resolver.js, verify*.ts/js), archive UX/DISCOVERY/PLUGIN docs
- **Verification:** `git status` clean (no untracked files)

**5C. Code-split WASM engines** (M)
- `vite.config.ts` — configure manualChunks: GEOS-WASM, PROJ-WASM, DuckDB-WASM as separate lazy chunks
- Dynamic import operation dialogs: `const BufferDialog = lazy(() => import('./components/operations/BufferDialog'))`
- Add `<Suspense fallback={<LoadingSpinner />}>` wrapper
- **Verification:** Build output shows multiple chunks, main bundle <2MB (from 5.2MB), app still loads

**Dependencies:** None (can run parallel with Unit 1). 5C depends on Unit 3A (operation dialogs extracted before lazy import).  
**Dispatch pattern:** Single implementer for 5A/5B, complementary for 5C  
**Est. slices:** 2 (5A+5B together, 5C separate)  
**Files created:** `docs/` tree, **Files modified:** `vite.config.ts`, `src/App.tsx`

---

## Dependency Graph

```
Unit 1 (ENGINE-TESTS)
  ├── 1A: NL Pipeline Tests ──────────────┐
  ├── 1B: Validation Core Tests           │
  ├── 1C: Operation Execution Tests      │  All parallelizable
  ├── 1D: Spatial Engine Tests            │
  └── 1E: Registry Tests ────────────────┘
                                          │
Unit 2 (NL-HARDEN)                        │
  ├── 2A: Fix parameter extraction ◄─── 1A
  ├── 2B: Wire attribute-join ◄───────── 1A
  └── 2C: Resolver robustness ◄───────── 1A
                                          │
Unit 3 (DECOMPOSE)                        │
  ├── 3A: Extract operation dialogs ◄─── (protects with Unit 1 tests)
  ├── 3B: Extract hooks ◄─── 3A
  ├── 3C: Extract panels ◄─── 3B
  └── 3D: Slim App.tsx ◄─── 3C
                                          │
Unit 4 (E2E)                              │
  ├── 4A: Test datasets (parallel)       │
  ├── 4B: Playwright script ◄─── Unit 2, Unit 3A
  └── 4C: Validation report ◄─── 4B
                                          │
Unit 5 (CLEANUP)                          │
  ├── 5A: Archive docs (parallel)        │
  ├── 5B: Commit untracked (parallel)   │
  └── 5C: Code-split ◄─── Unit 3A
```

## Recommended Sequence

```
Session 1:  1A + 1B + 1C + 1D + 1E  (parallel, 5 dispatches)
Session 2:  2A + 2B + 2C             (sequential, 3 slices)
Session 3:  3A                        (large, may need 2 dispatches)
Session 4:  3B + 3C + 3D             (sequential, 3 slices)
Session 5:  4A + 4B + 4C + 5A + 5B   (parallel where possible)
Session 6:  5C                        (code-split, depends on 3A)
```

**Parallel tracks during Session 1:**
- 5A + 5B can run alongside Unit 1 (no dependencies)

## Total Estimates

| Unit | Sub-units | Slices | Complexity | Sessions |
|------|-----------|--------|------------|---------|
| 1. ENGINE-TESTS | 5 (A-E) | 5 | L | 1 |
| 2. NL-HARDEN | 3 (A-C) | 3 | M | 1 |
| 3. DECOMPOSE | 4 (A-D) | 4-5 | L | 2 |
| 4. E2E | 3 (A-C) | 2 | M | 1 |
| 5. CLEANUP | 3 (A-C) | 2 | S-M | 1 |
| **Total** | **18** | **16-17** | | **~6** |

## Slice Dispatch Summary

| Slice | Unit | Task | Pattern | Files |
|-------|------|------|---------|-------|
| 16 | 1A | NL pipeline tests | Complementary | 2 test files |
| 17 | 1B | Validation core tests | Complementary | 1 test file (large) |
| 18 | 1C | Operation execution tests | Complementary | 5 test files |
| 19 | 1D | Spatial engine tests | Complementary | 3 test files |
| 20 | 1E | Registry tests | Complementary | 1 test file |
| 21 | 2A | Fix parameter extraction | Complementary | query-resolver.ts |
| 22 | 2B | Wire attribute-join | Complementary | plan-executor.ts |
| 23 | 2C | Resolver robustness | Complementary | query-resolver.ts |
| 24 | 3A | Extract operation dialogs | Complementary | 14+ new files, App.tsx |
| 25 | 3B | Extract hooks | Complementary | 4 new files, App.tsx |
| 26 | 3C | Extract panels | Complementary | 2 new files, App.tsx |
| 27 | 3D | Slim App.tsx | Single | App.tsx |
| 28 | 4A+B | Test datasets + Playwright | Single | 4 new files |
| 29 | 4C | E2E report | Single | 1 report |
| 30 | 5A+B | Archive + commit | Single | docs/ tree |
| 31 | 5C | Code-split | Complementary | vite.config.ts, App.tsx |

## Verification Gates

After each unit completes:

- [ ] Unit 1: `npm test` shows ≥400 tests (from 349), `src/lib/` coverage ≥40% (stepping toward 80%)
- [ ] Unit 2: All 5 canonical queries resolve with correct parameters, attribute-join executes
- [ ] Unit 3: `wc -l src/App.tsx` < 1,500, all tests + smoke test pass
- [ ] Unit 4: `node scripts/e2e-canonical-queries.mjs` passes 5/5
- [ ] Unit 5: `git status` clean, root <15 .md files, main bundle <2MB
