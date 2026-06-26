/**
 * Tests for registry.ts — Operation registry, lookup, intent metadata, and family dispatch.
 */
import { describe, it, expect } from 'vitest';
import { OPERATION_REGISTRY, getOperationDefinition } from '../registry';
import { OPERATION_INTENT_MAP } from '../intent-data';
import { findOperationsByTrigger } from '../chain-registry';
import type { OperationDefinition, OperationFamily } from '../types';

// ─── All registered operation IDs ──────────────────────────────────

const ALL_OPERATION_IDS = Object.keys(OPERATION_REGISTRY);

const EXPECTED_OPERATIONS = [
  'buffer',
  'centroid',
  'convex-hull-v1',
  'envelope-v1',
  'simplify-v1',
  'dissolve-grouped-v1',
  'reproject',
  'clip-v1',
  'intersect-v1',
  'attribute-join-v1',
  'area-v1',
  'perimeter-v1',
  'compactness-v1',
  'dissolve-global',
  'crs-assign',
];

// ─── 1. Registration ───────────────────────────────────────────────

describe('operation registration', () => {
  it('registers all 15 expected operations', () => {
    expect(ALL_OPERATION_IDS).toHaveLength(15);
    for (const id of EXPECTED_OPERATIONS) {
      expect(ALL_OPERATION_IDS).toContain(id);
    }
  });

  it('every entry has a non-empty id that matches its registry key', () => {
    for (const [key, def] of Object.entries(OPERATION_REGISTRY)) {
      expect(def.id).toBe(key);
      expect(def.id.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty label', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      expect(def.label).toBeTruthy();
      expect(typeof def.label).toBe('string');
    }
  });
});

// ─── 2. Lookup by ID ───────────────────────────────────────────────

describe('lookup by ID', () => {
  it('getOperationDefinition returns the correct definition for known IDs', () => {
    for (const id of EXPECTED_OPERATIONS) {
      const def = getOperationDefinition(id);
      expect(def).toBeDefined();
      expect(def!.id).toBe(id);
    }
  });

  it('getOperationDefinition returns undefined for unknown ID', () => {
    expect(getOperationDefinition('nonexistent-operation')).toBeUndefined();
    expect(getOperationDefinition('')).toBeUndefined();
  });

  it('OPERATION_REGISTRY entries match getOperationDefinition results', () => {
    for (const [key, def] of Object.entries(OPERATION_REGISTRY)) {
      expect(getOperationDefinition(key)).toBe(def);
    }
  });
});

// ─── 3. Family-based dispatch routing ──────────────────────────────

describe('family-based dispatch routing', () => {
  const EXPECTED_FAMILIES: OperationFamily[] = [
    'single-geometry',
    'topology-two-input',
    'crs',
    'measurement',
    'aggregation',
  ];

  it('every operation has a valid family', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      expect(EXPECTED_FAMILIES).toContain(def.family);
    }
  });

  it('groups operations by family correctly', () => {
    const byFamily: Record<string, string[]> = {};
    for (const def of Object.values(OPERATION_REGISTRY)) {
      if (!byFamily[def.family]) byFamily[def.family] = [];
      byFamily[def.family].push(def.id);
    }

    expect(byFamily['single-geometry']).toEqual(
      expect.arrayContaining(['buffer', 'centroid', 'convex-hull-v1', 'envelope-v1', 'simplify-v1']),
    );
    expect(byFamily['topology-two-input']).toEqual(
      expect.arrayContaining(['clip-v1', 'intersect-v1', 'attribute-join-v1']),
    );
    expect(byFamily['crs']).toEqual(
      expect.arrayContaining(['reproject', 'crs-assign']),
    );
    expect(byFamily['measurement']).toEqual(
      expect.arrayContaining(['area-v1', 'perimeter-v1', 'compactness-v1']),
    );
    expect(byFamily['aggregation']).toEqual(
      expect.arrayContaining(['dissolve-grouped-v1', 'dissolve-global']),
    );
  });

  it('input arity matches family expectations', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      if (def.family === 'topology-two-input') {
        expect(def.geometryContract.inputArity).toBe(2);
      } else {
        expect(def.geometryContract.inputArity).toBe(1);
      }
    }
  });
});

// ─── 4. Intent metadata structure ──────────────────────────────────

describe('intent metadata structure', () => {
  it('every operation in the registry has an intent attached', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      expect(def.intent).toBeDefined();
      expect(def.intent!.triggers).toBeDefined();
      expect(def.intent!.triggers.length).toBeGreaterThan(0);
      expect(def.intent!.description).toBeTruthy();
      expect(def.intent!.parameters).toBeDefined();
      expect(def.intent!.parameters.length).toBeGreaterThan(0);
      expect(def.intent!.typical_use).toBeTruthy();
      expect(def.intent!.examples).toBeDefined();
      expect(def.intent!.examples.length).toBeGreaterThan(0);
    }
  });

  it('intent references from registry match OPERATION_INTENT_MAP entries', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      const mapped = OPERATION_INTENT_MAP[def.id];
      expect(mapped).toBeDefined();
      expect(def.intent).toBe(mapped);
    }
  });

  it('every intent parameter has required fields', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      for (const param of def.intent!.parameters) {
        expect(param.name).toBeTruthy();
        expect(['artifact', 'number', 'string', 'field', 'crs']).toContain(param.type);
        expect(typeof param.required).toBe('boolean');
        expect(param.description).toBeTruthy();
      }
    }
  });

  it('every intent example has query and resolution', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      for (const example of def.intent!.examples) {
        expect(example.query).toBeTruthy();
        expect(example.resolution).toBeTruthy();
      }
    }
  });
});

// ─── 5. Lookup by trigger ──────────────────────────────────────────

