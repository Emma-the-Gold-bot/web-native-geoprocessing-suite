import { useState, useCallback, useEffect, useRef } from 'react';
import { discover, geocode, checkDiscoveryHealth, type DiscoveryResult as ApiDiscoveryResult, type DiscoveryCandidate } from '../lib/discovery';
import type { BBox } from '../types';
import { MapPin, Wifi, WifiOff, Loader2 } from 'lucide-react';

type PanelState = 'idle' | 'geocoding' | 'confirming' | 'searching' | 'results';

/** Extract a plausible place name from queries like "buildings in San Francisco" */
function extractPlaceFromQuery(query: string): string | null {
  // Match "in <Place Name>" patterns — common in spatial queries
  // Handles: "buildings in San Francisco", "parcels near Sacramento", "roads around Los Angeles"
  const patterns = [
    /\b(?:in|near|around|within|for|around)\s+(.+?)(?:\s*$)/i,
  ];
  for (const pat of patterns) {
    const match = query.match(pat);
    if (match) {
      let place = match[1].trim();
      // Strip trailing non-place words like "and show me", "with area", etc.
      place = place.replace(/\s+(?:and|or|with|by|from|to|that|which|show|display|calculate|compute|find|get|give|list)\b.*$/i, '').trim();
      // Must be at least 2 chars and contain a letter
      if (place.length >= 2 && /[a-zA-Z]/.test(place)) {
        return place;
      }
    }
  }
  return null;
}

interface DiscoveryPanelProps {
  onImport?: (result: ApiDiscoveryResult) => void;
  onBboxPreview?: (bbox: BBox | null) => void;
  /** Source to pin the panel to (e.g., 'osm', 'ckan', 'stac'). null = all sources. */
  source?: string | null;
  /** Initial query to seed the input with. Only used on mount. */
  initialQuery?: string;
}

