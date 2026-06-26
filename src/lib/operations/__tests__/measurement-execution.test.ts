/**
 * Tests for measurement-execution.ts — Area, perimeter, and compactness measurements.
 *
 * Covers:
 *   - Area calculation on known polygons (square-meters in projected CRS)
 *   - Perimeter calculation
 *   - Compactness calculation (Polsby-Popper)
 *   - CRS-dependent unit validation (meters for projected, warning for geographic)
 *   - Refusal for missing CRS, unknown CRS, non-spatial artifacts
 *   - Geometry type validation (only Polygon/MultiPolygon)
 *   - Output structure verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeAreaMeasurementOperation,
  executePerimeterMeasurementOperation,
  executeCompactnessMeasurementOperation,
} from '../measurement-execution';
import type { Artifact } from '../../../types';

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock('../../duckdb', () => ({
  getDuckDb: vi.fn(() =>
    Promise.resolve({
      connect: vi.fn(() =>
        Promise.resolve({
          query: vi.fn(() => Promise.resolve({ toArray: () => [], schema: { fields: [] } })),
          registerFileText: vi.fn(() => Promise.resolve()),
          insertJSONFromPath: vi.fn(),
          close: vi.fn(() => Promise.resolve()),
        }),
      ),
      registerFileText: vi.fn(() => Promise.resolve()),
    }),
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────

function makePolygonFeature(
  id: string,
  coordinates: number[][][],
  properties: Record<string, unknown> = {},
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { id, ...properties },
    geometry: { type: 'Polygon', coordinates },
  };
}

function makePolygonArtifact(
  overrides: Partial<Artifact> & { features?: GeoJSON.Feature[] } = {},
): Artifact {
  const features = overrides.features ?? [
    // 10x10 square in projected coordinates → area = 100, perimeter = 40
    makePolygonFeature('1', [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ]),
  ];

  return {
    id: overrides.id ?? 'art-1',
    name: overrides.name ?? 'parcels',
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: features.length,
    crs: overrides.crs ?? 'EPSG:3857',
    crsProvenance: {
      confidence: 'known',
      declaredCrs: overrides.crs ?? 'EPSG:3857',
      source: 'import-metadata',
      warnings: [],
    },
    warnings: [],
    originEventId: 'e0',
    tableName: overrides.tableName ?? 'parcels',
    data: { type: 'FeatureCollection', features },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('executeAreaMeasurementOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('M1: computes area for a known square polygon in projected CRS', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:3857' });
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeUndefined();
    expect(result.artifact).toBeDefined();
    expect(result.artifact?.name).toBe('parcels_area');
    expect(result.artifact?.spatial).toBe(false);
    expect(result.artifact?.outputKind).toBe('measurement-table');

    // Check measurement data
    const rows = result.artifact?.data as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].area_value).toBe(100); // 10 × 10 square
    expect(rows[0].area_unit).toBe('square_meters');
  });

  it('M2: area measurement preserves source CRS', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:32610' });
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.artifact?.crs).toBe('EPSG:32610');
    expect(result.artifact?.crsProvenance?.source).toBe('operation-inherited');
  });

  it('M3: area measurement refuses geographic CRS (EPSG:4326) with misleading unit error', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:4326' });
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('misleading');
    expect(result.artifact).toBeUndefined();
  });

  it('M4: area measurement refuses missing CRS', async () => {
    const source = makePolygonArtifact({});
    delete (source as any).crs;
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('missing stored CRS');
  });

  it('M5: area measurement refuses unknown CRS', async () => {
    const source = makePolygonArtifact({ crs: 'unknown' });
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('unknown stored CRS');
  });

  it('M6: area measurement refuses non-spatial artifact', async () => {
    const source = makePolygonArtifact({ spatial: false });
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('not spatial');
  });

  it('M7: area measurement refuses Point geometry type', async () => {
    const source = makePolygonArtifact({ geometryType: 'Point' });
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('refuses geometry type');
    expect(result.error).toContain('Point');
  });

  it('M8: area measurement supports custom output name', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:3857' });
    const result = await executeAreaMeasurementOperation({
      sourceArtifact: source,
      outputName: 'custom_name',
    });

    expect(result.artifact?.name).toBe('custom_name');
  });

  it('M9: area measurement history event records measurement kind', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:3857' });
    const result = await executeAreaMeasurementOperation({ sourceArtifact: source });

    expect(result.historyEvent).toBeDefined();
    expect(result.historyEvent?.details.measurementKind).toBe('area');
    expect(result.historyEvent?.details.measurementUnit).toBe('square_meters');
    expect(result.historyEvent?.details.measurementValueField).toBe('area_value');
  });
});

describe('executePerimeterMeasurementOperation', () => {
  it('M10: computes perimeter for a known square polygon', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:3857' });
    const result = await executePerimeterMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeUndefined();
    const rows = result.artifact?.data as any[];
    expect(rows[0].perimeter_value).toBe(40); // 4 × 10
    expect(rows[0].perimeter_unit).toBe('meters');
  });

  it('M11: perimeter measurement default name', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:3857' });
    const result = await executePerimeterMeasurementOperation({ sourceArtifact: source });

    expect(result.artifact?.name).toBe('parcels_perimeter');
  });
});

describe('executeCompactnessMeasurementOperation', () => {
  it('M12: computes Polsby-Popper compactness for a square', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:3857' });
    const result = await executeCompactnessMeasurementOperation({ sourceArtifact: source });

    expect(result.error).toBeUndefined();
    const rows = result.artifact?.data as any[];
    // Polsby-Popper for a square: 4π × area / perimeter² = 4π × 100 / 1600 = π/4 ≈ 0.7854
    const compactness = rows[0].compactness_value;
    expect(compactness).toBeCloseTo(Math.PI / 4, 3);
    expect(rows[0].compactness_unit).toBe('unitless');
  });

  it('M13: compactness measurement default name', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:3857' });
    const result = await executeCompactnessMeasurementOperation({ sourceArtifact: source });

    expect(result.artifact?.name).toBe('parcels_compactness');
  });
});
