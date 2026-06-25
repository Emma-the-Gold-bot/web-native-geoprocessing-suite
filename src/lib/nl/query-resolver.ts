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
      const parameters = extractOperationParameters(lower, intent);
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
      const parameters = extractChainParameters(lower, chain);
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

/**
 * Extract parameters from a query for an operation.
 */
function extractOperationParameters(
  query: string,
  intent: OperationIntent,
): Record<string, any> {
  const parameters: Record<string, any> = {};

  // Extract numbers for distance, tolerance, etc.
  const numberMatches = query.match(/\d+(\.\d+)?/g);
  if (numberMatches) {
    const numbers = numberMatches.map(Number);
    
    // Look for parameter hints in the query
    intent.parameters.forEach((param, index) => {
      if (param.type === 'number') {
        // Simple heuristic: first number for first numeric param, etc.
        if (numbers[index] !== undefined) {
          parameters[param.name] = numbers[index];
        }
        
        // Check for unit hints
        if (param.name === 'distance') {
          if (query.includes('feet') || query.includes('ft')) {
            parameters[`${param.name}_unit`] = 'feet';
          } else if (query.includes('mile') || query.includes('mi')) {
            parameters[`${param.name}_unit`] = 'miles';
          } else if (query.includes('meter') || query.includes('m')) {
            parameters[`${param.name}_unit`] = 'meters';
          }
        }
      }
    });
  }

  // Extract artifact references based on role hints
  intent.parameters.forEach((param) => {
    if (param.type === 'artifact' && param.role) {
      // Look for artifact names in the query that match role hints
      const roleWords = param.role.split('-').join(' ');
      if (query.includes(roleWords)) {
        parameters[param.name] = `$${param.role}`;
      }
    }
  });

  // Extract CRS references
  const crsMatch = query.match(/EPSG:\d+/i) || query.match(/WGS84/i) || query.match(/UTM/i) || query.match(/state plane/i);
  if (crsMatch) {
    intent.parameters.forEach((param) => {
      if (param.type === 'crs') {
        parameters[param.name] = crsMatch[0].toUpperCase();
      }
    });
  }

  return parameters;
}

/**
 * Extract parameters from a query for a chain.
 */
function extractChainParameters(
  query: string,
  chain: ChainDefinition,
): Record<string, any> {
  const parameters: Record<string, any> = {};

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
      // Look for the parameter name or description in the query
      if (query.includes(param.name) || query.includes(param.description.toLowerCase())) {
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
    return extractOperationParameters(query.toLowerCase(), intent);
  } else {
    const chain = chainRegistry[candidate.id];
    if (!chain) return {};
    return extractChainParameters(query.toLowerCase(), chain);
  }
}

/**
 * Compute match confidence between query and a set of triggers.
 * Improved scoring: considers trigger length, position, and multiple matches.
 */
export function computeTriggerConfidence(query: string, triggers: string[]): number {
  const lower = query.toLowerCase();
  let maxScore = 0;
  let totalScore = 0;
  let matchCount = 0;

  for (const trigger of triggers) {
    if (lower.includes(trigger)) {
      // Score based on trigger length and position
      const position = lower.indexOf(trigger);
      const lengthRatio = trigger.length / query.length;
      const positionPenalty = position === 0 ? 1.0 : 0.9;
      const score = lengthRatio * positionPenalty;
      totalScore += score;
      matchCount++;
      if (score > maxScore) maxScore = score;
    }
  }

  // Combine max score with match count bonus
  if (matchCount === 0) return 0;
  
  const averageScore = totalScore / matchCount;
  const matchBonus = Math.min(0.2, matchCount * 0.05);
  
  return Math.min(1.0, (maxScore * 0.7 + averageScore * 0.3) + matchBonus);
}