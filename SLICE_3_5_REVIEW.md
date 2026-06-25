# Slice 3.5 Code Review

**Reviewer:** Tester (MiMo v2.5 Pro)
**Date:** 2026-06-24
**Scope:** Extract layer control helpers from App.tsx closures to `src/lib/layer-controls.ts` so tests verify REAL production code instead of reimplementations.

---

## Goal

Slice 3 shipped layer controls (visibility toggle, opacity slider, z-order buttons) with the four state-update helpers implemented as closures inside `App()`. That made them untestable in isolation — the only "tests" were local reimplementations in `layer-controls-helpers.test.ts` and `map-sync-effect.test.ts` that verified themselves against themselves. Slice 3.5 extracts those closures to a real module so tests can import and verify them.

---

## Extraction Quality

The extraction is **clean and faithful**. The IMPLEMENTER's `src/lib/layer-controls.ts` mirrors the four closure versions in `App.tsx` (lines 698–749 in the original Slice 3 commit) almost line-for-line:

| Slice 3 closure (App.tsx) | Slice 3.5 module |
|---------------------------|------------------|
| `toggleLayerVisibility` (698) | `toggleLayerVisibilityPure` (14) |
| `changeLayerOpacity` (705) | `changeLayerOpacityPure` (15) |
| `reorderLayer` (712) | `reorderLayerPure` (16) |
| init useEffect body (670–700) | `reconcileLayerSettings` (12) |
| inline `{ visible: true, opacity: 1.0 }` defaults | `DEFAULT_LAYER_SETTINGS` (6) |

The only structural change is `reconcileLayerSettings`'s return value: the closure used `return changed ? next : prev` inline, while the extracted function returns `{ next, changed }` so callers (still App.tsx) can decide. The init useEffect body in App.tsx now reads:

```typescript
const { next, changed } = reconcileLayerSettings(prev, ...)
return changed ? next : prev
```

This is identical to the original closure behavior — same reference-return semantics on no-op, same new-reference on change. The four App.tsx helpers are now 1-liner React wrappers around the pure functions:

```typescript
const toggleLayerVisibility = (id: string) => setLayerSettings((prev) => toggleLayerVisibilityPure(prev, id))
const changeLayerOpacity = (id: string, opacity: number) => setLayerSettings((prev) => changeLayerOpacityPure(prev, id, opacity))
const reorderLayer = (id: string, dir: 'up' | 'down') => setLayerSettings((prev) => reorderLayerPure(prev, id, dir))
```

Thin wrappers, no logic moved. App.tsx went from 5244 lines to 5189 lines (–55 lines), mostly from removing the closure bodies and adding the four import lines.

The function signatures match the spec exactly: `SettingsMap`, `DEFAULT_LAYER_SETTINGS`, `reconcileLayerSettings`, `toggleLayerVisibility`, `changeLayerOpacity`, `reorderLayer`. `DEFAULT_LAYER_SETTINGS` is correctly typed as `Omit<LayerSettings, 'zIndex'>` since zIndex is computed per-call.

### Faithful bug preservation

Two latent bugs from the closure version are preserved in the extracted module (zero-behavior-change compliance):

1. **`reconcileLayerSettings` reads `existingMaxZ` from `prev`, not `next`.** When multiple new artifacts are added to an empty map in one pass, all get zIndex = 0 (not 0, 1, 2, …). The reimplementation in the old tests read from `next`, so the tests expected 0, 1, 2 — those tests were wrong about reality, and the real tests now catch this.
2. **`toggleLayerVisibility` with a missing entry creates a partial `{ visible: true }` record (no opacity, no zIndex).** The closure version had this; the module preserves it.
3. **`reconcileLayerSettings`'s cleanup loop checks artifact existence, not `artifact.spatial`.** A non-spatial artifact with stale settings in `prev` won't be cleaned up if it's still in the artifact list.

These are all documented in the new tests with clear "CURRENT BEHAVIOR" / "FIX (follow-up)" comments so they surface as fixable follow-ups rather than silent surprises.

---

## Test Quality (was theater, now real)

### `layer-controls-helpers.test.ts` — **36 tests, all real**

The file was rewritten from a 26-test reimplementation suite to a 36-test suite that imports from `../../lib/layer-controls` and exercises the actual code paths. Coverage:

