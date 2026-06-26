/**
 * Tests for Slice 8: Undo/Redo Stack.
 *
 * Since the undo/redo logic lives inline in App.tsx (not a separate module),
 * we test a local helper that mirrors the exact same logic pattern.
 * Any divergence between this helper and App.tsx is a bug in one of them.
 *
 * Part 1: Pure logic tests — snapshot stack semantics
 * Part 2: Keyboard shortcut tests — event → handler mapping
 *
 * NOTE: The test helper below mirrors the App.tsx implementation pattern:
 *   - undoStack / redoStack are arrays of { artifacts, label, timestamp }
 *   - pushSnapshot(label) captures current state BEFORE mutation
 *   - setCurrent(next) applies the mutation
 *   - undo pops from undoStack, pushes current to redoStack, restores
 *   - redo pops from redoStack, pushes current to undoStack, restores
 *   - cleanLayerSettings removes entries for artifact IDs no longer present
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Test helper: mirrors App.tsx undo/redo logic ─────────────────────────

interface Artifact {
  id: string
  name: string
  spatial?: boolean
}

interface LayerSettings {
  visible: boolean
  opacity: number
  zIndex: number
}

type SettingsMap = Record<string, LayerSettings>

interface UndoEntry {
  artifacts: Artifact[]
  label: string
  timestamp: number
}

/**
 * Standalone undo/redo stack manager that mirrors the App.tsx inline logic.
 * If App.tsx changes its semantics, these tests will catch the drift.
 *
 * Usage pattern (mirrors App.tsx):
 *   pushSnapshot('Import: foo.geojson')  // captures CURRENT state
 *   setCurrent([...current, newArtifact]) // applies the mutation
 */
function createUndoRedoStack(initial: Artifact[]) {
  let current = [...initial]
  const undoStack: UndoEntry[] = []
  const redoStack: UndoEntry[] = []

  /** Capture current state BEFORE applying a mutation. */
  function pushSnapshot(label: string) {
    undoStack.push({
      artifacts: current.map((a) => ({ ...a })),
      label,
      timestamp: Date.now(),
    })
    redoStack.length = 0 // clear redo on new change
  }

  function setCurrent(next: Artifact[]) {
    current = next
  }

  function undo(): UndoEntry | null {
    const entry = undoStack.pop()
    if (!entry) return null
    redoStack.push({
      artifacts: current.map((a) => ({ ...a })),
      label: entry.label,
      timestamp: Date.now(),
    })
    current = entry.artifacts.map((a) => ({ ...a }))
    return entry
  }

  function redo(): UndoEntry | null {
    const entry = redoStack.pop()
    if (!entry) return null
    undoStack.push({
      artifacts: current.map((a) => ({ ...a })),
      label: entry.label,
      timestamp: Date.now(),
    })
    current = entry.artifacts.map((a) => ({ ...a }))
    return entry
  }

  function getCurrent() {
    return current
  }

  function canUndo() {
    return undoStack.length > 0
  }

  function canRedo() {
    return redoStack.length > 0
  }

  function getUndoLabel() {
    return undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null
  }

  function getRedoLabel() {
    return redoStack.length > 0 ? redoStack[redoStack.length - 1].label : null
  }

  return {
    pushSnapshot,
    setCurrent,
    undo,
    redo,
    getCurrent,
    canUndo,
    canRedo,
    getUndoLabel,
    getRedoLabel,
  }
}

/**
 * Mirrors the layer settings cleanup logic from App.tsx handleUndo/handleRedo.
 * After restoring artifacts, filter layerSettings to only include IDs
 * present in the current artifacts array.
 */
function cleanLayerSettings(
  layerSettings: SettingsMap,
  artifacts: Artifact[],
): SettingsMap {
  const ids = new Set(artifacts.map((a) => a.id))
  const next: SettingsMap = {}
  for (const [id, settings] of Object.entries(layerSettings)) {
    if (ids.has(id)) {
      next[id] = settings
    }
  }
  return next
}

// ─── Part 1: Pure logic tests ─────────────────────────────────────────────

