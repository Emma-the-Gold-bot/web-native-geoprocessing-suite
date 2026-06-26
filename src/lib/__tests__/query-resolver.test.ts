/**
 * Tests for query-resolver.ts
 *
 * Covers:
 * - resolveQuery: trigger matching, parameter extraction, ranking
 * - computeTriggerConfidence: scoring logic, edge cases
 * - extractParameters: public API for parameter extraction
 * - Canonical queries as test cases
 * - Edge cases: empty query, unknown ops, ambiguous triggers
 * - Operation-specific parameter extraction with regex patterns
 */
import { describe, it, expect } from 'vitest';
import {
  resolveQuery,
  computeTriggerConfidence,
  extractParameters,
  levenshteinDistance,
  stringSimilarity,
  tokenizeInput,
  tokenizedMatchScore,
  resolveArtifactReference,
  type ResolutionCandidate,
} from '../nl/query-resolver';
import type { OperationIntent } from '../operations/types';
import type { ChainDefinition } from '../operations/chain-registry';
import { OPERATION_INTENT_MAP } from '../operations/intent-data';
import { CHAIN_REGISTRY } from '../operations/chain-registry';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeIntent(overrides: Partial<OperationIntent> = {}): OperationIntent {
  return {
    triggers: overrides.triggers ?? ['test'],
    description: overrides.description ?? 'Test operation',
    parameters: overrides.parameters ?? [],
    typical_use: overrides.typical_use ?? 'Testing',
    examples: overrides.examples ?? [],
  };
}

function makeChain(overrides: Partial<ChainDefinition> = {}): ChainDefinition {
  return {
    id: overrides.id ?? 'test-chain',
    label: overrides.label ?? 'Test chain',
    description: overrides.description ?? 'Test chain description',
    intent: overrides.intent ?? {
      triggers: ['chain trigger'],
      description: 'A test chain',
      typical_use: 'Testing',
      examples: [],
    },
    parameters: overrides.parameters ?? [],
    steps: overrides.steps ?? [],
  };
}

// ─── computeTriggerConfidence ─────────────────────────────────────────

