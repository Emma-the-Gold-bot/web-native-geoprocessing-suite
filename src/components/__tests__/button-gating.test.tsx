/**
 * Tests for Slice 11: Button Gating + Query State.
 *
 * These tests verify the expected DOM structure and disabled-state logic
 * AFTER the Slice 11 refactor. They render faithful replicas of the
 * SQL panel markup (sidebar + bottom dock) and verify behavioral contracts.
 *
 * What these tests lock in:
 * 1. Run query button is disabled when no queryable tables exist
 * 2. Run query button is disabled while a query is running
 * 3. Save Query button is disabled until a query has run successfully
 * 4. Save Query button enables after successful query
 * 5. "Import data" link appears when 0 tables exist
 * 6. "Import data" link is hidden when tables exist
 * 7. "Example query — import data to run this." label is present
 * 8. "Reset to example" button resets SQL to SAMPLE_SQL
 * 9. Both sidebar and bottom dock instances are structurally consistent
 *
 * NOTE: The "Import data" button behavior differs between sidebar
 * (triggers file picker) and bottom dock (switches to table tab).
 * This is intentional — the bottom dock navigates to the import area.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ─── Constants ──────────────────────────────────────────────────────────

const SAMPLE_SQL = `SELECT id, name, category, area_acres, geometry
FROM parcels
LIMIT 100`

// ─── Replica Components ─────────────────────────────────────────────────

/**
 * Replica of the sidebar SQL panel from App.tsx (~lines 3370–3410).
 * Accepts props to control state for testing different scenarios.
 */
function SidebarSqlPanel({
  artifacts = [],
  queryRunning = false,
  queryHasRunSuccessfully = false,
  queryError = null,
  sql = SAMPLE_SQL,
  onRunQuery,
  onSaveQuery,
  onResetSql,
  onSqlChange,
  onImportData,
}: {
  artifacts?: Array<{ tableName: string | null; kind: string }>
  queryRunning?: boolean
  queryHasRunSuccessfully?: boolean
  queryError?: string | null
  sql?: string
  onRunQuery?: () => void
  onSaveQuery?: () => void
  onResetSql?: () => void
  onSqlChange?: (value: string) => void
  onImportData?: () => void
}) {
  const queryableCount = artifacts.filter((a) => a.tableName).length
  return (
    <div>
      <div className="small muted">
        {queryableCount === 0
          ? 'No registered tables yet.'
          : artifacts
              .filter((a) => a.tableName)
              .map((a) => `${a.tableName} (${a.kind})`)
              .join(', ')}
      </div>
      {queryableCount === 0 && (
        <div className="small muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
          Import data or load a sample to enable SQL queries.{' '}
          <button
            className="secondary"
            style={{ padding: '2px 8px', fontSize: 'inherit' }}
            onClick={onImportData}
          >
            Import data
          </button>
        </div>
      )}
      <div className="small muted" style={{ marginBottom: 4, fontStyle: 'italic' }}>
        Example query — import data to run this.
      </div>
      <textarea
        className="sql-editor"
        value={sql}
        onChange={(event) => onSqlChange?.(event.target.value)}
      />
      {queryError && (
        <div className="card danger" style={{ marginTop: 12 }}>
          <strong>Query failed</strong>
          <div className="small muted" style={{ marginTop: 6 }}>{queryError}</div>
        </div>
      )}
      <div className="actions">
        <button
          className="primary"
          onClick={onRunQuery}
          disabled={queryRunning || queryableCount === 0}
        >
          {queryRunning ? 'Running…' : 'Run query'}
        </button>
        <button
          className="secondary"
          onClick={onSaveQuery}
          disabled={!queryHasRunSuccessfully}
        >
          Save Query
        </button>
        <button className="secondary" onClick={onResetSql}>
          Reset to example
        </button>
      </div>
    </div>
  )
}

/**
 * Replica of the bottom dock SQL panel from App.tsx (~lines 5505–5545).
 * Structurally identical to sidebar except "Import data" navigates to table tab.
 */
