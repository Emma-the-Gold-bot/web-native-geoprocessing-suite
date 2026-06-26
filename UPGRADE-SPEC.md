# GIS Suite Upgrade Specification

**Created:** 2026-06-25 23:31 PDT  
**Based on:** Opus 4.8 comprehensive evaluation  
**Status:** Phase 1 — SPECIFY (awaiting human review)

---

## Assumptions

1. **Intent:** Pilgrim wants a structured, prioritized upgrade plan based on Opus 4.8's honest assessment — not a vague roadmap, but specific, estimable work units with clear acceptance criteria.
2. **Codebase:** React 19 + MapLibre + GEOS-WASM / PROJ-WASM / DuckDB-WASM. ~20K lines across `src/`. App.tsx is 5,716 lines. 349 Vitest tests (UI-heavy). Browser validation scripts exist but aren't in `npm test`.
3. **Constraints:** No backend deployment (browser-first). No new dependencies unless explicitly approved. Dark theme preserved. Support-envelope honesty maintained.
4. **"Done" looks like:** Each upgrade unit is independently shippable, tested, and reduces a specific risk identified in the evaluation. The suite moves from "advanced prototype" to "credible internal-alpha with proven end-to-end flows."
5. **Unknowns:** Whether Pilgrim wants to tackle all 5 upgrades or select a subset. Whether an LLM resolver is feasible (cost, latency). Whether App.tsx decomposition should be incremental or structural.

---

## A. Objective

**Primary:** Transform the GIS Suite from advanced-prototype to credible internal-alpha by paying down the five critical/high debts identified by Opus 4.8.

**Secondary:**
- Establish unit test coverage for the spatial engine and operation pipeline
- Decompose App.tsx into maintainable, testable modules
- Make the NL pipeline reliable enough for real use
- Prove end-to-end workflows with real data
- Clean up documentation sprawl

**Out of scope:**
- Raster rendering (STAC asset display)
- Mobile-native app
- Multi-user collaboration
- Production deployment / hosting

---

## B. Commands

- `npm test` — Vitest suite (must stay green throughout)
- `npm run build` — TypeScript + Vite build
- `node scripts/smoke-test.mjs` — Playwright smoke test against built preview
- `node scripts/run-operation-validations-browser.mjs` — Browser-based engine validation (to be migrated into Vitest)
- `git push origin main` — Deploy to origin

---

## C. Project Structure

### Upgrade 1: Engine Unit Tests
**Files created:**
- `src/lib/__tests__/plan-executor.test.ts`
- `src/lib/__tests__/operation-validation-core.test.ts`
- `src/lib/__tests__/query-resolver.test.ts`
- `src/lib/spatial/__tests__/geometry-engine.test.ts`
- `src/lib/spatial/__tests__/display-transform.test.ts`
- `src/lib/spatial/__tests__/crs-engine.test.ts`
- `src/lib/operations/__tests__/registry.test.ts`
- `src/lib/operations/__tests__/topology-execution.test.ts`
- `src/lib/operations/__tests__/measurement-execution.test.ts`
- `src/lib/operations/__tests__/aggregation-execution.test.ts`
- `src/lib/operations/__tests__/attribute-join.test.ts`
- `src/lib/operations/__tests__/crs-policy.test.ts`

**Files modified:** None (tests only)

### Upgrade 2: App.tsx Decomposition
**Files created:**
- `src/hooks/useUndoRedo.ts` — undo/redo stack hook
- `src/hooks/useArtifacts.ts` — artifact state management hook
- `src/hooks/useMapSync.ts` — map-source/layer sync hook
- `src/hooks/useImportExport.ts` — import/export/persistence hook
- `src/components/operations/BufferDialog.tsx`
- `src/components/operations/CentroidDialog.tsx`
- `src/components/operations/ClipDialog.tsx`
- `src/components/operations/IntersectDialog.tsx`
- `src/components/operations/JoinDialog.tsx`
- `src/components/operations/SimplifyDialog.tsx`
- `src/components/operations/DissolveDialog.tsx`
- `src/components/operations/EnvelopeDialog.tsx`
- `src/components/operations/ReprojectDialog.tsx`
- `src/components/operations/MeasureDialog.tsx` (area, perimeter, compactness)
- `src/components/operations/OperationDialog.tsx` — shared wrapper
- `src/components/RightPanel.tsx` — Details/History panel extracted
- `src/components/BottomDock.tsx` — bottom dock + command bar extracted

**Files modified:**
- `src/App.tsx` — reduced to orchestration shell (~800-1200 lines target)

### Upgrade 3: NL Resolver Hardening
**Files created:**
- `src/lib/nl/llm-resolver.ts` — LLM-backed resolver (optional, behind feature flag)
- `src/lib/nl/__tests__/query-resolver.test.ts` — comprehensive resolver tests
- `src/lib/nl/__tests__/plan-executor.test.ts` — executor path tests

**Files modified:**
- `src/lib/nl/query-resolver.ts` — hardened regex + parameter extraction
- `src/lib/nl/plan-executor.ts` — wire `executeAttributeJoinStep` into main `executePlan` loop

### Upgrade 4: End-to-End Real-Data Validation
**Files created:**
- `scripts/e2e-canonical-queries.mjs` — Playwright script: 5 canonical queries, import → plan → execute → render → verify
- `data/test-datasets/` — small real GeoJSON files for testing
- `E2E-VALIDATION-REPORT.md` — results document

**Files modified:**
- `scripts/smoke-test.mjs` — extend with e2e assertions

### Upgrade 5: Documentation & Bundle Cleanup
**Files created:**
- `docs/` directory — archive for superseded docs
- `docs/CURRENT-STATUS.md` — single source of truth

