/** Discovery API client — typed fetch wrappers for /api/discover and /api/geocode. */

import type { BBox } from '../types';

export interface DiscoveryCandidate {
  title?: string;
  url?: string;
  dataset?: string;
  format?: string;
  license?: string;
}

export interface DiscoveryProvenance {
  source?: string;
  license?: string;
  attribution?: string;
  endpoint?: string;
}

export interface DiscoveryResult {
  kind: 'vector' | 'raster' | 'links';
  data?: unknown; // GeoJSON FeatureCollection for vector
  data_url?: string | null;
  format?: string | null;
  provenance: DiscoveryProvenance;
  bbox?: BBox | null;
  candidates?: DiscoveryCandidate[] | null;
  trace: string[];
}

export interface GeocodeResult {
  bbox: { west: number; south: number; east: number; north: number };
  display_name: string;
  center: [number, number]; // [lon, lat]
}

export interface DiscoveryRequest {
  query: string;
  bbox?: BBox;
  source?: string;
  params?: Record<string, unknown>;
}

/** Discover spatial data by describing what you need. */
export async function discover(request: DiscoveryRequest): Promise<DiscoveryResult> {
  const resp = await fetch('/api/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `Discovery failed (${resp.status})`);
  }
  return resp.json();
}

/** Resolve a place name to a bounding box + center. */
export async function geocode(place: string): Promise<GeocodeResult> {
  const resp = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ place }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `Geocode failed (${resp.status})`);
  }
  return resp.json();
}
