
import type { Artifact, SavedQuery, LayerSettings } from '../types';
import { formatCount } from '../lib/utils';
import { getArtifactOutputKind, getArtifactOutputKindLabel } from './operation-ui';

interface LayersPanelProps {
  projectName: string;
  statusMessage: string;
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  setSelectedArtifactId: (id: string | null) => void;
  setRightPanelOpen: (open: boolean) => void;
  savedQueries: SavedQuery[];
  handleLoadQuery: (query: SavedQuery) => void;
  handleDeleteQuery: (queryId: string) => void;
  setShowSaveQueryDialog: (show: boolean) => void;
  layerSettings: Record<string, LayerSettings>;
  onToggleVisibility: (artifactId: string) => void;
  onChangeOpacity: (artifactId: string, opacity: number) => void;
  onReorder: (artifactId: string, direction: 'up' | 'down') => void;
}

export default function LayersPanel({
  projectName,
  statusMessage,
  artifacts,
  selectedArtifactId,
  setSelectedArtifactId,
  setRightPanelOpen,
  savedQueries,
  handleLoadQuery,
  handleDeleteQuery,
  setShowSaveQueryDialog,
  layerSettings,
  onToggleVisibility,
  onChangeOpacity,
  onReorder,
}: LayersPanelProps) {
  // Determine z-order bounds for disabling up/down buttons
  const spatialArtifacts = artifacts.filter((a) => a.spatial);
  const sortedByZ = [...spatialArtifacts].sort(
    (a, b) => (layerSettings[a.id]?.zIndex ?? 0) - (layerSettings[b.id]?.zIndex ?? 0),
  );
  const lowestZId = sortedByZ[0]?.id;
  const highestZId = sortedByZ[sortedByZ.length - 1]?.id;

  return (
    <>
      <h2 className="panel-title">Project / Data</h2>
      <div className="card">
        <div className="row">
          <div>
            <strong>{projectName}</strong>
            <div className="muted small">{statusMessage}</div>
          </div>
          <span className="badge">{formatCount(artifacts.length, 'artifact')}</span>
        </div>
      </div>

      <h3 className="panel-title" style={{ marginTop: 16 }}>Artifacts</h3>
      <div className="artifact-list">
        {artifacts.length === 0 && <div className="card muted">No project artifacts yet. Import data to begin.</div>}
        {artifacts.map((artifact) => {
          const settings = layerSettings[artifact.id];
          const isSpatial = artifact.spatial;
          const isVisible = settings?.visible ?? true;
          const opacity = settings?.opacity ?? 1.0;

          return (
            <button
              key={artifact.id}
              className={`card ${selectedArtifactId === artifact.id ? 'selected' : ''} ${artifact.kind === 'derived' ? 'card-derived' : ''}`}
              style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-1)' }}
              onClick={() => { setSelectedArtifactId(artifact.id); setRightPanelOpen(true) }}
            >
              <div className="layer-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>
                    {artifact.name}
                  </div>
                  <div className="small muted" style={{ marginTop: 'var(--space-1)' }}>
                    {artifact.format} · {(artifact.rowCount ?? 0).toLocaleString()} rows · {artifact.geometryType ?? getArtifactOutputKindLabel(getArtifactOutputKind(artifact))}
                  </div>
                  <div className="small" style={{ marginTop: 'var(--space-1)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {artifact.geometryType === 'Point' ? '◉' : artifact.geometryType === 'LineString' ? '╱' : '▭'} {artifact.geometryType ?? '—'}
                    </span>
                    {artifact.warnings && artifact.warnings.length > 0 && (
                      <span style={{ color: '#d29922' }}>⚠ {artifact.warnings.length}</span>
                    )}
                    {artifact.crs && (
                      <span style={{ color: 'var(--text-muted)' }}>{artifact.crs}</span>
                    )}
                  </div>
                </div>
                {isSpatial && settings && (
                  <div className="layer-controls" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      className={`layer-visibility-toggle ${!isVisible ? 'invisible' : ''}`}
                      title={isVisible ? 'Hide layer' : 'Show layer'}
                      onClick={() => onToggleVisibility(artifact.id)}
                    >
                      {isVisible ? '👁' : '🚫'}
                    </button>
                    <label className="layer-opacity-control">
                      <input
                        type="range"
                        className="layer-opacity-slider"
                        min="0"
                        max="100"
                        step="5"
                        value={Math.round(opacity * 100)}
                        onChange={(e) => onChangeOpacity(artifact.id, Number(e.target.value) / 100)}
                        title={`Opacity: ${Math.round(opacity * 100)}%`}
                      />
                      <span className="layer-opacity-label">{Math.round(opacity * 100)}%</span>
                    </label>
                    <div className="layer-zorder-controls">
                      <button
                        className="layer-zorder-btn"
                        disabled={artifact.id === highestZId}
                        title="Move up (higher z-order)"
                        onClick={() => onReorder(artifact.id, 'up')}
                      >
                        ▲
                      </button>
                      <button
                        className="layer-zorder-btn"
                        disabled={artifact.id === lowestZId}
                        title="Move down (lower z-order)"
                        onClick={() => onReorder(artifact.id, 'down')}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <h3 className="panel-title" style={{ marginTop: 16 }}>Saved Queries</h3>
      <div className="artifact-list">
        {savedQueries.length === 0 && <div className="card muted">No saved queries yet.</div>}
        {savedQueries.map((query) => (
          <div
            key={query.id}
            className="card"
            style={{ textAlign: 'left' }}
            onClick={() => handleLoadQuery(query)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLoadQuery(query) }}
          >
            <div className="row">
              <strong>{query.name}</strong>
              <button
                className="secondary"
                style={{ padding: '2px 6px', fontSize: 11 }}
                onClick={(e) => { e.stopPropagation(); handleDeleteQuery(query.id) }}
              >
                ×
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {query.sql.substring(0, 50)}{query.sql.length > 50 ? '...' : ''}
            </div>
          </div>
        ))}
        {savedQueries.length > 0 && (
          <div
            className="card"
            style={{ textAlign: 'left', border: '1px dashed #94a3b8', cursor: 'pointer' }}
            onClick={() => setShowSaveQueryDialog(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowSaveQueryDialog(true) }}
          >
            <div className="muted small">+ Save current query</div>
          </div>
        )}
      </div>
    </>
  );
}
