/**
 * Tests for layer control helper logic (Slice 3).
 *
 * The actual helpers are closures inside App() and cannot be directly imported.
 * These tests reimplement the exact same state-update patterns from App.tsx
 * (lines 700–748) as pure functions to verify correctness in isolation.
 *
 * If helpers are later extracted to a separate module, update imports accordingly.
 */
import { describe, it, expect } from 'vitest'
import type { LayerSettings } from '../../types'

type SettingsMap = Record<string, LayerSettings>

// ─── Pure reimplementations of the App.tsx closure logic ───

function initLayerSettings(
  prev: SettingsMap,
  spatialArtifactIds: string[],
): { next: SettingsMap; changed: boolean } {
  const next = { ...prev }
  let changed = false
  for (const id of spatialArtifactIds) {
    if (!next[id]) {
      changed = true
      const existingMaxZ = Math.max(-1, ...Object.values(next).map((s) => s.zIndex))
      next[id] = { visible: true, opacity: 1.0, zIndex: existingMaxZ + 1 }
    }
  }
  for (const id of Object.keys(prev)) {
    if (!spatialArtifactIds.includes(id)) {
      changed = true
      delete next[id]
    }
  }
  return { next, changed }
}

function toggleLayerVisibility(prev: SettingsMap, artifactId: string): SettingsMap {
  return {
    ...prev,
    [artifactId]: { ...prev[artifactId], visible: !prev[artifactId]?.visible },
  }
}

function changeLayerOpacity(prev: SettingsMap, artifactId: string, opacity: number): SettingsMap {
  return {
    ...prev,
    [artifactId]: { ...prev[artifactId], opacity: Math.max(0, Math.min(1, opacity)) },
  }
}

function reorderLayer(prev: SettingsMap, artifactId: string, direction: 'up' | 'down'): SettingsMap {
  const current = prev[artifactId]
  if (!current) return prev
  const spatialIds = Object.keys(prev).sort((a, b) => prev[a].zIndex - prev[b].zIndex)
  const idx = spatialIds.indexOf(artifactId)
  if (idx === -1) return prev
  if (direction === 'up' && idx >= spatialIds.length - 1) return prev
  if (direction === 'down' && idx <= 0) return prev
  const swapIdx = direction === 'up' ? idx + 1 : idx - 1
  const swapId = spatialIds[swapIdx]
  const newSettings = { ...prev }
  newSettings[artifactId] = { ...newSettings[artifactId], zIndex: prev[swapId].zIndex }
  newSettings[swapId] = { ...newSettings[swapId], zIndex: prev[artifactId].zIndex }
  return newSettings
}

// ─── Tests ───

describe('LayerSettings initialization (useEffect logic)', () => {
  it('creates entry with defaults for new spatial artifact', () => {
    const { next, changed } = initLayerSettings({}, ['a1'])
    expect(changed).toBe(true)
    expect(next['a1']).toEqual({ visible: true, opacity: 1.0, zIndex: 0 })
  })

  it('assigns incrementing zIndex for multiple new artifacts', () => {
    const { next } = initLayerSettings({}, ['a1', 'a2', 'a3'])
    expect(next['a1'].zIndex).toBe(0)
    expect(next['a2'].zIndex).toBe(1)
    expect(next['a3'].zIndex).toBe(2)
  })

  it('preserves existing settings for known artifacts', () => {
    const prev: SettingsMap = {
      a1: { visible: false, opacity: 0.5, zIndex: 7 },
    }
    const { next, changed } = initLayerSettings(prev, ['a1'])
    expect(changed).toBe(false)
    expect(next['a1']).toEqual({ visible: false, opacity: 0.5, zIndex: 7 })
  })

  it('removes settings for artifacts no longer in spatial list', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    const { next, changed } = initLayerSettings(prev, ['a1'])
    expect(changed).toBe(true)
    expect(next['a1']).toBeDefined()
    expect(next['a2']).toBeUndefined()
  })

  it('does not create entries for non-spatial artifacts (caller filters)', () => {
    // Caller is responsible for only passing spatial artifact IDs
    const { next, changed } = initLayerSettings({}, [])
    expect(changed).toBe(false)
    expect(Object.keys(next)).toHaveLength(0)
  })

  it('assigns zIndex above existing max when adding to populated map', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 5 },
    }
    const { next } = initLayerSettings(prev, ['a1', 'a2'])
    expect(next['a2'].zIndex).toBe(6) // existingMaxZ(5) + 1
  })
})