export function DiscoveryPanel({ onImport, onBboxPreview, source, initialQuery }: DiscoveryPanelProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [result, setResult] = useState<ApiDiscoveryResult | null>(null);
  const [state, setState] = useState<PanelState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  // Check backend health on mount
  useEffect(() => {
    checkDiscoveryHealth().then(setBackendOnline);
  }, []);

  // Cleanup bbox preview when panel unmounts
  useEffect(() => {
    return () => {
      onBboxPreview?.(null);
    };
  }, [onBboxPreview]);

  // Notify parent when bbox changes (for map visualization)
  useEffect(() => {
    onBboxPreview?.(bbox);
  }, [bbox, onBboxPreview]);

  const handleDiscover = useCallback(async () => {
    if (!query.trim()) return;
    setError(null);
    setResult(null);

    // Step 1: If no bbox, try to extract place name and geocode
    let activeBbox = bbox;
    if (!activeBbox) {
      const extracted = extractPlaceFromQuery(query);
      if (extracted) {
        setState('geocoding');
        setPlaceName(extracted);
        try {
          const geo = await geocode(extracted);
          activeBbox = geo.bbox;
          setBbox(geo.bbox);
          setDisplayName(geo.display_name);
          setState('confirming');
          return; // Wait for user confirmation
        } catch (err) {
          // Geocoding failed — try without bbox
          console.warn(`Geocode failed for "${extracted}":`, err);
          setPlaceName(null);
        }
      }
    }

    // Step 2: Run discovery
    await runDiscovery(activeBbox);
  }, [query, bbox]);

  const runDiscovery = useCallback(async (activeBbox: BBox | null) => {
    setState('searching');
    setError(null);
    try {
      const res = await discover({
        query: queryRef.current,
        bbox: activeBbox ?? undefined,
        source: source ?? undefined,
      });
      setResult(res);
      setState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
      setState('idle');
    }
  }, [source]);

  const handleConfirmBbox = useCallback(() => {
    runDiscovery(bbox);
  }, [bbox, runDiscovery]);

  const handleSkipBbox = useCallback(() => {
    setBbox(null);
    runDiscovery(null);
  }, [runDiscovery]);

  const handleClearBbox = useCallback(() => {
    setBbox(null);
    setPlaceName(null);
    setDisplayName(null);
    setState('idle');
    onBboxPreview?.(null);
  }, [onBboxPreview]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (state === 'confirming') {
        handleConfirmBbox();
      } else {
        handleDiscover();
      }
    }
  };

  const handleImportResult = () => {
    if (!result) return;
    onImport?.(result);
  };

  const handleBboxFieldChange = (field: keyof BBox, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const newBbox: BBox = bbox
      ? { ...bbox, [field]: num }
      : { west: -122.5, south: 37.7, east: -122.3, north: 37.8, [field]: num };
    setBbox(newBbox);
  };

  return (
    <div style={{ padding: 12 }}>
      {/* Backend status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12 }}>
        {backendOnline === null ? (
          <>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
            <span style={{ color: '#94a3b8' }}>Checking backend...</span>
          </>
        ) : backendOnline ? (
          <>
            <Wifi size={12} style={{ color: '#22c55e' }} />
            <span style={{ color: '#22c55e' }}>Discovery API online</span>
          </>
        ) : (
          <>
            <WifiOff size={12} style={{ color: '#f59e0b' }} />
            <span style={{ color: '#f59e0b' }}>Backend offline</span>
          </>
        )}
      </div>

      {/* Offline hint */}
      {backendOnline === false && (
        <div className="card" style={{ marginBottom: 12, borderColor: '#f59e0b', background: '#1c1917' }}>
          <div className="small" style={{ color: '#f59e0b', fontFamily: 'monospace', fontSize: 11 }}>
            Start the discovery server: cd discovery && uvicorn discovery.server:app --port 8001
          </div>
        </div>
      )}

      {/* Source badge — shows pinned source from prefix routing */}
      {source && (
        <div style={{ marginBottom: 8 }}>
          <span className="badge" style={{ textTransform: 'uppercase' }}>{source}</span>
        </div>
      )}

      {/* Search form */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="What data do you need? (e.g., building footprints in San Francisco)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
          />
          <button
            className="primary"
            onClick={state === 'confirming' ? handleConfirmBbox : handleDiscover}
            disabled={state === 'geocoding' || state === 'searching' || !query.trim() || backendOnline === false}
          >
            {state === 'geocoding' ? 'Locating...' : state === 'searching' ? 'Searching...' : state === 'confirming' ? 'Confirm & Search' : 'Discover'}
          </button>
        </div>

        {/* Bbox confirmation panel */}
        {state === 'confirming' && bbox && (
          <div style={{
            marginTop: 8,
            padding: 10,
            background: '#1e293b',
            borderRadius: 6,
            border: '1px solid #334155',
          }}>
            <div className="small" style={{ marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={14} strokeWidth={1.5} aria-hidden="true" /> Area of interest{displayName ? `: ${displayName}` : placeName ? `: ${placeName}` : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              <label className="small">
                West
                <input type="number" step="0.01" value={bbox.west}
                  onChange={(e) => handleBboxFieldChange('west', e.target.value)}
                  style={{ width: '100%', marginTop: 2 }} />
              </label>
              <label className="small">
                East
                <input type="number" step="0.01" value={bbox.east}
                  onChange={(e) => handleBboxFieldChange('east', e.target.value)}
                  style={{ width: '100%', marginTop: 2 }} />
              </label>
              <label className="small">
                South
                <input type="number" step="0.01" value={bbox.south}
                  onChange={(e) => handleBboxFieldChange('south', e.target.value)}
                  style={{ width: '100%', marginTop: 2 }} />
              </label>
              <label className="small">
                North
                <input type="number" step="0.01" value={bbox.north}
                  onChange={(e) => handleBboxFieldChange('north', e.target.value)}
                  style={{ width: '100%', marginTop: 2 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="primary" onClick={handleConfirmBbox} style={{ flex: 1 }}>
                ✓ Search this area
              </button>
              <button onClick={handleSkipBbox} style={{ flex: 1 }}>
                Skip — search globally
              </button>
              <button onClick={handleClearBbox} style={{ padding: '4px 10px' }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Example search chips — always visible, dimmed when a query is active */}
        {!source && (
          <div
            style={{ opacity: (state === 'idle' && !query) ? 1 : 0.55, transition: 'opacity 0.2s ease', marginTop: 'var(--space-2)' }}
          >
            <div className="small muted" style={{ marginBottom: 6 }}>
              {query ? 'Try searching for…' : 'Try an example search'}
            </div>
            <div className="discovery-chips" style={{ marginTop: 0 }}>
              {[
                { label: 'parks & green spaces', query: '@osm parks' },
                { label: 'water quality data', query: '@ckan water' },
                { label: 'satellite imagery', query: '@stac sentinel-2' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  className="discovery-chip"
                  onClick={() => setQuery(chip.query)}
                  type="button"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Source badges — always visible to show available sources */}
        <div className="discovery-sources">
          {['OpenStreetMap', 'Data Portals', 'Satellite', 'ArcGIS'].map((src) => (
            <span key={src} className="discovery-source-badge">{src}</span>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ marginBottom: 12, borderColor: '#ef4444' }}>
          <div className="small" style={{ color: '#ef4444' }}>{error}</div>
        </div>
      )}

      {/* Loading state */}
      {(state === 'searching' || state === 'geocoding') && !result && (
        <div className="card" style={{ marginBottom: 12, textAlign: 'center', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
            <span className="small muted">
              {state === 'geocoding' ? 'Locating area of interest…' : 'Searching…'}
            </span>
          </div>
        </div>
      )}

      {/* No results state */}
      {state === 'results' && !error && result && (
        (result.kind === 'links' && result.candidates && result.candidates.length === 0) ||
        (result.kind === 'vector' && !result.data)
      ) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="small muted" style={{ marginBottom: 8 }}>
            No results found. Try a different query or source.
          </div>
          {!source && (
            <div className="discovery-chips">
              {[
                { label: 'parks & green spaces', query: '@osm parks' },
                { label: 'water quality data', query: '@ckan water' },
                { label: 'satellite imagery', query: '@stac sentinel-2' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  className="discovery-chip"
                  onClick={() => setQuery(chip.query)}
                  type="button"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result — only render if there's actual data to show */}
      {result && (
        !(
          (result.kind === 'links' && result.candidates && result.candidates.length === 0) ||
          (result.kind === 'vector' && !result.data)
        )
      ) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <strong>Discovery Result</strong>
            <span className="badge">{result.kind}</span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Source: {String(result.provenance.source ?? 'unknown')}
            {result.provenance.license != null && ` · License: ${String(result.provenance.license)}`}
          </div>

          {result.kind === 'vector' && result.data != null && (
            <div className="small" style={{ marginTop: 8 }}>
              {(() => {
                const fc = result.data as { type: string; features?: unknown[] };
                const count = fc.features?.length ?? 0;
                return `${count.toLocaleString()} feature${count !== 1 ? 's' : ''} loaded`;
              })()}
            </div>
          )}

          {result.kind === 'raster' && result.data_url && (
            <div className="small" style={{ marginTop: 8 }}>
              Asset URL resolved ({String(result.provenance.attribution ?? 'Sentinel-2')})
            </div>
          )}

          {result.kind === 'links' && result.candidates && (
            <div style={{ marginTop: 8 }}>
              <div className="small" style={{ marginBottom: 4 }}>
                {result.candidates.length} candidate{result.candidates.length !== 1 ? 's' : ''} found:
              </div>
              {result.candidates.map((c, i) => (
                <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
                  <span>{c.dataset ?? c.title ?? 'Untitled'}</span>
                  {c.format && <span className="badge" style={{ marginLeft: 8 }}>{c.format}</span>}
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontSize: 11 }}>
                      ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Import button for vector results only — raster links to external asset */}
          {result.kind === 'vector' && (
            <button
              className="primary"
              style={{ marginTop: 12 }}
              onClick={handleImportResult}
            >
              Import to workspace
            </button>
          )}

          {/* Trace */}
          {result.trace.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Discovery trace</summary>
              <div style={{ marginTop: 4 }}>
                {result.trace.map((t, i) => (
                  <div key={i} className="small muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {t}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
