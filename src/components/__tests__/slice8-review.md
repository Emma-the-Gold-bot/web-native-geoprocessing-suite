# Slice 8 Review Checklist: Undo/Redo Stack

**Reviewer:** (Judge fills in)
**Date:** (Judge fills in)
**Status:** ⬜ Pending

---

## Acceptance Criteria Verification

### AC1: Ctrl+Z / Cmd+Z undoes the last artifact change

- [ ] **`src/App.tsx`**: `handleUndo()` function exists and removes the last added artifact by restoring the snapshot
- [ ] **`src/App.tsx`**: Keyboard handler registered via `useEffect` — listens for `keydown` on `window`
- [ ] **`src/App.tsx`**: `e.metaKey || e.ctrlKey` check gates the handler (Mac + Windows)
- [ ] **`src/App.tsx`**: `e.key === 'z' && !e.shiftKey` triggers undo
- [ ] **`src/App.tsx`**: `e.preventDefault()` called to suppress browser default (Ctrl+Z = undo text)
- [ ] **Functional test**: Import a file → Ctrl+Z → artifact disappears from artifacts array

### AC2: Ctrl+Shift+Z / Cmd+Shift+Z (or Ctrl+Y) redoes the last undone change

- [ ] **`src/App.tsx`**: `handleRedo()` function exists and restores the next redo snapshot
- [ ] **`src/App.tsx`**: `(e.key === 'z' && e.shiftKey) || e.key === 'y'` triggers redo
- [ ] **`src/App.tsx`**: Both `Ctrl+Shift+Z` and `Ctrl+Y` work (Mac equivalents too)
- [ ] **Functional test**: Import → Ctrl+Z → Ctrl+Shift+Z → artifact reappears

### AC3: Undo/Redo buttons in top bar show disabled state when stack is empty

- [ ] **`src/App.tsx`**: Two buttons (Undo2 / Redo2 icons from lucide-react) rendered in the top bar
- [ ] **`src/App.tsx`**: Undo button has `disabled={!canUndo}` (or equivalent)
- [ ] **`src/App.tsx`**: Redo button has `disabled={!canRedo}` (or equivalent)
- [ ] **`src/styles.css`**: Disabled state visually dimmed (`.actions .secondary:disabled` or `opacity: 0.4`)
- [ ] **Visual test**: On fresh load with no imports, both buttons are disabled

### AC4: Button tooltips show what would be undone/redone

- [ ] **`src/App.tsx`**: Undo button has `title` or tooltip showing the label of the top undo entry
- [ ] **`src/App.tsx`**: Redo button has `title` or tooltip showing the label of the top redo entry
- [ ] **`src/App.tsx`**: Tooltip is a fallback string (e.g., "Nothing to undo") when stack is empty
- [ ] **Visual test**: Hover over undo button after import — tooltip shows "Import: filename"

### AC5: Toast confirms what was undone/redone

- [ ] **`src/App.tsx`**: `handleUndo()` calls `addToast(`Undid: ${entry.label}`, 'info')` after restoring
- [ ] **`src/App.tsx`**: `handleRedo()` calls `addToast(`Redid: ${entry.label}`, 'info')` after restoring
- [ ] **Functional test**: Undo → toast appears with "Undid: ..." text

### AC6: New change after undo clears the redo stack

- [ ] **`src/App.tsx`**: `pushArtifactSnapshot(label)` sets `redoStack.current = []` (or `.length = 0`)
- [ ] **`src/App.tsx`**: This is called BEFORE each `setArtifacts` mutation
- [ ] **Functional test**: Import A → Import B → Ctrl+Z (undo B) → Import C → Ctrl+Shift+Z does nothing (redo stack cleared)

### AC7: Undo preserves all artifact data + cleans up orphaned layer settings

- [ ] **`src/App.tsx`**: `handleUndo()` filters `layerSettings` after restoring artifacts
- [ ] **`src/App.tsx`**: Only `layerSettings` entries whose IDs exist in the restored artifacts array are kept
- [ ] **`src/App.tsx`**: `setLayerSettings(prev => ...)` with the filtered map
- [ ] **`src/App.tsx`**: Same cleanup in `handleRedo()` for symmetry
- [ ] **Functional test**: Import spatial file → toggle visibility → undo → layer settings for that artifact are removed