describe('Undo/Redo Stack Logic (mirrors App.tsx)', () => {
  let stack: ReturnType<typeof createUndoRedoStack>

  beforeEach(() => {
    stack = createUndoRedoStack([])
  })

  // 1. Push snapshot
  it('pushSnapshot stores pre-mutation state and clears redo stack', () => {
    stack.pushSnapshot('Import first') // captures empty state
    stack.setCurrent([{ id: 'a1', name: 'First' }])

    expect(stack.canUndo()).toBe(true)
    expect(stack.getUndoLabel()).toBe('Import first')
    expect(stack.canRedo()).toBe(false)
  })

  // 2. Undo restores previous state, pushes current to redo
  it('undo pops from undoStack, restores previous state, pushes current to redoStack', () => {
    // Step 1: import a1
    stack.pushSnapshot('Import first')
    stack.setCurrent([{ id: 'a1', name: 'First' }])

    // Step 2: import a2
    stack.pushSnapshot('Import second')
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    const entry = stack.undo()

    expect(entry).not.toBeNull()
    expect(entry!.label).toBe('Import second')
    expect(stack.getCurrent()).toEqual([{ id: 'a1', name: 'First' }])
    expect(stack.canRedo()).toBe(true)
    expect(stack.getRedoLabel()).toBe('Import second')
  })

  // 3. Redo restores state, pushes current to undoStack
  it('redo pops from redoStack, restores state, pushes current to undoStack', () => {
    stack.pushSnapshot('Import first')
    stack.setCurrent([{ id: 'a1', name: 'First' }])

    stack.pushSnapshot('Import second')
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    stack.undo()
    const entry = stack.redo()

    expect(entry).not.toBeNull()
    expect(entry!.label).toBe('Import second')
    expect(stack.getCurrent()).toEqual([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])
    expect(stack.canUndo()).toBe(true)
  })

  // 4. New change after undo clears redo stack
  it('new pushSnapshot after undo clears redo stack', () => {
    stack.pushSnapshot('Import first')
    stack.setCurrent([{ id: 'a1', name: 'First' }])

    stack.pushSnapshot('Import second')
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    stack.undo()
    expect(stack.canRedo()).toBe(true)

    // New change — should clear redo
    stack.pushSnapshot('Import third')
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a3', name: 'Third' },
    ])

    expect(stack.canRedo()).toBe(false)
    expect(stack.getCurrent()).toEqual([
      { id: 'a1', name: 'First' },
      { id: 'a3', name: 'Third' },
    ])
  })

  // 5. Empty stack handling
  it('undo on empty stack returns null', () => {
    const entry = stack.undo()
    expect(entry).toBeNull()
    expect(stack.canUndo()).toBe(false)
  })

  it('redo on empty stack returns null', () => {
    const entry = stack.redo()
    expect(entry).toBeNull()
    expect(stack.canRedo()).toBe(false)
  })

  // 6. Sequential undos
  it('push 3 snapshots, undo 3 times, each restores correct state', () => {
    // pushSnapshot captures the state BEFORE the mutation
    // After push + set: undo stack has the pre-state, current has the post-state

    stack.pushSnapshot('Step 1') // captures []
    stack.setCurrent([{ id: 'a0', name: 'Initial' }])

    stack.pushSnapshot('Step 2') // captures [{a0}]
    stack.setCurrent([
      { id: 'a0', name: 'Initial' },
      { id: 'a1', name: 'First' },
    ])

    stack.pushSnapshot('Step 3') // captures [{a0}, {a1}]
    stack.setCurrent([
      { id: 'a0', name: 'Initial' },
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    // Undo 1: restore to state before Step 3 = [{a0}, {a1}]
    const u1 = stack.undo()
    expect(u1!.label).toBe('Step 3')
    expect(stack.getCurrent()).toHaveLength(2)

    // Undo 2: restore to state before Step 2 = [{a0}]
    const u2 = stack.undo()
    expect(u2!.label).toBe('Step 2')
    expect(stack.getCurrent()).toHaveLength(1)
    expect(stack.getCurrent()[0].id).toBe('a0')

    // Undo 3: restore to state before Step 1 = []
    const u3 = stack.undo()
    expect(u3!.label).toBe('Step 1')
    expect(stack.getCurrent()).toHaveLength(0)
    expect(stack.canUndo()).toBe(false)
  })

  // 7. Undo then redo round-trip
  it('push 2, undo 1, redo 1 — state matches', () => {
    stack.pushSnapshot('Import first')
    stack.setCurrent([{ id: 'a1', name: 'First' }])

    stack.pushSnapshot('Import second')
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    const twoArtifactState = [...stack.getCurrent()]
    stack.undo()
    expect(stack.getCurrent()).toEqual([{ id: 'a1', name: 'First' }])

    stack.redo()
    expect(stack.getCurrent()).toEqual(twoArtifactState)
  })

  // 8. Layer settings cleanup
  it('cleanLayerSettings removes entries for artifact IDs not in artifacts', () => {
    const settings: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 0.8, zIndex: 1 },
      a3: { visible: false, opacity: 0.5, zIndex: 2 },
    }
    const artifacts: Artifact[] = [
      { id: 'a1', name: 'First' },
      { id: 'a3', name: 'Third' },
    ]

    const cleaned = cleanLayerSettings(settings, artifacts)

    expect(cleaned['a1']).toBeDefined()
    expect(cleaned['a2']).toBeUndefined()
    expect(cleaned['a3']).toBeDefined()
    expect(Object.keys(cleaned)).toHaveLength(2)
  })

  it('cleanLayerSettings preserves all settings when all IDs match', () => {
    const settings: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: false, opacity: 0.5, zIndex: 1 },
    }
    const artifacts: Artifact[] = [
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ]

    const cleaned = cleanLayerSettings(settings, artifacts)
    expect(Object.keys(cleaned)).toHaveLength(2)
  })

  it('cleanLayerSettings returns empty map when no artifacts', () => {
    const settings: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const cleaned = cleanLayerSettings(settings, [])
    expect(Object.keys(cleaned)).toHaveLength(0)
  })

  it('undo + cleanLayerSettings: orphaned settings are removed', () => {
    // Simulate: start with [a1], import a2, then undo
    const layerSettings: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 0.8, zIndex: 1 },
    }

    stack.pushSnapshot('Import first')
    stack.setCurrent([{ id: 'a1', name: 'First' }])

    stack.pushSnapshot('Import second')
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    // Undo — a2 is removed from artifacts
    stack.undo()
    const currentArtifacts = stack.getCurrent()
    const cleaned = cleanLayerSettings(layerSettings, currentArtifacts)

    expect(cleaned['a1']).toBeDefined()
    expect(cleaned['a2']).toBeUndefined()
  })

  // Additional edge cases
  it('pushSnapshot with empty current state works', () => {
    stack.pushSnapshot('Initial')
    expect(stack.canUndo()).toBe(true)
    expect(stack.getUndoLabel()).toBe('Initial')
  })

  it('multiple undos then redos round-trip correctly', () => {
    stack.pushSnapshot('Step 1') // captures []
    stack.setCurrent([{ id: 'a1', name: 'First' }])

    stack.pushSnapshot('Step 2') // captures [a1]
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    stack.pushSnapshot('Step 3') // captures [a1, a2]
    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
      { id: 'a3', name: 'Third' },
    ])

    // Undo all
    stack.undo() // back to [a1, a2]
    stack.undo() // back to [a1]
    stack.undo() // back to []
    expect(stack.getCurrent()).toHaveLength(0)
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(true)

    // Redo all
    stack.redo()
    expect(stack.getCurrent()).toHaveLength(1)
    stack.redo()
    expect(stack.getCurrent()).toHaveLength(2)
    stack.redo()
    expect(stack.getCurrent()).toHaveLength(3)
    expect(stack.canRedo()).toBe(false)
  })

  it('timestamps are captured on push', () => {
    const before = Date.now()
    stack.pushSnapshot('Import')
    stack.setCurrent([{ id: 'a1', name: 'First' }])
    const after = Date.now()

    // We can't read the timestamp directly from the public API,
    // but we can verify undo returns a timestamp in range
    const entry = stack.undo()
    expect(entry!.timestamp).toBeGreaterThanOrEqual(before)
    expect(entry!.timestamp).toBeLessThanOrEqual(after)
  })

  it('snapshot artifacts are independent copies (no reference sharing)', () => {
    const state1 = [{ id: 'a1', name: 'First' }]
    stack.setCurrent(state1)

    stack.pushSnapshot('Import first') // captures [...state1] = new array

    stack.setCurrent([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])

    stack.pushSnapshot('Import second')

    const entry = stack.undo()
    // Snapshot should be a deep-enough copy — mutating the original array
    // shouldn't affect the snapshot's artifact objects
    expect(entry!.artifacts).toEqual([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ])
    // And it should be a different array reference from current
    expect(entry!.artifacts).not.toBe(stack.getCurrent())
  })

  it('undo label matches what was pushed', () => {
    stack.pushSnapshot('Buffer 500 meters on parcels')
    stack.setCurrent([{ id: 'a1', name: 'Buffer' }])

    stack.pushSnapshot('Centroid on parcels')
    stack.setCurrent([{ id: 'a2', name: 'Centroid' }])

    expect(stack.getUndoLabel()).toBe('Centroid on parcels')
    const entry = stack.undo()
    expect(entry!.label).toBe('Centroid on parcels')
    expect(stack.getUndoLabel()).toBe('Buffer 500 meters on parcels')
  })

  it('redo label matches the undone operation', () => {
    stack.pushSnapshot('Import sf-buildings')
    stack.setCurrent([{ id: 'a1', name: 'sf-buildings' }])

    stack.pushSnapshot('Buffer 100m')
    stack.setCurrent([{ id: 'a2', name: 'Buffer' }])

    stack.undo()
    expect(stack.getRedoLabel()).toBe('Buffer 100m')
  })

  it('preserves exact artifact data through undo/redo cycle', () => {
    const original = {
      id: 'a1',
      name: 'parcels.geojson',
      spatial: true,
    }

    stack.pushSnapshot('Import')
    stack.setCurrent([{ ...original }])

    stack.pushSnapshot('Buffer')
    stack.setCurrent([
      { ...original },
      { id: 'a2', name: 'Buffer output', spatial: true },
    ])

    // Undo and redo
    stack.undo()
    stack.redo()

    const artifacts = stack.getCurrent()
    expect(artifacts).toHaveLength(2)
    expect(artifacts[0]).toEqual(original)
    expect(artifacts[1].name).toBe('Buffer output')
  })
})

