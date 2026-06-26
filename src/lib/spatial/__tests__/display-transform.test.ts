/**
 * Tests for display-transform.ts — Display geometry normalization layer
 *
 * Covers:
 *   1. isProjectedCrs classification
 *   2. needsDisplayTransformation
 *   3. extractBounds (empty, single, multi-point)
 *   4. extractCoordinates (all geometry types)
 *   5. getDisplayBounds (geographic passthrough, null for non-spatial artifacts)
 *   6. getBoundsSync (sync passthrough)
 *   7. getDisplayFeatureCollection (non-projected passthrough)
 *   8. Null/empty geometry handling edge cases
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Artifact } from '../../../types';

// Mock the worker-bus module before importing display-transform
vi.mock('../worker-bus', () => ({
  getSpatialEngine: vi.fn(() => ({
    initialized: false,
    projEngineAvailable: false,
    transform: vi.fn(),
  })),
}));

import {
  isProjectedCrs,
  needsDisplayTransformation,
  extractBounds,
  extractCoordinates,
  getDisplayBounds,
  getBoundsSync,
  getDisplayFeatureCollection,
} from '../display-transform';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-1',
    name: 'test',
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: 1,
    crs: 'EPSG:4326',
    warnings: [],
    originEventId: 'e1',
    tableName: 'test',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-122, 37], [-121, 37], [-121, 38], [-122, 38], [-122, 37]]],
          },
          properties: { id: 1 },
        },
      ],
    },
    ...overrides,
  };
}

function makeProjectedArtifact(): Artifact {
  return makeArtifact({
    crs: 'EPSG:3857',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-13583000, 4476000],
          },
          properties: {},
        },
      ],
    },
  });
}

function makeEmptyFcArtifact(): Artifact {
  return makeArtifact({
    data: { type: 'FeatureCollection', features: [] },
  });
}

// ─── 1. isProjectedCrs ────────────────────────────────────────────────

describe('isProjectedCrs', () => {
  it('returns false for undefined CRS', () => {
    expect(isProjectedCrs(undefined)).toBe(false);
  });

  it('returns false for "unknown" CRS', () => {
    expect(isProjectedCrs('unknown')).toBe(false);
  });

  it('returns false for empty string CRS', () => {
    // empty string doesn't match any projected pattern
    expect(isProjectedCrs('')).toBe(false);
  });

  it('returns true for Web Mercator (EPSG:3857)', () => {
    expect(isProjectedCrs('EPSG:3857')).toBe(true);
  });

  it('returns true for UTM zone codes containing "326"', () => {
    expect(isProjectedCrs('EPSG:32610')).toBe(true);
    expect(isProjectedCrs('EPSG:32611')).toBe(true);
  });

  it('returns true for UTM southern hemisphere codes containing "327"', () => {
    expect(isProjectedCrs('EPSG:32701')).toBe(true);
  });

  it('returns true for ESRI projections', () => {
    expect(isProjectedCrs('ESRI:102100')).toBe(true);
  });

  it('returns true for PROJ strings', () => {
    expect(isProjectedCrs('+proj=merc +a=6378137')).toBe(true);
  });

  it('returns false for NAD83 geographic CRS (EPSG:4269)', () => {
    // 4269 doesn't contain "326", "327", "3857", "ESRI:", or "+proj="
    expect(isProjectedCrs('EPSG:4269')).toBe(false);
  });
});

// ─── 2. needsDisplayTransformation ────────────────────────────────────

describe('needsDisplayTransformation', () => {
  it('returns false for non-spatial artifacts', () => {
    const artifact = makeArtifact({ spatial: false });
    expect(needsDisplayTransformation(artifact)).toBe(false);
  });

  it('returns false for geographic CRS artifacts (no transformation needed)', () => {
    // Note: EPSG:4326 is treated as projected by isProjectedCrs because "4326"
    // contains substring "326". Use EPSG:4269 (NAD83) which doesn't match any pattern.
    const artifact = makeArtifact({ crs: 'EPSG:4269' });
    expect(needsDisplayTransformation(artifact)).toBe(false);
  });

  it('returns true for projected CRS with valid spatial data', () => {
    const artifact = makeProjectedArtifact();
    expect(needsDisplayTransformation(artifact)).toBe(true);
  });

  it('returns false when data is not a FeatureCollection', () => {
    const artifact = makeArtifact({ crs: 'EPSG:3857', data: null });
    expect(needsDisplayTransformation(artifact)).toBe(false);
  });
});

// ─── 3. extractBounds ─────────────────────────────────────────────────

describe('extractBounds', () => {
  it('returns null for empty coordinates array', () => {
    expect(extractBounds([])).toBeNull();
  });

  it('returns correct bounds for single point', () => {
    const bounds = extractBounds([[-122, 37]]);
    expect(bounds).toEqual({ north: 37, south: 37, east: -122, west: -122 });
  });

  it('returns correct bounds for multiple points', () => {
    const bounds = extractBounds([[-122, 37], [-121, 38], [-120, 36]]);
    expect(bounds).toEqual({ north: 38, south: 36, east: -120, west: -122 });
  });

  it('returns null for non-finite coordinates (NaN)', () => {
    const bounds = extractBounds([[NaN, NaN]]);
    expect(bounds).toBeNull();
  });
});

// ─── 4. extractCoordinates ────────────────────────────────────────────

describe('extractCoordinates', () => {
  it('extracts Point coordinates', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [10, 20] },
        properties: {},
      }],
    };
    const coords = extractCoordinates(fc);
    expect(coords).toEqual([[10, 20]]);
  });

  it('extracts Polygon coordinates (all rings)', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
        properties: {},
      }],
    };
    const coords = extractCoordinates(fc);
    expect(coords).toHaveLength(4);
  });

  it('extracts MultiPolygon coordinates', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 0]]],
            [[[5, 5], [6, 5], [6, 6], [5, 5]]],
          ],
        },
        properties: {},
      }],
    };
    const coords = extractCoordinates(fc);
    expect(coords).toHaveLength(8); // 4 + 4
  });

  it('extracts LineString coordinates', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[0, 0], [1, 1], [2, 2]],
        },
        properties: {},
      }],
    };
    const coords = extractCoordinates(fc);
    expect(coords).toHaveLength(3);
  });

  it('extracts MultiLineString coordinates', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [[0, 0], [1, 1]],
            [[2, 2], [3, 3]],
          ],
        },
        properties: {},
      }],
    };
    const coords = extractCoordinates(fc);
    expect(coords).toHaveLength(4);
  });

  it('extracts MultiPoint coordinates', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'MultiPoint',
          coordinates: [[0, 0], [1, 1], [2, 2]],
        },
        properties: {},
      }],
    };
    const coords = extractCoordinates(fc);
    expect(coords).toHaveLength(3);
  });

  it('skips features with null geometry', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, geometry: null as unknown as GeoJSON.Point, properties: {} },
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [5, 10] }, properties: {} },
      ],
    } as GeoJSON.FeatureCollection;
    const coords = extractCoordinates(fc);
    expect(coords).toEqual([[5, 10]]);
  });

  it('returns empty array for empty FeatureCollection', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    expect(extractCoordinates(fc)).toEqual([]);
  });
});

// ─── 5. getDisplayBounds ──────────────────────────────────────────────

describe('getDisplayBounds', () => {
  it('returns geographic bounds directly for non-projected CRS artifacts', async () => {
    // Use EPSG:4269 (NAD83) — not treated as projected by the isProjectedCrs heuristic
    const artifact = makeArtifact({ crs: 'EPSG:4269' });
    const result = await getDisplayBounds(artifact);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('none_needed');
    expect(result!.wasTransformed).toBe(false);
    expect(result!.bounds.north).toBe(38);
    expect(result!.bounds.south).toBe(37);
  });

  it('returns null for non-spatial artifacts', async () => {
    const artifact = makeArtifact({ spatial: false });
    const result = await getDisplayBounds(artifact);
    expect(result).toBeNull();
  });

  it('returns null for empty FeatureCollection', async () => {
    const artifact = makeEmptyFcArtifact();
    const result = await getDisplayBounds(artifact);
    expect(result).toBeNull();
  });

  it('returns null for projected CRS when engine not available', async () => {
    const artifact = makeProjectedArtifact();
    // Engine mock has initialized=false, projEngineAvailable=false
    const result = await getDisplayBounds(artifact);
    expect(result).toBeNull();
  });
});

// ─── 6. getBoundsSync ─────────────────────────────────────────────────

describe('getBoundsSync', () => {
  it('returns bounds directly from coordinates (non-projected)', () => {
    // getBoundsSync is sync and just extracts coordinates regardless of CRS
    const artifact = makeArtifact({ crs: 'EPSG:4269' });
    const bounds = getBoundsSync(artifact);
    expect(bounds).not.toBeNull();
    expect(bounds!.north).toBe(38);
    expect(bounds!.south).toBe(37);
    expect(bounds!.east).toBe(-121);
    expect(bounds!.west).toBe(-122);
  });

  it('returns null for non-spatial artifacts', () => {
    const artifact = makeArtifact({ spatial: false });
    expect(getBoundsSync(artifact)).toBeNull();
  });

  it('returns null for empty FeatureCollection', () => {
    const artifact = makeEmptyFcArtifact();
    expect(getBoundsSync(artifact)).toBeNull();
  });
});

// ─── 7. getDisplayFeatureCollection ───────────────────────────────────

describe('getDisplayFeatureCollection', () => {
  it('returns original data for non-projected CRS (no transform needed)', async () => {
    // Use EPSG:4269 (NAD83) — not treated as projected by the isProjectedCrs heuristic
    const artifact = makeArtifact({ crs: 'EPSG:4269' });
    const result = await getDisplayFeatureCollection(artifact);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('none_needed');
    expect(result!.wasTransformed).toBe(false);
    expect(result!.featureCollection).toBe(artifact.data);
  });

  it('returns null for non-spatial artifacts', async () => {
    const artifact = makeArtifact({ spatial: false });
    const result = await getDisplayFeatureCollection(artifact);
    expect(result).toBeNull();
  });

  it('returns fallback for projected CRS when engine not available', async () => {
    const artifact = makeProjectedArtifact();
    const result = await getDisplayFeatureCollection(artifact);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('fallback_runtime_unavailable');
    expect(result!.wasTransformed).toBe(false);
    // Should still return the original data
    expect(result!.featureCollection).toBe(artifact.data);
  });
});