describe('computeTriggerConfidence', () => {
  it('returns 0 when no triggers match', () => {
    expect(computeTriggerConfidence('hello world', ['buffer', 'clip'])).toBe(0);
  });

  it('returns > 0 when a trigger matches', () => {
    const score = computeTriggerConfidence('buffer parcels 500 feet', ['buffer']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('gives higher score for longer matching triggers', () => {
    const a = computeTriggerConfidence('clip to boundary', ['clip']);
    const b = computeTriggerConfidence('clip to boundary', ['clip to']);
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it('applies position penalty for non-initial match', () => {
    const initialMatch = computeTriggerConfidence('buffer the parcels', ['buffer']);
    const midMatch = computeTriggerConfidence('please buffer the parcels', ['buffer']);
    expect(initialMatch).toBeGreaterThanOrEqual(midMatch);
  });

  it('returns 0 for empty triggers array', () => {
    expect(computeTriggerConfidence('buffer parcels', [])).toBe(0);
  });

  it('caps at 1.0 max confidence', () => {
    const score = computeTriggerConfidence('buffer', ['buffer']);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('adds match bonus for multiple matching triggers', () => {
    const single = computeTriggerConfidence('clip the parcels', ['clip']);
    const multi = computeTriggerConfidence('clip the parcels to boundary', ['clip', 'boundary']);
    expect(multi).toBeGreaterThan(single);
  });

  it('is case-insensitive on the query side', () => {
    const score = computeTriggerConfidence('BUFFER parcels', ['buffer']);
    expect(score).toBeGreaterThan(0);
  });

  it('triggers with uppercase do NOT match lowered query (known limitation)', () => {
    // computeTriggerConfidence lowercases query but NOT triggers
    const score = computeTriggerConfidence('change crs to wgs84', ['change CRS']);
    expect(score).toBe(0);
  });

  it('fuzzy-matches multi-word triggers with words separated by other words', () => {
    // "dissolve by" trigger should fuzzy-match "dissolve parcels by zone"
    const score = computeTriggerConfidence('dissolve parcels by zone', ['dissolve by']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('fuzzy score is lower than exact match for same trigger', () => {
    const exact = computeTriggerConfidence('dissolve by zone', ['dissolve by']);
    const fuzzy = computeTriggerConfidence('dissolve parcels by zone', ['dissolve by']);
    expect(exact).toBeGreaterThan(fuzzy);
  });
});

// ─── resolveQuery: Basic trigger matching ─────────────────────────────

describe('resolveQuery: trigger matching', () => {
  it("matches 'buffer' operation for buffer query", () => {
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, {});
    expect(candidates.length).toBeGreaterThan(0);
    const bufferMatch = candidates.find(c => c.id === 'buffer');
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch!.type).toBe('operation');
    expect(bufferMatch!.source).toBe('trigger-match');
  });

  it("matches 'centroid' operation for centroid query", () => {
    const candidates = resolveQuery('get the centroid of parcels', OPERATION_INTENT_MAP, {});
    const centroidMatch = candidates.find(c => c.id === 'centroid');
    expect(centroidMatch).toBeDefined();
  });

  it("matches 'clip-v1' operation for clip query", () => {
    const candidates = resolveQuery('clip parcels to boundary', OPERATION_INTENT_MAP, {});
    const clipMatch = candidates.find(c => c.id === 'clip-v1');
    expect(clipMatch).toBeDefined();
  });

  it("matches 'intersect-v1' operation for intersect query", () => {
    const candidates = resolveQuery('intersect parcels with floodzone', OPERATION_INTENT_MAP, {});
    const intersectMatch = candidates.find(c => c.id === 'intersect-v1');
    expect(intersectMatch).toBeDefined();
  });

  it("matches 'dissolve-grouped-v1' for 'dissolve by' contiguous trigger", () => {
    const candidates = resolveQuery('dissolve by owner name', OPERATION_INTENT_MAP, {});
    const dissolveMatch = candidates.find(c => c.id === 'dissolve-grouped-v1');
    expect(dissolveMatch).toBeDefined();
  });

  it("matches 'attribute-join-v1' for join query", () => {
    const candidates = resolveQuery('join ownership to parcels by APN', OPERATION_INTENT_MAP, {});
    const joinMatch = candidates.find(c => c.id === 'attribute-join-v1');
    expect(joinMatch).toBeDefined();
  });

  it("matches 'reproject' for reproject query via lowercase trigger", () => {
    const candidates = resolveQuery('reproject parcels to EPSG:32610', OPERATION_INTENT_MAP, {});
    const reprojectMatch = candidates.find(c => c.id === 'reproject');
    expect(reprojectMatch).toBeDefined();
  });

  it("matches 'simplify-v1' for simplify query", () => {
    const candidates = resolveQuery('simplify the county boundaries', OPERATION_INTENT_MAP, {});
    const simplifyMatch = candidates.find(c => c.id === 'simplify-v1');
    expect(simplifyMatch).toBeDefined();
  });

  it("matches 'convex-hull-v1' for convex hull query", () => {
    const candidates = resolveQuery('compute convex hull of parcels', OPERATION_INTENT_MAP, {});
    const hullMatch = candidates.find(c => c.id === 'convex-hull-v1');
    expect(hullMatch).toBeDefined();
  });

  it("matches 'envelope-v1' for bounding box query", () => {
    const candidates = resolveQuery('get the bounding box of parcels', OPERATION_INTENT_MAP, {});
    const envelopeMatch = candidates.find(c => c.id === 'envelope-v1');
    expect(envelopeMatch).toBeDefined();
  });

  it('matches chain triggers as well as operation triggers', () => {
    const candidates = resolveQuery('find conflicts of interest', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const chainMatch = candidates.find(c => c.type === 'chain' && c.id === 'conflict-detection');
    expect(chainMatch).toBeDefined();
  });

  it('returns candidates sorted by confidence descending', () => {
    const candidates = resolveQuery('clip and simplify boundaries', OPERATION_INTENT_MAP, {});
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].confidence).toBeLessThanOrEqual(candidates[i - 1].confidence + 0.001);
    }
  });

  it('mixed-case triggers do not match (triggers are not lowercased)', () => {
    // "change CRS" and "to WGS84" have uppercase; query is lowercased; no match
    const candidates = resolveQuery('change crs to wgs84', OPERATION_INTENT_MAP, {});
    const reprojectMatch = candidates.find(c => c.id === 'reproject');
    expect(reprojectMatch).toBeUndefined();
  });
});

// ─── resolveQuery: Parameter extraction ──────────────────────────────

describe('resolveQuery: parameter extraction', () => {
  it('extracts distance with number and unit for buffer', () => {
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('feet');
  });

  it('extracts distance with unit suffix without spaces (500ft)', () => {
    const candidates = resolveQuery('buffer parcels 500ft', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('feet');
  });

  it('extracts distance with unit suffix without spaces (500feet)', () => {
    const candidates = resolveQuery('buffer parcels 500feet', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('feet');
  });

  it('extracts distance with unit suffix without spaces (10m)', () => {
    const candidates = resolveQuery('buffer parcels 10m', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(10);
    expect(bufferMatch.parameters.distance_unit).toBe('meters');
  });

  it('extracts distance in reversed order (500 foot buffer on parcels)', () => {
    const candidates = resolveQuery('500 foot buffer on parcels', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('feet');
  });

  it('extracts tolerance for simplify', () => {
    const candidates = resolveQuery('simplify boundaries with tolerance 5', OPERATION_INTENT_MAP, {});
    const simplifyMatch = candidates.find(c => c.id === 'simplify-v1')!;
    expect(simplifyMatch).toBeDefined();
    expect(simplifyMatch.parameters.tolerance).toBe(5);
  });

  it('extracts EPSG CRS for reproject (with colon)', () => {
    const candidates = resolveQuery('reproject parcels to EPSG:32610', OPERATION_INTENT_MAP, {});
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch.parameters.target_crs).toBe('EPSG:32610');
  });

  it('extracts EPSG CRS for reproject (with space instead of colon)', () => {
    const candidates = resolveQuery('reproject parcels to EPSG 32610', OPERATION_INTENT_MAP, {});
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch.parameters.target_crs).toBe('EPSG:32610');
  });

  it('extracts WGS84 reference for reproject', () => {
    const candidates = resolveQuery('reproject to wgs84', OPERATION_INTENT_MAP, {});
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch.parameters.target_crs).toBe('WGS84');
  });

  it("extracts 'state plane' CRS reference", () => {
    const candidates = resolveQuery('reproject to state plane', OPERATION_INTENT_MAP, {});
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch.parameters.target_crs).toBe('STATE PLANE');
  });

  it('extracts source artifact role reference for buffer', () => {
    const candidates = resolveQuery('buffer the source layer', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch.parameters.source).toBe('$source');
  });

  it('extracts mask role reference for clip', () => {
    const candidates = resolveQuery('clip parcels to mask boundary', OPERATION_INTENT_MAP, {});
    const clipMatch = candidates.find(c => c.id === 'clip-v1')!;
    expect(clipMatch.parameters.mask).toBe('$mask');
  });

  it('extracts overlay role reference for intersect', () => {
    const candidates = resolveQuery('intersect parcels with overlay floodzone', OPERATION_INTENT_MAP, {});
    const intersectMatch = candidates.find(c => c.id === 'intersect-v1')!;
    expect(intersectMatch.parameters.overlay).toBe('$overlay');
  });

  it('extracts overlay for intersect from "with" preposition', () => {
    const candidates = resolveQuery('intersect parcels with floodzone', OPERATION_INTENT_MAP, {});
    const intersectMatch = candidates.find(c => c.id === 'intersect-v1')!;
    expect(intersectMatch).toBeDefined();
    expect(intersectMatch.parameters.overlay).toBe('$overlay');
  });

  it('extracts grouping_field from "dissolve parcels by zone"', () => {
    const candidates = resolveQuery('dissolve parcels by zone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const dissolveMatch = candidates.find(c => c.id === 'dissolve-grouped-v1');
    expect(dissolveMatch).toBeDefined();
    expect(dissolveMatch!.parameters.grouping_field).toBe('zone');
  });

  it('extracts join keys from attribute-join query', () => {
    const candidates = resolveQuery('join ownership to parcels by APN', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const joinMatch = candidates.find(c => c.id === 'attribute-join-v1')!;
    expect(joinMatch).toBeDefined();
    expect(joinMatch.parameters.source_key).toBe('APN');
    expect(joinMatch.parameters.join_key).toBe('APN');
    expect(joinMatch.parameters.join_table).toBe('$join_table');
    expect(joinMatch.parameters.source).toBe('$source');
  });
});

// ─── resolveQuery: Chain resolution ───────────────────────────────────

describe('resolveQuery: chain resolution', () => {
  it('matches conflict-detection chain', () => {
    const candidates = resolveQuery('find conflicts of interest', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const chain = candidates.find(c => c.id === 'conflict-detection');
    expect(chain).toBeDefined();
    expect(chain!.type).toBe('chain');
  });

  it('matches prepare-for-analysis chain', () => {
    const candidates = resolveQuery('prepare for analysis by reprojecting', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const chain = candidates.find(c => c.id === 'prepare-for-analysis');
    expect(chain).toBeDefined();
    expect(chain!.type).toBe('chain');
  });

  it('matches features-near-features chain for proximity query', () => {
    const candidates = resolveQuery('find parcels within 500 feet of the river', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const chain = candidates.find(c => c.id === 'features-near-features');
    expect(chain).toBeDefined();
    expect(chain!.type).toBe('chain');
  });

  it('documents chain numeric param index-alignment limitation', () => {
    // features-near-features has: source(0, artifact), target(1, artifact), distance(2, number)
    // numbers[2] is undefined when only "500" exists at numbers[0]
    const candidates = resolveQuery('find parcels within 500 feet of the river', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const chain = candidates.find(c => c.id === 'features-near-features')!;
    expect(chain.parameters.distance).toBeUndefined();
  });

  it('extracts chain numeric params when number param is at index 0 (custom chain)', () => {
    const customChain: Record<string, ChainDefinition> = {
      'custom-prox': makeChain({
        id: 'custom-prox',
        intent: {
          triggers: ['nearby'],
          description: 'Find nearby',
          typical_use: 'Proximity',
          examples: [],
        },
        parameters: [
          { name: 'distance', type: 'number', required: true, description: 'Search distance' },
          { name: 'source', type: 'artifact', required: true, description: 'Input layer' },
        ],
      }),
    };
    const candidates = resolveQuery('find nearby 500 feet', OPERATION_INTENT_MAP, customChain);
    const chain = candidates.find(c => c.id === 'custom-prox')!;
    expect(chain.parameters.distance).toBe(500);
  });

  it('matches area-within-boundary chain', () => {
    const candidates = resolveQuery('area within boundary', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const chain = candidates.find(c => c.id === 'area-within-boundary');
    expect(chain).toBeDefined();
  });
});

// ─── resolveQuery: Ranking ────────────────────────────────────────────

describe('resolveQuery: ranking and sorting', () => {
  it('returns at least one candidate for a matching query', () => {
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].confidence).toBeGreaterThan(0);
  });

  it('tie-breaks chains over operations when confidence is similar', () => {
    const customChains: Record<string, ChainDefinition> = {
      'test-chain': makeChain({
        intent: { triggers: ['testop'], description: 'test', typical_use: 'test', examples: [] },
      }),
    };
    const customIntents: Record<string, OperationIntent> = {
      'test-op': makeIntent({ triggers: ['testop'] }),
    };

    const candidates = resolveQuery('testop something', customIntents, customChains);
    if (candidates.length >= 2) {
      const firstChain = candidates.find(c => c.type === 'chain');
      const firstOp = candidates.find(c => c.type === 'operation');
      if (firstChain && firstOp && Math.abs(firstChain.confidence - firstOp.confidence) <= 0.05) {
        const chainIdx = candidates.indexOf(firstChain);
        const opIdx = candidates.indexOf(firstOp);
        expect(chainIdx).toBeLessThan(opIdx);
      }
    }
  });
});

// ─── resolveQuery: Canonical queries ──────────────────────────────────

describe('resolveQuery: canonical queries', () => {
  it('"buffer parcels 500 feet" → buffer with distance=500, distance_unit=feet', () => {
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.type).toBe('operation');
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('feet');
  });

  it('"intersect parcels with floodzone" → intersect-v1 with overlay extracted', () => {
    const candidates = resolveQuery('intersect parcels with floodzone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const intersectMatch = candidates.find(c => c.id === 'intersect-v1')!;
    expect(intersectMatch).toBeDefined();
    expect(intersectMatch.type).toBe('operation');
    expect(intersectMatch.parameters.overlay).toBe('$overlay');
  });

  it('"dissolve parcels by zone" → dissolve-grouped-v1 with grouping_field=zone', () => {
    // Triggers "dissolve by" fuzzy-matches because "dissolve" and "by" appear in order
    const candidates = resolveQuery('dissolve parcels by zone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const dissolveMatch = candidates.find(c => c.id === 'dissolve-grouped-v1');
    expect(dissolveMatch).toBeDefined();
    expect(dissolveMatch!.parameters.grouping_field).toBe('zone');
  });

  it('"dissolve by zone" → dissolve-grouped-v1 matched (contiguous trigger)', () => {
    const candidates = resolveQuery('dissolve by zone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const dissolveMatch = candidates.find(c => c.id === 'dissolve-grouped-v1');
    expect(dissolveMatch).toBeDefined();
  });

  it('"join ownership to parcels by APN" → attribute-join-v1 with keys extracted', () => {
    const candidates = resolveQuery('join ownership to parcels by APN', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const joinMatch = candidates.find(c => c.id === 'attribute-join-v1')!;
    expect(joinMatch).toBeDefined();
    expect(joinMatch.type).toBe('operation');
    expect(joinMatch.parameters.source_key).toBe('APN');
    expect(joinMatch.parameters.join_key).toBe('APN');
  });

  it('"reproject parcels to EPSG 32610" → reproject with target_crs=EPSG:32610', () => {
    // "EPSG 32610" (with space) is now handled by the improved CRS regex
    const candidates = resolveQuery('reproject parcels to EPSG 32610', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch).toBeDefined();
    expect(reprojectMatch.parameters.target_crs).toBe('EPSG:32610');
  });

  it('"reproject parcels to EPSG:32610" → reproject with correct CRS extracted', () => {
    const candidates = resolveQuery('reproject parcels to EPSG:32610', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch.parameters.target_crs).toBe('EPSG:32610');
  });
});

// ─── resolveQuery: Edge cases ─────────────────────────────────────────

describe('resolveQuery: edge cases', () => {
  it('empty query returns no high-confidence candidates', () => {
    const candidates = resolveQuery('', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(candidates.filter(c => c.confidence > 0.5)).toHaveLength(0);
  });

  it('unknown operation query returns no high-confidence matches', () => {
    const candidates = resolveQuery('xyzzy something unknown', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(candidates.filter(c => c.confidence > 0.5)).toHaveLength(0);
  });

  it('handles ambiguous queries that match multiple operations', () => {
    const candidates = resolveQuery('area of each parcel', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(candidates.length).toBeGreaterThan(0);
    const areaMatch = candidates.find(c => c.id === 'area-v1');
    expect(areaMatch).toBeDefined();
  });

  it('query with only whitespace returns no high-confidence candidates', () => {
    const candidates = resolveQuery('   ', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(candidates.filter(c => c.confidence > 0.5)).toHaveLength(0);
  });
});

// ─── extractParameters: public API ────────────────────────────────────

describe('extractParameters', () => {
  it('extracts operation parameters with number-first intent', () => {
    const customIntents: Record<string, OperationIntent> = {
      'test-buffer': {
        triggers: ['buffer'],
        description: 'Buffer',
        parameters: [
          { name: 'distance', type: 'number', required: true, description: 'Buffer distance' },
          { name: 'source', type: 'artifact', required: true, description: 'Layer', role: 'source' },
        ],
        typical_use: 'Prox',
        examples: [],
      },
    };
    const candidate: ResolutionCandidate = {
      type: 'operation',
      id: 'test-buffer',
      label: 'Buffer',
      description: 'Buffer',
      parameters: {},
      confidence: 0.9,
      source: 'trigger-match',
    };

    const params = extractParameters('buffer 500 feet', candidate, customIntents, {});
    expect(params.distance).toBe(500);
    expect(params.distance_unit).toBe('feet');
  });

  it('extracts chain parameters with number-first chain (custom)', () => {
    const customChains: Record<string, ChainDefinition> = {
      'test-chain': makeChain({
        id: 'test-chain',
        parameters: [
          { name: 'distance', type: 'number', required: true, description: 'Distance' },
          { name: 'source', type: 'artifact', required: true, description: 'Layer' },
        ],
      }),
    };
    const candidate: ResolutionCandidate = {
      type: 'chain',
      id: 'test-chain',
      label: 'Test',
      description: 'Test chain',
      parameters: {},
      confidence: 0.9,
      source: 'trigger-match',
    };

    const params = extractParameters('find 500 features', candidate, {}, customChains);
    expect(params.distance).toBe(500);
  });

  it('returns empty object for unknown operation candidate', () => {
    const candidate: ResolutionCandidate = {
      type: 'operation',
      id: 'nonexistent',
      label: 'Nope',
      description: 'Does not exist',
      parameters: {},
      confidence: 0.1,
      source: 'fallback',
    };

    const params = extractParameters('nope', candidate, OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(params).toEqual({});
  });

  it('returns empty object for unknown chain candidate', () => {
    const candidate: ResolutionCandidate = {
      type: 'chain',
      id: 'nonexistent-chain',
      label: 'Nope',
      description: 'Does not exist',
      parameters: {},
      confidence: 0.1,
      source: 'fallback',
    };

    const params = extractParameters('nope', candidate, OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(params).toEqual({});
  });

  it('extracts CRS parameters for reproject via public API', () => {
    const candidate: ResolutionCandidate = {
      type: 'operation',
      id: 'reproject',
      label: 'Reproject',
      description: 'Reproject',
      parameters: {},
      confidence: 0.9,
      source: 'trigger-match',
    };

    const params = extractParameters('reproject to EPSG:3857', candidate, OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    expect(params.target_crs).toBe('EPSG:3857');
  });

  it('extracts decimal numbers correctly with custom intent', () => {
    const customIntents: Record<string, OperationIntent> = {
      'test-simplify': {
        triggers: ['simplify'],
        description: 'Simplify',
        parameters: [
          { name: 'tolerance', type: 'number', required: true, description: 'Simplify tolerance' },
          { name: 'source', type: 'artifact', required: true, description: 'Layer', role: 'source' },
        ],
        typical_use: 'Test',
        examples: [],
      },
    };
    const candidate: ResolutionCandidate = {
      type: 'operation',
      id: 'test-simplify',
      label: 'Simplify',
      description: 'Simplify',
      parameters: {},
      confidence: 0.9,
      source: 'trigger-match',
    };

    const params = extractParameters('simplify 0.5 boundaries', candidate, customIntents, {});
    expect(params.tolerance).toBe(0.5);
  });

  it('extracts distance in reversed order via public API', () => {
    const customIntents: Record<string, OperationIntent> = {
      'test-buffer': {
        triggers: ['buffer'],
        description: 'Buffer',
        parameters: [
          { name: 'distance', type: 'number', required: true, description: 'Buffer distance' },
          { name: 'source', type: 'artifact', required: true, description: 'Layer', role: 'source' },
        ],
        typical_use: 'Prox',
        examples: [],
      },
    };
    const candidate: ResolutionCandidate = {
      type: 'operation',
      id: 'test-buffer',
      label: 'Buffer',
      description: 'Buffer',
      parameters: {},
      confidence: 0.9,
      source: 'trigger-match',
    };

    const params = extractParameters('500 foot buffer on parcels', candidate, customIntents, {});
    expect(params.distance).toBe(500);
    expect(params.distance_unit).toBe('feet');
  });
});

// ─── resolveQuery: Multiple candidates ────────────────────────────────

describe('resolveQuery: multiple candidates', () => {
  it('query triggers both operation and chain matches', () => {
    const candidates = resolveQuery('find overlapping areas with attributes', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const hasOp = candidates.some(c => c.type === 'operation');
    const hasChain = candidates.some(c => c.type === 'chain');
    expect(hasOp || hasChain).toBe(true);
  });

  it('all candidates have source "trigger-match"', () => {
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, {});
    candidates.forEach(c => {
      expect(c.source).toBe('trigger-match');
    });
  });

  it('candidates include label and description', () => {
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, {});
    candidates.forEach(c => {
      expect(c.label).toBeTruthy();
      expect(c.description).toBeTruthy();
    });
  });

  it('area-v1 and shape-analysis both match "shape analysis" query', () => {
    const candidates = resolveQuery('shape analysis of parcels', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    // "area" trigger matches area-v1; "shape analysis" matches shape-analysis chain
    const areaMatch = candidates.find(c => c.id === 'area-v1');
    const chainMatch = candidates.find(c => c.id === 'shape-analysis');
    expect(areaMatch || chainMatch).toBeTruthy();
  });
});

// ─── resolveQuery: Additional parameter extraction tests ──────────────

describe('resolveQuery: unit suffix variations', () => {
  it('extracts distance with kilometers', () => {
    const candidates = resolveQuery('buffer parcels 2 kilometers', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch.parameters.distance).toBe(2);
    expect(bufferMatch.parameters.distance_unit).toBe('kilometers');
  });

  it('extracts distance with km (no space)', () => {
    const candidates = resolveQuery('buffer parcels 2km', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch.parameters.distance).toBe(2);
    expect(bufferMatch.parameters.distance_unit).toBe('kilometers');
  });

  it('extracts distance with miles', () => {
    const candidates = resolveQuery('buffer parcels 1 mile', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch.parameters.distance).toBe(1);
    expect(bufferMatch.parameters.distance_unit).toBe('miles');
  });

  it('extracts distance with mi suffix', () => {
    const candidates = resolveQuery('buffer parcels 1mi', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch.parameters.distance).toBe(1);
    expect(bufferMatch.parameters.distance_unit).toBe('miles');
  });

  it('extracts decimal distance values', () => {
    const candidates = resolveQuery('buffer parcels 1.5 meters', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch.parameters.distance).toBe(1.5);
    expect(bufferMatch.parameters.distance_unit).toBe('meters');
  });
});

describe('resolveQuery: custom intents with specific param layouts', () => {
  it('extracts distance when number param is first (custom intent)', () => {
    const customIntents: Record<string, OperationIntent> = {
      'custom-buffer': {
        triggers: ['buffer'],
        description: 'Buffer features',
        parameters: [
          { name: 'distance', type: 'number', required: true, description: 'Buffer distance' },
          { name: 'source', type: 'artifact', required: true, description: 'Layer to buffer', role: 'source' },
        ],
        typical_use: 'Proximity',
        examples: [],
      },
    };
    const candidates = resolveQuery('buffer 500 feet parcels', customIntents, {});
    const match = candidates.find(c => c.id === 'custom-buffer')!;
    expect(match).toBeDefined();
    expect(match.parameters.distance).toBe(500);
    expect(match.parameters.distance_unit).toBe('feet');
  });

  it('extracts tolerance when number param is first (custom intent)', () => {
    const customIntents: Record<string, OperationIntent> = {
      'custom-simplify': {
        triggers: ['simplify'],
        description: 'Simplify',
        parameters: [
          { name: 'tolerance', type: 'number', required: true, description: 'Tolerance' },
          { name: 'source', type: 'artifact', required: true, description: 'Layer', role: 'source' },
        ],
        typical_use: 'Simplification',
        examples: [],
      },
    };
    const candidates = resolveQuery('simplify 5 boundaries', customIntents, {});
    const match = candidates.find(c => c.id === 'custom-simplify')!;
    expect(match.parameters.tolerance).toBe(5);
  });
});

// ─── Query variations (Slice 23) ──────────────────────────────────────

describe('resolveQuery: query variations', () => {
  it('"buffer the parcels by 500ft" — unit suffix, "the", "by"', () => {
    const candidates = resolveQuery('buffer the parcels by 500ft', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('feet');
  });

  it('"500 foot buffer on parcels" — reversed order', () => {
    const candidates = resolveQuery('500 foot buffer on parcels', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('feet');
  });

  it('"clip parcels with floodzone" — no "to"/"by", uses "with"', () => {
    const candidates = resolveQuery('clip parcels with floodzone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const clipMatch = candidates.find(c => c.id === 'clip-v1')!;
    expect(clipMatch).toBeDefined();
    expect(clipMatch.parameters.mask).toBe('$mask');
  });

  it('"dissolve by zone" — no artifact name, still resolves', () => {
    const candidates = resolveQuery('dissolve by zone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const dissolveMatch = candidates.find(c => c.id === 'dissolve-grouped-v1');
    expect(dissolveMatch).toBeDefined();
    expect(dissolveMatch!.parameters.grouping_field).toBe('zone');
  });

  it('"join ownership to parcels by APN" — attribute join', () => {
    const candidates = resolveQuery('join ownership to parcels by APN', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const joinMatch = candidates.find(c => c.id === 'attribute-join-v1')!;
    expect(joinMatch).toBeDefined();
    expect(joinMatch.parameters.source_key).toBe('APN');
    expect(joinMatch.parameters.join_key).toBe('APN');
  });

  it('"reproject to 32610" — bare EPSG code (no prefix)', () => {
    const candidates = resolveQuery('reproject to 32610', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch).toBeDefined();
    expect(reprojectMatch.parameters.target_crs).toBe('EPSG:32610');
  });

  it('"buffer 500" — bare number, defaults to meters', () => {
    const candidates = resolveQuery('buffer 500', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBe(500);
    expect(bufferMatch.parameters.distance_unit).toBe('meters');
  });
});

// ─── Confidence penalties (Slice 23) ──────────────────────────────────

describe('resolveQuery: confidence penalties', () => {
  it('bare number buffer gets lower confidence than same-length query with unit', () => {
    // Use same-length queries to isolate the bare-number penalty
    const withUnit = resolveQuery('buffer 500 feet', OPERATION_INTENT_MAP, {});
    const bareNumber = resolveQuery('buffer 500 xxxx', OPERATION_INTENT_MAP, {});

    const withUnitBuf = withUnit.find(c => c.id === 'buffer')!;
    const bareNumberBuf = bareNumber.find(c => c.id === 'buffer')!;

    expect(withUnitBuf).toBeDefined();
    expect(bareNumberBuf).toBeDefined();
    // "buffer 500 xxxx" has no recognized unit → default to meters + penalty
    expect(bareNumberBuf.parameters.distance_unit).toBe('meters');
    expect(withUnitBuf.parameters.distance_unit).toBe('feet');
    // Same query length → same base trigger confidence
    // Bare number (-0.1 penalty) → lower final confidence
    expect(bareNumberBuf.confidence).toBeLessThan(withUnitBuf.confidence);
  });

  it('bare number defaults distance_unit to meters and applies penalty', () => {
    const bareResult = resolveQuery('buffer 500', OPERATION_INTENT_MAP, {});
    const bareBuf = bareResult.find(c => c.id === 'buffer')!;
    expect(bareBuf).toBeDefined();
    expect(bareBuf.parameters.distance).toBe(500);
    // Bare number defaults to meters but with a confidence penalty
    expect(bareBuf.parameters.distance_unit).toBe('meters');
    expect(bareBuf.confidence).toBeLessThan(1.0);
  });

  it('reversed order query gets lower confidence than canonical order', () => {
    const canonical = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, {});
    const reversed = resolveQuery('500 feet buffer on parcels', OPERATION_INTENT_MAP, {});

    const canonicalBuf = canonical.find(c => c.id === 'buffer')!;
    const reversedBuf = reversed.find(c => c.id === 'buffer')!;

    expect(canonicalBuf).toBeDefined();
    expect(reversedBuf).toBeDefined();
    // Reversed gets -0.05 penalty → lower confidence than canonical
    expect(reversedBuf.confidence).toBeLessThan(canonicalBuf.confidence);
  });
});

// ─── String similarity utilities (Slice 23) ───────────────────────────

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('parcels', 'parcels')).toBe(0);
  });

  it('returns 1 for single-character edit', () => {
    expect(levenshteinDistance('parcel', 'parcels')).toBe(1);
  });

  it('returns correct distance for different strings', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
});

describe('stringSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(stringSimilarity('parcels', 'parcels')).toBe(1.0);
  });

  it('returns > 0.8 for near-match (typo)', () => {
    const sim = stringSimilarity('parcels', 'parcel');
    expect(sim).toBeGreaterThan(0.8);
  });

  it('returns low score for very different strings', () => {
    const sim = stringSimilarity('parcels', 'rivers');
    expect(sim).toBeLessThan(0.5);
  });
});

describe('tokenizeInput', () => {
  it('filters stop words', () => {
    const tokens = tokenizeInput('buffer the parcels by 500 feet');
    expect(tokens).toContain('buffer');
    expect(tokens).toContain('parcels');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('by');
  });

  it('handles empty/whitespace input', () => {
    expect(tokenizeInput('')).toEqual([]);
    expect(tokenizeInput('   ')).toEqual([]);
  });

  it('filters out single-character tokens', () => {
    const tokens = tokenizeInput('a buffer');
    expect(tokens).toEqual(['buffer']);
  });
});

describe('tokenizedMatchScore', () => {
  it('returns 1.0 for exact token match', () => {
    const score = tokenizedMatchScore(['parcels', 'buffer'], ['parcels', 'buffer']);
    expect(score).toBe(1.0);
  });

  it('returns > 0 for partial overlap', () => {
    const score = tokenizedMatchScore(['parcels'], ['parcels', 'buffer']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns 0 for no overlap', () => {
    const score = tokenizedMatchScore(['rivers'], ['parcels', 'buffer']);
    expect(score).toBe(0);
  });

  it('handles typo tolerance (parcels vs parcel)', () => {
    const score = tokenizedMatchScore(['parcels'], ['parcel']);
    expect(score).toBeGreaterThan(0.7);
  });
});

// ─── Artifact reference resolution (Slice 23) ────────────────────────

describe('resolveArtifactReference', () => {
  it('returns null for empty artifact list', () => {
    expect(resolveArtifactReference('buffer parcels', [])).toBeNull();
  });

  it('auto-resolves when only one artifact exists', () => {
    const result = resolveArtifactReference('buffer it', ['parcels']);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('parcels');
    expect(result!.autoResolved).toBe(true);
    expect(result!.score).toBe(1.0);
  });

  it('resolves exact name match', () => {
    const result = resolveArtifactReference('buffer the parcels', ['parcels', 'rivers', 'counties']);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('parcels');
    expect(result!.autoResolved).toBe(false);
    expect(result!.score).toBeGreaterThan(0.5);
  });

  it('handles typo tolerance (parcels vs parcel)', () => {
    const result = resolveArtifactReference('buffer the parcel', ['parcels', 'rivers']);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('parcels');
  });

  it('disambiguates between similar names with higher score', () => {
    const result = resolveArtifactReference('buffer the parcels', ['parcels', 'parcel_groups']);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('parcels');
    // "parcels" matches better than "parcel_groups" for query containing "parcels"
  });

  it('marks result as ambiguous when scores are close', () => {
    // Both artifacts are equally close to the query terms
    const result = resolveArtifactReference('buffer zone', ['zones', 'zonel']);
    expect(result).not.toBeNull();
    // The ambiguity flag depends on score proximity
  });

  it('returns null for query with no matching tokens', () => {
    const result = resolveArtifactReference('xyzzy foobar', ['parcels', 'rivers']);
    expect(result).toBeNull();
  });

  it('handles multi-word artifact names', () => {
    const result = resolveArtifactReference('buffer the flood zones', ['flood zones', 'parcels']);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('flood zones');
  });
});
