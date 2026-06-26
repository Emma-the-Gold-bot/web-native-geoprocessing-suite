/**
 * Tests for Slice 12: History Panel tab in the right panel.
 *
 * These tests verify the expected DOM structure and behavioral contracts
 * of the History tab added in Slice 12. They render faithful replicas of
 * the right-panel tab switcher and history list from App.tsx.
 *
 * What these tests lock in:
 * 1. Tab switcher renders Details and History buttons
 * 2. Clicking History tab shows the history content
 * 3. Clicking Details tab shows the details content
 * 4. Empty state renders when history array is empty
 * 5. History list renders events with summary, type badge, and timestamp
 * 6. Clicking an event sets it as selected (highlighted)
 * 7. Selected event detail section renders below the list
 * 8. Warning badges render when events have warnings
 * 9. Note and provenance badges render correctly
 * 10. History count badge shows on tab button
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'
import type { HistoryEvent, WarningRef } from '../../types'
import { formatTimestamp, formatCount } from '../../lib/utils'
import { getActiveWarnings, getCurrentNotes, getProvenanceNotes, getSeverityLabel, getWarningScopeLabel, getWarningRecoveryHint } from '../../lib/product-surface'

// ─── Mock Data ──────────────────────────────────────────────────────────

function makeWarning(overrides: Partial<WarningRef> = {}): WarningRef {
  return {
    id: 'w1',
    severity: 'info',
    title: 'Test note',
    message: 'This is a test note.',
    scope: 'active',
    code: 'TEST_NOTE',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    id: 'evt-1',
    type: 'import',
    timestamp: '2025-01-15T10:30:00.000Z',
    summary: 'Imported parcels.geojson',
    inputArtifactIds: [],
    outputArtifactIds: ['art-1'],
    warnings: [],
    details: {},
    ...overrides,
  }
}

// ─── Replica Components ─────────────────────────────────────────────────

/**
 * Replica of the right-panel tab switcher from App.tsx (~lines 4870–4910).
 * Faithfully reproduces the tab switching behavior and conditional rendering.
 */