describe('toggleLayerVisibility', () => {
  it('flips visible from true to false', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const next = toggleLayerVisibility(prev, 'a1')
    expect(next['a1'].visible).toBe(false)
  })

  it('flips visible from false to true', () => {
    const prev: SettingsMap = {
      a1: { visible: false, opacity: 1.0, zIndex: 0 },
    }
    const next = toggleLayerVisibility(prev, 'a1')
    expect(next['a1'].visible).toBe(true)
  })

  it('handles missing entry (creates with visible=true then flips)', () => {
    // prev[artifactId] is undefined → !undefined = true → visible becomes true
    // Actually: !prev[artifactId]?.visible = !undefined = true
    const prev: SettingsMap = {}
    const next = toggleLayerVisibility(prev, 'a1')
    // prev['a1'] is undefined, spread gives undefined, visible = !undefined?.visible = !undefined = true
    expect(next['a1'].visible).toBe(true)
    expect(next['a1'].opacity).toBeUndefined() // other fields not initialized
    expect(next['a1'].zIndex).toBeUndefined()
  })

  it('preserves other fields when toggling', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 0.7, zIndex: 3 },
    }
    const next = toggleLayerVisibility(prev, 'a1')
    expect(next['a1'].opacity).toBe(0.7)
    expect(next['a1'].zIndex).toBe(3)
  })

  it('does not affect other artifactIds', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 0.5, zIndex: 1 },
    }
    const next = toggleLayerVisibility(prev, 'a1')
    expect(next['a2']).toBe(prev['a2']) // same reference
  })
})

describe('changeLayerOpacity', () => {
  it('sets opacity to a valid 0..1 value', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const next = changeLayerOpacity(prev, 'a1', 0.5)
    expect(next['a1'].opacity).toBe(0.5)
  })

  it('clamps values above 1', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const next = changeLayerOpacity(prev, 'a1', 1.5)
    expect(next['a1'].opacity).toBe(1)
  })

  it('clamps values below 0', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const next = changeLayerOpacity(prev, 'a1', -0.3)
    expect(next['a1'].opacity).toBe(0)
  })

  it('preserves other fields', () => {
    const prev: SettingsMap = {
      a1: { visible: false, opacity: 1.0, zIndex: 5 },
    }
    const next = changeLayerOpacity(prev, 'a1', 0.3)
    expect(next['a1'].visible).toBe(false)
    expect(next['a1'].zIndex).toBe(5)
  })

  it('handles edge case of exactly 0', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 0.5, zIndex: 0 },
    }
    const next = changeLayerOpacity(prev, 'a1', 0)
    expect(next['a1'].opacity).toBe(0)
  })

  it('handles edge case of exactly 1', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 0.5, zIndex: 0 },
    }
    const next = changeLayerOpacity(prev, 'a1', 1)
    expect(next['a1'].opacity).toBe(1)
  })

  it('does not affect other artifactIds', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 0.8, zIndex: 1 },
    }
    const next = changeLayerOpacity(prev, 'a1', 0.3)
    expect(next['a2'].opacity).toBe(0.8)
  })
})

describe('reorderLayer', () => {
  const threeLayers: SettingsMap = {
    bottom: { visible: true, opacity: 1.0, zIndex: 0 },
    middle: { visible: true, opacity: 1.0, zIndex: 1 },
    top:    { visible: true, opacity: 1.0, zIndex: 2 },
  }

  it('swaps zIndex with artifact above on "up"', () => {
    const next = reorderLayer(threeLayers, 'bottom', 'up')
    expect(next['bottom'].zIndex).toBe(1)
    expect(next['middle'].zIndex).toBe(0)
    expect(next['top'].zIndex).toBe(2)
  })

  it('swaps zIndex with artifact below on "down"', () => {
    const next = reorderLayer(threeLayers, 'top', 'down')
    expect(next['top'].zIndex).toBe(1)
    expect(next['middle'].zIndex).toBe(2)
    expect(next['bottom'].zIndex).toBe(0)
  })

  it('no-ops at top boundary (highest zIndex)', () => {
    const next = reorderLayer(threeLayers, 'top', 'up')
    expect(next).toBe(threeLayers) // reference equality = no change
  })

  it('no-ops at bottom boundary (lowest zIndex)', () => {
    const next = reorderLayer(threeLayers, 'bottom', 'down')
    expect(next).toBe(threeLayers)
  })

  it('no-ops for missing artifactId', () => {
    const next = reorderLayer(threeLayers, 'nonexistent', 'up')
    expect(next).toBe(threeLayers)
  })

  it('handles two-layer swap correctly', () => {
    const two: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
      b: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    const next = reorderLayer(two, 'a', 'up')
    expect(next['a'].zIndex).toBe(1)
    expect(next['b'].zIndex).toBe(0)
  })

  it('preserves all other settings during swap', () => {
    const prev: SettingsMap = {
      a: { visible: false, opacity: 0.3, zIndex: 0 },
      b: { visible: true, opacity: 0.8, zIndex: 1 },
    }
    const next = reorderLayer(prev, 'a', 'up')
    expect(next['a'].visible).toBe(false)
    expect(next['a'].opacity).toBe(0.3)
    expect(next['b'].visible).toBe(true)
    expect(next['b'].opacity).toBe(0.8)
  })

  it('middle layer can move both up and down', () => {
    const up = reorderLayer(threeLayers, 'middle', 'up')
    expect(up['middle'].zIndex).toBe(2)
    expect(up['top'].zIndex).toBe(1)

    const down = reorderLayer(threeLayers, 'middle', 'down')
    expect(down['middle'].zIndex).toBe(0)
    expect(down['bottom'].zIndex).toBe(1)
  })
})
