import type { Artifact, SavedQuery } from '../types';
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
}: LayersPanelProps) {
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
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            className={`card ${selectedArtifactId === artifact.id ? 'selected' : ''} ${artifact.kind === 'derived' ? 'card-derived' : ''}`}
            style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-1)' }}
            onClick={() => { setSelectedArtifactId(artifact.id); setRightPanelOpen(true) }}
          >
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
          </button>
        ))}
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
