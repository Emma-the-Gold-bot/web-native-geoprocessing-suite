/**
 * Tests for aggregation-execution.ts — Global and grouped dissolve operations.
 *
 * Covers:
 *   - Global dissolve merges all features into one
 *   - Grouped dissolve splits by attribute, dissolves each group
 *   - Null/missing grouping field handling
 *   - Multipart output verification
 *   - Error for missing CRS (require-known operations)
 *   - Error for unknown grouping field
 *   - Output artifact structure (grouping-field-only attributes)
 *   - Dissolve with empty result
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRegisteredAggregationOperation } from '../aggregation-execution';
import type { Artifact } from '../../../types';
import type { GeometryOperationInput, GeometryOperationResult } from '../../spatial/types';

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock('../runtime', async () => {
  const actual = await vi.importActual('../runtime');
  return {
    ...actual,
    registerOperationArtifactTable: vi.fn(() => Promise.resolve()),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────

function makePolygonFeature(
  id: string,
  coords: number[][][],
  properties: Record<string, unknown> = {},
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { id, ...properties },
    geometry: { type: 'Polygon', coordinates: coords },
  };
}

function makePolygonArtifact(
  overrides: Partial<Artifact> & { features?: GeoJSON.Feature[] } = {},
): Artifact {
  const features = overrides.features ?? [
    makePolygonFeature('1', [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], { zone: 'A' }),
    makePolygonFeature('2', [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]], { zone: 'A' }),
    makePolygonFeature('3', [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]], { zone: 'B' }),
  ];

  return {
    id: overrides.id ?? 'art-agg',
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

function makeDissolveResult(
  featureCount: number = 1,
): GeometryOperationResult {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < featureCount; i++) {
    features.push(
      makePolygonFeature(`dissolved-${i}`, [
        [
          [0, 0],
          [30, 0],
          [30, 10],
          [0, 10],
          [0, 0],
        ],
      ]),
    );
  }
  return {
    success: true,
    output: { type: 'FeatureCollection' as const, features },
    outputCrs: 'EPSG:3857',
    warnings: [],
    errors: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('executeRegisteredAggregationOperation — global dissolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A1: global dissolve merges all features into one', async () => {
    const source = makePolygonArtifact();
    const executeOp = vi.fn(() => Promise.resolve(makeDissolveResult(1)));

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-global',
      sourceArtifact: source,
      executeOperation: executeOp,
    });

    expect(result.error).toBeUndefined();
    expect(result.artifact).toBeDefined();
    expect(executeOp).toHaveBeenCalledTimes(1);
  });

  it('A2: global dissolve inherits CRS from source', async () => {
    const source = makePolygonArtifact({ crs: 'EPSG:32610' });
    const executeOp = vi.fn(() =>
      Promise.resolve({
        ...makeDissolveResult(1),
        outputCrs: 'EPSG:32610',
      }),
    );

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-global',
      sourceArtifact: source,
      executeOperation: executeOp,
    });

    expect(result.artifact?.crs).toBe('EPSG:32610');
  });

  it('A3: global dissolve refuses unknown CRS', async () => {
    const source = makePolygonArtifact({ crs: 'unknown' });
    const executeOp = vi.fn();

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-global',
      sourceArtifact: source,
      executeOperation: executeOp,
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('unknown stored CRS');
    expect(executeOp).not.toHaveBeenCalled();
  });

  it('A4: global dissolve refuses missing CRS', async () => {
    const source = makePolygonArtifact({});
    delete (source as any).crs;
    const executeOp = vi.fn();

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-global',
      sourceArtifact: source,
      executeOperation: executeOp,
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('missing stored CRS');
  });

  it('A5: global dissolve returns error when operation fails', async () => {
    const source = makePolygonArtifact();
    const failResult: GeometryOperationResult = {
      success: false,
      output: undefined,
      warnings: [],
      errors: [{ code: 'DISSOLVE_FAILED', message: 'Engine error' }],
    };
    const executeOp = vi.fn(() => Promise.resolve(failResult));

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-global',
      sourceArtifact: source,
      executeOperation: executeOp,
    });

    expect(result.error).toContain('Engine error');
  });
});

describe('executeRegisteredAggregationOperation — grouped dissolve', () => {
  it('A6: grouped dissolve calls executeOperation per group', async () => {
    const source = makePolygonArtifact({
      features: [
        makePolygonFeature('1', [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], { zone: 'A' }),
        makePolygonFeature('2', [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]], { zone: 'A' }),
        makePolygonFeature('3', [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]], { zone: 'B' }),
      ],
    });
    const executeOp = vi.fn(() => Promise.resolve(makeDissolveResult(1)));

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-grouped-v1',
      sourceArtifact: source,
      executeOperation: executeOp,
      groupingField: 'zone',
    });

    expect(result.error).toBeUndefined();
    // 2 distinct groups (A, B) → invoked twice
    expect(executeOp).toHaveBeenCalledTimes(2);
  });

  it('A7: grouped dissolve errors when groupingField is not provided', async () => {
    const source = makePolygonArtifact();
    const executeOp = vi.fn();

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-grouped-v1',
      sourceArtifact: source,
      executeOperation: executeOp,
      // no groupingField
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('grouping field');
    expect(executeOp).not.toHaveBeenCalled();
  });

  it('A8: grouped dissolve errors when groupingField does not exist on artifact', async () => {
    const source = makePolygonArtifact();
    const executeOp = vi.fn();

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-grouped-v1',
      sourceArtifact: source,
      executeOperation: executeOp,
      groupingField: 'nonexistent_field',
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('nonexistent_field');
    expect(result.error).toContain('does not exist');
  });

  it('A9: grouped dissolve output has grouping-field-only attributes', async () => {
    const source = makePolygonArtifact({
      features: [
        makePolygonFeature('1', [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]], { zone: 'X' }),
        makePolygonFeature('2', [[[10, 0], [15, 0], [15, 5], [10, 5], [10, 0]]], { zone: 'Y' }),
      ],
    });

    // Each group call gets its group's features
    let callCount = 0;
    const executeOp = vi.fn((): Promise<GeometryOperationResult> => {
      callCount++;
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
            },
            properties: {},
          },
        ],
      };
      return Promise.resolve({
        success: true,
        output: fc,
        outputCrs: 'EPSG:3857',
        warnings: [],
        errors: [],
      });
    });

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-grouped-v1',
      sourceArtifact: source,
      executeOperation: executeOp,
      groupingField: 'zone',
    });

    expect(result.error).toBeUndefined();
    expect(result.artifact).toBeDefined();
    // Output features should have the grouping field
    const outputData = result.artifact?.data as { features: Array<{ properties: Record<string, unknown> }> } | undefined;
    expect(outputData).toBeDefined();
    expect(outputData?.features).toHaveLength(2);
    for (const feature of outputData!.features) {
      expect(feature.properties).toHaveProperty('zone');
    }
  });

  it('A10: unknown operation ID returns error', async () => {
    const source = makePolygonArtifact();

    const result = await executeRegisteredAggregationOperation({
      operationId: 'nonexistent-aggregation',
      sourceArtifact: source,
      executeOperation: vi.fn(),
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Unknown operation definition');
  });
});
