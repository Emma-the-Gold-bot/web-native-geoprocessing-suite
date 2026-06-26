# Slice 13 Review — Artifact Picker in NL Plan

**Reviewer:** Tester (subagent)
**Date:** 2026-06-25
**Status:** ✅ PASS

---

## Summary

Slice 13 adds an artifact picker to `NLQueryPanel` that appears when a plan has an artifact parameter (`source`, `mask`, `overlay`, `join_table`). The picker lists spatial FeatureCollection artifacts, auto-selects when only one exists, shows an empty state when none exist, and propagates the selection to plan execution via `handleStepParamChange`.

## Build & Tests

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (exit 0, 9.59s) |
| `npm test` (pre-existing) | ✅ 291/291 pass |
| `npm test` (with new tests) | ✅ 317/317 pass |

## New Tests Added

**File:** `src/components/__tests__/artifact-picker.test.tsx` (26 tests)

| Suite | Tests | What's Covered |
|-------|-------|----------------|
| Source layer label visibility | 2 | Label shown/hidden based on `planHasArtifactParam` |
| Empty state | 4 | 0 artifacts, non-spatial only, spatial but non-FC, has spatial (no empty) |
| Artifact filtering | 3 | FC included, non-spatial excluded, non-FC spatial excluded |
| Auto-selection | 3 | 1 artifact → auto-select, 2 artifacts → no auto-select, 0 → no auto-select |
| Placeholder option | 2 | "Select a layer…" shown for 2+, hidden for 1 |
| Selection propagation | 2 | User change → onParamChange called, correct param key (mask, overlay, etc.) |
| Display of selected artifact | 2 | Name shown after auto-select and manual selection |
| Dropdown option formatting | 2 | geometryType shown, falls back to kind |
| Mixed artifact scenarios | 2 | Only spatial FC in dropdown, picker hidden when no artifact param |
| ARTIFACT_PARAM_KEYS coverage | 4 | All 4 keys (source, mask, overlay, join_table) recognized |

## Code Review Findings

### ✅ Correct

1. **Filter logic** (line 48-50): `a.spatial && isFeatureCollection(a.data)` — correct dual gate. Non-spatial and non-FC spatial artifacts are excluded.

2. **Auto-select ref guard** (line 52-65): Uses `autoSelectAppliedRef` keyed by `planId:artifactId`. Prevents re-firing on re-renders. Resets on new plan (`resolveAndBuildPlan` sets `autoSelectAppliedRef.current = null`).

3. **Empty state** (line 271-282): Correctly shows "No spatial data loaded — import a dataset first." when `spatialArtifacts.length === 0`.

4. **Propagation** (line 67-77): useEffect watches `selectedSourceArtifactId`, finds first artifact param key via `ARTIFACT_PARAM_KEYS`, calls `handleStepParamChange` if value differs. Clean.

5. **handleStepParamChange** (line 152-178): Rebuilds `inputArtifacts` correctly when artifact param changes. Keeps non-artifact inputs, replaces artifact input for the changed role. Clears `refusal` when valid artifact selected.

6. **Plan description** (line 242-252): Injects artifact name into description when `opLabel` matches prefix and name not already present.

7. **Re-build on artifact change** (line 129-136): Plan re-builds when `selectedCandidate` or `artifacts` changes. New imports will appear in the picker.

### ⚠️ Minor Observations (non-blocking)

1. **Plan rebuild overwrites edits** (line 129-136): When artifacts change, `setEditedPlan(builtPlan)` replaces the entire plan. If the user manually changed output names or other params, those are lost. This is acceptable for a v1 — the user can re-edit after import. But worth noting for future refinement (e.g., merge edits onto rebuilt plan).

2. **`else if (spatialArtifacts.length === 0)` only clears selection** (line 63-64): When going from 1→2 artifacts (user imports a second dataset), the auto-select effect doesn't fire (correct — no auto-select for multiple). The previously auto-selected artifact remains selected. This is correct behavior — the user's choice persists.

3. **Description enhancement is prefix-only** (line 250): Only replaces when description starts with `opLabel`. Won't enhance descriptions like "Clip Parcels to boundary" where the operation isn't the first word. This is conservative and correct — avoids false replacements.

4. **Ref guard key format**: `editedPlan.id + ':' + onlyId` — ties auto-select to specific plan+artifact pair. New plan (new id) → ref guard resets → auto-select can fire again. Correct.

## Edge Cases Verified

| Scenario | Behavior | Status |
|----------|----------|--------|
| 0 spatial artifacts | Empty state shown, no dropdown | ✅ |
| 1 spatial artifact | Auto-selected, no placeholder | ✅ |
| 2+ spatial artifacts | Dropdown with placeholder | ✅ |
| Mix: spatial + non-spatial | Only spatial in dropdown | ✅ |
| Spatial but not FeatureCollection | Excluded | ✅ |
| Plan has no artifact param | Picker hidden entirely | ✅ |
| All 4 param keys (source/mask/overlay/join_table) | Recognized as artifact params | ✅ |
| New artifact imported | Plan rebuilds, picker updates | ✅ |
| Plan description with artifact name | Name injected when safe | ✅ |

## Acceptance Criteria

- [x] Build passes
- [x] All tests pass (317/317)
- [x] Test coverage for picker behavior (26 tests across 10 suites)
- [x] Review file written

## Files Changed

- `src/components/__tests__/artifact-picker.test.tsx` — **new** (26 tests)
- `SLICE_13_REVIEW.md` — **new** (this file)

## Verdict

Clean implementation. The filter logic, auto-select guard, propagation, and empty state all work correctly. No logic bugs found. The plan-rebuild-overwrites-edits behavior is the only thing to watch in future iterations, but it's acceptable for current scope.