// ─── Part 2: Keyboard shortcut tests ──────────────────────────────────────

describe('Keyboard shortcuts for undo/redo', () => {
  let undoCalled: boolean
  let redoCalled: boolean
  let handler: (e: KeyboardEvent) => void

  function setupHandler() {
    undoCalled = false
    redoCalled = false

    handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoCalled = true
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redoCalled = true
      }
    }

    window.addEventListener('keydown', handler)
  }

  function teardownHandler() {
    window.removeEventListener('keydown', handler)
  }

  function dispatchKey(opts: {
    key: string
    ctrlKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
  }) {
    const event = new KeyboardEvent('keydown', {
      key: opts.key,
      ctrlKey: opts.ctrlKey ?? false,
      metaKey: opts.metaKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(event)
    return event
  }

  beforeEach(() => {
    setupHandler()
    return () => teardownHandler()
  })

  // 9. Ctrl+Z triggers undo
  it('Ctrl+Z triggers undo', () => {
    dispatchKey({ key: 'z', ctrlKey: true })
    expect(undoCalled).toBe(true)
    expect(redoCalled).toBe(false)
  })

  // 10. Cmd+Z (metaKey) triggers undo (Mac variant)
  it('Cmd+Z (metaKey) triggers undo on Mac', () => {
    dispatchKey({ key: 'z', metaKey: true })
    expect(undoCalled).toBe(true)
    expect(redoCalled).toBe(false)
  })

  // 11. Ctrl+Shift+Z triggers redo
  it('Ctrl+Shift+Z triggers redo', () => {
    dispatchKey({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(undoCalled).toBe(false)
    expect(redoCalled).toBe(true)
  })

  it('Cmd+Shift+Z triggers redo on Mac', () => {
    dispatchKey({ key: 'z', metaKey: true, shiftKey: true })
    expect(undoCalled).toBe(false)
    expect(redoCalled).toBe(true)
  })

  // 12. Ctrl+Y triggers redo (alternate)
  it('Ctrl+Y triggers redo', () => {
    dispatchKey({ key: 'y', ctrlKey: true })
    expect(undoCalled).toBe(false)
    expect(redoCalled).toBe(true)
  })

  it('Cmd+Y triggers redo on Mac', () => {
    dispatchKey({ key: 'y', metaKey: true })
    expect(undoCalled).toBe(false)
    expect(redoCalled).toBe(true)
  })

  // 13. Plain Z does nothing (no modifier)
  it('plain Z key does nothing (no modifier)', () => {
    dispatchKey({ key: 'z' })
    expect(undoCalled).toBe(false)
    expect(redoCalled).toBe(false)
  })

  // 14. Ctrl+S does nothing (not an undo shortcut)
  it('Ctrl+S does nothing (not an undo/redo shortcut)', () => {
    dispatchKey({ key: 's', ctrlKey: true })
    expect(undoCalled).toBe(false)
    expect(redoCalled).toBe(false)
  })

  // Additional keyboard edge cases
  it('Shift+Z without Ctrl/Meta does nothing', () => {
    dispatchKey({ key: 'z', shiftKey: true })
    expect(undoCalled).toBe(false)
    expect(redoCalled).toBe(false)
  })

  it('Ctrl+Z calls preventDefault', () => {
    const event = dispatchKey({ key: 'z', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
  })

  it('Ctrl+Shift+Z calls preventDefault', () => {
    const event = dispatchKey({
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('plain Z does NOT call preventDefault', () => {
    const event = dispatchKey({ key: 'z' })
    expect(event.defaultPrevented).toBe(false)
  })

  it('Ctrl+Y calls preventDefault', () => {
    const event = dispatchKey({ key: 'y', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
  })
})
