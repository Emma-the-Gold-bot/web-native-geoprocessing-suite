/**
 * Tests for layer control helpers (Slice 3.5 — extracted module).
 *
 * These tests now import and verify the REAL pure functions exported by
 * `src/lib/layer-controls.ts` (no more local reimplementations).
 *
 * The previous version of this file reimplemented the closure logic from
 * App.tsx and verified the reimplementations against themselves — that was
 * theater, not testing. The current version verifies actual production code
 * that App.tsx calls.
 *
 * If a regression slips in, these tests fail. If a refactor changes behavior,
 * these tests document the new contract.
 */
import { describe, it, expect } from 'vitest'
import {
  reconcileLayerSettings,
  toggleLayerVisibility,
  changeLayerOpacity,
  reorderLayer,
  DEFAULT_LAYER_SETTINGS,
  type SettingsMap,
} from '../../lib/layer-controls'

// ─── DEFAULT_LAYER_SETTINGS ──────────────────────────────────────────────

describe('DEFAULT_LAYER_SETTINGS', () => {
  it('exports visible: true and opacity: 1.0', () => {
    // zIndex is intentionally omitted from this constant — it's computed
    // per-call (existingMaxZ + 1) so a single default doesn't fit.
    expect(DEFAULT_LAYER_SETTINGS.visible).toBe(true)
    expect(DEFAULT_LAYER_SETTINGS.opacity).toBe(1.0)
    expect(DEFAULT_LAYER_SETTINGS).not.toHaveProperty('zIndex')
  })
})

// ─── reconcileLayerSettings ──────────────────────────────────────────────

