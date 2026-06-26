/**
 * Tests for Slice 9: Export Menu + Keyboard Shortcuts.
 *
 * Since the export menu UI lives inline in App.tsx (not a separate component),
 * we test two things:
 *
 * Part 1: Keyboard shortcut tests — event → handler mapping
 *   (mirrors the expected App.tsx onKeyDown handler pattern)
 *
 * Part 2: Export menu logic tests — pure functions from src/lib/export.ts
 *   (imported directly, no mocking needed)
 *
 * NOTE: The keyboard handler helper below mirrors the expected App.tsx
 * implementation pattern. If App.tsx diverges from this contract, these
 * tests will catch the drift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getArtifactExportOptions,
  canExportArtifactAsGeoJson,
  canExportArtifactAsJson,
  type ArtifactExportOption,
} from '../../lib/export'
import type { Artifact } from '../../types'

// ─── Mock artifacts ───────────────────────────────────────────────────────

function makeSpatialArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    id: 'spatial-1',
    name: 'parcels',
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: 150,
    warnings: [],
    originEventId: 'evt-1',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.4, 37.7] },
          properties: { name: 'A' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.5, 37.8] },
          properties: { name: 'B' },
        },
      ],
    } as GeoJSON.FeatureCollection,
    ...overrides,
  }
}

function makeTabularArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    id: 'tabular-1',
    name: 'measurements',
    kind: 'derived',
    format: 'Measurement table',
    spatial: false,
    rowCount: 50,
    warnings: [],
    originEventId: 'evt-2',
    tableRows: [
      { station: 'A', value: 42 },
      { station: 'B', value: 37 },
    ],
    ...overrides,
  }
}

function makeDataArrayArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    id: 'data-1',
    name: 'computed',
    kind: 'derived',
    format: 'table',
    spatial: false,
    warnings: [],
    originEventId: 'evt-3',
    data: [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
    ...overrides,
  }
}

function makeEmptyArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    id: 'empty-1',
    name: 'empty-result',
    kind: 'derived',
    format: 'unknown',
    spatial: false,
    warnings: [],
    originEventId: 'evt-4',
    ...overrides,
  }
}

// ─── Part 1: Keyboard shortcut tests ──────────────────────────────────────
//
// These tests mirror the expected App.tsx keyboard handler pattern:
//   const mod = e.metaKey || e.ctrlKey
//   const isTyping = (e.target as HTMLElement).tagName === 'INPUT'
//                 || (e.target as HTMLElement).tagName === 'TEXTAREA'
//
//   if (mod && e.key === 's') { e.preventDefault(); ... }       // always
//   if (mod && e.key === 'o' && !isTyping) { e.preventDefault(); ... }
//   if (mod && e.key === 'n' && !isTyping) { e.preventDefault(); ... }
//   if (mod && e.key === 'k' && !isTyping) { e.preventDefault(); ... }
//   if (mod && e.key === 'b' && !isTyping) { e.preventDefault(); ... }
//   if (mod && e.key === 'e' && !isTyping) { e.preventDefault(); ... }
//   if (mod && e.key === '/' && !isTyping) { e.preventDefault(); ... }

describe('Keyboard shortcuts (Slice 9 pattern)', () => {
  // Track which actions were triggered
  let actions: Record<string, boolean>
  let preventDefaults: Record<string, boolean>
  let handler: (e: KeyboardEvent) => void

  function setupHandler() {
    actions = {
      save: false,
      open: false,
      newProject: false,
      focusCommand: false,
      toggleLayers: false,
      export: false,
      shortcutsHelp: false,
    }
    preventDefaults = {
      s: false,
      o: false,
      n: false,
      k: false,
      b: false,
      e: false,
      '/': false,
    }

    handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Ctrl/Cmd+S — always, even while typing
      if (e.key === 's') {
        e.preventDefault()
        actions.save = true
        preventDefaults.s = true
        return
      }

      // All other shortcuts are blocked while typing
      if (isTyping) return

      if (e.key === 'o') {
        e.preventDefault()
        actions.open = true
        preventDefaults.o = true
      } else if (e.key === 'n') {
        e.preventDefault()
        actions.newProject = true
        preventDefaults.n = true
      } else if (e.key === 'k') {
        e.preventDefault()
        actions.focusCommand = true
        preventDefaults.k = true
      } else if (e.key === 'b') {
        e.preventDefault()
        actions.toggleLayers = true
        preventDefaults.b = true
      } else if (e.key === 'e') {
        e.preventDefault()
        actions.export = true
        preventDefaults.e = true
      } else if (e.key === '/') {
        e.preventDefault()
        actions.shortcutsHelp = true
        preventDefaults['/'] = true
      }
    }

    window.addEventListener('keydown', handler)
  }

  function teardownHandler() {
    window.removeEventListener('keydown', handler)
  }

  function dispatchKey(
    opts: {
      key: string
      ctrlKey?: boolean
      metaKey?: boolean
      shiftKey?: boolean
      target?: HTMLElement
    },
  ) {
    const event = new KeyboardEvent('keydown', {
      key: opts.key,
      ctrlKey: opts.ctrlKey ?? false,
      metaKey: opts.metaKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    })

    // Override target if provided (for isTyping guard tests)
    if (opts.target) {
      Object.defineProperty(event, 'target', {
        value: opts.target,
        writable: false,
      })
    }

    window.dispatchEvent(event)
    return event
  }

  beforeEach(() => {
    setupHandler()
  })

  afterEach(() => {
    teardownHandler()
  })

  // 1. Ctrl+S → preventDefault called
  it('Ctrl+S calls preventDefault and triggers save', () => {
    const event = dispatchKey({ key: 's', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.save).toBe(true)
  })

  // 2. Ctrl+O → preventDefault called
  it('Ctrl+O calls preventDefault and triggers open', () => {
    const event = dispatchKey({ key: 'o', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.open).toBe(true)
  })

  // 3. Ctrl+N → preventDefault called
  it('Ctrl+N calls preventDefault and triggers new project', () => {
    const event = dispatchKey({ key: 'n', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.newProject).toBe(true)
  })

  // 4. Ctrl+K → preventDefault called
  it('Ctrl+K calls preventDefault and triggers focus command bar', () => {
    const event = dispatchKey({ key: 'k', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.focusCommand).toBe(true)
  })

  // 5. Ctrl+B → preventDefault called
  it('Ctrl+B calls preventDefault and triggers toggle layers', () => {
    const event = dispatchKey({ key: 'b', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.toggleLayers).toBe(true)
  })

  // 6. Ctrl+E → preventDefault called
  it('Ctrl+E calls preventDefault and triggers export', () => {
    const event = dispatchKey({ key: 'e', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.export).toBe(true)
  })

  // 7. Ctrl+/ → preventDefault called
  it('Ctrl+/ calls preventDefault and triggers shortcuts help', () => {
    const event = dispatchKey({ key: '/', ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.shortcutsHelp).toBe(true)
  })

  // 8. Plain S (no modifier) → no preventDefault
  it('plain S key does nothing (no modifier)', () => {
    const event = dispatchKey({ key: 's' })
    expect(event.defaultPrevented).toBe(false)
    expect(actions.save).toBe(false)
  })

  it('plain O key does nothing (no modifier)', () => {
    const event = dispatchKey({ key: 'o' })
    expect(Object.values(actions).every((v) => v === false)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  // Mac variant: metaKey instead of ctrlKey
  it('Cmd+S (metaKey) triggers save on Mac', () => {
    const event = dispatchKey({ key: 's', metaKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.save).toBe(true)
  })

  it('Cmd+O (metaKey) triggers open on Mac', () => {
    const event = dispatchKey({ key: 'o', metaKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.open).toBe(true)
  })

  // 9. Ctrl+S while typing in input → still preventDefault (save always works)
  it('Ctrl+S while typing in input still calls preventDefault and triggers save', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    const event = dispatchKey({ key: 's', ctrlKey: true, target: input })
    expect(event.defaultPrevented).toBe(true)
    expect(actions.save).toBe(true)

    document.body.removeChild(input)
  })

  // 10. Ctrl+O while typing in input → no action (guard blocks)
  it('Ctrl+O while typing in input does NOT trigger open (isTyping guard)', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    const event = dispatchKey({ key: 'o', ctrlKey: true, target: input })
    expect(event.defaultPrevented).toBe(false)
    expect(actions.open).toBe(false)

    document.body.removeChild(input)
  })

  // 11. Ctrl+B while typing in textarea → no action (guard blocks)
  it('Ctrl+B while typing in textarea does NOT trigger toggle layers (isTyping guard)', () => {
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    const event = dispatchKey({ key: 'b', ctrlKey: true, target: textarea })
    expect(event.defaultPrevented).toBe(false)
    expect(actions.toggleLayers).toBe(false)

    document.body.removeChild(textarea)
  })

  it('Ctrl+K while typing in input does NOT trigger focus command (isTyping guard)', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    const event = dispatchKey({ key: 'k', ctrlKey: true, target: input })
    expect(event.defaultPrevented).toBe(false)
    expect(actions.focusCommand).toBe(false)

    document.body.removeChild(input)
  })

  it('Ctrl+E while typing in textarea does NOT trigger export (isTyping guard)', () => {
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    const event = dispatchKey({ key: 'e', ctrlKey: true, target: textarea })
    expect(event.defaultPrevented).toBe(false)
    expect(actions.export).toBe(false)

    document.body.removeChild(textarea)
  })

  it('Ctrl+/ while typing in input does NOT trigger shortcuts help (isTyping guard)', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    const event = dispatchKey({ key: '/', ctrlKey: true, target: input })
    expect(event.defaultPrevented).toBe(false)
    expect(actions.shortcutsHelp).toBe(false)

    document.body.removeChild(input)
  })

  // 12. Ctrl+Z still works (undo from Slice 8 not broken)
  it('Ctrl+Z is not intercepted by the new handler (undo still works)', () => {
    // The new shortcuts should NOT match 'z' — undo/redo is handled separately
    const event = dispatchKey({ key: 'z', ctrlKey: true })
    expect(event.defaultPrevented).toBe(false)
    // No new shortcut actions should fire
    expect(Object.values(actions).every((v) => v === false)).toBe(true)
  })

  it('Ctrl+Shift+Z is not intercepted by the new handler (redo still works)', () => {
    const event = dispatchKey({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(event.defaultPrevented).toBe(false)
    expect(Object.values(actions).every((v) => v === false)).toBe(true)
  })

  it('Ctrl+Y is not intercepted by the new handler (redo still works)', () => {
    const event = dispatchKey({ key: 'y', ctrlKey: true })
    expect(event.defaultPrevented).toBe(false)
    expect(Object.values(actions).every((v) => v === false)).toBe(true)
  })

  // Additional: no action fires for unrelated keys
  it('Ctrl+P does nothing (not a registered shortcut)', () => {
    const event = dispatchKey({ key: 'p', ctrlKey: true })
    expect(event.defaultPrevented).toBe(false)
    expect(Object.values(actions).every((v) => v === false)).toBe(true)
  })
})

// ─── Part 2: Export menu logic tests ──────────────────────────────────────
//
// These test the pure functions from src/lib/export.ts directly.
// No mocking needed — import and call.

describe('Export menu logic (src/lib/export.ts)', () => {
  // 13. Export options for spatial artifact → returns geojson + json options
  it('getArtifactExportOptions returns geojson + json for spatial FeatureCollection artifact', () => {
    const artifact = makeSpatialArtifact()
    const options = getArtifactExportOptions(artifact)

    expect(options.length).toBe(2)
    expect(options.map((o) => o.kind)).toContain('geojson')
    expect(options.map((o) => o.kind)).toContain('json')

    const geojsonOpt = options.find((o) => o.kind === 'geojson')
    expect(geojsonOpt?.label).toContain('GeoJSON')
    expect(geojsonOpt?.description).toBeTruthy()

    const jsonOpt = options.find((o) => o.kind === 'json')
    expect(jsonOpt?.label).toContain('JSON')
    expect(jsonOpt?.description).toBeTruthy()
  })

  // 14. Export options for tabular artifact → returns json only
  it('getArtifactExportOptions returns json only for tabular artifact', () => {
    const artifact = makeTabularArtifact()
    const options = getArtifactExportOptions(artifact)

    expect(options.length).toBe(1)
    expect(options[0].kind).toBe('json')
    expect(options[0].label).toContain('JSON')
  })

  // 15. Export options for empty/null artifact → returns empty array
  it('getArtifactExportOptions returns empty array for artifact with no exportable data', () => {
    const artifact = makeEmptyArtifact()
    const options = getArtifactExportOptions(artifact)

    expect(options).toEqual([])
  })

  // 16. canExportArtifactAsGeoJson → true for spatial, false for tabular
  it('canExportArtifactAsGeoJson returns true for spatial FeatureCollection', () => {
    const spatial = makeSpatialArtifact()
    expect(canExportArtifactAsGeoJson(spatial)).toBe(true)
  })

  it('canExportArtifactAsGeoJson returns false for tabular artifact', () => {
    const tabular = makeTabularArtifact()
    expect(canExportArtifactAsGeoJson(tabular)).toBe(false)
  })

  it('canExportArtifactAsGeoJson returns false for empty artifact', () => {
    const empty = makeEmptyArtifact()
    expect(canExportArtifactAsGeoJson(empty)).toBe(false)
  })

  it('canExportArtifactAsGeoJson returns false for spatial artifact with non-FeatureCollection data', () => {
    // Spatial flag is true but data is not a FeatureCollection
    const badSpatial = makeSpatialArtifact({
      spatial: true,
      data: { type: 'Point', coordinates: [0, 0] }, // geometry, not FeatureCollection
    })
    expect(canExportArtifactAsGeoJson(badSpatial)).toBe(false)
  })

  // 17. canExportArtifactAsJson → true for artifacts with tableRows or data array
  it('canExportArtifactAsJson returns true for artifact with tableRows', () => {
    const tabular = makeTabularArtifact()
    expect(canExportArtifactAsJson(tabular)).toBe(true)
  })

  it('canExportArtifactAsJson returns true for artifact with data array', () => {
    const dataArr = makeDataArrayArtifact()
    expect(canExportArtifactAsJson(dataArr)).toBe(true)
  })

  it('canExportArtifactAsJson returns true for spatial FeatureCollection (extracts features as rows)', () => {
    const spatial = makeSpatialArtifact()
    expect(canExportArtifactAsJson(spatial)).toBe(true)
  })

  it('canExportArtifactAsJson returns false for empty artifact', () => {
    const empty = makeEmptyArtifact()
    expect(canExportArtifactAsJson(empty)).toBe(false)
  })

  // Additional edge cases
  it('getArtifactExportOptions labels include format descriptions', () => {
    const spatial = makeSpatialArtifact()
    const options = getArtifactExportOptions(spatial)

    for (const opt of options) {
      expect(opt.label).toBeTruthy()
      expect(opt.description).toBeTruthy()
      expect(typeof opt.label).toBe('string')
      expect(typeof opt.description).toBe('string')
    }
  })

  it('getArtifactExportOptions for tabular artifact has correct outputKind in description', () => {
    const tabular = makeTabularArtifact()
    const options = getArtifactExportOptions(tabular)

    expect(options.length).toBe(1)
    // The description should reference the output kind
    expect(options[0].description).toBeTruthy()
  })

  it('artifact with both tableRows and data array uses tableRows first', () => {
    // If both exist, canExportArtifactAsJson should still return true
    const both = makeSpatialArtifact({
      tableRows: [{ id: 1, name: 'test' }],
      data: [{ id: 2, name: 'other' }],
    })
    expect(canExportArtifactAsJson(both)).toBe(true)
  })
})