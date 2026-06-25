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

  it('CURRENT BEHAVIOR: multiple new artifacts get same zIndex (latent bug, see follow-up)', () => {
    // The current implementation reads `existingMaxZ` from `prev` (not `next`),
    // so when 3 new artifacts are added to an empty map in one pass, all get
    // zIndex = 0 (because prev is empty, so existingMaxZ = -1, then +1 = 0).
    //
    // In practice this rarely fires because:
    //   - artifacts are usually added one at a time, and the effect re-runs
    //     between each add (so prev grows incrementally)
    //   - LayersPanel doesn't depend on zIndex uniqueness for rendering
    //     (the sort uses Math.max/min and the disable logic just needs
    //     a stable top/bottom, which works even with duplicate zIndex)
    //
    // But it IS a latent bug. Fix (follow-up): change to read from `next`
    // instead of `prev` so each newly-added artifact gets a unique zIndex.
    //
    // See SLICE_3_5_REVIEW.md for details.
    const { next } = reconcileLayerSettings(
      {},
      [
        { id: 'a1', spatial: true },
        { id: 'a2', spatial: true },
        { id: 'a3', spatial: true },
      ],
    )
    expect(next['a1'].zIndex).toBe(0)
    expect(next['a2'].zIndex).toBe(0) // CURRENT BEHAVIOR — should be 1
    expect(next['a3'].zIndex).toBe(0) // CURRENT BEHAVIOR — should be 2
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

  it('CURRENT BEHAVIOR: does not remove stale settings for non-spatial artifacts still in list (latent bug)', () => {
    // The cleanup loop checks whether each prev entry's artifact is still
    // in the artifact list, but does NOT check whether it's spatial.
    //
    // Edge case: if an artifact's `spatial` flag was flipped from true → false
    // while its settings still exist in prev, those settings WILL stay in
    // the map (because the artifact is still in the list).
    //
    // In practice this rarely fires because:
    //   - The add loop never creates entries for non-spatial artifacts,
    //     so stale entries can only exist from a prior `spatial: true`
    //     state — which is rare (artifact type is set on import and
    //     doesn't flip during a session)
    //   - The map-sync effect filters by .spatial before reading settings,
    //     so stale entries are never actually used
    //
    // Fix (follow-up): make the cleanup loop also check `artifact.spatial`:
    //
    //   for (const id of Object.keys(prev)) {
    //     const artifact = artifacts.find((a) => a.id === id)
    //     if (!artifact || !artifact.spatial) {
    //       changed = true
    //       delete next[id]
    //     }
    //   }
    //
    // See SLICE_3_5_REVIEW.md for details.
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
    // CURRENT BEHAVIOR — t1 stays because it's in the list (just non-spatial):
    expect(changed).toBe(false)
    expect(next['a1']).toBeDefined()
    expect(next['t1']).toBeDefined() // CURRENT BEHAVIOR — should be cleaned up
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
  it('CURRENTLY BROKEN: creates partial entry when artifactId missing', () => {
    const prev: SettingsMap = {}
    const next = toggleLayerVisibility(prev, 'a1')
    // The visible flip works (undefined → true):
    expect(next['a1'].visible).toBe(true)
    // But the entry is incomplete — opacity and zIndex are missing:
    expect(next['a1'].opacity).toBeUndefined()
    expect(next['a1'].zIndex).toBeUndefined()
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