/**
 * Tests for crs-policy.ts — CRS validation, state detection, and policy enforcement.
 *
 * Covers:
 *   - getArtifactCrsState detection (known/unknown/missing)
 *   - validateOperationCrsPolicy with various contract requirements
 *   - CRS mismatch detection for two-input operations
 *   - validateOperationDefinitionCrsContract structural validation
 *   - Explicit CRS override handling
 */
import { describe, it, expect } from 'vitest';
import {
  getArtifactCrsState,
  validateOperationCrsPolicy,
  validateOperationDefinitionCrsContract,
} from '../crs-policy';
import type { Artifact } from '../../../types';
import type { OperationDefinition } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: overrides.id ?? 'art-1',
    name: overrides.name ?? 'parcels',
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: 1,
    warnings: [],
    originEventId: 'e0',
    ...overrides,
  };
}

function makeDefinition(overrides: Partial<OperationDefinition> = {}): OperationDefinition {
  return {
    id: overrides.id ?? 'test-op',
    label: overrides.label ?? 'Test Operation',
    family: overrides.family ?? 'single-geometry',
    supportTier: 'partial',
    geometryContract: {
      inputArity: 1,
      ...overrides.geometryContract,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
      ...overrides.crsContract,
    },
    outputContract: overrides.outputContract ?? { attributePolicy: 'none' },
    warningCodes: [],
    refusalCodes: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('getArtifactCrsState', () => {
  it('CP1: returns "known" when CRS is a valid EPSG string', () => {
    const artifact = makeArtifact({ crs: 'EPSG:3857' });
    expect(getArtifactCrsState(artifact)).toBe('known');
  });

  it('CP2: returns "unknown" when CRS is the literal string "unknown"', () => {
    const artifact = makeArtifact({ crs: 'unknown' });
    expect(getArtifactCrsState(artifact)).toBe('unknown');
  });

  it('CP3: returns "missing" when CRS is undefined', () => {
    const artifact = makeArtifact({});
    // No crs field set
    delete (artifact as any).crs;
    expect(getArtifactCrsState(artifact)).toBe('missing');
  });

  it('CP4: returns "known" for any non-"unknown" CRS string', () => {
    const artifact = makeArtifact({ crs: 'EPSG:4326' });
    expect(getArtifactCrsState(artifact)).toBe('known');
  });
});

describe('validateOperationCrsPolicy', () => {
  it('CP5: passes when source has known CRS and requirement is require-known', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'require-known',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });
    const source = makeArtifact({ crs: 'EPSG:3857' });

    const result = validateOperationCrsPolicy({ definition, sourceArtifact: source });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('CP6: fails when source CRS is unknown and requirement is require-known', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'require-known',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });
    const source = makeArtifact({ crs: 'unknown' });

    const result = validateOperationCrsPolicy({ definition, sourceArtifact: source });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('CRS_UNKNOWN');
    expect(result.errors[0].message).toContain('unknown');
  });

  it('CP7: fails when source CRS is missing and requirement is require-known', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'require-known',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });
    const source = makeArtifact({});
    delete (source as any).crs;

    const result = validateOperationCrsPolicy({ definition, sourceArtifact: source });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('CRS_MISSING');
  });

  it('CP8: passes for allow-any requirement regardless of CRS state', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'allow-any',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });
    const source = makeArtifact({ crs: 'unknown' });

    const result = validateOperationCrsPolicy({ definition, sourceArtifact: source });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('CP9: require-known-or-explicit passes when explicit CRS provided despite unknown stored', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'require-known-or-explicit',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });
    const source = makeArtifact({ crs: 'unknown' });

    const result = validateOperationCrsPolicy({
      definition,
      sourceArtifact: source,
      explicitSourceCrs: 'EPSG:3857',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('CP10: detects CRS mismatch for two-input operations with exactMatchRequirement', () => {
    const definition = makeDefinition({
      geometryContract: { inputArity: 2 },
      crsContract: {
        sourceRequirement: 'require-known',
        secondaryRequirement: 'require-known',
        exactMatchRequirement: 'source-secondary-known-match',
        transformPlanning: {
          executionRequirement: 'same-crs-only',
          futureEligibility: 'candidate-via-explicit-plan',
          outputCrsMode: 'inherit-source',
        },
      },
    });
    const source = makeArtifact({ id: 'src', name: 'parcels', crs: 'EPSG:3857' });
    const secondary = makeArtifact({ id: 'sec', name: 'zones', crs: 'EPSG:4326' });

    const result = validateOperationCrsPolicy({
      definition,
      sourceArtifact: source,
      secondaryArtifact: secondary,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CRS_MISMATCH')).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('CP11: returns transformPlanSummary from the plan', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'allow-any',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });
    const source = makeArtifact({ crs: 'EPSG:3857' });

    const result = validateOperationCrsPolicy({ definition, sourceArtifact: source });
    expect(result.transformPlanSummary).toBeDefined();
    expect(typeof result.transformPlanSummary).toBe('string');
  });
});

describe('validateOperationDefinitionCrsContract', () => {
  it('CP12: flags two-input operation missing secondaryRequirement', () => {
    const definition = makeDefinition({
      geometryContract: { inputArity: 2 },
      crsContract: {
        sourceRequirement: 'require-known',
        // No secondaryRequirement
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });

    const errors = validateOperationDefinitionCrsContract(definition);
    expect(errors).toContain(`${definition.id}: two-input operations must declare secondaryRequirement in crsContract`);
  });

  it('CP13: flags missing transformPlanning declaration', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'require-known',
        transformPlanning: undefined as any,
      },
    });

    const errors = validateOperationDefinitionCrsContract(definition);
    expect(errors.some((e) => e.includes('transformPlanning'))).toBe(true);
  });

  it('CP14: passes for a properly declared single-input contract', () => {
    const definition = makeDefinition({
      crsContract: {
        sourceRequirement: 'require-known',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });

    const errors = validateOperationDefinitionCrsContract(definition);
    expect(errors).toHaveLength(0);
  });

  it('CP15: flags source-secondary-known-match without both require-known', () => {
    const definition = makeDefinition({
      geometryContract: { inputArity: 2 },
      crsContract: {
        sourceRequirement: 'require-known',
        secondaryRequirement: 'allow-any',
        exactMatchRequirement: 'source-secondary-known-match',
        transformPlanning: {
          executionRequirement: 'none',
          futureEligibility: 'none',
          outputCrsMode: 'inherit-source',
        },
      },
    });

    const errors = validateOperationDefinitionCrsContract(definition);
    expect(errors.some((e) => e.includes('source-secondary-known-match requires both'))).toBe(true);
  });
});
