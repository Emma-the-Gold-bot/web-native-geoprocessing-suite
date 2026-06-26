/**
 * Tests for topology-execution.ts — Two-input topology operations (clip, intersect).
 *
 * Covers:
 *   - Successful clip operation with valid inputs
 *   - Successful intersect operation with valid inputs
 *   - Validation errors (missing CRS, geometry type mismatch)
 *   - Operation execution errors
 *   - Output artifact structure and CRS propagation
 *   - Empty result handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTopologyOperation } from '../topology-execution';
import type { Artifact } from '../../../types';
import type { GeometryOperationResult } from '../../spatial/types';

// Mock DuckDB operations
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

// Mock runtime module to avoid DuckDB side effects
vi.mock('../runtime', async () => {
  const actual = await vi.importActual('../runtime');
  return {
    ...actual,
    registerOperationArtifactTable: vi.fn(() => Promise.resolve()),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────

function makePolygonFeature(id: string, coords: number[][][]): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { id },
    geometry: {
      type: 'Polygon',
      coordinates: coords,
    },
  };
}

function makePolygonArtifact(
  overrides: Partial<Artifact> & { features?: GeoJSON.Feature[] } = {},
): Artifact {
  const features = overrides.features ?? [
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
    id: overrides.id ?? 'source-1',
    name: overrides.name ?? 'parcels',
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: features.length,
    crs: overrides.crs ?? 'EPSG:3857',
    warnings: [],
    originEventId: 'e0',
    tableName: overrides.tableName ?? 'parcels',
    data: {
      type: 'FeatureCollection',
      features,
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('executeTopologyOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clip operation', () => {
    it('T1: executes clip successfully with valid inputs', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels' });
      const mask = makePolygonArtifact({ id: 'mask', name: 'boundary' });

      const mockResult: GeometryOperationResult = {
        success: true,
        output: {
          type: 'FeatureCollection',
          features: [makePolygonFeature('clipped', [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]])],
        },
        outputCrs: 'EPSG:3857',
        warnings: [],
        errors: [],
      };

      const result = await executeTopologyOperation({
        operationId: 'clip-v1',
        sourceArtifact: source,
        secondaryArtifact: mask,
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      expect(result.error).toBeUndefined();
      expect(result.artifact).toBeDefined();
      expect(result.artifact?.kind).toBe('derived');
      expect(result.artifact?.spatial).toBe(true);
      expect(result.artifact?.crs).toBe('EPSG:3857');
      expect(result.historyEvent).toBeDefined();
      expect(result.historyEvent?.type).toBe('operation');
    });

    it('T2: returns validation error when source CRS is unknown', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels', crs: 'unknown' });
      const mask = makePolygonArtifact({ id: 'mask', name: 'boundary' });

      const result = await executeTopologyOperation({
        operationId: 'clip-v1',
        sourceArtifact: source,
        secondaryArtifact: mask,
        executeTopology: vi.fn(),
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain('unknown');
      expect(result.artifact).toBeUndefined();
    });

    it('T3: returns validation error when CRS mismatch between source and secondary', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels', crs: 'EPSG:3857' });
      const mask = makePolygonArtifact({ id: 'mask', name: 'boundary', crs: 'EPSG:4326' });

      const result = await executeTopologyOperation({
        operationId: 'clip-v1',
        sourceArtifact: source,
        secondaryArtifact: mask,
        executeTopology: vi.fn(),
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain('match');
      expect(result.artifact).toBeUndefined();
    });

    it('T4: returns error when operation execution fails', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels' });
      const mask = makePolygonArtifact({ id: 'mask', name: 'boundary' });

      const mockResult: GeometryOperationResult = {
        success: false,
        output: undefined,
        warnings: [],
        errors: [{ code: 'TOPOLOGY_FAILED', message: 'Geometry engine error' }],
      };

      const result = await executeTopologyOperation({
        operationId: 'clip-v1',
        sourceArtifact: source,
        secondaryArtifact: mask,
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Geometry engine error');
      expect(result.artifact).toBeUndefined();
    });

    it('T5: handles empty result with warning', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels' });
      const mask = makePolygonArtifact({ id: 'mask', name: 'boundary' });

      const mockResult: GeometryOperationResult = {
        success: true,
        output: {
          type: 'FeatureCollection',
          features: [],
        },
        outputCrs: 'EPSG:3857',
        warnings: [],
        errors: [],
      };

      const result = await executeTopologyOperation({
        operationId: 'clip-v1',
        sourceArtifact: source,
        secondaryArtifact: mask,
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      expect(result.error).toBeUndefined();
      expect(result.artifact).toBeDefined();
      expect(result.artifact?.rowCount).toBe(0);
      expect(result.artifact?.warnings.some((w) => w.code === 'EMPTY_TOPOLOGY_RESULT')).toBe(true);
    });

    it('T6: propagates outputCrs from result when provided', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels', crs: 'EPSG:3857' });
      const mask = makePolygonArtifact({ id: 'mask', name: 'boundary', crs: 'EPSG:3857' });

      const mockResult: GeometryOperationResult = {
        success: true,
        output: {
          type: 'FeatureCollection',
          features: [makePolygonFeature('out', [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])],
        },
        outputCrs: 'EPSG:4326', // Different from source
        warnings: [],
        errors: [],
      };

      const result = await executeTopologyOperation({
        operationId: 'clip-v1',
        sourceArtifact: source,
        secondaryArtifact: mask,
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      expect(result.artifact?.crs).toBe('EPSG:4326');
      expect(result.artifact?.crsProvenance?.source).toBe('operation-derived');
      expect(result.artifact?.crsProvenance?.confidence).toBe('known');
    });

    it('T7: inherits source CRS when result has no outputCrs', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels', crs: 'EPSG:3857' });
      const mask = makePolygonArtifact({ id: 'mask', name: 'boundary', crs: 'EPSG:3857' });

      const mockResult: GeometryOperationResult = {
        success: true,
        output: {
          type: 'FeatureCollection',
          features: [makePolygonFeature('out', [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])],
        },
        warnings: [],
        errors: [],
      };

      const result = await executeTopologyOperation({
        operationId: 'clip-v1',
        sourceArtifact: source,
        secondaryArtifact: mask,
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      // Topology operations always use 'operation-derived' even when inheriting source CRS
      expect(result.artifact?.crs).toBe('EPSG:3857');
      expect(result.artifact?.crsProvenance?.source).toBe('operation-derived');
      expect(result.artifact?.crsProvenance?.confidence).toBe('known');
    });
  });

  describe('intersect operation', () => {
    it('T8: executes intersect successfully', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels' });
      const overlay = makePolygonArtifact({ id: 'overlay', name: 'zones' });

      const mockResult: GeometryOperationResult = {
        success: true,
        output: {
          type: 'FeatureCollection',
          features: [makePolygonFeature('intersected', [[[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]]])],
        },
        outputCrs: 'EPSG:3857',
        warnings: [],
        errors: [],
      };

      const result = await executeTopologyOperation({
        operationId: 'intersect-v1',
        sourceArtifact: source,
        secondaryArtifact: overlay,
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      expect(result.error).toBeUndefined();
      expect(result.artifact).toBeDefined();
      expect(result.historyEvent?.summary).toContain('Intersect');
      expect(result.historyEvent?.summary).toContain('parcels');
      expect(result.historyEvent?.summary).toContain('zones');
    });

    it('T9: uses custom outputName when provided', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'parcels' });
      const overlay = makePolygonArtifact({ id: 'overlay', name: 'zones' });

      const mockResult: GeometryOperationResult = {
        success: true,
        output: {
          type: 'FeatureCollection',
          features: [makePolygonFeature('out', [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])],
        },
        outputCrs: 'EPSG:3857',
        warnings: [],
        errors: [],
      };

      const result = await executeTopologyOperation({
        operationId: 'intersect-v1',
        sourceArtifact: source,
        secondaryArtifact: overlay,
        outputName: 'my_custom_output',
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      expect(result.artifact?.name).toBe('my_custom_output');
    });

    it('T10: throws error for unknown operation ID', async () => {
      const source = makePolygonArtifact();
      const overlay = makePolygonArtifact();

      await expect(
        executeTopologyOperation({
          operationId: 'unknown-op' as any,
          sourceArtifact: source,
          secondaryArtifact: overlay,
          executeTopology: vi.fn(),
        }),
      ).rejects.toThrow('Missing topology operation definition');
    });

    it('T11: validates geometry type - rejects non-polygon source', async () => {
      const source = makePolygonArtifact({ id: 'source', name: 'points', geometryType: 'Point' });
      const overlay = makePolygonArtifact({ id: 'overlay', name: 'zones' });

      const result = await executeTopologyOperation({
        operationId: 'intersect-v1',
        sourceArtifact: source,
        secondaryArtifact: overlay,
        executeTopology: vi.fn(),
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain('geometry type');
      expect(result.error).toContain('Point');
    });

    it('T12: history event contains correct input/output artifact IDs', async () => {
      const source = makePolygonArtifact({ id: 'src-123', name: 'parcels' });
      const overlay = makePolygonArtifact({ id: 'ovr-456', name: 'zones' });

      const mockResult: GeometryOperationResult = {
        success: true,
        output: {
          type: 'FeatureCollection',
          features: [makePolygonFeature('out', [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])],
        },
        outputCrs: 'EPSG:3857',
        warnings: [],
        errors: [],
      };

      const result = await executeTopologyOperation({
        operationId: 'intersect-v1',
        sourceArtifact: source,
        secondaryArtifact: overlay,
        executeTopology: vi.fn(() => Promise.resolve(mockResult)),
      });

      expect(result.historyEvent?.inputArtifactIds).toContain('src-123');
      expect(result.historyEvent?.inputArtifactIds).toContain('ovr-456');
      expect(result.historyEvent?.outputArtifactIds).toHaveLength(1);
      expect(result.artifact?.inputArtifactIds).toContain('src-123');
      expect(result.artifact?.inputArtifactIds).toContain('ovr-456');
    });
  });
});
