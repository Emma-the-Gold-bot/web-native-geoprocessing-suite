import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { Artifact, QueryPreview } from '../types'
import { isFeatureCollection, formatCount } from '../lib/utils'
import { getArtifactOutputKindLabel } from './operation-ui'
import { getArtifactOutputKind } from './operation-ui'
import { getQueryProvenanceStrengthPresentation } from '../lib/query-semantics'
import { NLQueryPanel } from './NLQueryPanel'

const COMMAND_EXAMPLES = [
  'Buffer the parcels by 500 feet',
  'Clip parcels to Butte County and calculate area',
  'Show me what\'s near the rivers',
  'Join ownership to parcels by APN',
  'Find the median income by census tract',
]

export type MaterializeStage = 'idle' | 'naming' | 'materializing'

export interface PlanExecutionResult {
  success: boolean
  artifacts: Artifact[]
  historyEvents: import('../types').HistoryEvent[]
  errors: string[]
}

export interface BottomDockProps {
  commandInput: string
  onCommandChange: (val: string) => void
  onCommandSubmit: (val: string) => void
  onCommandClear: () => void
  artifacts: Artifact[]
  activeSidebar: string | null
  onCloseSidebar: () => void
  onOpenSidebar: (mode: 'query' | 'discover' | 'chain') => void
  addArtifact: (artifact: Artifact) => void
  onPlanExecuted: (result: PlanExecutionResult) => void
  bottomTab: string
  setBottomTab: (tab: string) => void
  selectedArtifact: Artifact | null
  selectedRowIndex: number | null
  onSelectRow: (idx: number | null) => void
  queryPreview: QueryPreview | null
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void
  // SQL tab state
  sql: string
  onSqlChange: (val: string) => void
  queryError: string | null
  queryRunning: boolean
  queryHasRunSuccessfully: boolean
  onRunQuery: () => void
  onOpenSaveQueryDialog: () => void
  sampleSql: string
  // Results tab state (materialization)
  materializeStage: MaterializeStage
  setMaterializeStage: (stage: MaterializeStage) => void
  derivedArtifactName: string
  setDerivedArtifactName: (name: string) => void
  materializing: boolean
  initiateMaterialization: () => void
  confirmMaterialize: () => void
  onSelectArtifactId: (id: string) => void
  // Empty state callbacks
  onImportFile: () => void
  onLoadSample: () => void
}