**Files modified:**
- `App.tsx` / `vite.config.ts` — lazy-load WASM engines, dynamic import operation dialogs
- Delete or archive ~30 stale root-level markdown files
- Commit or delete untracked files (discovery/, add_intents.py, etc.)
- `DEVELOPMENT.md` — updated as single current-truth source
- `PROGRESS.md`, `TOMORROW.md`, `ACTIVE_TODO.md` — archived or deleted

---

## D. Code Style

- TypeScript strict mode (already enforced by `tsc -b`)
- Existing conventions: camelCase variables, PascalCase components/types, kebab-case files
- Vitest for all tests — no Jest, no Mocha
- React functional components with hooks
- CSS custom properties (no Tailwind, no CSS modules)
- JSDoc comments on exported functions in `src/lib/`
- Commit messages: `Slice N: <description>` format, present tense

---

## E. Testing Strategy

### Unit Tests (Upgrade 1)
- **Framework:** Vitest (existing)
- **Target:** Every exported function in `src/lib/` and `src/lib/spatial/` has at least one test
- **Coverage goal:** 80% line coverage on `src/lib/` (up from ~5%)
- **Priority order:** plan-executor → operation-validation-core → query-resolver → topology-execution → measurement-execution → aggregation-execution → attribute-join → crs-policy → geometry-engine → display-transform → registry

### Integration Tests (Upgrade 3-4)
- **NL pipeline:** query string → resolver → plan-builder → plan-executor → assert output
- **5 canonical queries:** "buffer parcels 500 feet", "intersect parcels with floodzone", "dissolve parcels by zone", "join ownership to parcels by APN", "reproject parcels to EPSG:32610"
- Each must complete end-to-end with real data

### E2E Tests (Upgrade 4)
- **Framework:** Playwright (existing smoke-test pattern)
- **Target:** 5 canonical queries run against built preview, assert map renders results
- **Data:** Small real GeoJSON files (parcels, floodzone, ownership) in `data/test-datasets/`

### Existing Tests
- 349 current tests must stay green throughout
- No test deletions — only additions and refactors

---

## F. Boundaries

### Always do
- Run `npm run build` and `npm test` before committing
- Keep SUPPORT-ENVELOPE.md honesty — never claim more than is validated
- Commit per slice with descriptive messages
- Update DEVELOPMENT.md when slices ship
- Preserve existing test behavior (no breaking changes to test contracts)

### Ask first
- Install new npm packages
- Change vite.config.ts build configuration
- Modify any file in `src/lib/spatial/` that touches WASM engine initialization
- Add LLM resolver (costs money, needs API key)
- Delete any markdown files (may have historical value)

### Never do
- Remove or skip existing tests to make builds pass
- Change SUPPORT-ENVELOPE.md claim tiers without explicit approval
- Introduce a backend dependency (must stay browser-first)
- Touch `src/lib/operation-validation-core.ts` without running browser validations
- Merge code that drops a parameter the user explicitly typed

---

## Upgrade Priority & Dependencies

```
Upgrade 1 (Engine Tests) ──────────────────────────────┐
                                                        │
Upgrade 2 (App.tsx Decompose) ──────────────────────┐  │
                                                     │  │
Upgrade 3 (NL Hardening) ─────────────────────┐    │  │
                                                │    │  │
Upgrade 4 (E2E Validation) ───────────────┐    │    │
                                           │    │    │
Upgrade 5 (Docs + Bundle) ───────────┐    │    │    │
                                      │    │    │    │
                                      v    v    v    v
                                   SHIP
```

**Recommended sequence:**
1. **Upgrade 1** (Engine Tests) — first, because it protects all subsequent work
2. **Upgrade 3** (NL Hardening) — second, because it's smaller than Upgrade 2 and unblocks Upgrade 4
3. **Upgrade 2** (App.tsx Decompose) — third, largest effort, benefits from test coverage
4. **Upgrade 4** (E2E Validation) — fourth, validates everything above
5. **Upgrade 5** (Docs + Bundle) — last, cleanup pass

**Parallelizable:** Upgrades 1 and 5 can run in parallel. Upgrades 2 and 3 can overlap if file scopes are disjoint.

---

## Complexity Estimates

| Upgrade | Complexity | Est. Slices | Est. Time | Risk |
|---------|-----------|-------------|-----------|------|
| 1. Engine Unit Tests | L | 4-6 slices | 2-3 sessions | Low — additive only |
| 2. App.tsx Decompose | L | 8-12 slices | 3-4 sessions | Medium — refactoring working code |
| 3. NL Hardening | M | 3-4 slices | 1-2 sessions | Medium — touches core flow |
| 4. E2E Validation | M | 2-3 slices | 1 session | Low — validation only |
| 5. Docs + Bundle | S-M | 2-3 slices | 1 session | Low — cleanup |

**Total:** ~20-28 slices, 8-11 sessions

---

## Success Criteria

- [ ] `src/lib/` has ≥80% Vitest line coverage (from ~5% today)
- [ ] App.tsx is under 1,500 lines (from 5,716)
- [ ] `attribute-join-v1` executes successfully via NL pipeline
- [ ] "Buffer parcels 500 feet" preserves `distance=500` in the plan
- [ ] All 5 canonical queries complete end-to-end with real data
- [ ] No untracked files in `git status`
- [ ] Root directory has <15 markdown files (from 59)
- [ ] Bundle is code-split (WASM engines lazy-loaded)
- [ ] All 349+ existing tests remain green
- [ ] DEVELOPMENT.md is the single source of truth for project status