describe('reconcileLayerSettings', () => {
  it('creates entry with defaults + zIndex 0 for a single new spatial artifact', () => {
    const { next, changed } = reconcileLayerSettings(
      {},
      [{ id: 'a1', spatial: true }],
    )
    expect(changed).toBe(true)
    expect(next['a1']).toEqual({ visible: true, opacity: 1.0, zIndex: 0 })
  })

  it('FIXED (Slice 3.6): multiple new artifacts get incrementing zIndex', () => {
    // Slice 3.6 fix: existingMaxZ is now read from `next` (not `prev`) so each
    // newly-added artifact gets a unique zIndex even when added in one pass.
    const { next } = reconcileLayerSettings(
      {},
      [
        { id: 'a1', spatial: true },
        { id: 'a2', spatial: true },
        { id: 'a3', spatial: true },
      ],
    )
    expect(next['a1'].zIndex).toBe(0)
    expect(next['a2'].zIndex).toBe(1)
    expect(next['a3'].zIndex).toBe(2)
  })

  it('FIXED (Slice 3.6): 5 new artifacts added in one pass get zIndex 0..4', () => {
    const { next } = reconcileLayerSettings(
      {},
      [
        { id: 'a1', spatial: true },
        { id: 'a2', spatial: true },
        { id: 'a3', spatial: true },
        { id: 'a4', spatial: true },
        { id: 'a5', spatial: true },
      ],
    )
    expect(next['a1'].zIndex).toBe(0)
    expect(next['a2'].zIndex).toBe(1)
    expect(next['a3'].zIndex).toBe(2)
    expect(next['a4'].zIndex).toBe(3)
    expect(next['a5'].zIndex).toBe(4)
  })

  it('FIXED (Slice 3.6): new artifacts added above existing max-z', () => {
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 10 },
    }
    const { next } = reconcileLayerSettings(
      prev,
      [
        { id: 'a', spatial: true },
        { id: 'b', spatial: true },
        { id: 'c', spatial: true },
      ],
    )
    expect(next['a'].zIndex).toBe(10) // preserved
    expect(next['b'].zIndex).toBe(11) // first new gets max+1
    expect(next['c'].zIndex).toBe(12) // second new gets prev-new-max+1
  })

  it('assigns unique zIndex above existing max when adding to populated map (correct case)', () => {
    // When prev already has entries, adding a single new artifact correctly
    // gets existingMaxZ + 1. This is the common case in the UI.
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 5 },
    }
    const { next } = reconcileLayerSettings(
      prev,
      [
        { id: 'a', spatial: true },
        { id: 'b', spatial: true },
      ],
    )
    expect(next['b'].zIndex).toBe(6) // existingMaxZ(5) + 1
  })

  it('preserves existing settings for known artifacts', () => {
    const prev: SettingsMap = {
      a1: { visible: false, opacity: 0.5, zIndex: 7 },
    }
    const { next, changed } = reconcileLayerSettings(
      prev,
      [{ id: 'a1', spatial: true }],
    )
    expect(changed).toBe(false)
    expect(next['a1']).toEqual({ visible: false, opacity: 0.5, zIndex: 7 })
  })

  it('removes settings for artifacts no longer in artifact list', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    const { next, changed } = reconcileLayerSettings(
      prev,
      [{ id: 'a1', spatial: true }], // a2 removed
    )
    expect(changed).toBe(true)
    expect(next['a1']).toBeDefined()
    expect(next['a2']).toBeUndefined()
  })

  it('skips non-spatial artifacts (does not create entries for them)', () => {
    // reconcileLayerSettings filters internally — caller doesn't have to
    // pre-filter the artifact list.
    const { next, changed } = reconcileLayerSettings(
      {},
      [
        { id: 'a1', spatial: true },
        { id: 't1', spatial: false }, // tabular
      ],
    )
    expect(changed).toBe(true)
    expect(next['a1']).toBeDefined()
    expect(next['t1']).toBeUndefined()
  })

  it('FIXED (Slice 3.6): cleans up stale settings for non-spatial artifacts still in list', () => {
    // Slice 3.6 fix: cleanup loop now checks `artifact.spatial` so stale
    // entries for non-spatial artifacts get removed even if the artifact
    // is still in the list (e.g. spatial flag was flipped true → false).
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      t1: { visible: true, opacity: 1.0, zIndex: 1 }, // stale
    }
    const { next, changed } = reconcileLayerSettings(
      prev,
      [
        { id: 'a1', spatial: true },
        { id: 't1', spatial: false },
      ],
    )
    expect(changed).toBe(true)
    expect(next['a1']).toBeDefined()
    expect(next['t1']).toBeUndefined()
  })

  it('FIXED (Slice 3.6): preserves spatial artifact settings when still in list', () => {
    const prev: SettingsMap = {
      a1: { visible: false, opacity: 0.5, zIndex: 3 },
    }
    const { next, changed } = reconcileLayerSettings(
      prev,
      [{ id: 'a1', spatial: true }],
    )
    expect(changed).toBe(false)
    expect(next['a1']).toEqual({ visible: false, opacity: 0.5, zIndex: 3 })
  })

  it('FIXED (Slice 3.6): cleans up multiple stale entries in one pass', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      t1: { visible: true, opacity: 1.0, zIndex: 1 },
      t2: { visible: true, opacity: 1.0, zIndex: 2 },
      a2: { visible: true, opacity: 1.0, zIndex: 3 },
    }
    const { next, changed } = reconcileLayerSettings(
      prev,
      [
        { id: 'a1', spatial: true },
        { id: 'a2', spatial: true },
        { id: 't1', spatial: false }, // stale
        { id: 't2', spatial: false }, // stale
      ],
    )
    expect(changed).toBe(true)
    expect(next['a1']).toBeDefined()
    expect(next['a2']).toBeDefined()
    expect(next['t1']).toBeUndefined()
    expect(next['t2']).toBeUndefined()
  })

  it('removes settings for artifacts no longer in artifact list (correct case)', () => {
    // The cleanup loop DOES correctly handle the common case: an artifact
    // is removed from the project entirely.
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    const { next, changed } = reconcileLayerSettings(
      prev,
      [{ id: 'a1', spatial: true }], // a2 removed
    )
    expect(changed).toBe(true)
    expect(next['a1']).toBeDefined()
    expect(next['a2']).toBeUndefined()
  })

  it('returns changed=false when nothing changed', () => {
    // When the artifact list and existing settings are in sync,
    // changed=false so the caller can skip setState.
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const { changed } = reconcileLayerSettings(
      prev,
      [{ id: 'a1', spatial: true }],
    )
    expect(changed).toBe(false)
  })

  it('returns changed=true when entries added', () => {
    const { changed } = reconcileLayerSettings(
      {},
      [{ id: 'a1', spatial: true }],
    )
    expect(changed).toBe(true)
  })

  it('returns changed=true when entries removed', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const { changed } = reconcileLayerSettings(prev, [])
    expect(changed).toBe(true)
  })

  it('handles empty artifacts list', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const { next, changed } = reconcileLayerSettings(prev, [])
    expect(changed).toBe(true)
    expect(Object.keys(next)).toHaveLength(0)
  })
})

