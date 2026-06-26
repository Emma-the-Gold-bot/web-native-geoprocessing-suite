/**
 * Natural Language Query Resolver
 *
 * Maps natural language queries to operation or chain candidates.
 * Supports trigger matching, parameter extraction, and confidence scoring.
 * Includes improved artifact name resolution with tokenized matching and
 * Levenshtein-based typo tolerance.
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

// ─── String similarity utilities ───────────────────────────────────────

/**
 * Compute Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits needed to transform one into the other.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two-row approach for space efficiency
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Compute similarity score between two strings (0-1 scale).
 * 1.0 = exact match, 0.0 = completely different.
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Tokenize a string into content words, filtering out stop words and articles.
 */
export function tokenizeInput(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'by', 'for', 'in', 'on',
    'with', 'at', 'from', 'is', 'it', 'this', 'that', 'each', 'all',
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word));
}

/**
 * Compute tokenized match score between query tokens and target tokens.
 * Uses Levenshtein similarity for each token pair to handle typos.
 * Returns a score between 0 and 1.
 */
export function tokenizedMatchScore(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

  let totalScore = 0;
  let matchedCount = 0;

  for (const qt of queryTokens) {
    let bestMatch = 0;
    for (const tt of targetTokens) {
      const sim = stringSimilarity(qt, tt);
      if (sim > 0.7) {
        bestMatch = Math.max(bestMatch, sim);
      }
    }
    if (bestMatch > 0) {
      totalScore += bestMatch;
      matchedCount++;
    }
  }

  const coverage = matchedCount / queryTokens.length;
  const avgSim = matchedCount > 0 ? totalScore / matchedCount : 0;
  return coverage * avgSim;
}

// ─── Artifact name resolution ──────────────────────────────────────────

export interface ArtifactResolutionResult {
  /** The resolved artifact name */
  name: string;
  /** Confidence score of the match (0-1) */
  score: number;
  /** Whether the match was ambiguous (multiple close matches) */
  ambiguous: boolean;
  /** Whether it was auto-resolved (only one artifact available) */
  autoResolved: boolean;
}

/**
 * Resolve an artifact name from a query against a list of available artifact names.
 * Uses tokenized matching with Levenshtein-based typo tolerance.
 *
 * - If exactly one spatial artifact exists, auto-resolve regardless of name match.
 * - Supports typo tolerance via Levenshtein distance.
 * - Returns disambiguation info when multiple artifacts have similar scores.
 */
export function resolveArtifactReference(
  query: string,
  availableArtifacts: string[],
): ArtifactResolutionResult | null {
  if (availableArtifacts.length === 0) return null;

  // If exactly one spatial artifact exists, auto-resolve
  if (availableArtifacts.length === 1) {
    return {
      name: availableArtifacts[0],
      score: 1.0,
      ambiguous: false,
      autoResolved: true,
    };
  }

  const queryTokens = tokenizeInput(query);
  if (queryTokens.length === 0) return null;

  // Score each artifact
  const scored: Array<{ name: string; score: number }> = [];
  for (const artifactName of availableArtifacts) {
    const targetTokens = tokenizeInput(artifactName);
    const score = tokenizedMatchScore(queryTokens, targetTokens);

    // Also check direct substring match (backward compat)
    const lowerQuery = query.toLowerCase();
    const lowerName = artifactName.toLowerCase();
    let finalScore = score;
    if (lowerQuery.includes(lowerName) || lowerName.includes(lowerQuery.split(/\s+/).filter(w => w.length > 2).join(' '))) {
      // Boost substring matches
      finalScore = Math.max(finalScore, 0.8);
    }

    if (finalScore > 0.1) {
      scored.push({ name: artifactName, score: finalScore });
    }
  }

  if (scored.length === 0) return null;

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const secondBest = scored.length > 1 ? scored[1] : null;

  // Check for ambiguity: if top 2 scores are within 0.1 of each other
  const ambiguous = secondBest !== null && (best.score - secondBest.score) < 0.1;

  return {
    name: best.name,
    score: best.score,
    ambiguous,
    autoResolved: false,
  };
}

// ─── Main resolver ─────────────────────────────────────────────────────

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

  // ─── Apply confidence penalties ────────────────────────────────────
  applyConfidencePenalties(query, candidates);

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

// ─── Confidence penalties ──────────────────────────────────────────────

/**
 * Apply confidence penalties based on query characteristics.
 * - Ambiguous artifact match: -0.15 confidence
 * - No unit specified (bare number): -0.1 confidence
 * - Reversed order query: -0.05 confidence
 */