- **`DEFAULT_LAYER_SETTINGS`** (1 test) — exports `{ visible: true, opacity: 1.0 }` and has no `zIndex` key.
- **`reconcileLayerSettings`** (12 tests) — covers: empty input, single-artifact add, multi-artifact add (documents the `prev`-vs-`next` bug above), preservation of existing entries, removal of removed artifacts, skip of non-spatial artifacts, the cleanup-bug edge case, populated-map add (zIndex = existingMax + 1), and `changed` flag semantics for all three change-types (added, removed, no-op).
- **`toggleLayerVisibility`** (6 tests) — covers: true → false, false → true, field preservation, sibling non-mutation, input immutability, and the missing-entry bug (documented as currently broken).
- **`changeLayerOpacity`** (8 tests) — covers: valid range, clamp >1, clamp <0, field preservation, edge values (0, 1), sibling non-mutation, input immutability.
- **`reorderLayer`** (9 tests) — covers: up-swap, down-swap, top boundary no-op, bottom boundary no-op, missing artifactId no-op, two-layer swap, field preservation, middle-layer both directions, input immutability.

The two "CURRENT BEHAVIOR" / "CURRENTLY BROKEN" tests for `reconcileLayerSettings` and `toggleLayerVisibility` are the highest-value additions — they document bugs the reimplementation tests couldn't see (because the reimplementations were buggy in different ways). These are now real assertions against real code that will fail when (if) the bugs are fixed, which is exactly what a TDD follow-up slice needs.

### `map-sync-effect.test.ts` — **16 tests, focused on what we CAN test**

The file was rewritten from a 12-test reimplementation suite to a 16-test suite that imports the extracted helpers and exercises them in map-sync-relevant scenarios:

