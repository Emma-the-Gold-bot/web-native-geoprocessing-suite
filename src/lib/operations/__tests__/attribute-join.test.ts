/**
 * Tests for attribute-join.ts — Left join with field prefixing.
 *
 * Covers:
 *   - Successful join by APN key
 *   - Field prefixing (right-fields-prefixed collision policy)
 *   - Missing join key errors
 *   - Empty result on no match (null fill)
 *   - Warning generation (LIMITED_SUPPORT_ENVELOPE)
 *   - Spatial artifact data preservation
 *   - Duplicate output field rejection
 *   - Empty field selection rejection
 *   - Row count and output structure verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAttributeJoinOperation, getJoinableFieldNames } from '../attribute-join';
import type { Artifact } from '../../../types';
import type { AttributeJoinExecutionContext, AttributeJoinFieldSelection } from '../types';

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

function makeSpatialFeatureCollectionArtifact(
  overrides: Partial<Artifact> & { features?: GeoJSON.Feature[] } = {},
): Artifact {
  const features = overrides.features ?? [
    {
      type: 'Feature',
      properties: { apn: '001-01', owner: 'Alice', zone: 'R1' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    },
    {
      type: 'Feature',
      properties: { apn: '001-02', owner: 'Bob', zone: 'R2' },
      geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] },
    },
  ];

  return {
    id: overrides.id ?? 'src-1',
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

function makeTabularArtifact(
  overrides: Partial<Artifact> & { rows?: Record<string, unknown>[] } = {},
): Artifact {
  const rows = overrides.rows ?? [
    { apn: '001-01', land_value: 500000, flood_zone: 'X' },
    { apn: '001-02', land_value: 750000, flood_zone: 'A' },
    { apn: '001-03', land_value: 300000, flood_zone: 'X' },
  ];

  return {
    id: overrides.id ?? 'tbl-1',
    name: overrides.name ?? 'assessments',
    kind: 'source',
    format: 'CSV',
    spatial: false,
    rowCount: rows.length,
    crs: overrides.crs ?? 'EPSG:3857',
    crsProvenance: {
      confidence: 'known',
      declaredCrs: overrides.crs ?? 'EPSG:3857',
      source: 'import-metadata',
      warnings: [],
    },
    warnings: [],
    originEventId: 'e1',
    tableName: overrides.tableName ?? 'assessments',
    data: rows,
    tableRows: rows,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('executeAttributeJoinOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AJ1: successful join by APN produces enriched rows', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [
        { sourceField: 'land_value', outputField: 'land_value' },
        { sourceField: 'flood_zone', outputField: 'flood_zone' },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.artifact).toBeDefined();
    expect(result.artifact?.kind).toBe('derived');
    expect(result.artifact?.spatial).toBe(true);

    const tableRows = result.artifact?.tableRows as Record<string, unknown>[];
    expect(tableRows).toHaveLength(2);
    expect(tableRows[0].land_value).toBe(500000);
    expect(tableRows[0].flood_zone).toBe('X');
    expect(tableRows[1].land_value).toBe(750000);
    expect(tableRows[1].flood_zone).toBe('A');
  });

  it('AJ2: no match produces null-fill for right-side fields', async () => {
    const source = makeSpatialFeatureCollectionArtifact({
      features: [
        {
          type: 'Feature',
          properties: { apn: '999-99', owner: 'Nobody' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        },
      ],
    });
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
    });

    expect(result.error).toBeUndefined();
    const tableRows = result.artifact?.tableRows as Record<string, unknown>[];
    expect(tableRows).toHaveLength(1);
    expect(tableRows[0].land_value).toBeNull();
  });

  it('AJ3: missing source key field returns error', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'nonexistent_key',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('nonexistent_key');
    expect(result.error).toContain('does not exist');
  });

  it('AJ4: missing secondary key field returns error', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'wrong_key',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('wrong_key');
  });

  it('AJ5: empty field selection returns error', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [],
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('at least one');
  });

  it('AJ6: nonexistent right-side field returns error', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'does_not_exist', outputField: 'does_not_exist' }],
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  it('AJ7: duplicate output field names return error', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [
        { sourceField: 'land_value', outputField: 'value' },
        { sourceField: 'flood_zone', outputField: 'value' },
      ],
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('more than once');
  });

  it('AJ8: field prefixing allows renaming to avoid collision', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    // 'owner' already exists on left; output as 'right_owner' to avoid collision
    const sourceWithOverwrite = makeSpatialFeatureCollectionArtifact({
      features: [
        {
          type: 'Feature',
          properties: { apn: '001-01', owner: 'Alice' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        },
      ],
    });
    const joinTableWithOwner = makeTabularArtifact({
      rows: [{ apn: '001-01', owner: 'Alice Trust' }],
    });

    const result = await executeAttributeJoinOperation({
      sourceArtifact: sourceWithOverwrite,
      secondaryArtifact: joinTableWithOwner,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'owner', outputField: 'join_owner' }],
    });

    expect(result.error).toBeUndefined();
    const tableRows = result.artifact?.tableRows as Record<string, unknown>[];
    expect(tableRows[0].owner).toBe('Alice'); // left preserved
    expect(tableRows[0].join_owner).toBe('Alice Trust'); // right prefixed
  });

  it('AJ9: output CRS inherits from source artifact', async () => {
    const source = makeSpatialFeatureCollectionArtifact({ crs: 'EPSG:32610' });
    const joinTable = makeTabularArtifact({ crs: 'EPSG:32610' });

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
    });

    expect(result.artifact?.crs).toBe('EPSG:32610');
    expect(result.artifact?.crsProvenance?.source).toBe('operation-inherited');
  });

  it('AJ10: spatial data is preserved with enriched properties', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
    });

    const data = result.artifact?.data as GeoJSON.FeatureCollection;
    expect(data.type).toBe('FeatureCollection');
    expect(data.features).toHaveLength(2);
    expect(data.features[0].geometry).toBeDefined();
    expect((data.features[0].properties as any).land_value).toBe(500000);
  });

  it('AJ11: output warnings include LIMITED_SUPPORT_ENVELOPE', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
    });

    expect(result.artifact?.warnings.some((w) => w.code === 'LIMITED_SUPPORT_ENVELOPE')).toBe(true);
  });

  it('AJ12: history event records join semantics', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
    });

    const details = result.historyEvent?.details;
    expect(details?.joinMode).toBe('left');
    expect(details?.joinPredicate).toBe('exact-equality');
    expect(details?.collisionPolicy).toBe('right-fields-prefixed');
    expect(details?.sourceJoinKey).toBe('apn');
    expect(details?.outputRowCount).toBe(2);
  });

  it('AJ13: custom outputName is respected', async () => {
    const source = makeSpatialFeatureCollectionArtifact();
    const joinTable = makeTabularArtifact();

    const result = await executeAttributeJoinOperation({
      sourceArtifact: source,
      secondaryArtifact: joinTable,
      sourceKey: 'apn',
      secondaryKey: 'apn',
      selectedFields: [{ sourceField: 'land_value', outputField: 'land_value' }],
      outputName: 'my_joined_output',
    });

    expect(result.artifact?.name).toBe('my_joined_output');
  });
});

describe('getJoinableFieldNames', () => {
  it('AJ14: returns fields from tabular data', () => {
    const artifact = makeTabularArtifact();
    const fields = getJoinableFieldNames(artifact);
    expect(fields).toContain('apn');
    expect(fields).toContain('land_value');
    expect(fields).toContain('flood_zone');
  });

  it('AJ15: returns fields from spatial feature collection properties', () => {
    const artifact = makeSpatialFeatureCollectionArtifact();
    const fields = getJoinableFieldNames(artifact);
    expect(fields).toContain('apn');
    expect(fields).toContain('owner');
    expect(fields).toContain('zone');
  });
});