// ─── toggleLayerVisibility ───────────────────────────────────────────────

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

  it('preserves opacity and zIndex when toggling', () => {
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
    expect(next['a2']).toEqual(prev['a2']) // same reference (not cloned)
  })

  it('does not mutate the input map', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const prevSnapshot = JSON.stringify(prev)
    toggleLayerVisibility(prev, 'a1')
    expect(JSON.stringify(prev)).toBe(prevSnapshot)
  })

  // ─── KNOWN BUG — document current behavior; fix in follow-up ────────────
  //
  // The current implementation creates a partial entry when called for an
  // artifactId that doesn't exist in `prev`:
  //
  //   toggleLayerVisibility({}, 'a1')
  //   // returns { a1: { visible: true } }  ← opacity + zIndex MISSING
  //
  // Why this is a latent bug:
  //   - The map-sync effect reads settings.opacity and settings.zIndex
  //     directly (with `??` defaults), so the UI doesn't visibly break.
  //   - BUT: any code that does e.g. `next[id].opacity = newValue` would
  //     see opacity silently transition from undefined → number.
  //   - AND: a subsequent `changeLayerOpacity` preserves the missing
  //     zIndex, so the entry has a partial shape until reconcile runs.
  //
  // Fix (follow-up): include DEFAULT_LAYER_SETTINGS + zIndex: 0 in the
  // new-entry spread:
  //
  //   [artifactId]: {
  //     ...DEFAULT_LAYER_SETTINGS,
  //     zIndex: prev[artifactId]?.zIndex ?? 0,
  //     visible: !prev[artifactId]?.visible,
  //   }
  //
  // This test DOCUMENTS the current (broken) behavior so we notice if a
  // fix accidentally regresses it OR so the fix itself can be verified
  // when it's shipped.
  //
  // See SLICE_3_REVIEW.md "Nice to have" #3 and SLICE_3_5_REVIEW.md.
  it('FIXED (Slice 3.6): creates complete entry with defaults when artifactId missing', () => {
    // Slice 3.6 fix: missing-entry now creates a complete entry with
    // DEFAULT_LAYER_SETTINGS.opacity and zIndex: 0 instead of leaving
    // opacity/zIndex undefined.
    const prev: SettingsMap = {}
    const next = toggleLayerVisibility(prev, 'a1')
    expect(next['a1'].visible).toBe(true)
    expect(next['a1'].opacity).toBe(DEFAULT_LAYER_SETTINGS.opacity)
    expect(next['a1'].zIndex).toBe(0)
  })

  it('FIXED (Slice 3.6): toggling missing entry twice flips visible to false', () => {
    const next = toggleLayerVisibility(toggleLayerVisibility({}, 'a1'), 'a1')
    expect(next['a1'].visible).toBe(false)
    expect(next['a1'].opacity).toBe(DEFAULT_LAYER_SETTINGS.opacity)
    expect(next['a1'].zIndex).toBe(0)
  })

  it('FIXED (Slice 3.6): toggling existing entry preserves opacity and zIndex', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 0.7, zIndex: 5 },
    }
    const next = toggleLayerVisibility(prev, 'a1')
    expect(next['a1'].visible).toBe(false)
    expect(next['a1'].opacity).toBe(0.7)
    expect(next['a1'].zIndex).toBe(5)
  })
})

// ─── changeLayerOpacity ──────────────────────────────────────────────────

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

  it('preserves visible and zIndex', () => {
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

  it('does not mutate the input map', () => {
    const prev: SettingsMap = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const prevSnapshot = JSON.stringify(prev)
    changeLayerOpacity(prev, 'a1', 0.5)
    expect(JSON.stringify(prev)).toBe(prevSnapshot)
  })
})

// ─── reorderLayer ────────────────────────────────────────────────────────

describe('reorderLayer', () => {
  const threeLayers: SettingsMap = {
    bottom: { visible: true, opacity: 1.0, zIndex: 0 },
    middle: { visible: true, opacity: 1.0, zIndex: 1 },
    top: { visible: true, opacity: 1.0, zIndex: 2 },
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
    // Returns the same reference → caller can detect no-op via ===
    expect(next).toBe(threeLayers)
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

  it('preserves visible and opacity during swap', () => {
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

  it('does not mutate the input map (on actual swap)', () => {
    const prevSnapshot = JSON.stringify(threeLayers)
    reorderLayer(threeLayers, 'bottom', 'up')
    expect(JSON.stringify(threeLayers)).toBe(prevSnapshot)
  })
})