function applyConfidencePenalties(query: string, candidates: ResolutionCandidate[]): void {
  const lower = query.toLowerCase().trim();

  // Check if query has reversed order (number before operation keyword like "buffer")
  const reversedOrderPattern = /^[\d.]+\s*(?:feet|foot|ft|meters?|m|kilometers?|km|miles?|mi)?\s*\w*buffer/i;
  const isReversedOrder = reversedOrderPattern.test(query) ||
    /^(?:500|100|200|1000|[\d.]+)\s+(?:foot|feet|ft|meter|m|km|kilometer|mile|mi)?\s*buffer/i.test(query);

  // Check if query has a bare number for distance (number with no unit)
  const hasExplicitUnit = /(?:feet|foot|ft|meters?|m|kilometers?|km|miles?|mi)\b/i.test(query);
  const hasNumber = /\d+(?:\.\d+)?/.test(query);
  const hasBareNumber = hasNumber && !hasExplicitUnit;

  // Detect if this is a distance-related query (for bare-number penalty)
  const isDistanceQuery = /\bbuffer\b/i.test(query) ||
    candidates.some(c => c.id === 'buffer' && c.parameters.distance !== undefined);

  for (const candidate of candidates) {
    // Apply reversed order penalty (-0.05 = multiply by 0.95)
    if (isReversedOrder && candidate.parameters.distance !== undefined) {
      candidate.confidence *= 0.95;
    }

    // Apply bare number penalty for distance operations (-0.1 = multiply by 0.9)
    if (hasBareNumber && isDistanceQuery && candidate.id === 'buffer') {
      candidate.confidence *= 0.9;
    }
  }

  // Check for ambiguous matches: multiple candidates within 0.05 of top confidence
  if (candidates.length >= 2) {
    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const topConfidence = sorted[0].confidence;
    const closeMatches = sorted.filter(c => Math.abs(c.confidence - topConfidence) < 0.03);

    if (closeMatches.length > 1) {
      // Apply ambiguity penalty (-0.15 = multiply by 0.85) to all close matches
      for (const candidate of closeMatches) {
        candidate.confidence *= 0.88;
      }
    }
  }
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
 * Bare number without unit defaults to meters.
 */
function extractDistanceParams(query: string, parameters: Record<string, any>): void {
  // Pattern: number followed by optional space and unit
  const distUnitRegex = /(\d+(?:\.\d+)?)\s*(feet|foot|ft|meters?|m|kilometers?|km|miles?|mi)\b/i;
  const match = query.match(distUnitRegex);
  if (match) {
    parameters.distance = Number(match[1]);
    const rawUnit = match[2].toLowerCase();
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
  // Fallback: bare number without unit — default to meters
  const bareNumber = query.match(/(\d+(?:\.\d+)?)/);
  if (bareNumber) {
    parameters.distance = Number(bareNumber[1]);
    parameters.distance_unit = 'meters';
  }
}

/**
 * Extract tolerance + optional unit from a query for simplify-like operations.
 */
function extractToleranceParams(query: string, parameters: Record<string, any>): void {
  const tolUnitRegex = /(\d+(?:\.\d+)?)\s*(meters?|m|feet|ft|degrees?)\b/i;
  const match = query.match(tolUnitRegex);
  if (match) {
    parameters.tolerance = Number(match[1]);
    return;
  }
  const tolKeywordRegex = /tolerance\s+(\d+(?:\.\d+)?)/i;
  const kwMatch = query.match(tolKeywordRegex);
  if (kwMatch) {
    parameters.tolerance = Number(kwMatch[1]);
    return;
  }
  const bareNumber = query.match(/(\d+(?:\.\d+)?)/);
  if (bareNumber) {
    parameters.tolerance = Number(bareNumber[1]);
  }
}

/**
 * Extract target CRS from a query for reproject-like operations.
 * Handles "EPSG:32610", "EPSG 32610", "EPSG32610", "32610" (bare), "WGS84", "state plane", "UTM".
 */
function extractCrsParams(query: string, parameters: Record<string, any>): void {
  // EPSG with colon or space or concatenated: EPSG:32610, EPSG 32610, EPSG32610
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
  // Bare number (likely an EPSG code without prefix): "reproject to 32610"
  const bareNumberMatch = query.match(/\bto\s+(\d{4,6})\b/i) || query.match(/\b(\d{4,6})\s*$/i);
  if (bareNumberMatch) {
    parameters.target_crs = `EPSG:${bareNumberMatch[1]}`;
    return;
  }
}

/**
 * Extract grouping field from "dissolve <source> by <field>" pattern.
 * Handles "dissolve by zone" (no artifact name) and "dissolve parcels by zone".
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
  const byMatch = query.match(/\bby\s+(\w+)\s*$/i) || query.match(/\bby\s+(\w+)/i);
  if (byMatch) {
    const fieldName = byMatch[1].trim();
    parameters.source_key = fieldName;
    parameters.join_key = fieldName;
  }

  const joinToMatch = query.match(/\bjoin\s+(.+?)\s+to\s+(.+?)(?:\s+by\b|$)/i);
  if (joinToMatch) {
    parameters.join_table = `$join_table`;
    parameters.source = `$source`;
  }

  if (!parameters.source && /\bsource\b/.test(query)) {
    parameters.source = '$source';
  }
}

/**
 * Extract overlay artifact reference for intersect-like operations.
 */
function extractOverlayParams(query: string, parameters: Record<string, any>): void {
  if (/\boverlay\b/.test(query)) {
    parameters.overlay = '$overlay';
    return;
  }
  const withMatch = query.match(/\bwith\s+(?:the\s+)?(\w[\w\s]*?)(?:\s*$)/i);
  if (withMatch) {
    parameters.overlay = '$overlay';
  }
}

/**
 * Extract mask artifact reference for clip-like operations.
 * Handles both "clip parcels to boundary" and "clip parcels with floodzone".
 */
function extractMaskParams(query: string, parameters: Record<string, any>): void {
  if (/\bmask\b/.test(query)) {
    parameters.mask = '$mask';
    return;
  }
  // Handle "to" preposition
  const toMatch = query.match(/\bto\s+(?:the\s+)?(\w[\w\s]*?)(?:\s*$)/i);
  if (toMatch) {
    parameters.mask = '$mask';
    return;
  }
  // Handle "with" preposition (e.g., "clip parcels with floodzone")
  const withMatch = query.match(/\bwith\s+(?:the\s+)?(\w[\w\s]*?)(?:\s*$)/i);
  if (withMatch) {
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

  if (hasDistanceParam(intent)) {
    extractDistanceParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  if (hasToleranceParam(intent)) {
    extractToleranceParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  if (hasTargetCrsParam(intent)) {
    extractCrsParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  if (hasGroupingFieldParam(intent)) {
    extractDissolveGroupedParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  if (hasJoinTableParam(intent)) {
    extractAttributeJoinParams(query, parameters);
    return parameters;
  }

  if (hasOverlayParam(intent)) {
    extractOverlayParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

  if (hasMaskParam(intent)) {
    extractMaskParams(query, parameters);
    extractSourceArtifact(query, intent, parameters);
    return parameters;
  }

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
 */
function extractGenericParams(
  query: string,
  intent: OperationIntent,
  parameters: Record<string, any>,
): void {
  const lower = query.toLowerCase();
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

  intent.parameters.forEach((param) => {
    if (param.type === 'artifact' && param.role) {
      const roleWords = param.role.split('-').join(' ');
      if (lower.includes(roleWords)) {
        parameters[param.name] = `$${param.role}`;
      }
    }
  });

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

  const numberMatches = query.match(/\d+(\.\d+)?/g);
  if (numberMatches) {
    const numbers = numberMatches.map(Number);
    chain.parameters.forEach((param, index) => {
      if (param.type === 'number' && numbers[index] !== undefined) {
        parameters[param.name] = numbers[index];
      }
    });
  }

  chain.parameters.forEach((param) => {
    if (param.type === 'artifact') {
      if (lower.includes(param.name) || lower.includes(param.description.toLowerCase())) {
        parameters[param.name] = `$${param.name}`;
      }
    }
  });

  return parameters;
}

/**
 * Extract parameters from a query (public API).
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
    return extractOperationParameters(query, intent);
  } else {
    const chain = chainRegistry[candidate.id];
    if (!chain) return {};
    return extractChainParameters(query, chain);
  }
}

/**
 * Compute match confidence between query and a set of triggers.
 */
export function computeTriggerConfidence(query: string, triggers: string[]): number {
  const lower = query.toLowerCase();
  let maxScore = 0;
  let totalScore = 0;
  let matchCount = 0;

  for (const trigger of triggers) {
    if (lower.includes(trigger)) {
      const position = lower.indexOf(trigger);
      const lengthRatio = trigger.length / query.length;
      const positionPenalty = position === 0 ? 1.0 : 0.9;
      const score = lengthRatio * positionPenalty;
      totalScore += score;
      matchCount++;
      if (score > maxScore) maxScore = score;
    } else if (trigger.includes(' ')) {
      const fuzzyScore = computeFuzzyTriggerScore(lower, trigger);
      if (fuzzyScore > 0) {
        totalScore += fuzzyScore;
        matchCount++;
        if (fuzzyScore > maxScore) maxScore = fuzzyScore;
      }
    }
  }

  if (matchCount === 0) return 0;

  const averageScore = totalScore / matchCount;
  const matchBonus = Math.min(0.2, matchCount * 0.05);

  return Math.min(1.0, (maxScore * 0.7 + averageScore * 0.3) + matchBonus);
}

/**
 * Compute fuzzy match score for a multi-word trigger.
 */
function computeFuzzyTriggerScore(query: string, trigger: string): number {
  const words = trigger.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  let pos = 0;
  for (const word of words) {
    const idx = query.indexOf(word, pos);
    if (idx === -1) return 0;
    pos = idx + word.length;
  }

  const totalWordLength = words.reduce((sum, w) => sum + w.length, 0);
  const lengthRatio = totalWordLength / query.length;
  const score = lengthRatio * 0.5;
  return score;
}