export function BottomDock({
  commandInput,
  onCommandChange,
  onCommandSubmit,
  onCommandClear,
  artifacts,
  activeSidebar,
  onCloseSidebar,
  onOpenSidebar,
  addArtifact,
  onPlanExecuted,
  bottomTab,
  setBottomTab,
  selectedArtifact,
  selectedRowIndex,
  onSelectRow,
  queryPreview,
  addToast,
  // SQL tab
  sql,
  onSqlChange,
  queryError,
  queryRunning,
  queryHasRunSuccessfully,
  onRunQuery,
  onOpenSaveQueryDialog,
  sampleSql,
  // Results tab (materialization)
  materializeStage,
  setMaterializeStage,
  derivedArtifactName,
  setDerivedArtifactName,
  materializing,
  initiateMaterialization,
  confirmMaterialize,
  onSelectArtifactId,
  // Empty state
  onImportFile,
  onLoadSample,
}: BottomDockProps) {
  // Local UI state
  const [bottomDockExpanded, setBottomDockExpanded] = useState(false)
  const [commandFocused, setCommandFocused] = useState(false)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)

  // Derived values
  const rowsForSelected = useMemo(() => {
    if (!selectedArtifact) return []
    if (isFeatureCollection(selectedArtifact.data)) {
      return selectedArtifact.data.features.map((feature, featureIndex) => ({
        _featureIndex: featureIndex,
        ...(feature.properties ?? {}),
        geometry: feature.geometry?.type ?? null,
      }))
    }
    if (selectedArtifact.tableRows?.length) {
      return selectedArtifact.tableRows
    }
    if (Array.isArray(selectedArtifact.data)) {
      return selectedArtifact.data as Record<string, unknown>[]
    }
    return []
  }, [selectedArtifact])

  const selectedArtifactOutputKind = selectedArtifact ? getArtifactOutputKind(selectedArtifact) : null

  const selectedFeatureProperties = useMemo(() => {
    if (!selectedArtifact || !isFeatureCollection(selectedArtifact.data) || selectedRowIndex === null) return null
    return selectedArtifact.data.features[selectedRowIndex]?.properties ?? null
  }, [selectedArtifact, selectedRowIndex])

  const queryPreviewMaterializedOutputKind = queryPreview?.materialization?.outputKind ?? null
  const queryPreviewProvenancePresentation = queryPreview?.materialization
    ? getQueryProvenanceStrengthPresentation(queryPreview.materialization.provenanceStrength)
    : null

  const hasSpatialArtifacts = artifacts.some(a => a.spatial && isFeatureCollection(a.data))

  // Scroll selected row into view
  useEffect(() => {
    if (selectedRowIndex === null || !tableContainerRef.current) return
    const container = tableContainerRef.current
    const rows = container.querySelectorAll('tbody tr')
    const targetRow = rows[selectedRowIndex]
    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedRowIndex])

  // Command bar handlers
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommandSubmit(commandInput)
    }
    if (e.key === 'Escape') {
      onCommandClear()
    }
  }, [commandInput, onCommandSubmit, onCommandClear])

  const applyExampleQuery = useCallback((example: string) => {
    onCommandChange(example)
    // Also trigger submit logic since the parent's handleCommandChange would have been called
    onCommandSubmit(example)
  }, [onCommandChange, onCommandSubmit])

  return (
    <>
      {/* Command bar */}
      <div className="command-bar">
        <span style={{ color: '#8b949e', fontSize: 18 }}>⌘</span>
        <input
          type="text"
          className="command-bar-input"
          ref={commandInputRef}
          placeholder="Ask anything…   / SQL   @osm @ckan @stac"
          value={commandInput}
          onChange={(e) => onCommandChange(e.target.value)}
          onFocus={() => setCommandFocused(true)}
          onBlur={() => setTimeout(() => setCommandFocused(false), 200)}
          onKeyDown={handleKeyDown}
        />
        {commandInput && (
          <button
            className="secondary"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={onCommandClear}
          >
            ×
          </button>
        )}
      </div>

      {(commandFocused || activeSidebar === 'chain') && !commandInput && (
        <div className="command-surface">
          <div className="panel-title" style={{ marginTop: 0 }}>Try an example</div>
          {COMMAND_EXAMPLES.map((example) => (
            <div
              key={example}
              className="command-example"
              onMouseDown={(e) => { e.preventDefault(); applyExampleQuery(example) }}
            >
              {example}
            </div>
          ))}
        </div>
      )}

      {/* NL plan bottom sheet — shown when chain visualization is active */}
      {activeSidebar === 'chain' && (
        <div className="bottom-sheet nl-plan-sheet bottom-sheet--expanded">
          <div className="bottom-sheet-handle" onClick={onCloseSidebar} />
          <div className="bottom-sheet-content">
            <h2 className="panel-title" style={{ marginTop: 0 }}>Plan</h2>
            <NLQueryPanel
              artifacts={artifacts}
              addArtifact={addArtifact}
              onPlanExecuted={onPlanExecuted}
              externalQuery={commandInput}
              onClose={onCloseSidebar}
              sheetMode={true}
            />
          </div>
        </div>
      )}

      {/* Empty state bottom sheet — shown when no data exists */}
      {!selectedArtifact && !hasSpatialArtifacts && !activeSidebar && (
        <div className="bottom-sheet empty-state-sheet bottom-sheet--expanded">
          <div className="bottom-sheet-handle" />
          <div className="bottom-sheet-content" style={{ textAlign: 'center' }}>
            <div className="muted small">Map pane</div>
            <div style={{ marginTop: 8 }}>Import or load a spatial dataset to see it on the map.</div>
            <div className="muted small" style={{ marginTop: 8 }}>Supports GeoJSON (Point, LineString, Polygon, MultiPolygon) with direct map rendering.</div>
            <div className="empty-state-actions" style={{ marginTop: 'var(--space-3)' }}>
              <button className="secondary empty-state-btn" onClick={onImportFile}>
                Import file
              </button>
              <button className="secondary empty-state-btn" onClick={onLoadSample}>
                Try sample data
              </button>
            </div>
          </div>
        </div>
      )}

      <section className={`bottom-dock ${bottomDockExpanded ? 'expanded' : ''}`}>
        {/* Handle (always visible) */}
        <div className="bottom-dock-handle" onClick={() => setBottomDockExpanded(!bottomDockExpanded)} />

        {/* Tab bar (visible when expanded) */}
        {bottomDockExpanded && (
          <div className="bottom-dock-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)' }}>
                {bottomTab.charAt(0).toUpperCase() + bottomTab.slice(1)}
                {selectedArtifact && ` — ${selectedArtifact.name}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(['table', 'sql', 'results'] as const).map(tab => (
                <button
                  key={tab}
                  className={`tab ${bottomTab === tab ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setBottomTab(tab) }}
                  style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Expanded content */}
        {bottomDockExpanded && (
        <>
        {bottomTab === 'table' && (
          <div>
            {selectedArtifact && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="row">
                  <strong>Inspection focus</strong>
                  <span className="badge">{selectedArtifact.name}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  {selectedArtifactOutputKind === 'measurement-table'
                    ? 'This is a measurement table. Table and details stay coherent, but there is no map-focus contract because the output is intentionally non-spatial.'
                    : selectedArtifact.spatial && isFeatureCollection(selectedArtifact.data)
                      ? (selectedRowIndex !== null
                          ? `Feature ${selectedRowIndex + 1} is selected. Map, table, and details are now focused on the same layer context.`
                          : 'No individual feature selected yet. Click a table row to focus one feature inside the selected layer.')
                      : 'This layer is not currently map-synchronized. Table inspection still works, but feature-level map focus is unavailable.'}
                </div>
                {selectedRowIndex !== null && (
                  <>
                    <div className="inspection-focus-banner" style={{ marginTop: 10 }}>
                      <span className="inspection-focus-dot" aria-hidden="true" />
                      <span>
                        Focused feature <strong>#{selectedRowIndex + 1}</strong> is active across map, table, and details.
                      </span>
                    </div>
                    {selectedFeatureProperties && (
                      <div className="small" style={{ marginTop: 8, color: '#cbd5e1' }}>
                        Focused feature properties: {Object.entries(selectedFeatureProperties).slice(0, 4).map(([key, value]) => `${key}=${String(value)}`).join(', ') || 'no properties'}
                      </div>
                    )}
                    <button
                      className="secondary"
                      style={{ marginTop: 10, fontSize: 12, padding: '4px 8px' }}
                      onClick={() => onSelectRow(null)}
                    >
                      Clear focus
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="table-wrap" ref={tableContainerRef}>
            <table>
              <thead>
                <tr>
                  {(rowsForSelected[0] ? Object.keys(rowsForSelected[0]) : ['message']).map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsForSelected.length === 0 ? (
                  <tr><td className="muted">Select or import a spatial layer to inspect rows.</td></tr>
                ) : (
                  rowsForSelected.map((row, idx) => {
                    const isFocusedRow = selectedRowIndex === idx
                    return (
                      <tr
                        key={idx}
                        onClick={() => onSelectRow(idx)}
                        aria-selected={isFocusedRow}
                        className={isFocusedRow ? 'focused-row' : undefined}
                      >
                        {Object.entries(row).map(([key, value]) => (
                          <td key={key}>{String(value)}</td>
                        ))}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {bottomTab === 'sql' && (
          <div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="row">
                <strong>{artifacts.filter((artifact) => artifact.tableName).length === 0 ? 'No data loaded' : `${artifacts.filter((artifact) => artifact.tableName).length} tables loaded`}</strong>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {artifacts.filter((artifact) => artifact.tableName).length === 0
                  ? 'Import a GeoJSON file or discover data to enable SQL queries.'
                  : artifacts
                      .filter((artifact) => artifact.tableName)
                      .map((artifact) => `${artifact.tableName} (${artifact.kind})`)
                      .join(', ')}
              </div>
              {artifacts.filter((artifact) => artifact.tableName).length === 0 && (
                <div className="small muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
                  <button
                    className="secondary"
                    style={{ padding: '2px 8px', fontSize: 'inherit' }}
                    onClick={() => setBottomTab('table')}
                  >
                    Import data
                  </button>
                  {' '}or{' '}
                  <button
                    className="empty-state-link"
                    style={{ padding: '2px 8px', fontSize: 'inherit' }}
                    onClick={() => onOpenSidebar('discover')}
                  >
                    discover data
                  </button>
                </div>
              )}
            </div>
            <div className="small muted" style={{ marginBottom: 4, fontStyle: 'italic' }}>
              Example query — import data to run this.
            </div>
            <textarea className="sql-editor" value={sql} onChange={(event) => onSqlChange(event.target.value)} />
            {queryError && (
              <div className="card danger" style={{ marginTop: 12 }}>
                <strong>Query failed</strong>
                <div className="small muted" style={{ marginTop: 6 }}>{queryError}</div>
                <div className="small" style={{ marginTop: 6 }}>Recovery: verify table names, SQL syntax, and that the referenced layer tables are registered in the workspace.</div>
              </div>
            )}
            <div className="actions">
              <button className="primary" onClick={onRunQuery} disabled={queryRunning || artifacts.filter((artifact) => artifact.tableName).length === 0}>{queryRunning ? 'Running…' : 'Run query'}</button>
              <button className="secondary" onClick={onOpenSaveQueryDialog} disabled={!queryHasRunSuccessfully}>Save Query</button>
              <button className="secondary" onClick={() => onSqlChange(sampleSql)}>Reset to example</button>
            </div>
          </div>
        )}

        {bottomTab === 'results' && (
          <div>
            {!queryPreview && <div className="card muted">No query result preview yet.</div>}
            {queryPreview && (
              <>
                <div className="card">
                  <div className="row">
                    <strong>Result preview</strong>
                    <span className="badge">{formatCount(queryPreview.rows.length, 'row')}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    Referenced tables: {queryPreview.referencedTables?.length ? queryPreview.referencedTables.join(', ') : (queryPreview.sourceTableName || 'none detected')}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Source layers matched: {queryPreview.sourceArtifactIds?.length ? queryPreview.sourceArtifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)?.name ?? id).join(', ') : 'none matched directly'}
                  </div>
                  {queryPreviewMaterializedOutputKind && (
                    <div className="small" style={{ marginTop: 6, color: '#cbd5e1' }}>
                      If materialized now, output kind would be <strong>{queryPreview.materialization?.outputKindLabel ?? getArtifactOutputKindLabel(queryPreviewMaterializedOutputKind)}</strong>. {queryPreview.materialization?.outputKindDescription}
                    </div>
                  )}
                  {queryPreviewProvenancePresentation && (
                    <div className="small" style={{ marginTop: 6, color: '#cbd5e1' }}>
                      Provenance strength: <strong>{queryPreviewProvenancePresentation.label}</strong>. {queryPreviewProvenancePresentation.message}
                    </div>
                  )}
                  <div className="small muted" style={{ marginTop: 4 }}>
                    This preview uses the same provenance-strength, output-kind, and persisted-layer vocabulary that will be recorded if you materialize it.
                  </div>

                  {/* Materialization naming dialog */}
                  {materializeStage === 'naming' && (
                    <div className="card" style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #0ea5e9' }}>
                      <div className="row">
                        <strong>Name your derived layer</strong>
                      </div>
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Give this query result a name to save it as a derived layer in your workspace.
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <input
                          type="text"
                          value={derivedArtifactName}
                          onChange={(e) => setDerivedArtifactName(e.target.value)}
                          placeholder="Enter layer name..."
                          style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                          disabled={materializing}
                        />
                      </div>
                      <div className="actions" style={{ marginTop: 12 }}>
                        <button
                          className="primary"
                          onClick={confirmMaterialize}
                          disabled={materializing || !derivedArtifactName.trim()}
                        >
                          {materializing ? 'Creating...' : 'Confirm & Create'}
                        </button>
                        <button
                          className="secondary"
                          onClick={() => { setMaterializeStage('idle'); setDerivedArtifactName('') }}
                          disabled={materializing}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Materialize button (shown when not in naming mode and not yet materialized) */}
                  {materializeStage === 'idle' && !queryPreview.materializedArtifactId && (
                    <>
                      <div className="small muted" style={{ marginTop: 6 }}>
                        This is still a preview. Materialize it to create a derived layer.
                      </div>
                      <div className="actions">
                        <button className="primary" onClick={initiateMaterialization}>Materialize result</button>
                      </div>
                    </>
                  )}

                  {/* Already materialized indicator */}
                  {queryPreview.materializedArtifactId && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      ✓ Materialized as layer. <button className="link" onClick={() => {
                        const artifact = artifacts.find(a => a.id === queryPreview.materializedArtifactId)
                        if (artifact) onSelectArtifactId(artifact.id)
                      }}>View layer</button> or re-run query to create a new one.
                    </div>
                  )}

                  {/* Materializing indicator */}
                  {materializeStage === 'materializing' && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Creating derived layer...
                    </div>
                  )}
                </div>
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>{queryPreview.columns.map((column) => <th key={column}>{column}</th>)}</tr>
                    </thead>
                    <tbody>
                      {queryPreview.rows.map((row, idx) => (
                        <tr key={idx}>
                          {queryPreview.columns.map((column) => <td key={column}>{String(row[column])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        </>
        )}
      </section>
    </>
  )
}

export default BottomDock