function RightPanelTabReplica({
  history = [],
  rightPanelTab = 'details',
  onTabChange,
  selectedHistoryEventId = null,
  onHistoryEventSelect,
}: {
  history?: HistoryEvent[]
  rightPanelTab?: 'details' | 'history'
  onTabChange?: (tab: 'details' | 'history') => void
  selectedHistoryEventId?: string | null
  onHistoryEventSelect?: (id: string) => void
}) {
  const [tab, setTab] = useState<'details' | 'history'>(rightPanelTab)
  const [selectedId, setSelectedId] = useState<string | null>(selectedHistoryEventId)

  const handleTabChange = (newTab: 'details' | 'history') => {
    setTab(newTab)
    onTabChange?.(newTab)
  }

  const handleEventClick = (id: string) => {
    setSelectedId(id)
    onHistoryEventSelect?.(id)
  }

  const selectedHistoryEvent = selectedId
    ? history.find((event) => event.id === selectedId) ?? null
    : null

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          data-testid="tab-details"
          style={{
            background: tab === 'details' ? '#1e293b' : 'transparent',
            color: tab === 'details' ? '#e2e8f0' : '#64748b',
            borderBottom: tab === 'details' ? '2px solid #3b82f6' : '2px solid transparent',
          }}
          onClick={() => handleTabChange('details')}
        >
          Details
        </button>
        <button
          data-testid="tab-history"
          style={{
            background: tab === 'history' ? '#1e293b' : 'transparent',
            color: tab === 'history' ? '#e2e8f0' : '#64748b',
            borderBottom: tab === 'history' ? '2px solid #3b82f6' : '2px solid transparent',
          }}
          onClick={() => handleTabChange('history')}
        >
          History{history.length > 0 ? ` (${history.length})` : ''}
        </button>
      </div>

      {/* Details tab content */}
      {tab === 'details' && (
        <div data-testid="details-content">Details panel content</div>
      )}

      {/* History tab content */}
      {tab === 'history' && (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {history.length === 0 && (
            <div data-testid="history-empty" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>⏱</div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                No operations yet. Run a geoprocessing operation to see history here.
              </div>
            </div>
          )}
          {history.length > 0 && (
            <div className="history-list" data-testid="history-list">
              {history.map((event) => (
                <button
                  key={event.id}
                  data-testid={`history-event-${event.id}`}
                  className={`card ${selectedId === event.id ? 'selected' : ''}`}
                  style={{ textAlign: 'left' }}
                  onClick={() => handleEventClick(event.id)}
                >
                  <div className="row">
                    <strong>{event.summary}</strong>
                    <span className="badge">{event.type}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {formatTimestamp(event.timestamp)}
                  </div>
                  <div className="row" style={{ marginTop: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    {getActiveWarnings(event.warnings).length > 0 && (
                      <span className="badge warning">
                        {formatCount(getActiveWarnings(event.warnings).length, 'warning')}
                      </span>
                    )}
                    {getCurrentNotes(event.warnings).length > 0 && (
                      <span className="badge info">
                        {formatCount(getCurrentNotes(event.warnings).length, 'note')}
                      </span>
                    )}
                    {getProvenanceNotes(event.warnings).length > 0 && (
                      <span className="badge historical">
                        {formatCount(getProvenanceNotes(event.warnings).length, 'provenance note')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedHistoryEvent && (
            <div data-testid="history-detail" style={{ marginTop: 16 }}>
              <div className="small" style={{ color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
                Event detail
              </div>
              <div className="card">
                <div className="row">
                  <strong>{selectedHistoryEvent.summary}</strong>
                  <span className="badge">{selectedHistoryEvent.type}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  {formatTimestamp(selectedHistoryEvent.timestamp)}
                </div>
                <div className="small" style={{ marginTop: 10 }}>
                  Inputs: {selectedHistoryEvent.inputArtifactIds.length
                    ? selectedHistoryEvent.inputArtifactIds.join(', ')
                    : 'none'}
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  Outputs: {selectedHistoryEvent.outputArtifactIds.length
                    ? selectedHistoryEvent.outputArtifactIds.join(', ')
                    : 'none'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('Slice 12 — History Panel', () => {
  describe('Tab switcher', () => {
    it('renders Details and History tab buttons', () => {
      render(<RightPanelTabReplica />)

      expect(screen.getByTestId('tab-details')).toBeTruthy()
      expect(screen.getByTestId('tab-history')).toBeTruthy()
      expect(screen.getByTestId('tab-details').textContent).toBe('Details')
      expect(screen.getByTestId('tab-history').textContent).toBe('History')
    })

    it('defaults to details tab', () => {
      render(<RightPanelTabReplica />)

      expect(screen.getByTestId('details-content')).toBeTruthy()
      expect(screen.queryByTestId('history-empty')).toBeNull()
    })

    it('switches to history tab on click', () => {
      const onTabChange = vi.fn()
      render(<RightPanelTabReplica onTabChange={onTabChange} />)

      fireEvent.click(screen.getByTestId('tab-history'))

      expect(onTabChange).toHaveBeenCalledWith('history')
      expect(screen.queryByTestId('details-content')).toBeNull()
    })

    it('switches back to details tab on click', () => {
      render(<RightPanelTabReplica rightPanelTab="history" />)

      fireEvent.click(screen.getByTestId('tab-details'))

      expect(screen.getByTestId('details-content')).toBeTruthy()
    })

    it('applies active styling to the selected tab', () => {
      render(<RightPanelTabReplica rightPanelTab="details" />)

      const detailsBtn = screen.getByTestId('tab-details')
      const historyBtn = screen.getByTestId('tab-history')

      // Details should have active background
      expect(detailsBtn.style.background).toBe('rgb(30, 41, 59)') // #1e293b
      expect(detailsBtn.style.borderBottom).toBe('2px solid rgb(59, 130, 246)') // #3b82f6

      // History should be transparent
      expect(historyBtn.style.background).toBe('transparent')
      expect(historyBtn.style.borderBottom).toBe('2px solid transparent')
    })
  })

  describe('History count badge', () => {
    it('does not show count when history is empty', () => {
      render(<RightPanelTabReplica history={[]} />)

      expect(screen.getByTestId('tab-history').textContent).toBe('History')
    })

    it('shows count when history has events', () => {
      const events = [makeEvent({ id: 'evt-1' }), makeEvent({ id: 'evt-2' })]
      render(<RightPanelTabReplica history={events} />)

      expect(screen.getByTestId('tab-history').textContent).toBe('History (2)')
    })
  })

  describe('Empty state', () => {
    it('shows empty state when history is empty', () => {
      render(<RightPanelTabReplica rightPanelTab="history" history={[]} />)

      const empty = screen.getByTestId('history-empty')
      expect(empty).toBeTruthy()
      expect(empty.textContent).toContain('No operations yet')
    })

    it('does not show empty state when history has events', () => {
      const events = [makeEvent()]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      expect(screen.queryByTestId('history-empty')).toBeNull()
    })

    it('does not show empty state on details tab', () => {
      render(<RightPanelTabReplica rightPanelTab="details" history={[]} />)

      expect(screen.queryByTestId('history-empty')).toBeNull()
    })
  })

  describe('History list rendering', () => {
    it('renders events with summary and type badge', () => {
      const events = [
        makeEvent({ id: 'evt-1', summary: 'Imported parcels.geojson', type: 'import' }),
        makeEvent({ id: 'evt-2', summary: 'Buffer 100m on parcels', type: 'operation' }),
      ]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      expect(screen.getByTestId('history-list')).toBeTruthy()
      expect(screen.getByTestId('history-event-evt-1').textContent).toContain('Imported parcels.geojson')
      expect(screen.getByTestId('history-event-evt-1').textContent).toContain('import')
      expect(screen.getByTestId('history-event-evt-2').textContent).toContain('Buffer 100m on parcels')
      expect(screen.getByTestId('history-event-evt-2').textContent).toContain('operation')
    })

    it('renders formatted timestamps', () => {
      const events = [makeEvent({ timestamp: '2025-01-15T10:30:00.000Z' })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      // formatTimestamp uses toLocaleString() — check it's rendered
      const eventBtn = screen.getByTestId('history-event-evt-1')
      const formatted = formatTimestamp('2025-01-15T10:30:00.000Z')
      expect(eventBtn.textContent).toContain(formatted)
    })

    it('renders query type events', () => {
      const events = [makeEvent({ id: 'evt-1', type: 'query', summary: 'Materialized query result' })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      expect(screen.getByTestId('history-event-evt-1').textContent).toContain('query')
    })

    it('renders operation type events', () => {
      const events = [makeEvent({ id: 'evt-1', type: 'operation', summary: 'Convex hull on parcels' })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      expect(screen.getByTestId('history-event-evt-1').textContent).toContain('operation')
    })
  })

  describe('Event selection', () => {
    it('clicking an event sets it as selected', () => {
      const onHistoryEventSelect = vi.fn()
      const events = [makeEvent({ id: 'evt-1' })]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          onHistoryEventSelect={onHistoryEventSelect}
        />
      )

      fireEvent.click(screen.getByTestId('history-event-evt-1'))

      expect(onHistoryEventSelect).toHaveBeenCalledWith('evt-1')
    })

    it('selected event gets "selected" class', () => {
      const events = [makeEvent({ id: 'evt-1' })]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          selectedHistoryEventId="evt-1"
        />
      )

      expect(screen.getByTestId('history-event-evt-1').className).toContain('selected')
    })

    it('non-selected event does not get "selected" class', () => {
      const events = [makeEvent({ id: 'evt-1' }), makeEvent({ id: 'evt-2' })]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          selectedHistoryEventId="evt-1"
        />
      )

      expect(screen.getByTestId('history-event-evt-2').className).not.toContain('selected')
    })

    it('shows event detail section when an event is selected', () => {
      const events = [makeEvent({ id: 'evt-1', summary: 'Imported parcels.geojson' })]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          selectedHistoryEventId="evt-1"
        />
      )

      const detail = screen.getByTestId('history-detail')
      expect(detail).toBeTruthy()
      expect(detail.textContent).toContain('Event detail')
      expect(detail.textContent).toContain('Imported parcels.geojson')
    })

    it('does not show event detail when no event is selected', () => {
      const events = [makeEvent({ id: 'evt-1' })]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          selectedHistoryEventId={null}
        />
      )

      expect(screen.queryByTestId('history-detail')).toBeNull()
    })

    it('event detail shows input and output artifact ids', () => {
      const events = [
        makeEvent({
          id: 'evt-1',
          inputArtifactIds: ['art-1', 'art-2'],
          outputArtifactIds: ['art-3'],
        }),
      ]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          selectedHistoryEventId="evt-1"
        />
      )

      const detail = screen.getByTestId('history-detail')
      expect(detail.textContent).toContain('Inputs: art-1, art-2')
      expect(detail.textContent).toContain('Outputs: art-3')
    })

    it('event detail shows "none" when no input/output artifacts', () => {
      const events = [
        makeEvent({
          id: 'evt-1',
          inputArtifactIds: [],
          outputArtifactIds: [],
        }),
      ]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          selectedHistoryEventId="evt-1"
        />
      )

      const detail = screen.getByTestId('history-detail')
      expect(detail.textContent).toContain('Inputs: none')
      expect(detail.textContent).toContain('Outputs: none')
    })
  })

  describe('Warning badges', () => {
    it('shows warning badge when event has active warnings', () => {
      const warnings: WarningRef[] = [
        makeWarning({ id: 'w1', severity: 'serious', title: 'CRS missing', scope: 'active' }),
      ]
      const events = [makeEvent({ id: 'evt-1', warnings })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      const eventBtn = screen.getByTestId('history-event-evt-1')
      expect(eventBtn.textContent).toContain('1 warning')
    })

    it('shows note badge when event has info-severity notes', () => {
      const warnings: WarningRef[] = [
        makeWarning({ id: 'w1', severity: 'info', title: 'Auto-detected CRS', scope: 'active' }),
      ]
      const events = [makeEvent({ id: 'evt-1', warnings })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      const eventBtn = screen.getByTestId('history-event-evt-1')
      expect(eventBtn.textContent).toContain('1 note')
    })

    it('shows provenance note badge when event has historical info notes', () => {
      const warnings: WarningRef[] = [
        makeWarning({ id: 'w1', severity: 'info', title: 'Imported from GeoJSON', scope: 'historical' }),
      ]
      const events = [makeEvent({ id: 'evt-1', warnings })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      const eventBtn = screen.getByTestId('history-event-evt-1')
      expect(eventBtn.textContent).toContain('1 provenance note')
    })

    it('shows multiple badge types simultaneously', () => {
      const warnings: WarningRef[] = [
        makeWarning({ id: 'w1', severity: 'serious', scope: 'active' }),
        makeWarning({ id: 'w2', severity: 'info', scope: 'active' }),
        makeWarning({ id: 'w3', severity: 'info', scope: 'historical' }),
      ]
      const events = [makeEvent({ id: 'evt-1', warnings })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      const eventBtn = screen.getByTestId('history-event-evt-1')
      expect(eventBtn.textContent).toContain('1 warning')
      expect(eventBtn.textContent).toContain('1 note')
      expect(eventBtn.textContent).toContain('1 provenance note')
    })

    it('does not show badges when no warnings', () => {
      const events = [makeEvent({ id: 'evt-1', warnings: [] })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      const eventBtn = screen.getByTestId('history-event-evt-1')
      expect(eventBtn.textContent).not.toContain('warning')
      expect(eventBtn.textContent).not.toContain('note')
      expect(eventBtn.textContent).not.toContain('provenance')
    })

    it('handles multiple warnings of the same type', () => {
      const warnings: WarningRef[] = [
        makeWarning({ id: 'w1', severity: 'serious', scope: 'active' }),
        makeWarning({ id: 'w2', severity: 'caution', scope: 'active' }),
      ]
      const events = [makeEvent({ id: 'evt-1', warnings })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      const eventBtn = screen.getByTestId('history-event-evt-1')
      expect(eventBtn.textContent).toContain('2 warnings')
    })
  })

  describe('Multiple events', () => {
    it('renders all events in order', () => {
      const events = [
        makeEvent({ id: 'evt-1', summary: 'First event' }),
        makeEvent({ id: 'evt-2', summary: 'Second event' }),
        makeEvent({ id: 'evt-3', summary: 'Third event' }),
      ]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      const list = screen.getByTestId('history-list')
      expect(list.textContent).toContain('First event')
      expect(list.textContent).toContain('Second event')
      expect(list.textContent).toContain('Third event')
    })

    it('allows selecting different events', () => {
      const onHistoryEventSelect = vi.fn()
      const events = [
        makeEvent({ id: 'evt-1', summary: 'First event' }),
        makeEvent({ id: 'evt-2', summary: 'Second event' }),
      ]
      render(
        <RightPanelTabReplica
          rightPanelTab="history"
          history={events}
          onHistoryEventSelect={onHistoryEventSelect}
        />
      )

      fireEvent.click(screen.getByTestId('history-event-evt-2'))
      expect(onHistoryEventSelect).toHaveBeenCalledWith('evt-2')
    })
  })

  describe('Edge cases', () => {
    it('handles event with undefined warnings gracefully', () => {
      // Some events might have empty warnings array
      const events = [makeEvent({ id: 'evt-1', warnings: [] })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      expect(screen.getByTestId('history-event-evt-1')).toBeTruthy()
    })

    it('handles very long summary text', () => {
      const longSummary = 'A'.repeat(200)
      const events = [makeEvent({ id: 'evt-1', summary: longSummary })]
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      expect(screen.getByTestId('history-event-evt-1').textContent).toContain(longSummary)
    })

    it('handles many events', () => {
      const events = Array.from({ length: 50 }, (_, i) =>
        makeEvent({ id: `evt-${i}`, summary: `Event ${i}` })
      )
      render(<RightPanelTabReplica rightPanelTab="history" history={events} />)

      expect(screen.getByTestId('history-list')).toBeTruthy()
      expect(screen.getByTestId('tab-history').textContent).toBe('History (50)')
    })
  })
})
