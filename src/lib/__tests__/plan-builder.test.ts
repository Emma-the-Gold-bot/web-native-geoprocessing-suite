/**
 * Tests for plan-builder.ts — Slice 7: Chain condition handling.
 *
 * Covers:
 *   A. evaluateCondition behaviour (7 tests via buildPlan)
 *   B. Chain step skipping via buildPlan (4 tests)
 *   C. buildPlan end-to-end (7 tests)
 *   D. evaluateCondition direct unit tests (5 tests — added after exporting helper)
 */
import { describe, it, expect } from 'vitest';
import { buildPlan, evaluateCondition, type ExecutionPlan } from '../nl/plan-builder';
import type { ResolutionCandidate } from '../nl/query-resolver';
import type { Artifact } from '../../types';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeSpatialArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: overrides.id ?? 'art-1',
    name: overrides.name ?? 'parcels',
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: 1,
    crs: 'EPSG:4326',
    warnings: [],
    originEventId: 'e1',
    tableName: 'parcels',
    data: { type: 'FeatureCollection', features: [] },
    ...overrides,
  };
}

const parcelsArtifact = makeSpatialArtifact({
  id: 'parcels-1',
  name: 'parcels',
  tableName: 'parcels',
});

const boundariesArtifact = makeSpatialArtifact({
  id: 'boundaries-1',
  name: 'boundaries',
  tableName: 'boundaries',
});

const enrichmentArtifact: Artifact = {
  id: 'enrichment-1',
  name: 'enrichment',
  kind: 'source',
  format: 'CSV',
  spatial: false,
  rowCount: 10,
  warnings: [],
  originEventId: 'e2',
  tableName: 'enrichment',
  data: [],
};

/** Minimal ResolutionCandidate for the conflict-detection chain. */
function conflictCandidate(
  params: Record<string, any> = {},
): ResolutionCandidate {
  return {
    type: 'chain',
    id: 'conflict-detection',
    label: 'Conflict detection',
    description: 'Find where two layers overlap and enrich with attributes from both.',
    parameters: params,
    confidence: 0.9,
    source: 'trigger-match',
  };
}

/** Minimal ResolutionCandidate for the prepare-for-analysis chain. */
function prepareCandidate(
  params: Record<string, any> = {},
): ResolutionCandidate {
  return {
    type: 'chain',
    id: 'prepare-for-analysis',
    label: 'Prepare for analysis',
    description: 'Reproject a layer to a projected CRS, then simplify for performance.',
    parameters: params,
    confidence: 0.85,
    source: 'trigger-match',
  };
}

// ─── A. Condition evaluation (tested through buildPlan) ──────────────
//
// evaluateCondition is not exported, so we test its behaviour indirectly.
// The conflict-detection chain has step 1 (attribute-join) gated by
//   condition: { kind: 'param-provided', paramName: 'enrichment' }
// The prepare-for-analysis chain has step 1 (simplify) gated by
//   condition: { kind: 'param-provided', paramName: 'tolerance' }

describe('condition evaluation via buildPlan', () => {
  it('A1: no condition → step always included (conflict-detection step 0)', () => {
    // Step 0 (intersect) has no condition — it should always be present.
    const plan = buildPlan(
      conflictCandidate({ source: 'parcels', overlay: 'boundaries' }),
      [parcelsArtifact, boundariesArtifact],
    );
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
    expect(plan.steps[0].operationId).toBe('intersect-v1');
  });

  it('A2: condition satisfied → step included (enrichment provided)', () => {
    // When enrichment IS provided, the attribute-join step should be included.
    const plan = buildPlan(
      conflictCandidate({
        source: 'parcels',
        overlay: 'boundaries',
        enrichment: 'enrichment',
        source_key: 'apn',
        enrichment_key: 'apn',
      }),
      [parcelsArtifact, boundariesArtifact, enrichmentArtifact],
    );
    // Should have 2 steps: intersect + attribute-join
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1].operationId).toBe('attribute-join-v1');
  });

  it('A3: condition not satisfied → step skipped (enrichment missing)', () => {
    // When enrichment is NOT provided, the attribute-join step should be SKIPPED.
    const plan = buildPlan(
      conflictCandidate({ source: 'parcels', overlay: 'boundaries' }),
      [parcelsArtifact, boundariesArtifact],
    );
    // Contract: only 1 step (intersect). Step 1 should be skipped.
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].operationId).toBe('intersect-v1');
  });

  it('A4: condition not satisfied → step skipped (tolerance not provided)', () => {
    // prepare-for-analysis without tolerance → simplify step should be skipped.
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857' }),
      [parcelsArtifact],
    );
    // Contract: only 1 step (reproject). Simplify should be skipped.
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].operationId).toBe('reproject');
  });

  it('A5: condition satisfied → step included (tolerance provided)', () => {
    // prepare-for-analysis WITH tolerance → simplify step should be included.
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857', tolerance: 0.5 }),
      [parcelsArtifact],
    );
    // Should have 2 steps: reproject + simplify
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1].operationId).toBe('simplify-v1');
  });

  it('A6: param explicitly undefined → condition not satisfied (tolerance: undefined)', () => {
    // evaluateCondition should treat undefined as "not provided".
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857', tolerance: undefined }),
      [parcelsArtifact],
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].operationId).toBe('reproject');
  });

  it('A7: param explicitly null → condition not satisfied (tolerance: null)', () => {
    // evaluateCondition should treat null as "not provided".
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857', tolerance: null }),
      [parcelsArtifact],
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].operationId).toBe('reproject');
  });
});