### AC8: All existing tests pass (195/195)

- [ ] Run `npm test` — all 195 existing tests pass
- [ ] No regressions in LayersPanel, DiscoveryPanel, map-sync-effect, layer-controls, or bottom-sheet tests
- [ ] New undo-redo tests (29 cases) also pass

### AC9: `npm run build` clean

- [ ] Run `npm run build` — no TypeScript errors
- [ ] No unused imports or dead code warnings

### AC10: Smoke test passes (9/9)

- [ ] Run smoke test suite — all 9 pass

---

## Mutation Site Coverage Audit

The spec identifies ~12 `setArtifacts` mutation sites that need `pushArtifactSnapshot(label)` called BEFORE each one. Every site where `setArtifacts` adds an artifact must have a preceding `pushArtifactSnapshot` call.

### Grep commands to verify coverage

```bash
# Find ALL setArtifacts call sites in App.tsx
grep -n 'setArtifacts' src/App.tsx

# Find ALL pushArtifactSnapshot call sites
grep -n 'pushArtifactSnapshot' src/App.tsx

# Verify pushArtifactSnapshot appears before each setArtifacts mutation
# For each setArtifacts line number, check if pushArtifactSnapshot appears within ~5 lines above
grep -B5 'setArtifacts' src/App.tsx | grep -E 'pushArtifactSnapshot|setArtifacts'
```

### Expected mutation sites (from spec)

Each of these operations should have `pushArtifactSnapshot(label)` before its `setArtifacts` call:

| # | Operation | Expected label pattern | Verified |
|---|-----------|----------------------|----------|
| 1 | `confirmImport()` — adds source artifact | `"Import: {filename}"` | ⬜ |
| 2 | `runQuery()` — materializes query result | `"Query: {queryPreview}"` | ⬜ |
| 3 | Buffer operation | `"Buffer {distance} {unit} on {name}"` | ⬜ |
| 4 | Centroid operation | `"Centroid on {name}"` | ⬜ |
| 5 | Clip operation | `"Clip {name}"` | ⬜ |
| 6 | Dissolve operation | `"Dissolve {name}"` | ⬜ |
| 7 | Union operation | `"Union {name}"` | ⬜ |
| 8 | Intersect operation | `"Intersect {name}"` | ⬜ |
| 9 | Discovery import | `"Import: {name}"` | ⬜ |
| 10 | Additional geoprocessing ops | varies | ⬜ |
| 11 | Additional geoprocessing ops | varies | ⬜ |
| 12 | Additional mutation site | varies | ⬜ |

**Missing any one means that operation is NOT undoable.**

---

## Structural Checks

### undoStack / redoStack refs

- [ ] **`src/App.tsx`**: `const undoStack = useRef<UndoEntry[]>([])` declared
- [ ] **`src/App.tsx`**: `const redoStack = useRef<UndoEntry[]>([])` declared
- [ ] **`src/App.tsx`**: `UndoEntry` interface: `{ artifacts: Artifact[], label: string, timestamp: number }`
- [ ] **`src/App.tsx`**: Stacks use `useRef` (not `useState`) — mutations don't trigger re-renders

### pushArtifactSnapshot helper

- [ ] **`src/App.tsx`**: `pushArtifactSnapshot(label: string)` function exists
- [ ] **`src/App.tsx`**: Pushes current `artifacts` (deep enough copy — at least `[...artifacts]`)
- [ ] **`src/App.tsx`**: Sets `redoStack.current = []` to clear redo on new change
- [ ] **`src/App.tsx`**: Snapshot `timestamp` is `Date.now()`

### handleUndo / handleRedo functions