describe('lookup by trigger', () => {
  it('findOperationsByTrigger finds buffer for "buffer the rivers"', () => {
    const results = findOperationsByTrigger('buffer the rivers', OPERATION_INTENT_MAP);
    const ids = results.map(r => r.id);
    expect(ids).toContain('buffer');
  });

  it('findOperationsByTrigger finds clip-v1 for "clip to boundary"', () => {
    const results = findOperationsByTrigger('clip to the project boundary', OPERATION_INTENT_MAP);
    const ids = results.map(r => r.id);
    expect(ids).toContain('clip-v1');
  });

  it('findOperationsByTrigger finds area-v1 for "how big is each parcel"', () => {
    const results = findOperationsByTrigger('how big is each parcel', OPERATION_INTENT_MAP);
    const ids = results.map(r => r.id);
    expect(ids).toContain('area-v1');
  });

  it('findOperationsByTrigger scores longer triggers higher', () => {
    const results = findOperationsByTrigger('dissolve by owner name', OPERATION_INTENT_MAP);
    // "dissolve by" (10 chars) is more specific than partial matches
    const dissolveGrouped = results.find(r => r.id === 'dissolve-grouped-v1');
    expect(dissolveGrouped).toBeDefined();
    expect(dissolveGrouped!.score).toBeGreaterThanOrEqual('dissolve by'.length);
  });

  it('findOperationsByTrigger returns empty for unrelated queries', () => {
    const results = findOperationsByTrigger('send an email', OPERATION_INTENT_MAP);
    expect(results).toHaveLength(0);
  });
});

// ─── 6. Specific operation metadata ────────────────────────────────

describe('specific operation metadata', () => {
  it('buffer has correct support tier and contracts', () => {
    const buf = getOperationDefinition('buffer');
    expect(buf).toBeDefined();
    expect(buf!.family).toBe('single-geometry');
    expect(buf!.supportTier).toBe('validated_local');
    expect(buf!.geometryContract.inputArity).toBe(1);
    expect(buf!.crsContract.sourceRequirement).toBe('allow-any');
    expect(buf!.outputContract.attributePolicy).toBe('none');
  });

  it('clip-v1 requires two polygon inputs with known matching CRS', () => {
    const clip = getOperationDefinition('clip-v1');
    expect(clip).toBeDefined();
    expect(clip!.geometryContract.inputArity).toBe(2);
    expect(clip!.geometryContract.allowedSourceGeometry).toEqual(['Polygon', 'MultiPolygon']);
    expect(clip!.geometryContract.allowedSecondaryGeometry).toEqual(['Polygon', 'MultiPolygon']);
    expect(clip!.crsContract.exactMatchRequirement).toBe('source-secondary-known-match');
    expect(clip!.uiHints?.secondaryRoleLabel).toBe('mask');
  });

  it('area-v1 has measurement contract with area kind', () => {
    const area = getOperationDefinition('area-v1');
    expect(area).toBeDefined();
    expect(area!.family).toBe('measurement');
    expect(area!.measurementContract).toBeDefined();
    expect(area!.measurementContract!.measurementKind).toBe('area');
    expect(area!.measurementContract!.areaUnit).toBe('square-meters');
    expect(area!.measurementContract!.preservesSourceRows).toBe(true);
  });

  it('reproject has explicit transform planning', () => {
    const reproject = getOperationDefinition('reproject');
    expect(reproject).toBeDefined();
    expect(reproject!.family).toBe('crs');
    expect(reproject!.runtimeSensitive).toBe(true);
    expect(reproject!.crsContract.transformPlanning.executionRequirement).toBe('explicit-transform');
    expect(reproject!.crsContract.transformPlanning.outputCrsMode).toBe('explicit-target');
  });

  it('attribute-join-v1 has join contract with left join mode', () => {
    const join = getOperationDefinition('attribute-join-v1');
    expect(join).toBeDefined();
    expect(join!.joinContract).toBeDefined();
    expect(join!.joinContract!.joinMode).toBe('left');
    expect(join!.joinContract!.predicate).toBe('exact-equality');
    expect(join!.joinContract!.supportsSpatialPredicates).toBe(false);
    expect(join!.outputContract.attributePolicy).toBe('explicit-right-fields-left-join-equality');
  });

  it('dissolve-grouped-v1 has aggregation contract with grouping', () => {
    const dg = getOperationDefinition('dissolve-grouped-v1');
    expect(dg).toBeDefined();
    expect(dg!.family).toBe('aggregation');
    expect(dg!.aggregationContract).toBeDefined();
    expect(dg!.aggregationContract!.scope).toBe('grouped-by-attribute');
    expect(dg!.aggregationContract!.groupingFieldMode).toBe('required-attribute');
  });

  it('crs-assign has universal support tier and no runtime sensitivity', () => {
    const crsAssign = getOperationDefinition('crs-assign');
    expect(crsAssign).toBeDefined();
    expect(crsAssign!.supportTier).toBe('universal');
    expect(crsAssign!.runtimeSensitive).toBe(false);
    expect(crsAssign!.refusalCodes).toHaveLength(0);
  });
});

// ─── 7. Warning and refusal codes ──────────────────────────────────

describe('warning and refusal codes', () => {
  it('every operation has warningCodes and refusalCodes arrays', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      expect(Array.isArray(def.warningCodes)).toBe(true);
      expect(Array.isArray(def.refusalCodes)).toBe(true);
    }
  });

  it('all partial-support operations include LIMITED_SUPPORT_ENVELOPE warning', () => {
    for (const def of Object.values(OPERATION_REGISTRY)) {
      if (def.supportTier === 'partial') {
        expect(def.warningCodes).toContain('LIMITED_SUPPORT_ENVELOPE');
      }
    }
  });
});