// ─── B. Chain step skipping (via buildPlan) ──────────────────────────

describe('chain step skipping', () => {
  it('B1: conflict-detection without enrichment → 1 step (no join)', () => {
    const plan = buildPlan(
      conflictCandidate({ source: 'parcels', overlay: 'boundaries' }),
      [parcelsArtifact, boundariesArtifact],
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].operationId).toBe('intersect-v1');
  });

  it('B2: conflict-detection with enrichment → 2 steps (intersect + join)', () => {
    const plan = buildPlan(
      conflictCandidate({
        source: 'parcels',
        overlay: 'boundaries',
        enrichment: 'enrichment',
        source_key: 'apn',
        enrichment_key: 'apn',
      }),
      [parcelsArtifact, boundariesArtifact, enrichmentArtifact],
    );
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].operationId).toBe('intersect-v1');
    expect(plan.steps[1].operationId).toBe('attribute-join-v1');
  });

  it('B3: prepare-for-analysis without tolerance → 1 step (no simplify)', () => {
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857' }),
      [parcelsArtifact],
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].operationId).toBe('reproject');
  });

  it('B4: prepare-for-analysis with tolerance → 2 steps (reproject + simplify)', () => {
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857', tolerance: 0.5 }),
      [parcelsArtifact],
    );
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].operationId).toBe('reproject');
    expect(plan.steps[1].operationId).toBe('simplify-v1');
  });
});

// ─── C. buildPlan end-to-end ─────────────────────────────────────────

describe('buildPlan end-to-end', () => {
  it('C1: conflict-detection with source + overlay → 1-step plan, canExecute true', () => {
    const plan = buildPlan(
      conflictCandidate({ source: 'parcels', overlay: 'boundaries' }),
      [parcelsArtifact, boundariesArtifact],
    );
    expect(plan.source).toBe('chain');
    expect(plan.sourceId).toBe('conflict-detection');
    expect(plan.steps).toHaveLength(1);
    expect(plan.canExecute).toBe(true);
    expect(plan.confidence).toBe(0.9);
    expect(plan.steps[0].refusal).toBeUndefined();
  });

  it('C2: conflict-detection missing overlay artifact → plan with refusal', () => {
    // Only parcels provided — overlay is required but missing from artifacts.
    const plan = buildPlan(
      conflictCandidate({ source: 'parcels', overlay: 'boundaries' }),
      [parcelsArtifact],
    );
    // The step should have a refusal because 'boundaries' can't be resolved.
    expect(plan.canExecute).toBe(false);
    expect(plan.steps[0].refusal).toBeDefined();
  });

  it('C3: prepare-for-analysis without tolerance → 1-step plan, canExecute true', () => {
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857' }),
      [parcelsArtifact],
    );
    expect(plan.source).toBe('chain');
    expect(plan.sourceId).toBe('prepare-for-analysis');
    expect(plan.steps).toHaveLength(1);
    expect(plan.canExecute).toBe(true);
    expect(plan.steps[0].operationId).toBe('reproject');
  });

  it('C4: unknown chain id → canExecute false', () => {
    const plan = buildPlan(
      {
        type: 'chain',
        id: 'nonexistent-chain',
        label: 'Nope',
        description: 'Does not exist',
        parameters: {},
        confidence: 0.1,
        source: 'fallback',
      },
      [],
    );
    expect(plan.canExecute).toBe(false);
    expect(plan.steps).toHaveLength(0);
  });

  it('C5: conflict-detection plan has correct metadata', () => {
    const plan = buildPlan(
      conflictCandidate({ source: 'parcels', overlay: 'boundaries' }),
      [parcelsArtifact, boundariesArtifact],
    );
    expect(plan.id).toMatch(/^plan_/);
    expect(plan.description).toContain('overlap');
    expect(plan.source).toBe('chain');
    expect(plan.sourceId).toBe('conflict-detection');
  });

  it('C6: skipped step appends note to plan description', () => {
    // When a conditional step is skipped, description should note it.
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857' }),
      [parcelsArtifact],
    );
    expect(plan.description).toContain('skipped');
    expect(plan.description).toContain('simplify');
  });

  it('C7: description has no skipped note when all steps run', () => {
    // When tolerance IS provided, no step is skipped — no suffix.
    const plan = buildPlan(
      prepareCandidate({ source: 'parcels', target_crs: 'EPSG:3857', tolerance: 1.0 }),
      [parcelsArtifact],
    );
    expect(plan.description).not.toContain('skipped');
  });
});

// ─── Section D: evaluateCondition direct unit tests ───────────────────

describe('evaluateCondition (direct)', () => {
  it('D1: undefined condition → true (no gating)', () => {
    expect(evaluateCondition(undefined, {})).toBe(true);
  });

  it('D2: param-provided, param present → true', () => {
    expect(
      evaluateCondition({ kind: 'param-provided', paramName: 'tolerance' }, { tolerance: 0.5 }),
    ).toBe(true);
  });

  it('D3: param-provided, param missing → false', () => {
    expect(
      evaluateCondition({ kind: 'param-provided', paramName: 'tolerance' }, {}),
    ).toBe(false);
  });

  it('D4: param-provided, param explicitly undefined → false', () => {
    expect(
      evaluateCondition(
        { kind: 'param-provided', paramName: 'tolerance' },
        { tolerance: undefined },
      ),
    ).toBe(false);
  });

  it('D5: param-provided, param explicitly null → false', () => {
    expect(
      evaluateCondition(
        { kind: 'param-provided', paramName: 'tolerance' },
        { tolerance: null },
      ),
    ).toBe(false);
  });
});
