import React from 'react'
import type { Artifact, HistoryEvent, WarningRef, CrsProvenance, CrsConfidence } from '../types'
import type { DisplayTransformStatus } from '../lib/spatial/display-transform'
import { isProjectedCrs } from '../lib/spatial'
import { formatTimestamp, formatCount, isFeatureCollection, getArtifactGeometryLabel } from '../lib/utils'
import { getActiveWarnings, getCurrentNotes, getProvenanceNotes, getSeverityLabel, getWarningScope, getWarningScopeLabel, getWarningRecoveryHint, getHistoryDetailGroups, isWarning } from '../lib/product-surface'
import { getArtifactOutputKindLabel } from './operation-ui'

// --- Local helper functions (extracted from App.tsx) ---

function getCrsProvenanceLabel(source: CrsProvenance['source']): string {
  switch (source) {
    case 'import-metadata': return 'Import metadata'
    case 'user-assigned': return 'User assigned'
    case 'auto-detected': return 'Auto-detected'
    case 'operation-inherited': return 'Inherited from operation'
    case 'operation-derived': return 'Derived from operation'
    case 'display-transform': return 'Display transform'
    default: return 'unknown'
  }
}

function getCrsConfidenceLabel(confidence: CrsConfidence): string {
  switch (confidence) {
    case 'known': return 'known'
    case 'unknown': return 'unknown'
    case 'missing': return 'missing'
    default: return confidence
  }
}

function getDisplayCrsIfNeeded(artifact: Artifact): string | null {
  if (artifact.crsProvenance?.displayTransform?.displayCrs) {
    return artifact.crsProvenance.displayTransform.displayCrs
  }
  if (!artifact.spatial) return null
  if (!artifact.crs || artifact.crs === 'unknown') return null
  if (isProjectedCrs(artifact.crs)) {
    return 'EPSG:4326'
  }
  return null
}

function getDisplayStatusMeta(status: DisplayTransformStatus): {
  badge: 'display only' | 'display fallback'
  message: string
  warning?: WarningRef
  provenanceWarning?: string
} | null {
  if (status === 'transformed') {
    return {
      badge: 'display only',
      message: 'Display normalized to EPSG:4326 for map only; stored CRS metadata is unchanged',
    }
  }
  if (status === 'fallback_runtime_unavailable') {
    return {
      badge: 'display fallback',
      message: 'Display framing fell back while targeting EPSG:4326 because transform runtime was unavailable; stored CRS metadata is unchanged',
      warning: {
        id: 'display_transform_fallback_runtime',
        code: 'DISPLAY_TRANSFORM_FALLBACK',
        severity: 'caution',
        scope: 'active',
        title: 'Display transform fallback',
        message: 'Display framing fell back because transform runtime was unavailable. Stored CRS metadata is unchanged, but map framing may be unreliable.',
      },
      provenanceWarning: 'Display framing fell back because transform runtime was unavailable.',
    }
  }
  if (status === 'fallback_transform_failed') {
    return {
      badge: 'display fallback',
      message: 'Display framing fell back while targeting EPSG:4326 because the coordinate transformation failed; stored CRS metadata is unchanged',
      warning: {
        id: 'display_transform_fallback_transform',
        code: 'DISPLAY_TRANSFORM_FALLBACK',
        severity: 'caution',
        scope: 'active',
        title: 'Display transform fallback',
        message: 'Display framing fell back because coordinate transformation failed. Stored CRS metadata is unchanged, but map framing may be unreliable.',
      },
      provenanceWarning: 'Display framing fell back because coordinate transformation failed.',
    }
  }
  return null
}

// --- AccordionSection component ---

function AccordionSection({ title, defaultOpen, children, badge }: {
  title: string
  defaultOpen?: boolean
  badge?: string | number
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} style={{ marginBottom: 8 }}>
      <summary style={{ cursor: 'pointer', padding: '8px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b949e', fontWeight: 600, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, transition: 'transform 0.15s' }}>▸</span>
        {title}
        {badge && <span className="badge" style={{ marginLeft: 'auto' }}>{badge}</span>}
      </summary>
      <div style={{ paddingLeft: 0, paddingTop: 4 }}>
        {children}
      </div>
    </details>
  )
}

// --- Props ---