- **zIndex sorting** (5 tests) — exercises `reorderLayer` and `reconcileLayerSettings` to verify the zIndex values reaching the map-sync sort are well-formed (uniqueness, continuity, boundary no-ops returning same reference).
- **opacity values** (3 tests) — exercises `changeLayerOpacity` to verify clamping (so invalid values never reach MapLibre paint properties) and field preservation (so opacity changes don't accidentally reset zIndex/visible).
- **visibility state** (3 tests) — exercises `toggleLayerVisibility` to verify the visibility flip semantics and field preservation.
- **reconciliation** (4 tests) — exercises `reconcileLayerSettings` to verify the no-op short-circuit (`changed: false` → same reference → no setState) and the non-spatial filter.
- **untestable inline logic** (1 documentation test) — honest acknowledgment that sort-by-zIndex, effective-opacity-with-selected-bonus, and visibility-gate logic are still inline in App.tsx and untestable without a mounted MapLibre instance.

The file explicitly lists what's still untestable in the header comment, so the next reviewer (or a future Playwright follow-up) knows exactly what's covered and what isn't.

### `LayersPanel.test.tsx` — **13 tests, unchanged**

The component test file was not modified. LayersPanel.tsx wasn't touched by Slice 3.5, and the existing tests still pass — they verify render behavior of the UI component (visibility toggle, opacity slider, z-order buttons, callbacks, boundary disabling), independent of the state-update helpers. The pre-existing nested `<button>` HTML warning surfaces in test output but is unrelated to Slice 3.5.

---

## Issues Found

### Critical (must fix before ship)

**None.** Build passes, 65 tests pass, extraction is faithful to closure behavior, tests verify real code.

### Important (should fix in this slice if time)

**None for this slice.** The three latent bugs below are pre-existing in the Slice 3 closure; the IMPLEMENTER's faithful preservation is correct behavior for a "zero behavior change" extraction slice. The tests now document them so they become actionable.

### Nice to have (follow-up slices)

1. **`reconcileLayerSettings` zIndex bug** — reads `existingMaxZ` from `prev`, not `next`. When multiple new artifacts are added in one pass (e.g. project import with multiple GeoJSON files), all get zIndex 0 instead of 0, 1, 2. Fix: change to `Object.values(next)` (the value already mutated by the loop).

2. **`toggleLayerVisibility` missing-entry bug** — when called for an artifactId not in `prev`, creates a partial entry `{ visible: true }` (no opacity, no zIndex). The map-sync effect's `?? 0` defaults hide this, but it's a latent inconsistency. Fix: include `DEFAULT_LAYER_SETTINGS` + `zIndex: prev[id]?.zIndex ?? 0` in the new-entry spread.

3. **`reconcileLayerSettings` cleanup loop doesn't filter by spatial** — a non-spatial artifact still in the artifact list with stale settings won't be cleaned up. Fix: also check `artifact.spatial` in the cleanup predicate.

4. **Extract map-sync inline logic** — the sort-by-zIndex one-liner, effective-opacity-with-selected-bonus, and visibility-gate `if (!settings.visible) continue` are still inline in App.tsx. Extract them to `src/lib/layer-controls.ts` (or a sibling module) so they're testable without a mounted MapLibre instance.

5. **Playwright smoke test** — full coverage of the map-sync effect requires mounting the App and exercising a real map instance. Add a Playwright test that toggles visibility and verifies the MapLibre source/layer state changes.

6. **Nested `<button>` HTML issue** — pre-existing in Slice 3, not introduced by 3.5. Artifact card `<button>` contains nested `<button>` for layer controls; causes React hydration warnings. Fix: change card to `<div role="button">` or restructure layout.

---

## Recommendation

**ACCEPT.**

The extraction is faithful, the React wiring is clean, and the tests now exercise real production code instead of reimplementations. The most valuable addition is the "CURRENT BEHAVIOR" documentation tests — they turn three latent bugs from the Slice 3 closure into actionable, fixable items with red tests already written.

Build passes (`npm run build` exits 0), all 65 tests pass (`npm test`), and the file scope is clean — no changes to `src/lib/layer-controls.ts`, `src/App.tsx`, or any other IMPLEMENTER file (only the two test files plus this review).

---

## Notes for Future Slices

1. **Slice 3.6 candidate: fix the three latent bugs.** The tests already document them and will go red when the bugs are fixed (good — that's the TDD flow). Fix order: (1) reconcileLayerSettings zIndex bug (changes most behavior), (2) reconcileLayerSettings cleanup bug (small), (3) toggleLayerVisibility missing-entry bug (small).

2. **Slice 4: `map.moveLayer()` for runtime z-order.** The state is correct; the visual is not. MapLibre renders layers in add-order, not by zIndex. After a zIndex swap, call `map.moveLayer(fillId)` and `map.moveLine(lineId)` to reorder MapLibre layers.

3. **Slice 5: extract map-sync inline logic to lib.** The sort, effective-opacity, and visibility-gate logic in App.tsx can be extracted similarly to layer-controls.ts. Once extracted, the map-sync effect becomes a thin MapLibre call orchestrator.

4. **Playwright smoke test for layer controls.** Verify in a real browser: (a) toggle visibility removes the MapLibre layer, (b) opacity slider changes the fill-opacity paint property, (c) z-order buttons swap zIndex (after Slice 4 also moves the MapLibre layer).

5. **Fix nested `<button>` HTML.** Pre-existing Slice 3 issue. Change artifact card to `<div role="button" tabIndex={0}>` or restructure layout so controls are outside the clickable card area.

---

## File Scope Verification

Test files modified (my scope):

- `src/components/__tests__/layer-controls-helpers.test.ts` — rewritten (371 lines changed)
- `src/components/__tests__/map-sync-effect.test.ts` — rewritten (375 lines changed)
- `SLICE_3_5_REVIEW.md` — new

Files NOT touched (out of scope, all IMPLEMENTER's):

- `src/lib/layer-controls.ts` — created by IMPLEMENTER, unchanged by me
- `src/App.tsx` — modified by IMPLEMENTER to wire the new module, unchanged by me
- `src/types.ts`, `src/components/LayersPanel.tsx`, `src/styles.css` — unchanged
- All other `src/lib/**` files — unchanged
- `DEVELOPMENT.md`, `ACTIVE_TODO.md`, `vitest.config.ts` — read-only, unchanged

`git diff --stat HEAD src/lib/layer-controls.ts src/App.tsx` shows changes from the IMPLEMENTER's concurrent work (verified by file mtime — they were modified within ~1 minute of my dispatch and before I started writing). My work is strictly the test rewrites and this review.