/**
 * Natural Language Query Resolver
 *
 * Maps natural language queries to operation or chain candidates.
 * Supports trigger matching, parameter extraction, and confidence scoring.
 */

import type { OperationIntent } from '../operations/types';
import type { ChainDefinition } from '../operations/chain-registry';

export interface ResolutionCandidate {
  type: 'operation' | 'chain';
  id: string;
  label: string;
  description: string;
  parameters: Record<string, any>;
  confidence: number;
  source: 'trigger-match' | 'semantic-match' | 'fallback';
}

/**
 * Resolve a natural language query to a list of candidate operations or chains.
 * Extends the prototype with chain resolution, parameter extraction, and improved scoring.
 */
export function resolveQuery(
  query: string,
  operationIntentMap: Record<string, OperationIntent>,
  chainRegistry: Record<string, ChainDefinition>,
): ResolutionCandidate[] {
  const lower = query.toLowerCase();
  const candidates: ResolutionCandidate[] = [];

  // ─── Operation matching with parameter extraction ──────────────────
  for (const [id, intent] of Object.entries(operationIntentMap)) {
    const confidence = computeTriggerConfidence(lower, intent.triggers);
    if (confidence > 0) {
      // Pass original query to preserve case for field names (e.g., "APN")
      const parameters = extractOperationParameters(query, intent);
      candidates.push({
        type: 'operation',
        id,
        label: intent.description.split(' ')[0] || id, // Use first word of description as label
        description: intent.description,
        parameters,
        confidence,
        source: 'trigger-match',
      });
    }
  }

  // ─── Chain matching with parameter extraction ──────────────────────
  for (const [id, chain] of Object.entries(chainRegistry)) {
    const confidence = computeTriggerConfidence(lower, chain.intent.triggers);
    if (confidence > 0) {
      const parameters = extractChainParameters(query, chain);
      candidates.push({
        type: 'chain',
        id,
        label: chain.label,
        description: chain.description,
        parameters,
        confidence,
        source: 'trigger-match',
      });
    }
  }

  // ─── Ranking ───────────────────────────────────────────────────────
  // Sort by confidence descending, then by type (chains first, then operations)
  candidates.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) > 0.05) {
      return b.confidence - a.confidence;
    }
    // Tie‑break: chains over operations (more complex workflows)
    if (a.type !== b.type) {
      return a.type === 'chain' ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return candidates;
}

// ─── Operation-type classifiers ────────────────────────────────────────

/** Check if intent is a distance-based operation (buffer-like). */
function hasDistanceParam(intent: OperationIntent): boolean {
  return intent.parameters.some(p => p.name === 'distance' && p.type === 'number');
}

/** Check if intent is a tolerance-based operation (simplify-like). */
function hasToleranceParam(intent: OperationIntent): boolean {
  return intent.parameters.some(p => p.name === 'tolerance' && p.type === 'number');
}

/** Check if intent is a CRS-targeting operation (reproject-like). */
function hasTargetCrsParam(intent: OperationIntent): boolean {
  return intent.parameters.some(p => p.name === 'target_crs' && p.type === 'crs');
}

/** Check if intent is a dissolve-grouped operation. */
function hasGroupingFieldParam(intent: OperationIntent): boolean {
  return intent.parameters.some(p => p.name === 'grouping_field' && p.type === 'field');
}

/** Check if intent is an attribute-join operation. */
function hasJoinTableParam(intent: OperationIntent): boolean {
  return intent.parameters.some(p => p.name === 'join_table');
}

/** Check if intent has an overlay artifact param. */
function hasOverlayParam(intent: OperationIntent): boolean {
  return intent.parameters.some(p => p.name === 'overlay' && p.type === 'artifact');
}

/** Check if intent has a mask artifact param. */
function hasMaskParam(intent: OperationIntent): boolean {
  return intent.parameters.some(p => p.name === 'mask' && p.type === 'artifact');
}

// ─── Specialized extractors ────────────────────────────────────────────

/**
 * Extract distance + unit from a query for buffer-like operations.
 * Handles "500 feet", "500ft", "500feet", "10m", "1 mile", "1.5 km".
 * Also handles reversed order: "500 foot buffer on parcels".
 */