- [ ] **`src/App.tsx`**: `handleUndo()` pops from `undoStack`, pushes to `redoStack`, calls `setArtifacts`
- [ ] **`src/App.tsx`**: `handleRedo()` pops from `redoStack`, pushes to `undoStack`, calls `setArtifacts`
- [ ] **`src/App.tsx`**: Both handle empty stack (no-op / early return)
- [ ] **`src/App.tsx`**: Both call `cleanLayerSettings` or inline filter on `layerSettings`
- [ ] **`src/App.tsx`**: Both call `addToast` with the entry label

### canUndo / canRedo derived state

- [ ] **`src/App.tsx`**: `canUndo` derived from `undoStack.current.length > 0`
- [ ] **`src/App.tsx`**: `canRedo` derived from `redoStack.current.length > 0`
- [ ] **`src/App.tsx`**: Used in button `disabled` prop and keyboard handler guard

### Keyboard shortcut handler

- [ ] **`src/App.tsx`**: `useEffect` with `window.addEventListener('keydown', handleKeyDown)`
- [ ] **`src/App.tsx`**: Cleanup: `return () => window.removeEventListener(...)`
- [ ] **`src/App.tsx`**: `handleUndo` / `handleRedo` in dependency array or stable refs (no stale closures)

### UI: Undo/Redo buttons

- [ ] **`src/App.tsx`**: Buttons rendered in top bar (near existing `.actions` area)
- [ ] **`src/App.tsx`**: Uses `Undo2` and `Redo2` icons from `lucide-react`
- [ ] **`src/App.tsx`**: Buttons have `className="secondary"` or matching existing pattern
- [ ] **`src/styles.css`**: Button styles match existing `.actions .secondary` pattern
- [ ] **`src/App.tsx`**: `onClick` calls `handleUndo()` / `handleRedo()`

---

## Snapshot Integrity Checks

### Deep copy verification

- [ ] **`src/App.tsx`**: `pushArtifactSnapshot` does NOT just push a reference — must spread or clone
- [ ] Correct pattern: `undoStack.current.push({ artifacts: [...currentArtifacts], ... })`
- [ ] **Risk**: If artifacts contain nested objects (GeoJSON features), shallow spread may share references. Acceptable for now per spec, but worth noting.

### Stack mutation safety

- [ ] **`src/App.tsx`**: `undo()` does not mutate the undoStack entry after popping (no reference leaks)
- [ ] **`src/App.tsx`**: `redo()` does not mutate the redoStack entry after popping

---

## Code Quality Checks

- [ ] No new `any` types introduced
- [ ] `UndoEntry` interface is properly typed (not inline object literals everywhere)
- [ ] No dead code (e.g., unused `useUndoRedu` hook if approach changed)
- [ ] Keyboard handler has correct cleanup in `useEffect` return
- [ ] `handleUndo`/`handleRedo` are wrapped in `useCallback` or stable (no stale closure risk in keyboard handler)
- [ ] No circular dependency issues
- [ ] Comments explain the snapshot pattern for future maintainers

---

## Files Changed (verify against spec)

| File | Expected Change | Verified |
|------|----------------|----------|
| `src/App.tsx` | ~80-120 lines: undoStack/redoStack refs, pushArtifactSnapshot, handleUndo/Redo, keyboard handler, buttons | ⬜ |
| `src/styles.css` | ~10-20 lines: undo/redo button styles | ⬜ |
| New test file | `src/components/__tests__/undo-redo.test.ts` — 29 test cases | ⬜ |
| New review file | `src/components/__tests__/slice8-review.md` — this checklist | ⬜ |

---

## Risks from Spec (verify mitigated)

- [ ] **Snapshot size**: Large GeoJSON artifacts in snapshots — acceptable per spec, no mitigation needed now
- [ ] **12 mutation sites**: All covered with `pushArtifactSnapshot` — see mutation site audit above
- [ ] **Layer settings orphaning**: Verified cleanup exists in both handleUndo and handleRedo
- [ ] **Stale closures**: Keyboard handler useEffect has correct dependency management
- [ ] **Stack growth**: No max stack size limit — could grow unbounded with many operations. Acceptable for now.

---

## Notes

_(Judge fills in findings here)_
