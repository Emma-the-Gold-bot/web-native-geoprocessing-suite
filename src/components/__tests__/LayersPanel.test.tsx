/**
 * Tests for LayersPanel component (Slice 3 — layer controls).
 *
 * Tests that layer controls (visibility, opacity, z-order) render correctly
 * for spatial artifacts and are absent for non-spatial artifacts.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LayersPanel from '../LayersPanel'
import type { Artifact, SavedQuery, LayerSettings } from '../../types'

// ─── Test fixtures ───

function makeSpatialArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'spatial-1',
    name: 'Parcels',
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: 100,
    warnings: [],
    originEventId: 'evt-1',
    ...overrides,
  }
}

function makeTabularArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'tabular-1',
    name: 'Census Table',
    kind: 'source',
    format: 'CSV',
    spatial: false,
    rowCount: 500,
    warnings: [],
    originEventId: 'evt-2',
    ...overrides,
  }
}

function makeLayerSettings(artifacts: Artifact[]): Record<string, LayerSettings> {
  const map: Record<string, LayerSettings> = {}
  artifacts.forEach((a, i) => {
    if (a.spatial) {
      map[a.id] = { visible: true, opacity: 1.0, zIndex: i }
    }
  })
  return map
}

const defaultProps = {
  projectName: 'Test Project',
  statusMessage: 'Ready',
  artifacts: [] as Artifact[],
  selectedArtifactId: null as string | null,
  setSelectedArtifactId: vi.fn(),
  setRightPanelOpen: vi.fn(),
  savedQueries: [] as SavedQuery[],
  handleLoadQuery: vi.fn(),
  handleDeleteQuery: vi.fn(),
  setShowSaveQueryDialog: vi.fn(),
  layerSettings: {} as Record<string, LayerSettings>,
  onToggleVisibility: vi.fn(),
  onChangeOpacity: vi.fn(),
  onReorder: vi.fn(),
}

// ─── Tests ───

describe('LayersPanel — layer controls', () => {
  it('renders visibility toggle for spatial artifacts', () => {
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
      />,
    )
    expect(screen.getByTitle('Hide layer')).toBeTruthy()
  })

  it('does not render controls for non-spatial artifacts', () => {
    const tabular = makeTabularArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[tabular]}
        layerSettings={{}}
      />,
    )
    expect(screen.queryByTitle('Hide layer')).toBeNull()
    expect(screen.queryByTitle('Show layer')).toBeNull()
  })

  it('renders opacity slider with current value', () => {
    const spatial = makeSpatialArtifact()
    const layerSettings: Record<string, LayerSettings> = {
      'spatial-1': { visible: true, opacity: 0.7, zIndex: 0 },
    }
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={layerSettings}
      />,
    )
    const slider = screen.getByTitle('Opacity: 70%') as HTMLInputElement
    expect(slider).toBeTruthy()
    expect(slider.value).toBe('70')
  })

  it('renders z-order buttons', () => {
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
      />,
    )
    expect(screen.getByTitle('Move up (higher z-order)')).toBeTruthy()
    expect(screen.getByTitle('Move down (lower z-order)')).toBeTruthy()
  })

  it('disables up button on top artifact (highest zIndex)', () => {
    const a1 = makeSpatialArtifact({ id: 'a1', name: 'Bottom' })
    const a2 = makeSpatialArtifact({ id: 'a2', name: 'Top' })
    const layerSettings: Record<string, LayerSettings> = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[a1, a2]}
        layerSettings={layerSettings}
      />,
    )
    // Top artifact (a2, zIndex 1) should have up button disabled
    const upButtons = screen.getAllByTitle('Move up (higher z-order)')
    // a2 is listed second — its up button should be disabled
    expect((upButtons[1] as HTMLButtonElement).disabled).toBe(true)
    expect((upButtons[0] as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables down button on bottom artifact (lowest zIndex)', () => {
    const a1 = makeSpatialArtifact({ id: 'a1', name: 'Bottom' })
    const a2 = makeSpatialArtifact({ id: 'a2', name: 'Top' })
    const layerSettings: Record<string, LayerSettings> = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[a1, a2]}
        layerSettings={layerSettings}
      />,
    )
    const downButtons = screen.getAllByTitle('Move down (lower z-order)')
    // a1 (zIndex 0) should have down button disabled
    expect((downButtons[0] as HTMLButtonElement).disabled).toBe(true)
    expect((downButtons[1] as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls onToggleVisibility when eye icon clicked', () => {
    const onToggle = vi.fn()
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
        onToggleVisibility={onToggle}
      />,
    )
    fireEvent.click(screen.getByTitle('Hide layer'))
    expect(onToggle).toHaveBeenCalledWith('spatial-1')
  })

  it('calls onChangeOpacity when slider moves', () => {
    const onChange = vi.fn()
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
        onChangeOpacity={onChange}
      />,
    )
    const slider = screen.getByTitle(/Opacity/) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '30' } })
    expect(onChange).toHaveBeenCalledWith('spatial-1', 0.3)
  })

  it('calls onReorder("up") when up button clicked', () => {
    const onReorder = vi.fn()
    const a1 = makeSpatialArtifact({ id: 'a1' })
    const a2 = makeSpatialArtifact({ id: 'a2' })
    const layerSettings: Record<string, LayerSettings> = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[a1, a2]}
        layerSettings={layerSettings}
        onReorder={onReorder}
      />,
    )
    const upButtons = screen.getAllByTitle('Move up (higher z-order)')
    fireEvent.click(upButtons[0]) // click up on a1
    expect(onReorder).toHaveBeenCalledWith('a1', 'up')
  })

  it('calls onReorder("down") when down button clicked', () => {
    const onReorder = vi.fn()
    const a1 = makeSpatialArtifact({ id: 'a1' })
    const a2 = makeSpatialArtifact({ id: 'a2' })
    const layerSettings: Record<string, LayerSettings> = {
      a1: { visible: true, opacity: 1.0, zIndex: 0 },
      a2: { visible: true, opacity: 1.0, zIndex: 1 },
    }
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[a1, a2]}
        layerSettings={layerSettings}
        onReorder={onReorder}
      />,
    )
    const downButtons = screen.getAllByTitle('Move down (lower z-order)')
    fireEvent.click(downButtons[1]) // click down on a2
    expect(onReorder).toHaveBeenCalledWith('a2', 'down')
  })

  it('stopPropagation on layer controls does not trigger selection', () => {
    const setSelected = vi.fn()
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
        setSelectedArtifactId={setSelected}
      />,
    )
    // Click the visibility toggle — should NOT select the artifact
    fireEvent.click(screen.getByTitle('Hide layer'))
    expect(setSelected).not.toHaveBeenCalled()
  })

  it('shows eye icon for visible layers, hidden icon for invisible', () => {
    const spatial = makeSpatialArtifact()
    const layerSettings: Record<string, LayerSettings> = {
      'spatial-1': { visible: false, opacity: 1.0, zIndex: 0 },
    }
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={layerSettings}
      />,
    )
    expect(screen.getByTitle('Show layer')).toBeTruthy()
    expect(screen.queryByTitle('Hide layer')).toBeNull()
  })

  it('renders mixed spatial and non-spatial: controls only for spatial', () => {
    const spatial = makeSpatialArtifact({ id: 's1', name: 'Parcels' })
    const tabular = makeTabularArtifact({ id: 't1', name: 'Table' })
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial, tabular]}
        layerSettings={makeLayerSettings([spatial])}
      />,
    )
    // Should have exactly one set of controls (for spatial only)
    expect(screen.getByTitle('Hide layer')).toBeTruthy()
    expect(screen.getAllByTitle('Move up (higher z-order)')).toHaveLength(1)
    expect(screen.getAllByTitle('Move down (lower z-order)')).toHaveLength(1)
  })
})
