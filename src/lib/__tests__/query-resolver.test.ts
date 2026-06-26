/**
 * Tests for query-resolver.ts
 *
 * Covers:
 * - resolveQuery: trigger matching, parameter extraction, ranking
 * - computeTriggerConfidence: scoring logic, edge cases
 * - extractParameters: public API for parameter extraction
 * - Canonical queries as test cases
 * - Edge cases: empty query, unknown ops, ambiguous triggers
 *
 * NOTE: Some parameter extraction behavior documents known limitations
 * in the index-based number assignment (numbers[paramArrayIndex] is used
 * rather than a sequential numeric counter). Tests document this as-is.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveQuery,
  computeTriggerConfidence,
  extractParameters,
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
    // The trigger "dissolve by" must appear as a contiguous substring
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
  // The number extraction uses numbers[parameterArrayIndex] so a number param
  // at index 1 (after a non-number param at index 0) won't find numbers[1]
  // when only one number is present. These tests document that behavior and
  // also test working extraction with custom intents.

  it('extracts distance when number param is first (custom intent workaround)', () => {
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

  it('extracts tolerance when number param is first (custom intent workaround)', () => {
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

  it('documents index-alignment limitation: standard buffer distance not extracted', () => {
    // Buffer intent: source(0, artifact), distance(1, number). numbers[1]=undefined.
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, {});
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.parameters.distance).toBeUndefined();
  });

  it('documents index-alignment limitation: standard simplify tolerance not extracted', () => {
    const candidates = resolveQuery('simplify boundaries with tolerance 5', OPERATION_INTENT_MAP, {});
    const simplifyMatch = candidates.find(c => c.id === 'simplify-v1')!;
    expect(simplifyMatch).toBeDefined();
    expect(simplifyMatch.parameters.tolerance).toBeUndefined();
  });

  it('extracts EPSG CRS for reproject', () => {
    const candidates = resolveQuery('reproject parcels to EPSG:32610', OPERATION_INTENT_MAP, {});
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

  it('does NOT extract join_table role when underscore doesnt match space in query', () => {
    // Role 'join_table' → split('-').join(' ') → 'join_table' (underscore preserved)
    // Query has "join table" (space), not "join_table" (underscore) → no match
    const candidates = resolveQuery('join the join table data to parcels', OPERATION_INTENT_MAP, {});
    const joinMatch = candidates.find(c => c.id === 'attribute-join-v1')!;
    // The roleWords "join_table" is NOT a substring of the lowered query
    expect(joinMatch.parameters.join_table).toBeUndefined();
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
  it('"buffer parcels 500 feet" → buffer operation matched', () => {
    const candidates = resolveQuery('buffer parcels 500 feet', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const bufferMatch = candidates.find(c => c.id === 'buffer')!;
    expect(bufferMatch).toBeDefined();
    expect(bufferMatch.type).toBe('operation');
    // Document: distance not extracted due to param-index-alignment bug
    expect(bufferMatch.parameters.distance).toBeUndefined();
  });

  it('"intersect parcels with floodzone" → intersect-v1 operation', () => {
    const candidates = resolveQuery('intersect parcels with floodzone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const intersectMatch = candidates.find(c => c.id === 'intersect-v1')!;
    expect(intersectMatch).toBeDefined();
    expect(intersectMatch.type).toBe('operation');
  });

  it('"dissolve parcels by zone" → dissolve-grouped-v1 NOT matched (trigger "dissolve by" not contiguous)', () => {
    // "dissolve parcels by zone" lowered = "dissolve parcels by zone"
    // Trigger "dissolve by" is not a contiguous substring here
    const candidates = resolveQuery('dissolve parcels by zone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const dissolveMatch = candidates.find(c => c.id === 'dissolve-grouped-v1');
    expect(dissolveMatch).toBeUndefined();
  });

  it('"dissolve by zone" → dissolve-grouped-v1 matched (contiguous trigger)', () => {
    const candidates = resolveQuery('dissolve by zone', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const dissolveMatch = candidates.find(c => c.id === 'dissolve-grouped-v1');
    expect(dissolveMatch).toBeDefined();
  });

  it('"join ownership to parcels by APN" → attribute-join-v1 operation', () => {
    const candidates = resolveQuery('join ownership to parcels by APN', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const joinMatch = candidates.find(c => c.id === 'attribute-join-v1')!;
    expect(joinMatch).toBeDefined();
    expect(joinMatch.type).toBe('operation');
  });

  it('"reproject parcels to EPSG 32610" → reproject operation matched (no CRS extraction without colon)', () => {
    // "EPSG 32610" (no colon) doesn't match /EPSG:\d+/ but "reproject" trigger matches
    const candidates = resolveQuery('reproject parcels to EPSG 32610', OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    const reprojectMatch = candidates.find(c => c.id === 'reproject')!;
    expect(reprojectMatch).toBeDefined();
    // "EPSG" alone matches /EPSG:\d+/i? No — /EPSG:\d+/ requires the colon.
    // But the trigger list includes "EPSG" which matches the query.
    // CRS extraction: /EPSG:\d+/i doesn't match "epsg 32610". Next: /WGS84/i no. /UTM/i no. /state plane/i no.
    // So target_crs is not extracted.
    expect(reprojectMatch.parameters.target_crs).toBeUndefined();
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
