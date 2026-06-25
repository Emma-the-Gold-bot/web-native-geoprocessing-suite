/**
 * Tests for LayersPanel component (Slice 3 — layer controls, Slice 4.2 — empty state CTAs).
 *
 * Tests that:
 * - Layer controls (visibility, opacity, z-order) render correctly for spatial artifacts
 * - Empty state CTAs (Import file, Try sample data, Discover data) render and fire handlers
 * - Saved queries empty state has "Save your first query" CTA
 * - CTAs are keyboard accessible
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

// ─── Keyboard accessibility (Slice 3.7 — nested <button> fix) ──────────────
//
// After Slice 3.7, the outer artifact card is <div role="button" tabIndex={0}>
// instead of <button>. This fixes the HTML violation where <button> contained
// nested <button> elements (visibility toggle, z-order controls).
//
// The card must remain keyboard-accessible: Enter and Space activate it.

describe('LayersPanel — keyboard accessibility', () => {
  it('artifact card has role="button"', () => {
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
      />,
    )
    const card = screen.getByRole('button', { name: /Parcels/ })
    expect(card.getAttribute('role')).toBe('button')
  })

  it('artifact card has tabIndex={0}', () => {
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
      />,
    )
    const card = screen.getByRole('button', { name: /Parcels/ })
    expect(card.getAttribute('tabindex')).toBe('0')
  })

  it('artifact card is a <div>, not <button> (nested button fix)', () => {
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
      />,
    )
    const card = screen.getByRole('button', { name: /Parcels/ })
    expect(card.tagName).toBe('DIV')
  })

  it('Enter key on artifact card selects it and opens right panel', () => {
    const setSelected = vi.fn()
    const setRightPanel = vi.fn()
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
        setSelectedArtifactId={setSelected}
        setRightPanelOpen={setRightPanel}
      />,
    )
    const card = screen.getByRole('button', { name: /Parcels/ })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(setSelected).toHaveBeenCalledWith('spatial-1')
    expect(setRightPanel).toHaveBeenCalledWith(true)
  })

  it('Space key on artifact card selects it and opens right panel', () => {
    const setSelected = vi.fn()
    const setRightPanel = vi.fn()
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
        setSelectedArtifactId={setSelected}
        setRightPanelOpen={setRightPanel}
      />,
    )
    const card = screen.getByRole('button', { name: /Parcels/ })
    fireEvent.keyDown(card, { key: ' ' })
    expect(setSelected).toHaveBeenCalledWith('spatial-1')
    expect(setRightPanel).toHaveBeenCalledWith(true)
  })

  it('other keys on artifact card do not trigger selection', () => {
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
    const card = screen.getByRole('button', { name: /Parcels/ })
    fireEvent.keyDown(card, { key: 'Tab' })
    fireEvent.keyDown(card, { key: 'Escape' })
    fireEvent.keyDown(card, { key: 'a' })
    expect(setSelected).not.toHaveBeenCalled()
  })

  it('no nested <button> warning: inner controls are inside <div>, not <button>', () => {
    // This test verifies the structural fix: the outer card is <div role="button">
    // and inner controls (visibility toggle, z-order buttons) are real <button>
    // elements inside a <div>, not <button> inside <button>.
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
      />,
    )
    const card = screen.getByRole('button', { name: /Parcels/ })
    // The outer card should be a div
    expect(card.tagName).toBe('DIV')
    // The inner buttons (visibility, z-order) should be actual <button> elements
    const innerButtons = card.querySelectorAll('button')
    expect(innerButtons.length).toBeGreaterThan(0)
    // The visibility toggle should still work
    expect(screen.getByTitle('Hide layer')).toBeTruthy()
  })
})

// ─── Empty state CTAs (Slice 4.2) ────────────────────────────────────────
//
// Slice 4.2 replaces passive empty-state text with actionable CTAs:
// - "Import file" button → triggers file picker
// - "Try sample data" button → loads sample GeoJSON
// - "Discover data →" link → opens Discovery panel
// - "Save your first query" link → opens save query dialog

describe('LayersPanel — empty state CTAs (artifacts)', () => {
  const ctaProps = {
    onImportFile: vi.fn(),
    onLoadSampleData: vi.fn(),
    onOpenDiscover: vi.fn(),
  }

  it('renders empty state text for accessibility (screen readers)', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        {...ctaProps}
      />,
    )
    expect(screen.getByText('No project artifacts yet. Import data to begin.')).toBeTruthy()
  })

  it('renders Import file button in empty state', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        {...ctaProps}
      />,
    )
    expect(screen.getByText('Import file')).toBeTruthy()
  })

  it('Import file button triggers the onImportFile handler', () => {
    const onImportFile = vi.fn()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        onImportFile={onImportFile}
        onLoadSampleData={ctaProps.onLoadSampleData}
        onOpenDiscover={ctaProps.onOpenDiscover}
      />,
    )
    fireEvent.click(screen.getByText('Import file'))
    expect(onImportFile).toHaveBeenCalledTimes(1)
  })

  it('renders Try sample data button', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        {...ctaProps}
      />,
    )
    expect(screen.getByText('Try sample data')).toBeTruthy()
  })

  it('Try sample data button triggers the onLoadSampleData handler', () => {
    const onLoadSampleData = vi.fn()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        onImportFile={ctaProps.onImportFile}
        onLoadSampleData={onLoadSampleData}
        onOpenDiscover={ctaProps.onOpenDiscover}
      />,
    )
    fireEvent.click(screen.getByText('Try sample data'))
    expect(onLoadSampleData).toHaveBeenCalledTimes(1)
  })

  it('renders Discover data link', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        {...ctaProps}
      />,
    )
    expect(screen.getByText(/Discover data/)).toBeTruthy()
  })

  it('Discover data link triggers the onOpenDiscover handler', () => {
    const onOpenDiscover = vi.fn()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        onImportFile={ctaProps.onImportFile}
        onLoadSampleData={ctaProps.onLoadSampleData}
        onOpenDiscover={onOpenDiscover}
      />,
    )
    fireEvent.click(screen.getByText(/Discover data/))
    expect(onOpenDiscover).toHaveBeenCalledTimes(1)
  })

  it('Import file button is keyboard accessible (focusable)', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        {...ctaProps}
      />,
    )
    const button = screen.getByText('Import file')
    // <button> is natively focusable — verify it's a real button
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('disabled')).toBeNull()
  })

  it('Discover data link is keyboard accessible (focusable button)', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        {...ctaProps}
      />,
    )
    const link = screen.getByText(/Discover data/)
    // It's rendered as a <button> with a link-like class
    expect(link.tagName).toBe('BUTTON')
  })

  it('CTA buttons are NOT rendered when handlers are not provided', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        // no onImportFile, onLoadSampleData, or onOpenDiscover
      />,
    )
    expect(screen.queryByText('Import file')).toBeNull()
    expect(screen.queryByText('Try sample data')).toBeNull()
    expect(screen.queryByText(/Discover data/)).toBeNull()
    // Empty state text is still present
    expect(screen.getByText('No project artifacts yet. Import data to begin.')).toBeTruthy()
  })

  it('CTAs do NOT appear when artifacts exist', () => {
    const spatial = makeSpatialArtifact()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[spatial]}
        layerSettings={makeLayerSettings([spatial])}
        {...ctaProps}
      />,
    )
    expect(screen.queryByText('Import file')).toBeNull()
    expect(screen.queryByText('Try sample data')).toBeNull()
    expect(screen.queryByText(/Discover data/)).toBeNull()
  })
})

describe('LayersPanel — empty state CTA (saved queries)', () => {
  it('renders Save your first query link when no saved queries', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        savedQueries={[]}
      />,
    )
    expect(screen.getByText('Save your first query')).toBeTruthy()
  })

  it('Save your first query link triggers setShowSaveQueryDialog', () => {
    const setShowSaveQueryDialog = vi.fn()
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        savedQueries={[]}
        setShowSaveQueryDialog={setShowSaveQueryDialog}
      />,
    )
    fireEvent.click(screen.getByText('Save your first query'))
    expect(setShowSaveQueryDialog).toHaveBeenCalledWith(true)
  })

  it('Save your first query link is keyboard accessible', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        savedQueries={[]}
      />,
    )
    const link = screen.getByText('Save your first query')
    expect(link.tagName).toBe('BUTTON')
  })

  it('Save your first query does NOT appear when saved queries exist', () => {
    const query: SavedQuery = {
      id: 'q1',
      name: 'Test Query',
      sql: 'SELECT 1',
      createdAt: new Date().toISOString(),
    }
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        savedQueries={[query]}
      />,
    )
    expect(screen.queryByText('Save your first query')).toBeNull()
  })

  it('empty state text is still present for accessibility', () => {
    render(
      <LayersPanel
        {...defaultProps}
        artifacts={[]}
        savedQueries={[]}
      />,
    )
    expect(screen.getByText('No saved queries yet.')).toBeTruthy()
  })
})