function extractDistanceParams(query: string, parameters: Record<string, any>): void {
  // Pattern: number followed by optional space and unit
  // Units: feet, foot, ft, meters, meter, m, kilometers, kilometer, km, miles, mile, mi
  const distUnitRegex = /(\d+(?:\.\d+)?)\s*(feet|foot|ft|meters?|m|kilometers?|km|miles?|mi)\b/i;
  const match = query.match(distUnitRegex);
  if (match) {
    parameters.distance = Number(match[1]);
    const rawUnit = match[2].toLowerCase();
    // Normalize unit
    if (['feet', 'foot', 'ft'].includes(rawUnit)) {
      parameters.distance_unit = 'feet';
    } else if (['meter', 'meters', 'm'].includes(rawUnit)) {
      parameters.distance_unit = 'meters';
    } else if (['kilometer', 'kilometers', 'km'].includes(rawUnit)) {
      parameters.distance_unit = 'kilometers';
    } else if (['mile', 'miles', 'mi'].includes(rawUnit)) {
      parameters.distance_unit = 'miles';
    }
    return;
  }
  // Fallback: bare number without unit
  const bareNumber = query.match(/(\d+(?:\.\d+)?)/);
  if (bareNumber) {
    parameters.distance = Number(bareNumber[1]);
  }
}

/**
 * Extract tolerance + optional unit from a query for simplify-like operations.
 */
function extractToleranceParams(query: string, parameters: Record<string, any>): void {
  // Pattern: number followed by optional space and unit
  const tolUnitRegex = /(\d+(?:\.\d+)?)\s*(meters?|m|feet|ft|degrees?)\b/i;
  const match = query.match(tolUnitRegex);
  if (match) {
    parameters.tolerance = Number(match[1]);
    return;
  }
  // Fallback: try tolerance keyword followed by number
  const tolKeywordRegex = /tolerance\s+(\d+(?:\.\d+)?)/i;
  const kwMatch = query.match(tolKeywordRegex);
  if (kwMatch) {
    parameters.tolerance = Number(kwMatch[1]);
    return;
  }
  // Fallback: bare number
  const bareNumber = query.match(/(\d+(?:\.\d+)?)/);
  if (bareNumber) {
    parameters.tolerance = Number(bareNumber[1]);
  }
}

/**
 * Extract target CRS from a query for reproject-like operations.
 * Handles "EPSG:32610", "EPSG 32610", "EPSG32610", "WGS84", "state plane", "UTM".
 */
function extractCrsParams(query: string, parameters: Record<string, any>): void {
  // EPSG with colon: EPSG:32610
  const epsgColonMatch = query.match(/EPSG[:\s]*(\d+)/i);
  if (epsgColonMatch) {
    parameters.target_crs = `EPSG:${epsgColonMatch[1]}`;
    return;
  }
  // Named CRS references
  if (/wgs84/i.test(query)) {
    parameters.target_crs = 'WGS84';
    return;
  }
  if (/state plane/i.test(query)) {
    parameters.target_crs = 'STATE PLANE';
    return;
  }
  if (/utm/i.test(query)) {
    parameters.target_crs = 'UTM';
    return;
  }
}

/**
 * Extract grouping field from "dissolve <source> by <field>" pattern.
 */
function extractDissolveGroupedParams(query: string, parameters: Record<string, any>): void {
  // "dissolve <artifact> by <field>" or just "dissolve by <field>"
  const byFieldMatch = query.match(/\bby\s+(\w[\w\s]*?)\s*$/i) ||
                       query.match(/\bby\s+(\w+)/i);
  if (byFieldMatch) {
    parameters.grouping_field = byFieldMatch[1].trim();
  }
}

/**
 * Extract attribute-join parameters from "join <table> to <source> by <key>" pattern.
 */
function extractAttributeJoinParams(query: string, parameters: Record<string, any>): void {
  // Pattern: "join <X> to <Y> by <Z>"
  // X = join_table (artifact before "to")
  // Y = source (artifact after "to", before "by")
  // Z = source_key and join_key (field after "by")

  // Extract key (field after "by")
  const byMatch = query.match(/\bby\s+(\w+)\s*$/i) || query.match(/\bby\s+(\w+)/i);
  if (byMatch) {
    const fieldName = byMatch[1].trim();
    parameters.source_key = fieldName;
    parameters.join_key = fieldName;
  }

  // Extract source and join_table from "join X to Y" pattern
  const joinToMatch = query.match(/\bjoin\s+(.+?)\s+to\s+(.+?)(?:\s+by\b|$)/i);
  if (joinToMatch) {
    // join_table is the thing after "join" before "to"
    parameters.join_table = `$join_table`;
    // source is the thing after "to" before "by"
    parameters.source = `$source`;
  }

  // Fallback: role-word detection for source
  if (!parameters.source && /\bsource\b/.test(query)) {
    parameters.source = '$source';
  }
}

