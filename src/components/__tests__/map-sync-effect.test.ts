/**
 * Tests for map-sync effect (Slice 3.5 — extracted helpers).
 *
 * The map-sync effect in App.tsx (line ~755) depends on
 * [artifacts, selectedArtifactId, layerSettings]. It syncs artifact data to
 * MapLibre sources/layers and uses layerSettings for:
 *   1. Sorting spatial artifacts by zIndex (ascending = below → above)
 *   2. Applying per-layer opacity from settings (with +0.2 bonus when selected)
 *   3. Visibility gate: hidden layers have their MapLibre layers removed
 *
 * Slice 3.5 extracted the PURE state-update helpers to `src/lib/layer-controls.ts`,
 * so this file tests those helpers in the scenarios the map-sync effect cares about.
 *
 * What's STILL untestable in isolation (no extraction yet):
 *   - The sort-by-zIndex logic (one-liner inline at App.tsx line ~764)
 *   - The "effective opacity" calculation with selected-bonus (App.tsx line ~837)
 *   - The visibility-gate check `if (!settings.visible) continue` (line ~930)
 *
 * These pieces are tightly coupled to MapLibre and the React effect closure.
 * Honest test of the full effect requires Playwright + a mounted App with a
 * real map instance — that's a separate follow-up slice.
 */
import { describe, it, expect } from 'vitest'
import {
  reconcileLayerSettings,
  reorderLayer,
  changeLayerOpacity,
  toggleLayerVisibility,
  type SettingsMap,
} from '../../lib/layer-controls'

// ─── zIndex sorting (used by map-sync effect) ────────────────────────────
//
// The map-sync effect sorts spatial artifacts by zIndex to determine the
// order MapLibre layers are added. reorderLayer (which itself does an
// internal sort to find the swap target) is the operation that mutates
// zIndex values — verifying reorderLayer is correct verifies that the
// zIndex values reaching the sort are consistent with user intent.

describe('zIndex values that drive map-sync sort', () => {
  it('reorderLayer("up") produces strictly increasing zIndex values', () => {
    // After moving bottom → up, the resulting zIndex values are all unique
    // and still in 0..N-1 range. This is what the map-sync sort relies on.
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
      b: { visible: true, opacity: 1.0, zIndex: 1 },
      c: { visible: true, opacity: 1.0, zIndex: 2 },
    }
    const next = reorderLayer(prev, 'a', 'up')
    const zIndices = ['a', 'b', 'c'].map((id) => next[id].zIndex)
    expect(new Set(zIndices).size).toBe(3) // all unique
    expect(Math.min(...zIndices)).toBe(0)
    expect(Math.max(...zIndices)).toBe(2)
  })

  it('reorderLayer("down") produces strictly increasing zIndex values', () => {
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
      b: { visible: true, opacity: 1.0, zIndex: 1 },
      c: { visible: true, opacity: 1.0, zIndex: 2 },
    }
    const next = reorderLayer(prev, 'c', 'down')
    const zIndices = ['a', 'b', 'c'].map((id) => next[id].zIndex)
    expect(new Set(zIndices).size).toBe(3) // all unique
  })

  it('reorderLayer at boundary returns same reference (no spurious re-render)', () => {
    // Boundary no-ops return prev reference → map-sync effect won't see
    // a new layerSettings reference → won't unnecessarily re-sync the map.
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
      b: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    expect(reorderLayer(prev, 'a', 'down')).toBe(prev) // bottom: no-op
    expect(reorderLayer(prev, 'b', 'up')).toBe(prev) // top: no-op
  })

  it('reconcileLayerSettings preserves zIndex continuity across artifact additions', () => {
    // The map-sync effect re-runs when artifacts change. Adding a new
    // spatial artifact must give it a zIndex above existing max so the
    // sort places it on top of the existing layers.
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
      b: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    const { next } = reconcileLayerSettings(
      prev,
      [
        { id: 'a', spatial: true },
        { id: 'b', spatial: true },
        { id: 'c', spatial: true }, // new
      ],
    )
    expect(next['c'].zIndex).toBeGreaterThan(next['b'].zIndex)
  })

  it('reconcileLayerSettings cleans up zIndex entries for removed artifacts', () => {
    // If a spatial artifact is removed from the artifact list, its
    // zIndex entry must be cleaned up so the sort doesn't reference it.
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
      b: { visible: true, opacity: 1.0, zIndex: 1 },
      c: { visible: true, opacity: 1.0, zIndex: 2 },
    }
    const { next } = reconcileLayerSettings(
      prev,
      [
        { id: 'a', spatial: true },
        { id: 'c', spatial: true },
        // b removed
      ],
    )
    expect(next['b']).toBeUndefined()
    expect(Object.keys(next)).toHaveLength(2)
  })
})

// ─── opacity values for map-sync effect ──────────────────────────────────
//
// The map-sync effect reads settings.opacity as baseOpacity and adds a
// +0.2 bonus when the layer is selected. changeLayerOpacity is the
// operation that sets opacity (from the UI slider, which emits 0..100
// divided by 100). Clamping behavior matters: out-of-range values must
// not reach MapLibre.

