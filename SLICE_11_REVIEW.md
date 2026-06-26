# Slice 11 Review: Button Gating + Query State

**Reviewer:** TESTER subagent  
**Date:** 2026-06-25  
**Status:** ⚠️ Conditional pass — logic correct with one bug and two minor UX issues

---

## Summary

Slice 11 adds query state management to gate the Run, Save Query, and Reset buttons in both the sidebar and bottom dock SQL panels. The core gating logic is correct and consistent across both instances. However, `queryHasRunSuccessfully` is never reset to `false` on project lifecycle events, which is a logic bug.

---

## What Changed

| Change | Location | Status |
|--------|----------|--------|
| `queryHasRunSuccessfully` state added | Line 446 | ✅ |
| Run button disabled when `queryRunning \|\| 0 tables` | Lines 3404, 5539 | ✅ |
| Save Query disabled when `!queryHasRunSuccessfully` | Lines 3405, 5540 | ✅ |
| "Import data" link shown when 0 tables | Lines 3387, 5522 | ✅ |
| "Example query — import data to run this." label | Lines 3393, 5528 | ⚠️ Always shown |
| Reset button relabeled "Reset to example" | Lines 3406, 5541 | ✅ |

---

## Findings

### 🔴 Bug: `queryHasRunSuccessfully` never resets

**Severity:** Medium  
**Location:** `src/App.tsx` line 446 (declaration), line 2085 (set to true)

`queryHasRunSuccessfully` is initialized to `false` and set to `true` on line 2085 when a query runs successfully. However, it is **never reset to `false`** in either:

- `handleNewProject` (line ~1550) — clears artifacts, history, saved queries, but not this flag
- `handleOpenProject` (line ~1519) — restores project state, but doesn't reset this flag

**Impact:** After running a successful query, if the user creates a new project or opens a different project, the Save Query button remains enabled even though no query has been run in the new context. This could allow saving a query that has no valid result.

**Fix:** Add `setQueryHasRunSuccessfully(false)` to both `handleNewProject` and `handleOpenProject`.

**Test coverage:** A test documents this behavior (`button-gating.test.tsx` — "Save button stays enabled when queryHasRunSuccessfully=true but artifacts cleared"). The test currently asserts the buggy behavior; update it after the fix.

### ⚠️ Minor: "Example query" label always visible

**Severity:** Low  
**Location:** Lines 3393, 5528

The label "Example query — import data to run this." is shown unconditionally, even when queryable tables exist. This could confuse users into thinking they need to import data when they already have tables available.

**Suggestion:** Gate this label with the same `artifacts.filter((artifact) => artifact.tableName).length === 0` check, or reword it to be context-independent (e.g., "Example query — edit or run below.").

### ⚠️ Minor: "Import data" button behavior differs between panels

**Severity:** Low  
**Location:** Line 3387 (sidebar), Line 5522 (bottom dock)

- **Sidebar:** `onClick={() => importFileRef.current?.click()}` — directly triggers the file picker
- **Bottom dock:** `onClick={() => setBottomTab('table')}` — switches to the table tab (where import lives)

This is likely intentional (the bottom dock doesn't have direct access to the file input ref), but the different behavior could surprise users. Worth documenting or unifying.

---

## Consistency Verification

### Sidebar vs Bottom Dock

| Element | Sidebar | Bottom Dock | Match? |
|---------|---------|-------------|--------|
| Run button disabled logic | `queryRunning \|\| 0 tables` | `queryRunning \|\| 0 tables` | ✅ |
| Save button disabled logic | `!queryHasRunSuccessfully` | `!queryHasRunSuccessfully` | ✅ |
| Reset button text | "Reset to example" | "Reset to example" | ✅ |
| Error display | Same card structure | Same card structure | ✅ |
| Button labels | Run query / Save Query / Reset to example | Same | ✅ |

### `queryableTablesCount` Derivation

The count is computed inline as `artifacts.filter((artifact) => artifact.tableName).length`. This correctly counts only artifacts that have been imported and registered with a `tableName`. Both instances use the identical expression.

---

## Build & Test Results

- **Build:** ✅ Passes clean (9.08s)
- **Tests:** ✅ 291 passed (262 existing + 29 new), 0 failed
- **New test file:** `src/components/__tests__/button-gating.test.tsx`

### Test Coverage Added

| Scenario | Test |
|----------|------|
| Run disabled with 0 tables | ✅ |
| Run disabled with null-tableName artifacts | ✅ |
| Run enabled with 1+ tables | ✅ |
| Run disabled while running | ✅ |
| Run button text changes during execution | ✅ |
| Save disabled without successful query | ✅ |
| Save enabled after successful query | ✅ |
| Save disabled with tables but no query run | ✅ |
| Import data link shown when 0 tables | ✅ |
| Import data link hidden when tables exist | ✅ |
| Import data click handler fires | ✅ |
| Example query label present | ✅ |
| Example query label shown with tables | ✅ |
| Reset to example button present | ✅ |
| Reset click handler fires | ✅ |
| Error card shown/hidden | ✅ |
| Sidebar vs bottom dock consistency (6 tests) | ✅ |
| Edge cases (4 tests) | ✅ |

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Build passes | ✅ |
| All tests pass | ✅ |
| Test coverage for new gating logic | ✅ |
| Review file written | ✅ |

---

## Recommendation

**Merge after fixing the reset bug.** The `queryHasRunSuccessfully` reset is a one-line addition in two functions. All other logic is correct and well-tested.