/**
 * Extract overlay artifact reference for intersect-like operations.
 * Uses role-word detection and positional clues (after "with").
 */
function extractOverlayParams(query: string, parameters: Record<string, any>): void {
  // Role-word detection: if "overlay" appears in query
  if (/\boverlay\b/.test(query)) {
    parameters.overlay = '$overlay';
    return;
  }
  // Positional: artifact after "with"
  const withMatch = query.match(/\bwith\s+(?:the\s+)?(\w[\w\s]*?)(?:\s*$)/i);
  if (withMatch) {
    parameters.overlay = '$overlay';
  }
}

/**
 * Extract mask artifact reference for clip-like operations.
 * Uses role-word detection and positional clues (after "to").
 */
function extractMaskParams(query: string, parameters: Record<string, any>): void {
  // Role-word detection: if "mask" appears in query
  if (/\bmask\b/.test(query)) {
    parameters.mask = '$mask';
    return;
  }
  // Positional: artifact after "to"
  const toMatch = query.match(/\bto\s+(?:the\s+)?(\w[\w\s]*?)(?:\s*$)/i);
  if (toMatch) {
    parameters.mask = '$mask';
  }
}

// ─── Main extraction function ──────────────────────────────────────────

/**
 * Extract parameters from a query for an operation.
 * Uses operation-specific regex patterns for reliable extraction
 * regardless of word order.
 */
