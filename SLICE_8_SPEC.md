# Slice 8: Undo/Redo Stack

## Goal

Add undo/redo for artifact-affecting operations (import, query, geoprocessing operations). Users can Ctrl+Z / Ctrl+Shift+Z (or Cmd+Z / Cmd+Shift+Z on Mac) to undo/redo the last artifact change.

## Current State

- `artifacts` is a flat `useState<Artifact[]>` array (line 434)
- `history` is a display-only log of `HistoryEvent[]` (line 435) — append-only, never used for reversal
- ~12 call sites do `setArtifacts(current => [...current, result.artifact!])` — each adds a derived artifact
- `confirmImport()` adds source artifacts via `setArtifacts((current) => [...current, updatedArtifact])`
- `runQuery()` materializes query results as artifacts
- No artifact deletion exists (no remove path — undo would be the first "removal")
- `projectName`, `savedQueries`, `layerSettings` also change but are NOT in scope for undo/redo

## Design

### What's undoable

Only `artifacts` array changes. Each undo/redo step reverts or restores the full artifacts array snapshot.

**Undoable operations:**
- Import (adds 1 artifact)
- Query execution (adds 1 artifact)
- Geoprocessing operations (Buffer, Centroid, Clip, Dissolve, Union, Intersect, etc. — each adds 1 artifact)
- Discovery import (adds 1 artifact)

**NOT undoable (out of scope):**
- `layerSettings` changes (visibility, opacity, z-order)
- `savedQueries` changes
- `sql` editor content
- `selectedArtifactId` changes
- `history` log (display only — undo doesn't remove history events)
- `projectName` changes

### Architecture: Snapshot-based undo stack

Simple and correct: snapshot the full `artifacts` array before each mutation.

```ts
interface UndoEntry {
  artifacts: Artifact[]      // snapshot BEFORE the change
  label: string             // human-readable ("Import: sf-buildings.geojson")
  timestamp: number
}
```

- `undoStack: UndoEntry[]` — snapshots before each change
- `redoStack: UndoEntry[]` — snapshots after undo, cleared on new change

### Hook: `useUndoRedu`

Extract into a custom hook to keep App.tsx from growing:

```ts
// src/lib/use-undo-redo.ts
export function useUndoRedu<T>(initial: T) {
  const [current, setCurrent] = useState<T>(initial)
  const undoStack = useRef<UndoEntry<T>[]>([])
  const redoStack = useRef<UndoEntry<T>[]>([])
  
  // Call before any mutation to capture the pre-change state
  const pushSnapshot = useCallback((label: string) => {
    undoStack.current.push({ state: current, label, timestamp: Date.now() })
    redoStack.current = [] // clear redo on new change
  }, [current])
  
  const commit = useCallback((next: T) => {
    setCurrent(next)
  }, [])
  
  const undo = useCallback((): UndoEntry<T> | null => {
    const entry = undoStack.current.pop()
    if (!entry) return null
    redoStack.current.push({ state: current, label: entry.label, timestamp: Date.now() })
    setCurrent(entry.state)
    return entry
  }, [current])
  
  const redo = useCallback((): UndoEntry<T> | null => {
    const entry = redoStack.current.pop()
    if (!entry) return null
    undoStack.current.push({ state: current, label: entry.label, timestamp: Date.now() })
    setCurrent(entry.state)
    return entry
  }, [current])
  
  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0
  
  return { current, pushSnapshot, commit, undo, redo, canUndo, canRedo, undoStack, redoStack }
}
```

### Integration in App.tsx

Replace `const [artifacts, setArtifacts] = useState<Artifact[]>([])` with the hook.

Before each `setArtifacts` call that adds an artifact, call `pushSnapshot(label)` first, then `commit(newArtifacts)`.

Pattern for operation results:
```ts
// Before:
setArtifacts(current => [...current, result.artifact!])

// After:
pushSnapshot(`Buffer ${distance} ${unit} on ${selectedArtifact.name}`)
setArtifacts(current => [...current, result.artifact!])
```

Wait — the hook returns `current` and `commit`, but existing code uses functional updates `setArtifacts(current => ...)`. We need to keep functional updates working. Better approach:

```ts
// Don't replace setArtifacts. Wrap it.
const { pushSnapshot, undo, redo, canUndo, canRedo } = useUndoRedu(artifacts)

// Existing setArtifacts calls stay the same.
// Before each mutation, call pushSnapshot with a label.
// The snapshot captures current artifacts state.
```

Actually, cleanest approach: **don't extract a hook**. Add `undoStack` and `redoStack` as `useRef` in App.tsx, add a `pushArtifactSnapshot(label)` helper, add `handleUndo()` and `handleRedo()` functions, wire keyboard shortcut. This avoids touching all 12 `setArtifacts` call sites — we just add `pushArtifactSnapshot(label)` before each one.

### Keyboard shortcut

Global `keydown` handler in App.tsx:

```ts
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      handleUndo()
    } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      e.preventDefault()
      handleRedo()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

### UI: Undo/Redo buttons

Add two buttons to the top bar (next to existing actions):
- ↶ Undo (disabled when `!canUndo`)
- ↷ Redo (disabled when `!canRedo`)
- Tooltip shows the label of what would be undone/redone

### Toast feedback

On undo: `addToast(`Undid: ${entry.label}`, 'info')`
On redo: `addToast(`Redid: ${entry.label}`, 'info')`

## Files to modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add undoStack/redoStack refs, pushArtifactSnapshot helper, handleUndo/handleRedo, keyboard shortcut, undo/redo buttons in top bar. Add `pushArtifactSnapshot(label)` calls before each `setArtifacts` mutation (~12 sites). |
| `src/styles.css` | Undo/redo button styles (small, icon-only, match existing `.actions .secondary` pattern) |

## Files NOT touched

- `src/lib/**` — no engine changes
- `src/components/**` — no component changes
- `src/types.ts` — no type changes (UndoEntry is internal)
- Test files (tester will create new ones)
- `discovery/**`

## Acceptance Criteria

1. Ctrl+Z / Cmd+Z undoes the last artifact change (removes the last added artifact)
2. Ctrl+Shift+Z / Cmd+Shift+Z (or Ctrl+Y) redoes the last undone change
3. Undo/Redo buttons in top bar show disabled state when stack is empty
4. Button tooltips show what would be undone/redone
5. Toast confirms what was undone/redone
6. New change after undo clears the redo stack (standard behavior)
7. Undo preserves all artifact data — undoing an import removes the artifact AND its layer settings are cleaned up
8. All existing tests pass (195/195)
9. `npm run build` clean
10. Smoke test passes (9/9)

## Risks

- **Snapshot size:** Each snapshot is a full copy of `artifacts` array. With large GeoJSON artifacts (10K+ features), this could use significant memory. Acceptable for now — artifacts are already in memory. If this becomes a problem, switch to command pattern (diffs) later.
- **12 mutation sites:** Need to add `pushArtifactSnapshot` before each one. Missing one means that operation isn't undoable. The tester should verify coverage.
- **Layer settings orphaning:** When undo removes an artifact, its `layerSettings` entry stays. Should clean up: filter `layerSettings` to only include IDs present in current artifacts after undo.

## Out of scope

- Undo for layer settings, saved queries, SQL content, project name
- Command pattern / diff-based undo (snapshot is fine for now)
- Undo history persistence (save/load)
- Undo for artifact deletion (doesn't exist yet)
- Export menu (Slice 9)