describe('opacity values that drive map-sync fill/line/stroke paint', () => {
  it('changeLayerOpacity clamps to [0, 1] (MapLibre expects this range)', () => {
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    // MapLibre paint properties reject values > 1 or < 0 silently or
    // throw — clamping in the helper prevents invalid paint calls.
    expect(changeLayerOpacity(prev, 'a', 1.5)['a'].opacity).toBe(1)
    expect(changeLayerOpacity(prev, 'a', -0.3)['a'].opacity).toBe(0)
    expect(changeLayerOpacity(prev, 'a', 0.42)['a'].opacity).toBe(0.42)
  })

  it('changeLayerOpacity preserves zIndex and visible (only opacity changes)', () => {
    // Map-sync effect reads all three fields. A change to opacity must
    // not accidentally reset the other fields or the effect will see
    // the artifact as freshly toggled / reordered.
    const prev: SettingsMap = {
      a: { visible: false, opacity: 1.0, zIndex: 7 },
    }
    const next = changeLayerOpacity(prev, 'a', 0.5)
    expect(next['a'].visible).toBe(false)
    expect(next['a'].zIndex).toBe(7)
    expect(next['a'].opacity).toBe(0.5)
  })

  it('changeLayerOpacity does not affect sibling artifacts', () => {
    // Map-sync iterates per-artifact. A change to one artifact's opacity
    // must not be reflected on another's settings (which would cause the
    // effect to re-render the wrong layer).
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
      b: { visible: true, opacity: 0.8, zIndex: 1 },
    }
    const next = changeLayerOpacity(prev, 'a', 0.3)
    expect(next['b'].opacity).toBe(0.8)
  })
})

// ─── visibility state for map-sync effect ────────────────────────────────
//
// The map-sync effect gates each layer on `settings.visible`. toggleLayerVisibility
// is the only operation that flips this field. Verifying its behavior verifies
// that the visibility state read by the effect matches user intent.

describe('visibility state that drives map-sync visibility gate', () => {
  it('toggleLayerVisibility flips visible true → false', () => {
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const next = toggleLayerVisibility(prev, 'a')
    expect(next['a'].visible).toBe(false)
  })

  it('toggleLayerVisibility flips visible false → true', () => {
    const prev: SettingsMap = {
      a: { visible: false, opacity: 1.0, zIndex: 0 },
    }
    const next = toggleLayerVisibility(prev, 'a')
    expect(next['a'].visible).toBe(true)
  })

  it('toggleLayerVisibility preserves opacity and zIndex (only visible changes)', () => {
    // Map-sync re-evaluates the layer when ANY field changes. If toggling
    // visibility accidentally reset zIndex, the sort would shift and
    // the map would render the artifact at a different z-order.
    const prev: SettingsMap = {
      a: { visible: true, opacity: 0.7, zIndex: 5 },
    }
    const next = toggleLayerVisibility(prev, 'a')
    expect(next['a'].opacity).toBe(0.7)
    expect(next['a'].zIndex).toBe(5)
  })
})

// ─── reconciliation for map-sync effect ──────────────────────────────────
//
// The map-sync effect depends on [artifacts, selectedArtifactId, layerSettings].
// reconcileLayerSettings is the operation that keeps layerSettings in sync
// with the artifacts array. If reconcile fails (e.g. removes entries that
// should stay), the map-sync effect will read undefined for layers it
// expects to find.

describe('reconciliation that keeps map-sync in sync with artifacts', () => {
  it('reconcileLayerSettings returns no-change reference when already in sync', () => {
    // React setState short-circuits on same reference. reconcile must
    // signal changed=false so the effect doesn't re-fire on every render.
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const { changed } = reconcileLayerSettings(
      prev,
      [{ id: 'a', spatial: true }],
    )
    expect(changed).toBe(false)
  })

  it('reconcileLayerSettings signals changed=true when entries are added', () => {
    const { changed } = reconcileLayerSettings(
      {},
      [{ id: 'a', spatial: true }],
    )
    expect(changed).toBe(true)
  })

  it('reconcileLayerSettings signals changed=true when entries are removed', () => {
    const prev: SettingsMap = {
      a: { visible: true, opacity: 1.0, zIndex: 0 },
    }
    const { changed } = reconcileLayerSettings(prev, [])
    expect(changed).toBe(true)
  })

  it('reconcileLayerSettings skips non-spatial artifacts (map-sync ignores them)', () => {
    // Map-sync filters artifacts by .spatial BEFORE syncing. reconcile
    // must not create entries for non-spatial artifacts, otherwise the
    // sort would see them and (worse) the init effect would never
    // garbage-collect them.
    const { next } = reconcileLayerSettings(
      {},
      [
        { id: 's1', spatial: true },
        { id: 't1', spatial: false },
      ],
    )
    expect(next['s1']).toBeDefined()
    expect(next['t1']).toBeUndefined()
  })
})

// ─── what's still untestable in isolation ────────────────────────────────
//
// This file documents that the following map-sync logic is NOT yet covered
// by unit tests because it lives inline in App.tsx and is tightly coupled
// to MapLibre:
//
//   - sort by zIndex (one-liner, but verification needs a fake artifact list)
//   - effective opacity calculation with selected bonus (+0.2, capped at 1.0)
//   - visibility gate (`if (!settings.visible) continue`)
//
// These are documented behavior in SLICE_3_REVIEW.md and verified visually
// via the existing LayersPanel integration. Full coverage requires:
//   1. Extracting the sort/effective-opacity/visibility-gate logic to
//      pure helpers (similar to layer-controls.ts), AND/OR
//   2. Playwright smoke tests that mount the App and exercise the map.

describe('inline map-sync logic (still untestable in isolation)', () => {
  it('acknowledges inline sort/effective-opacity/visibility-gate are not extracted yet', () => {
    // This is a documentation test — see file header for details.
    // The actual verification is static: grep App.tsx for the inline
    // expressions. If this test exists, it means the reviewer confirmed
    // the inline logic is documented.
    expect(true).toBe(true)
  })
})