export interface RightPanelProps {
  selectedArtifact: Artifact | null
  artifacts: Artifact[]
  history: HistoryEvent[]
  selectedHistoryEventId: string | null
  rightPanelOpen: boolean
  selectedRowIndex: number | null
  onClose: () => void
  onOpen: () => void
  onImportFile: () => void
  onLoadSample: () => void
  onSelectHistoryEvent: (id: string) => void
  statusMessage: string
  rightPanelTab: 'details' | 'history'
  setRightPanelTab: (tab: 'details' | 'history') => void
  selectedArtifactDisplayStatus: DisplayTransformStatus | null
}

export function RightPanel({
  selectedArtifact,
  artifacts,
  history,
  selectedHistoryEventId,
  rightPanelOpen,
  selectedRowIndex,
  onClose,
  onOpen,
  onImportFile,
  onLoadSample,
  onSelectHistoryEvent,
  statusMessage,
  rightPanelTab,
  setRightPanelTab,
  selectedArtifactDisplayStatus,
}: RightPanelProps) {
  // Derived values
  const selectedArtifactOutputKind = selectedArtifact ? (selectedArtifact.outputKind ?? null) : null

  const selectedArtifactOriginEvent = selectedArtifact
    ? history.find((event) => event.id === selectedArtifact.originEventId) ?? null
    : null

  const selectedFeatureGeometry = React.useMemo(() => {
    if (!selectedArtifact || !isFeatureCollection(selectedArtifact.data) || selectedRowIndex === null) return null
    const feature = selectedArtifact.data.features[selectedRowIndex]
    return feature?.geometry ?? null
  }, [selectedArtifact, selectedRowIndex])

  const selectedFeatureProperties = React.useMemo(() => {
    if (!selectedArtifact || !isFeatureCollection(selectedArtifact.data) || selectedRowIndex === null) return null
    return selectedArtifact.data.features[selectedRowIndex]?.properties ?? null
  }, [selectedArtifact, selectedRowIndex])

  const selectedHistoryEvent = selectedHistoryEventId
    ? history.find((event) => event.id === selectedHistoryEventId) ?? null
    : null

  return (
    <>
      <aside className={`right-panel ${rightPanelOpen ? 'open' : ''}`}>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className={`right-panel-tab ${rightPanelTab === 'details' ? 'active' : ''}`}
            onClick={() => setRightPanelTab('details')}
          >
            Details
          </button>
          <button
            className={`right-panel-tab ${rightPanelTab === 'history' ? 'active' : ''}`}
            onClick={() => setRightPanelTab('history')}
          >
            History{history.length > 0 ? ` (${history.length})` : ''}
          </button>
          <button
            className="secondary"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {rightPanelTab === 'details' && !selectedArtifact && (
          <AccordionSection title="Project Summary" defaultOpen={true} badge={formatCount(artifacts.length, 'layer')}>
            <div className="small muted" style={{ marginBottom: 8 }}>{statusMessage}</div>
            <div className="actions" style={{ marginTop: 0, gap: 8 }}>
              <button className="secondary" onClick={onImportFile}>Import data</button>
              <button className="secondary" onClick={onLoadSample}>Load sample</button>
            </div>
          </AccordionSection>
        )}
        {rightPanelTab === 'details' && selectedArtifact && (
          <>
            {/* Focused Feature accordion — shown at top when a feature is selected */}
            {selectedRowIndex !== null && selectedArtifact.spatial && isFeatureCollection(selectedArtifact.data) && (
              <AccordionSection title="Focused Feature" defaultOpen={true} badge={`#${selectedRowIndex + 1}`}>
                <div className="card" style={{ background: '#0f172a', border: '1px solid #1e3a5f' }}>
                  {selectedFeatureGeometry && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Geometry: {selectedFeatureGeometry.type}
                    </div>
                  )}
                  {selectedFeatureProperties && (
                    <div style={{ marginTop: 8 }}>
                      <div className="small" style={{ color: '#94a3b8' }}>Properties</div>
                      <div style={{ marginTop: 4, fontSize: 12, fontFamily: 'monospace' }}>
                        {Object.entries(selectedFeatureProperties).map(([key, value]) => (
                          <div key={key} style={{ color: '#cbd5e1' }}>
                            {key}: {String(value)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selectedFeatureProperties && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      No properties on this feature.
                    </div>
                  )}
                </div>
              </AccordionSection>
            )}

            {/* Overview accordion */}
            <AccordionSection title="Overview" defaultOpen={selectedRowIndex === null}>
              <div className="card">
                <div className="row">
                  <strong>{selectedArtifact.name}</strong>
                  <span className={`badge ${selectedArtifact.kind}`}>{selectedArtifact.kind}</span>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>{selectedArtifact.format}</div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {selectedArtifact.rowCount ?? '?'} rows · {getArtifactGeometryLabel(selectedArtifact)}
                </div>
                <div className="small" style={{ marginTop: 6, color: '#cbd5e1' }}>
                  Output kind: <strong>{selectedArtifactOutputKind ? getArtifactOutputKindLabel(selectedArtifactOutputKind) : 'unknown output'}</strong>
                </div>
                {/* Compact CRS metadata block */}
                <div className="small" style={{ marginTop: 8, padding: '8px 10px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#94a3b8' }}>Stored CRS:</span>
                    <strong>{selectedArtifact.crs ?? 'unknown'}</strong>
                    {selectedArtifact.crsProvenance && (
                      <span className={`badge ${selectedArtifact.crsProvenance.confidence}`}>
                        {getCrsConfidenceLabel(selectedArtifact.crsProvenance.confidence)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    <span style={{ color: '#94a3b8' }}>CRS provenance:</span>
                    <span style={{ color: '#cbd5e1' }}>{selectedArtifact.crsProvenance ? getCrsProvenanceLabel(selectedArtifact.crsProvenance.source) : 'unknown'}</span>
                  </div>
                  {/* Show display CRS info when display normalization is applied */}
                  {getDisplayCrsIfNeeded(selectedArtifact) && (() => {
                    const displayMeta = selectedArtifactDisplayStatus ? getDisplayStatusMeta(selectedArtifactDisplayStatus) : null
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: '#fbbf24', fontSize: '11px', flexWrap: 'wrap' }}>
                        <span>↻</span>
                        <span>
                          Display CRS: {getDisplayCrsIfNeeded(selectedArtifact)} (map only)
                        </span>
                        <span style={{ color: '#64748b' }}>·</span>
                        <span>
                          {displayMeta?.message ?? 'Display normalization changes map rendering only. Stored CRS metadata is unchanged.'}
                        </span>
                      </div>
                    )
                  })()}
                </div>
                {selectedArtifact.renderIssue && (
                  <div className="card danger" style={{ marginTop: 10 }}>
                    <strong>Render issue</strong>
                    <div className="small muted" style={{ marginTop: 6 }}>{selectedArtifact.renderIssue}</div>
                    <div className="small" style={{ marginTop: 6 }}>The layer still exists and remains queryable/tabular. Only the current map adaptation failed.</div>
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* Issues accordion */}
            {(() => {
              const hasBlockingWarnings = selectedArtifact.warnings.some(isWarning) && getActiveWarnings(selectedArtifact.warnings).length > 0
              const noteCount = getCurrentNotes(selectedArtifact.warnings).length
              const provNoteCount = getProvenanceNotes(selectedArtifact.warnings).length
              const warningCount = getActiveWarnings(selectedArtifact.warnings).length
              const displayWarning = selectedArtifactDisplayStatus && getDisplayStatusMeta(selectedArtifactDisplayStatus)?.warning
              const badgeParts: string[] = []
              if (warningCount > 0) badgeParts.push(formatCount(warningCount, 'warning'))
              if (noteCount > 0) badgeParts.push(formatCount(noteCount, 'note'))
              const hasAnyIssues = noteCount > 0 || provNoteCount > 0 || displayWarning || selectedArtifact.warnings.some(isWarning)
              return (
                <AccordionSection title="Issues" defaultOpen={hasBlockingWarnings} badge={badgeParts.join(', ') || undefined}>
                  {!hasAnyIssues && (
                    <div className="card muted">No issues detected.</div>
                  )}
                  {/* Current notes */}
                  {noteCount > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="small" style={{ color: '#93c5fd', marginBottom: 8 }}>Notes</div>
                      <div className="artifact-list">
                        {getCurrentNotes(selectedArtifact.warnings).map((warning) => (
                          <div key={warning.id} className="card" style={{ borderColor: '#1e3a5f', background: '#0a1525' }}>
                            <div className="row">
                              <strong>{warning.title}</strong>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span className="badge info">{getSeverityLabel(warning)}</span>
                                <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                              </div>
                            </div>
                            <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                            <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Provenance notes */}
                  {provNoteCount > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="small" style={{ color: '#cbd5e1', marginBottom: 8 }}>Provenance notes</div>
                      <div className="artifact-list">
                        {getProvenanceNotes(selectedArtifact.warnings).map((warning) => (
                          <div key={warning.id} className="card" style={{ borderColor: '#334155', background: '#111827' }}>
                            <div className="row">
                              <strong>{warning.title}</strong>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span className="badge info">{getSeverityLabel(warning)}</span>
                                <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                              </div>
                            </div>
                            <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                            <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Display runtime warning */}
                  {displayWarning && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="small" style={{ marginBottom: 8 }}>Display runtime</div>
                      <div className="artifact-list">
                        <div className="card">
                          <div className="row">
                            <strong>{displayWarning.title}</strong>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span className="badge caution">caution</span>
                              <span className="badge active">active</span>
                            </div>
                          </div>
                          <div className="small muted" style={{ marginTop: 6 }}>{displayWarning.message}</div>
                          <div className="small" style={{ marginTop: 6 }}>This reflects the current map-framing runtime, not a persisted change to the layer itself.</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Active warnings (caution/serious/blocking) */}
                  {selectedArtifact.warnings.some(isWarning) && (
                    <div>
                      <div className="small" style={{ marginBottom: 8 }}>Warnings</div>
                      <div className="artifact-list">
                        {selectedArtifact.warnings.filter(isWarning).map((warning) => (
                          <div key={warning.id} className="card">
                            <div className="row">
                              <strong>{warning.title}</strong>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span className={`badge ${warning.severity}`}>{getSeverityLabel(warning)}</span>
                                <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                              </div>
                            </div>
                            <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                            <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionSection>
              )
            })()}

            {/* Lineage accordion */}
            <AccordionSection title="Lineage" defaultOpen={selectedArtifact.kind === 'derived'}>
              <div className="card">
                <div className="row">
                  <strong>Lineage</strong>
                  <span className="badge">{selectedArtifact.kind}</span>
                </div>
                {selectedArtifact.kind === 'source' ? (
                  <>
                    <div className="small" style={{ marginTop: 8 }}>Imported into the workspace as a source layer.</div>
                    {selectedArtifactOriginEvent && (
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Created by: import event on {formatTimestamp(selectedArtifactOriginEvent.timestamp)}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="small" style={{ marginTop: 8 }}>
                      Upstream layer(s): {selectedArtifact.inputArtifactIds?.map((id) => artifacts.find((a) => a.id === id)?.name ?? id).join(', ') || 'unknown upstream layer'}
                    </div>
                    {selectedArtifactOriginEvent && (
                      <>
                        <div className="small muted" style={{ marginTop: 6 }}>Created by: {selectedArtifactOriginEvent.type} event on {formatTimestamp(selectedArtifactOriginEvent.timestamp)}</div>
                        <div className="small" style={{ marginTop: 8, color: '#cbd5e1' }}>
                          This layer's stored truth comes from the output of that event. Input assumptions and provenance notes remain inspectable in the event details below.
                        </div>
                        {getHistoryDetailGroups(selectedArtifactOriginEvent.details).length > 0 && (
                          <div className="card" style={{ marginTop: 10 }}>
                            <strong className="small">Event-derived lineage facts</strong>
                            <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                              {getHistoryDetailGroups(selectedArtifactOriginEvent.details).map((group) => (
                                <div key={group.title}>
                                  <div className="small" style={{ color: '#93c5fd', marginBottom: 6 }}>{group.title}</div>
                                  <div style={{ display: 'grid', gap: 6 }}>
                                    {group.rows.map(({ key, label, renderedValue }) => (
                                      <div key={key} className="small" style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                                        <span style={{ color: '#94a3b8' }}>{label}</span>
                                        <span>{renderedValue}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {'sql' in selectedArtifactOriginEvent.details && typeof selectedArtifactOriginEvent.details.sql === 'string' && (
                          <pre className="card code-block">
{String(selectedArtifactOriginEvent.details.sql)}
                          </pre>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </AccordionSection>
          </>
        )}
        {rightPanelTab === 'history' && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {history.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>⏱</div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                  No operations yet. Run a geoprocessing operation to see history here.
                </div>
              </div>
            )}
            {history.length > 0 && (
              <div className="history-list">
                {history.map((event) => (
                  <button
                    key={event.id}
                    className={`card ${selectedHistoryEventId === event.id ? 'selected' : ''}`}
                    style={{ textAlign: 'left' }}
                    onClick={() => onSelectHistoryEvent(event.id)}
                  >
                    <div className="row"><strong>{event.summary}</strong><span className="badge">{event.type}</span></div>
                    <div className="small muted" style={{ marginTop: 6 }}>{formatTimestamp(event.timestamp)}</div>
                    <div className="row" style={{ marginTop: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                      {getActiveWarnings(event.warnings).length > 0 && (
                        <span className="badge warning">{formatCount(getActiveWarnings(event.warnings).length, 'warning')}</span>
                      )}
                      {getCurrentNotes(event.warnings).length > 0 && (
                        <span className="badge info">{formatCount(getCurrentNotes(event.warnings).length, 'note')}</span>
                      )}
                      {getProvenanceNotes(event.warnings).length > 0 && (
                        <span className="badge historical">{formatCount(getProvenanceNotes(event.warnings).length, 'provenance note')}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedHistoryEvent && (
              <div style={{ marginTop: 16 }}>
                <div className="small" style={{ color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>Event detail</div>
                <div className="card">
                  <div className="row">
                    <strong>{selectedHistoryEvent.summary}</strong>
                    <span className="badge">{selectedHistoryEvent.type}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>{formatTimestamp(selectedHistoryEvent.timestamp)}</div>
                  <div className="small" style={{ marginTop: 10 }}>
                    Inputs: {selectedHistoryEvent.inputArtifactIds.length
                      ? selectedHistoryEvent.inputArtifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)?.name ?? id).join(', ')
                      : 'none'}
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    Outputs: {selectedHistoryEvent.outputArtifactIds.length
                      ? selectedHistoryEvent.outputArtifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)?.name ?? id).join(', ')
                      : 'none'}
                  </div>
                  {getHistoryDetailGroups(selectedHistoryEvent.details).length > 0 && (
                    <div className="card" style={{ marginTop: 12 }}>
                      <strong className="small">Structured event details</strong>
                      <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                        {getHistoryDetailGroups(selectedHistoryEvent.details).map((group) => (
                          <div key={group.title}>
                            <div className="small" style={{ color: '#93c5fd', marginBottom: 6 }}>{group.title}</div>
                            <div style={{ display: 'grid', gap: 6 }}>
                              {group.rows.map(({ key, label, renderedValue }) => (
                                <div key={key} className="small" style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8 }}>
                                  <span style={{ color: '#94a3b8' }}>{label}</span>
                                  <span>{renderedValue}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedHistoryEvent.warnings.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {getCurrentNotes(selectedHistoryEvent.warnings).length > 0 && (
                        <>
                          <strong style={{ color: '#93c5fd' }}>Event notes</strong>
                          <div className="artifact-list" style={{ marginTop: 8 }}>
                            {getCurrentNotes(selectedHistoryEvent.warnings).map((warning) => (
                              <div key={warning.id} className="card" style={{ borderColor: '#1e3a5f', background: '#0a1525' }}>
                                <div className="row">
                                  <strong>{warning.title}</strong>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span className="badge info">{getSeverityLabel(warning)}</span>
                                    <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                                  </div>
                                </div>
                                <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                                <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {getProvenanceNotes(selectedHistoryEvent.warnings).length > 0 && (
                        <>
                          <strong>Event provenance</strong>
                          <div className="artifact-list" style={{ marginTop: 8 }}>
                            {getProvenanceNotes(selectedHistoryEvent.warnings).map((warning) => (
                              <div key={warning.id} className="card">
                                <div className="row">
                                  <strong>{warning.title}</strong>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span className="badge info">{getSeverityLabel(warning)}</span>
                                    <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                                  </div>
                                </div>
                                <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                                <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {getActiveWarnings(selectedHistoryEvent.warnings).length > 0 && (
                        <>
                          <strong>Event warnings</strong>
                          <div className="artifact-list" style={{ marginTop: 8 }}>
                            {getActiveWarnings(selectedHistoryEvent.warnings).map((warning) => (
                              <div key={warning.id} className="card">
                                <div className="row">
                                  <strong>{warning.title}</strong>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span className={`badge ${warning.severity}`}>{getSeverityLabel(warning)}</span>
                                    <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                                  </div>
                                </div>
                                <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                                <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {'sql' in selectedHistoryEvent.details && typeof selectedHistoryEvent.details.sql === 'string' && (
                    <pre className="card code-block">
{String(selectedHistoryEvent.details.sql)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {!rightPanelOpen && (
        <button
          className="right-panel-grip"
          title="Open details / history"
          onClick={onOpen}
        >
          ◀
        </button>
      )}
    </>
  )
}

export default RightPanel