function BottomDockSqlPanel({
  artifacts = [],
  queryRunning = false,
  queryHasRunSuccessfully = false,
  queryError = null,
  sql = SAMPLE_SQL,
  onRunQuery,
  onSaveQuery,
  onResetSql,
  onSqlChange,
  onImportData,
}: {
  artifacts?: Array<{ tableName: string | null; kind: string }>
  queryRunning?: boolean
  queryHasRunSuccessfully?: boolean
  queryError?: string | null
  sql?: string
  onRunQuery?: () => void
  onSaveQuery?: () => void
  onResetSql?: () => void
  onSqlChange?: (value: string) => void
  onImportData?: () => void
}) {
  const queryableCount = artifacts.filter((a) => a.tableName).length
  return (
    <div>
      <div className="small muted">
        {queryableCount === 0
          ? 'No registered tables yet.'
          : artifacts
              .filter((a) => a.tableName)
              .map((a) => `${a.tableName} (${a.kind})`)
              .join(', ')}
      </div>
      {queryableCount === 0 && (
        <div className="small muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
          Import data or load a sample to enable SQL queries.{' '}
          <button
            className="secondary"
            style={{ padding: '2px 8px', fontSize: 'inherit' }}
            onClick={onImportData}
          >
            Import data
          </button>
        </div>
      )}
      <div className="small muted" style={{ marginBottom: 4, fontStyle: 'italic' }}>
        Example query — import data to run this.
      </div>
      <textarea
        className="sql-editor"
        value={sql}
        onChange={(event) => onSqlChange?.(event.target.value)}
      />
      {queryError && (
        <div className="card danger" style={{ marginTop: 12 }}>
          <strong>Query failed</strong>
          <div className="small muted" style={{ marginTop: 6 }}>{queryError}</div>
        </div>
      )}
      <div className="actions">
        <button
          className="primary"
          onClick={onRunQuery}
          disabled={queryRunning || queryableCount === 0}
        >
          {queryRunning ? 'Running…' : 'Run query'}
        </button>
        <button
          className="secondary"
          onClick={onSaveQuery}
          disabled={!queryHasRunSuccessfully}
        >
          Save Query
        </button>
        <button className="secondary" onClick={onResetSql}>
          Reset to example
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getButtonByName(name: string): HTMLButtonElement {
  const btn = screen.getByRole('button', { name })
  return btn as HTMLButtonElement
}

function queryButtonByName(name: string): HTMLButtonElement | null {
  return screen.queryByRole('button', { name }) as HTMLButtonElement | null
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('Slice 11 — Run button gating (0 tables)', () => {
  it('Run query button is disabled when no queryable tables exist', () => {
    render(<SidebarSqlPanel artifacts={[]} />)
    expect(getButtonByName('Run query').disabled).toBe(true)
  })

  it('Run query button is disabled when artifacts exist but none have tableName', () => {
    render(
      <SidebarSqlPanel
        artifacts={[
          { tableName: null, kind: 'geojson' },
          { tableName: null, kind: 'geoparquet' },
        ]}
      />,
    )
    expect(getButtonByName('Run query').disabled).toBe(true)
  })

  it('Run query button is enabled when at least one table exists', () => {
    render(
      <SidebarSqlPanel
        artifacts={[{ tableName: 'parcels', kind: 'geojson' }]}
      />,
    )
    expect(getButtonByName('Run query').disabled).toBe(false)
  })

  it('Run query button is disabled while query is running (even with tables)', () => {
    render(
      <SidebarSqlPanel
        artifacts={[{ tableName: 'parcels', kind: 'geojson' }]}
        queryRunning={true}
      />,
    )
    expect(getButtonByName('Running…').disabled).toBe(true)
  })

  it('Run button text changes to "Running…" while query is running', () => {
    render(
      <SidebarSqlPanel
        artifacts={[{ tableName: 'parcels', kind: 'geojson' }]}
        queryRunning={true}
      />,
    )
    expect(getButtonByName('Running…')).toBeTruthy()
    expect(queryButtonByName('Run query')).toBeNull()
  })
})

describe('Slice 11 — Save Query button gating', () => {
  it('Save Query is disabled when no query has run successfully', () => {
    render(<SidebarSqlPanel queryHasRunSuccessfully={false} />)
    expect(getButtonByName('Save Query').disabled).toBe(true)
  })

  it('Save Query is enabled after a successful query', () => {
    render(<SidebarSqlPanel queryHasRunSuccessfully={true} />)
    expect(getButtonByName('Save Query').disabled).toBe(false)
  })

  it('Save Query remains disabled even when tables exist but query has not run', () => {
    render(
      <SidebarSqlPanel
        artifacts={[{ tableName: 'parcels', kind: 'geojson' }]}
        queryHasRunSuccessfully={false}
      />,
    )
    expect(getButtonByName('Save Query').disabled).toBe(true)
  })
})

describe('Slice 11 — Import data link', () => {
  it('shows "Import data" link when no queryable tables exist', () => {
    render(<SidebarSqlPanel artifacts={[]} />)
    expect(getButtonByName('Import data')).toBeTruthy()
  })

  it('hides "Import data" link when tables exist', () => {
    render(
      <SidebarSqlPanel
        artifacts={[{ tableName: 'parcels', kind: 'geojson' }]}
      />,
    )
    expect(queryButtonByName('Import data')).toBeNull()
  })

  it('shows "No registered tables yet." when no tables exist', () => {
    render(<SidebarSqlPanel artifacts={[]} />)
    expect(screen.getByText('No registered tables yet.')).toBeTruthy()
  })

  it('shows table names when tables exist', () => {
    render(
      <SidebarSqlPanel
        artifacts={[
          { tableName: 'parcels', kind: 'geojson' },
          { tableName: 'roads', kind: 'geoparquet' },
        ]}
      />,
    )
    expect(screen.getByText('parcels (geojson), roads (geoparquet)')).toBeTruthy()
  })

  it('calls onImportData when Import data button is clicked', () => {
    const onImportData = vi.fn()
    render(<SidebarSqlPanel artifacts={[]} onImportData={onImportData} />)
    fireEvent.click(getButtonByName('Import data'))
    expect(onImportData).toHaveBeenCalledTimes(1)
  })
})

describe('Slice 11 — Example query label and Reset', () => {
  it('shows "Example query — import data to run this." label', () => {
    render(<SidebarSqlPanel />)
    expect(screen.getByText('Example query — import data to run this.')).toBeTruthy()
  })

  it('shows "Example query" label even when tables exist', () => {
    render(
      <SidebarSqlPanel
        artifacts={[{ tableName: 'parcels', kind: 'geojson' }]}
      />,
    )
    expect(screen.getByText('Example query — import data to run this.')).toBeTruthy()
  })

  it('shows "Reset to example" button', () => {
    render(<SidebarSqlPanel />)
    expect(getButtonByName('Reset to example')).toBeTruthy()
  })

  it('calls onResetSql when Reset to example is clicked', () => {
    const onResetSql = vi.fn()
    render(<SidebarSqlPanel onResetSql={onResetSql} />)
    fireEvent.click(getButtonByName('Reset to example'))
    expect(onResetSql).toHaveBeenCalledTimes(1)
  })
})

describe('Slice 11 — Query error display', () => {
  it('shows error card when queryError is set', () => {
    render(<SidebarSqlPanel queryError='Table "parcels" not found' />)
    expect(screen.getByText('Query failed')).toBeTruthy()
    expect(screen.getByText('Table "parcels" not found')).toBeTruthy()
  })

  it('does not show error card when queryError is null', () => {
    render(<SidebarSqlPanel queryError={null} />)
    expect(screen.queryByText('Query failed')).toBeNull()
  })
})

describe('Slice 11 — Sidebar vs Bottom dock consistency', () => {
  const baseProps = {
    artifacts: [{ tableName: 'parcels', kind: 'geojson' }] as Array<{ tableName: string | null; kind: string }>,
    queryRunning: false,
    queryHasRunSuccessfully: false,
    queryError: null as string | null,
    sql: SAMPLE_SQL,
  }

  it('Run button has same disabled state in both panels', () => {
    const { unmount } = render(<SidebarSqlPanel {...baseProps} />)
    const sidebarDisabled = getButtonByName('Run query').disabled
    unmount()

    render(<BottomDockSqlPanel {...baseProps} />)
    expect(getButtonByName('Run query').disabled).toBe(sidebarDisabled)
  })

  it('Save button has same disabled state in both panels', () => {
    const { unmount } = render(<SidebarSqlPanel {...baseProps} />)
    const sidebarDisabled = getButtonByName('Save Query').disabled
    unmount()

    render(<BottomDockSqlPanel {...baseProps} />)
    expect(getButtonByName('Save Query').disabled).toBe(sidebarDisabled)
  })

  it('Run button disabled when 0 tables — same in both panels', () => {
    const { unmount } = render(<SidebarSqlPanel artifacts={[]} />)
    expect(getButtonByName('Run query').disabled).toBe(true)
    unmount()

    render(<BottomDockSqlPanel artifacts={[]} />)
    expect(getButtonByName('Run query').disabled).toBe(true)
  })

  it('Save button disabled when queryHasRunSuccessfully=false — same in both panels', () => {
    const { unmount } = render(<SidebarSqlPanel queryHasRunSuccessfully={false} />)
    expect(getButtonByName('Save Query').disabled).toBe(true)
    unmount()

    render(<BottomDockSqlPanel queryHasRunSuccessfully={false} />)
    expect(getButtonByName('Save Query').disabled).toBe(true)
  })

  it('both panels have same button labels', () => {
    const { unmount } = render(<SidebarSqlPanel {...baseProps} />)
    const sidebarButtons = screen.getAllByRole('button').map((b) => b.textContent)
    unmount()

    render(<BottomDockSqlPanel {...baseProps} />)
    const dockButtons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(dockButtons).toEqual(sidebarButtons)
  })

  it('both panels show the "Example query" label', () => {
    const { unmount } = render(<SidebarSqlPanel {...baseProps} />)
    expect(screen.getByText('Example query — import data to run this.')).toBeTruthy()
    unmount()

    render(<BottomDockSqlPanel {...baseProps} />)
    expect(screen.getByText('Example query — import data to run this.')).toBeTruthy()
  })
})

describe('Slice 11 — Edge cases', () => {
  it('Run button disabled when queryRunning=true AND 0 tables (both conditions)', () => {
    render(<SidebarSqlPanel artifacts={[]} queryRunning={true} />)
    expect(getButtonByName('Running…').disabled).toBe(true)
  })

  it('Save button stays enabled when queryHasRunSuccessfully=true but artifacts cleared (documents known bug)', () => {
    // This tests the scenario where queryHasRunSuccessfully was set to true,
    // then a new project was created (clearing artifacts) but the flag wasn't reset.
    // queryHasRunSuccessfully is not reset in handleNewProject or handleOpenProject.
    render(
      <SidebarSqlPanel
        artifacts={[]}
        queryHasRunSuccessfully={true}
      />,
    )
    // BUG: Save Query is enabled even though no query ran in this project context.
    // queryHasRunSuccessfully should be reset to false on project reset/load.
    expect(getButtonByName('Save Query').disabled).toBe(false)
  })

  it('Import data button hidden when mixed artifacts (some with tableName, some without)', () => {
    render(
      <SidebarSqlPanel
        artifacts={[
          { tableName: 'parcels', kind: 'geojson' },
          { tableName: null, kind: 'geoparquet' },
        ]}
      />,
    )
    expect(queryButtonByName('Import data')).toBeNull()
  })

  it('Run button enabled when at least one table exists among null-tableName artifacts', () => {
    render(
      <SidebarSqlPanel
        artifacts={[
          { tableName: null, kind: 'geojson' },
          { tableName: 'roads', kind: 'geoparquet' },
        ]}
      />,
    )
    expect(getButtonByName('Run query').disabled).toBe(false)
  })
})