function extractOperationParameters(
  query: string,
  intent: OperationIntent,
): Record<string, any> {
  const parameters: Record<string, any> = {};

  // ─── Distance-based operations (buffer) ──────────────────────────
  if (hasDistanceParam(intent)) {
    extractDistanceParams(query, parameters);
    // Still extract source artifact via role-word detection
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  // ─── Tolerance-based operations (simplify) ───────────────────────
  if (hasToleranceParam(intent)) {
    extractToleranceParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  // ─── CRS-targeting operations (reproject) ────────────────────────
  if (hasTargetCrsParam(intent)) {
    extractCrsParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  // ─── Dissolve-grouped operations ─────────────────────────────────
  if (hasGroupingFieldParam(intent)) {
    extractDissolveGroupedParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  // ─── Attribute-join operations ───────────────────────────────────
  if (hasJoinTableParam(intent)) {
    extractAttributeJoinParams(query, parameters);
    return parameters;
  }

  // ─── Intersect operations ────────────────────────────────────────
  if (hasOverlayParam(intent)) {
    extractOverlayParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  // ─── Clip operations ─────────────────────────────────────────────
  if (hasMaskParam(intent)) {
    extractMaskParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  // ─── Generic fallback ────────────────────────────────────────────
  extractGenericParams(query, intent, parameters);
  return parameters;
}

/**
 * Extract source artifact from role-word detection.
 */
function extractSourceArtifact(
  query: string,
  intent: OperationIntent,
  parameters: Record<string, any>,
): void {
  const lower = query.toLowerCase();
  intent.parameters.forEach((param) => {
    if (param.type === 'artifact' && param.role && param.role !== 'mask' && param.role !== 'overlay' && param.role !== 'join_table') {
      const roleWords = param.role.split('-').join(' ');
      if (lower.includes(roleWords)) {
        parameters[param.name] = `$${param.role}`;
      }
    }
  });
}

/**
 * Generic parameter extraction fallback.
 * Uses the old positional logic as a last resort.
 */
function extractGenericParams(
  query: string,
  intent: OperationIntent,
  parameters: Record<string, any>,
): void {
  const lower = query.toLowerCase();
  // Extract numbers
  const numberMatches = query.match(/\d+(\.\d+)?/g);
  if (numberMatches) {
    const numbers = numberMatches.map(Number);
    intent.parameters.forEach((param, index) => {
      if (param.type === 'number') {
        if (numbers[index] !== undefined) {
          parameters[param.name] = numbers[index];
        }
      }
    });
  }

  // Extract artifact references based on role hints
  intent.parameters.forEach((param) => {
    if (param.type === 'artifact' && param.role) {
      const roleWords = param.role.split('-').join(' ');
      if (lower.includes(roleWords)) {
        parameters[param.name] = `$${param.role}`;
      }
    }
  });

  // Extract CRS references
  const crsMatch = query.match(/EPSG:\d+/i) || query.match(/WGS84/i) || query.match(/state plane/i);
  if (crsMatch) {
    intent.parameters.forEach((param) => {
      if (param.type === 'crs') {
        parameters[param.name] = crsMatch[0].toUpperCase();
      }
    });
  }
}

/**
 * Extract parameters from a query for a chain.
 */
function extractChainParameters(
  query: string,
  chain: ChainDefinition,
): Record<string, any> {
  const parameters: Record<string, any> = {};
  const lower = query.toLowerCase();

  // Extract numbers
  const numberMatches = query.match(/\d+(\.\d+)?/g);
  if (numberMatches) {
    const numbers = numberMatches.map(Number);
    chain.parameters.forEach((param, index) => {
      if (param.type === 'number' && numbers[index] !== undefined) {
        parameters[param.name] = numbers[index];
      }
    });
  }

  // Extract artifact references based on parameter names
  chain.parameters.forEach((param) => {
    if (param.type === 'artifact') {
      // Look for the parameter name or description in the query (case-insensitive)
      if (lower.includes(param.name) || lower.includes(param.description.toLowerCase())) {
        parameters[param.name] = `$${param.name}`;
      }
    }
  });

  return parameters;
}

/**
 * Extract parameters from a query (public API).
 * This combines operation and chain parameter extraction.
 */
export function extractParameters(
  query: string,
  candidate: ResolutionCandidate,
  operationIntentMap: Record<string, OperationIntent>,
  chainRegistry: Record<string, ChainDefinition>,
): Record<string, any> {
  if (candidate.type === 'operation') {
    const intent = operationIntentMap[candidate.id];
    if (!intent) return {};
    // Pass original query to preserve case for field names
    return extractOperationParameters(query, intent);
  } else {
    const chain = chainRegistry[candidate.id];
    if (!chain) return {};
    return extractChainParameters(query, chain);
  }
}

/**
 * Compute match confidence between query and a set of triggers.
 * Improved scoring: considers trigger length, position, and multiple matches.
 * Also supports fuzzy matching for multi-word triggers where words appear
 * in order but are separated by other words.
 */
export function computeTriggerConfidence(query: string, triggers: string[]): number {
  const lower = query.toLowerCase();
  let maxScore = 0;
  let totalScore = 0;
  let matchCount = 0;

  for (const trigger of triggers) {
    if (lower.includes(trigger)) {
      // Exact match: score based on trigger length and position
      const position = lower.indexOf(trigger);
      const lengthRatio = trigger.length / query.length;
      const positionPenalty = position === 0 ? 1.0 : 0.9;
      const score = lengthRatio * positionPenalty;
      totalScore += score;
      matchCount++;
      if (score > maxScore) maxScore = score;
    } else if (trigger.includes(' ')) {
      // Fuzzy match for multi-word triggers: check if all trigger words
      // appear in the query in order (with possible gaps)
      const fuzzyScore = computeFuzzyTriggerScore(lower, trigger);
      if (fuzzyScore > 0) {
        totalScore += fuzzyScore;
        matchCount++;
        if (fuzzyScore > maxScore) maxScore = fuzzyScore;
      }
    }
  }

  // Combine max score with match count bonus
  if (matchCount === 0) return 0;
  
  const averageScore = totalScore / matchCount;
  const matchBonus = Math.min(0.2, matchCount * 0.05);
  
  return Math.min(1.0, (maxScore * 0.7 + averageScore * 0.3) + matchBonus);
}

/**
 * Compute fuzzy match score for a multi-word trigger.
 * All words must appear in order in the query, but other words may appear between them.
 * Returns a score lower than exact match to rank exact matches higher.
 */
function computeFuzzyTriggerScore(query: string, trigger: string): number {
  const words = trigger.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  // Check if all words appear in order
  let pos = 0;
  for (const word of words) {
    const idx = query.indexOf(word, pos);
    if (idx === -1) return 0; // Word not found → no match
    pos = idx + word.length;
  }

  // All words found in order — compute a reduced score
  // The score is lower than exact match to prefer exact matches
  const totalWordLength = words.reduce((sum, w) => sum + w.length, 0);
  const lengthRatio = totalWordLength / query.length;
  // Apply a penalty for fuzzy matching (50% of what exact match would give)
  const score = lengthRatio * 0.5;
  return score;
}
