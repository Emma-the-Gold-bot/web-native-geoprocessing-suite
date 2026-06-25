# Slice 3.7 Code Review

## Goal
Fix 2 known technical debt items:
1. Z-order visual reorder (map.moveLayer calls)
2. Nested `<button>` HTML violation (outer → div role=button)

## Fix 1: Z-order reconciliation

- [x] reconcile pass present in App.tsx map-sync effect (lines ~1097–1141)
- [x] fill, line, point layers all moved together (each layer type moved in same loop)
- [x] moveLayer called in correct order (sorted by zIndex ascending, beforeId from next artifact's fill)
- [x] Tests added (4 contract tests verifying sort input, hidden exclusion, uniqueness, beforeFillId pattern)
- [x] Topmost artifact gets `map.moveLayer(fillId)` (no beforeId → moves to top)
- [x] Visibility gate respected: only visible artifacts participate in reconciliation
- [x] Safety checks: `map.getLayer(fillId)` and `map.getLayer(beforeFillId)` guards before moveLayer

**Implementation notes:**
- The reconciliation pass filters to `visible !== false`, sorts by zIndex ascending, then iterates.
- For each artifact, computes `beforeFillId` from the next-higher-zIndex artifact's fill layer.
- All three layer types (fill, line, point) for each artifact are moved together.
- The topmost artifact (no next) gets `map.moveLayer(fillId)` without a beforeId → moves to top.
- The old TODO comment (`// TODO: Slice 4`) is replaced with a proper comment explaining the reconciliation.

## Fix 2: Nested `<button>` violation

- [x] outer card now `<div role="button" tabIndex={0}>`
- [x] Enter and Space keys activate the card (with `e.preventDefault()`)
- [x] Click behavior preserved (`setSelectedArtifactId` + `setRightPanelOpen`)
- [x] React nested `<button>` warning gone (verified: no warning in test output)
- [x] Keyboard accessibility tests added (7 new tests)
- [x] `card-button` CSS class added with hover/focus-visible styles
- [x] Inner controls (visibility toggle, z-order buttons) remain real `<button>` elements inside the `<div>`

**Implementation notes:**
- Outer element changed from `<button>` to `<div>` with `role="button"` and `tabIndex={0}`.
- `onKeyDown` handler checks for `Enter` or `Space`, calls `preventDefault()`, then activates.
- CSS class `card-button` provides cursor, border removal, width, font inheritance, hover highlight, and focus-visible outline.
- The `layer-controls` div still has `stopPropagation` on click and mouseDown to prevent activation when interacting with controls.

## Test result

- **Tests passing:** 82/82
- **Tests updated:** 0 (existing tests still pass unchanged — `getByRole('button')` works with `role="button"`)
- **Tests added:** 11 total
  - 7 keyboard accessibility tests in `LayersPanel.test.tsx`
  - 4 z-order reconciliation contract tests in `map-sync-effect.test.ts`
- **Warnings:** None (nested `<button>` warning eliminated)

### New tests in `LayersPanel.test.tsx` (keyboard accessibility)
1. `artifact card has role="button"` — verifies role attribute
2. `artifact card has tabIndex={0}` — verifies keyboard focusability
3. `artifact card is a <div>, not <button>` — verifies structural fix
4. `Enter key on artifact card selects it and opens right panel`
5. `Space key on artifact card selects it and opens right panel`
6. `other keys on artifact card do not trigger selection` — Tab, Escape, 'a'
7. `no nested <button> warning: inner controls are inside <div>, not <button>` — structural verification

### New tests in `map-sync-effect.test.ts` (z-order reconciliation contract)
1. `sorted by zIndex ascending produces correct render order` — verifies sort input after reorder
2. `hidden layers are excluded from reconciliation sort` — verifies visibility filter
3. `zIndex values are unique after any sequence of reorders` — verifies swap invariant
4. `beforeFillId pattern: next artifact fill layer is used as beforeId` — verifies layer ID pattern

## Issues found in IMPLEMENTER's code

None. Both fixes are clean and correct.

**Observations (non-blocking):**
- The z-order reconciliation is still inline in App.tsx. A future extraction to a testable helper would enable direct unit testing of the moveLayer call sequence, but that's out of scope for this slice.
- The `card-button` class resets `border: none` and `background: none` — these may already be inherited from `.card` but are explicit for safety.

## File scope check

- ✅ `src/components/__tests__/LayersPanel.test.tsx` — modified (added 7 keyboard tests)
- ✅ `src/components/__tests__/map-sync-effect.test.ts` — modified (added 4 z-order contract tests)
- ✅ `src/components/__tests__/layer-controls-helpers.test.ts` — NOT modified (42 tests still pass)
- ✅ `SLICE_3_7_REVIEW.md` — created
- ✅ DID NOT touch: `src/App.tsx`, `src/components/LayersPanel.tsx`, `src/styles.css` (IMPLEMENTER's scope)
- ✅ DID NOT touch: `src/lib/**`, `src/types.ts`, `src/components/NLQueryPanel.tsx`, `src/components/DiscoveryPanel.tsx`
- ✅ DID NOT touch: `DEVELOPMENT.md`, `ACTIVE_TODO.md`, `vitest.config.ts`

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (6.70s) |
| `npm test` | ✅ 82/82 pass |
| Nested `<button>` warning | ✅ Gone |
| `git diff --stat HEAD src/App.tsx src/components/LayersPanel.tsx src/styles.css` | IMPLEMENTER's uncommitted changes only (not mine) |

## Recommendation

**ACCEPT**

Both fixes are correctly implemented:
1. Z-order reconciliation pass properly uses `map.moveLayer()` with correct beforeId computation and safety guards.
2. Nested `<button>` violation is fixed with `<div role="button">`, keyboard handlers, and proper CSS.
3. All 71 existing tests continue to pass.
4. 11 new tests added covering keyboard accessibility and z-order contract.
5. No nested `<button>` warning in test output.

## Notes for future slices

- Consider extracting the z-order reconciliation pass to a pure helper (like `layer-controls.ts`) for direct unit testing of moveLayer call sequences.
- The z-order reconciliation currently only handles base layers (fill/line/point) — selected highlight layers (`artifact-selected-fill-*`, etc.) are not included in the reconciliation pass. This may cause visual ordering issues if selected layers need to render above non-selected ones at different z-indices.
- The `card-button` CSS class could be applied to the saved query cards too (currently they use `role="button"` without the `card-button` class).
