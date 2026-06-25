/**
 * Chain registry for composed workflows.
 *
 * Pre-built sequences of operations with parameter bindings.
 */

import type { OperationIntent } from './types';

export interface ChainStepInput {
  /** Reference: "$param_name" for user params, "$stepN.output" for step outputs */
  ref: string;
}

export interface ChainStep {
  /** Operation id from OPERATION_REGISTRY */
  op: string;

  /** Named inputs — values are refs to step outputs or user params */
  inputs: Record<string, string>;

  /** Optional: override default output name */
  output_name?: string;

  /** Optional condition for conditional execution */
  condition?: string;
}

export interface ChainParameter {
  name: string;
  type: 'artifact' | 'number' | 'string' | 'field' | 'crs';
  required: boolean;
  description: string;
  /** For type='artifact': which step consumes this */
  consumed_by?: number;
}

export interface ChainIntent {
  triggers: string[];
  description: string;
  typical_use: string;
  examples: Array<{ query: string; resolution: string }>;
}

export interface ChainDefinition {
  id: string;
  label: string;
  description: string;
  intent: ChainIntent;
  parameters: ChainParameter[];
  steps: ChainStep[];
}

// ─── Chain registry ─────────────────────────────────────────────────

export const CHAIN_REGISTRY: Record<string, ChainDefinition> = {

  // ═══════════════════════════════════════════════════════════════════
  // ANALYSIS CHAINS
  // ═══════════════════════════════════════════════════════════════════

  'area-within-boundary': {
    id: 'area-within-boundary',
    label: 'Area within boundary',
    description: 'Clip a layer to a boundary, then measure the area of each resulting feature.',
    intent: {
      triggers: [
        'area within', 'area inside', 'acreage in', 'how big within',
        'size inside', 'area clipped to', 'area trimmed to',
        'measure area within', 'calculate area inside',
      ],
      description: 'First reduce the dataset to a boundary, then measure the area of each feature within that boundary.',
      typical_use: 'Measure feature sizes within a study area. Common for "how much land in each parcel within the county?" or "acreage of each zone inside the watershed."',
      examples: [
        {
          query: 'What is the area of each parcel within Butte County?',
          resolution: 'Chain: clip parcels to Butte County → calculate area of clipped result.',
        },
        {
          query: 'Calculate the acreage of each land use type inside the watershed',
          resolution: 'Chain: clip land use to watershed → calculate area of clipped result.',
        },
      ],
    },
    parameters: [
      { name: 'source', type: 'artifact', required: true, description: 'The layer to measure', consumed_by: 0 },
      { name: 'boundary', type: 'artifact', required: true, description: 'The boundary to clip to', consumed_by: 0 },
    ],
    steps: [
      {
        op: 'clip-v1',
        inputs: { source: '$source', mask: '$boundary' },
        output_name: '$source_clipped',
      },
      {
        op: 'area-v1',
        inputs: { source: '$step0.output' },
      },
    ],
  },

  'area-by-owner': {
    id: 'area-by-owner',
    label: 'Area by owner',
    description: 'Calculate area of each parcel, then join owner data, so you can see area alongside ownership.',
    intent: {
      triggers: [
        'area by owner', 'acreage by owner', 'how much land per owner',
        'parcel sizes with ownership', 'area with owner names',
        'land area and ownership',
      ],
      description: 'Measure parcel areas and enrich with ownership data in one workflow.',
      typical_use: 'Land accountability analysis. Common for "show me the area of each parcel with the owner name" or "how much land does each owner have?"',
      examples: [
        {
          query: 'Show me the area of each parcel with the owner name',
          resolution: 'Chain: calculate area → join ownership data by APN → result has area + owner.',
        },
        {
          query: 'How much land does each owner have?',
          resolution: 'Chain: calculate area → join ownership by APN → then SQL to sum area by owner.',
        },
      ],
    },
    parameters: [
      { name: 'parcels', type: 'artifact', required: true, description: 'Parcel layer', consumed_by: 0 },
      { name: 'ownership', type: 'artifact', required: true, description: 'Ownership table or layer', consumed_by: 1 },
      { name: 'parcel_key', type: 'field', required: true, description: 'Key field in parcels (e.g., APN)', consumed_by: 1 },
      { name: 'owner_key', type: 'field', required: true, description: 'Key field in ownership table', consumed_by: 1 },
    ],
    steps: [
      {
        op: 'area-v1',
        inputs: { source: '$parcels' },
        output_name: '$parcels_areas',
      },
      {
        op: 'attribute-join-v1',
        inputs: {
          source: '$step0.output',
          join_table: '$ownership',
          source_key: '$parcel_key',
          join_key: '$owner_key',
        },
        output_name: '$parcels_with_owners',
      },
    ],
  },

  'conflict-detection': {
    id: 'conflict-detection',
    label: 'Conflict detection (overlay + attribute enrichment)',
    description: 'Find where two layers overlap and enrich with attributes from both. Common for governance conflict analysis.',
    intent: {
      triggers: [
        'conflicts', 'conflict detection', 'who owns what overlaps',
        'find conflicts of interest', 'overlay and enrich',
        'who governs what they own', 'self-interest',
        'board members who own land', 'overlap with attributes',
      ],
      description: 'Find overlapping areas and attach attributes from both layers. Used for governance transparency and conflict of interest detection.',
      typical_use: 'AquaGraph-style conflict detection: overlay governance boundaries with ownership, then enrich with both attribute sets.',
      examples: [
        {
          query: 'Show me board members who own land in their district',
          resolution: 'Chain: intersect parcels with district boundaries → join board member data → result shows overlapping parcels with governance context.',
        },
        {
          query: 'Find parcels that overlap the flood zone with owner info',
          resolution: 'Chain: intersect parcels with flood zone → join ownership data.',
        },
      ],
    },
    parameters: [
      { name: 'source', type: 'artifact', required: true, description: 'Primary layer (e.g., parcels)', consumed_by: 0 },
      { name: 'overlay', type: 'artifact', required: true, description: 'Overlay layer (e.g., governance boundaries)', consumed_by: 0 },
      { name: 'enrichment', type: 'artifact', required: false, description: 'Optional table to join for additional context', consumed_by: 1 },
      { name: 'source_key', type: 'field', required: false, description: 'Join key in source', consumed_by: 1 },
      { name: 'enrichment_key', type: 'field', required: false, description: 'Join key in enrichment table', consumed_by: 1 },
    ],
    steps: [
      {
        op: 'intersect-v1',
        inputs: { source: '$source', overlay: '$overlay' },
        output_name: '$overlapping_features',
      },
      {
        op: 'attribute-join-v1',
        inputs: {
          source: '$step0.output',
          join_table: '$enrichment',
          source_key: '$source_key',
          join_key: '$enrichment_key',
        },
        // Only runs if enrichment params are provided
        condition: 'enrichment provided',
        output_name: '$enriched_conflicts',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // DATA PREPARATION CHAINS
  // ═══════════════════════════════════════════════════════════════════

  'prepare-for-analysis': {
    id: 'prepare-for-analysis',
    label: 'Prepare for analysis',
    description: 'Reproject a layer to a projected CRS suitable for area/distance calculations, then simplify for performance.',
    intent: {
      triggers: [
        'prepare for analysis', 'make ready', 'clean up for analysis',
        'reproject and simplify', 'get ready for measurement',
        'set up for area calculation',
      ],
      description: 'Reproject to a measurement-friendly CRS and optionally simplify for performance.',
      typical_use: 'Prepare a geographic-CRS layer for accurate area/distance measurements by projecting to a suitable planar CRS.',
      examples: [
        {
          query: 'Prepare the parcels for area analysis',
          resolution: 'Chain: reproject to appropriate projected CRS (ask which one or suggest UTM/State Plane) → simplify if needed.',
        },
      ],
    },
    parameters: [
      { name: 'source', type: 'artifact', required: true, description: 'Layer to prepare', consumed_by: 0 },
      { name: 'target_crs', type: 'crs', required: true, description: 'Target projected CRS', consumed_by: 0 },
      { name: 'tolerance', type: 'number', required: false, description: 'Simplification tolerance (skip if not provided)', consumed_by: 1 },
    ],
    steps: [
      {
        op: 'reproject',
        inputs: { source: '$source', target_crs: '$target_crs' },
        output_name: '$source_projected',
      },
      {
        op: 'simplify-v1',
        inputs: { source: '$step0.output', tolerance: '$tolerance' },
        condition: 'tolerance provided',
        output_name: '$source_simplified',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SHAPE ANALYSIS CHAINS
  // ═══════════════════════════════════════════════════════════════════

  'shape-analysis': {
    id: 'shape-analysis',
    label: 'Shape analysis',
    description: 'Calculate area and compactness together to characterize feature shapes.',
    intent: {
      triggers: [
        'shape analysis', 'shape metrics', 'how irregular', 'form analysis',
        'size and shape', 'compactness and area', 'gerrymandering analysis',
        'district shape', 'parcel shape',
      ],
      description: 'Measure both size and shape characteristics of features.',
      typical_use: 'Characterize feature geometry. Common for gerrymandering detection, parcel regularity assessment, or comparing shapes across a dataset.',
      examples: [
        {
          query: 'Analyze the shape of each council district',
          resolution: 'Chain: calculate area → join back → calculate compactness → join back. Result has both metrics per district.',
        },
        {
          query: 'Which parcels are most irregular?',
          resolution: 'Chain: calculate compactness (lower = more irregular). Direct operation, no chain needed.',
        },
      ],
    },
    parameters: [
      { name: 'source', type: 'artifact', required: true, description: 'Layer to analyze', consumed_by: 0 },
    ],
    steps: [
      {
        op: 'area-v1',
        inputs: { source: '$source' },
        output_name: '$areas',
      },
      {
        op: 'compactness-v1',
        inputs: { source: '$source' },
        output_name: '$compactness',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // PROXIMITY CHAINS
  // ═══════════════════════════════════════════════════════════════════

  'features-near-features': {
    id: 'features-near-features',
    label: 'Features near features',
    description: 'Buffer one layer, then intersect with another to find features within a distance of target features.',
    intent: {
      triggers: [
        'near', 'within distance of', 'close to', 'proximity to',
        'parcels near rivers', 'features around', 'what is near',
        'within 500 feet of', 'within 1 mile of',
      ],
      description: 'Find features within a specified distance of other features.',
      typical_use: 'Proximity analysis. Common for "parcels within 500 feet of a river" or "schools within 1 mile of highways."',
      examples: [
        {
          query: 'Find parcels within 500 feet of the river',
          resolution: 'Chain: buffer river by 500 feet → intersect parcels with buffered river.',
        },
        {
          query: 'What schools are within 1 mile of a highway?',
          resolution: 'Chain: buffer highway by 1 mile → intersect schools with buffered highway.',
        },
      ],
    },
    parameters: [
      { name: 'source', type: 'artifact', required: true, description: 'Layer to find features in (e.g., parcels)', consumed_by: 1 },
      { name: 'target', type: 'artifact', required: true, description: 'Layer to measure distance from (e.g., rivers)', consumed_by: 0 },
      { name: 'distance', type: 'number', required: true, description: 'Search distance', consumed_by: 0 },
    ],
    steps: [
      {
        op: 'buffer',
        inputs: { source: '$target', distance: '$distance' },
        output_name: '$target_buffer',
      },
      {
        op: 'intersect-v1',
        inputs: { source: '$source', overlay: '$step0.output' },
        output_name: '$nearby_features',
      },
    ],
  },
};

// ─── Helper: find chains by natural language trigger ─────────────────

/**
 * Find chains whose intent triggers match the given query.
 * Returns sorted by trigger specificity (more specific matches first).
 */
export function findChainsByTrigger(query: string): ChainDefinition[] {
  const lower = query.toLowerCase();
  const matches: Array<{ chain: ChainDefinition; score: number }> = [];

  for (const chain of Object.values(CHAIN_REGISTRY)) {
    for (const trigger of chain.intent.triggers) {
      if (lower.includes(trigger)) {
        // Score by trigger length (longer = more specific)
        matches.push({ chain, score: trigger.length });
        break;
      }
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .map(m => m.chain);
}

// ─── Helper: find operations by natural language trigger ─────────────

/**
 * Find operations whose intent triggers match the given query.
 * Requires OPERATION_INTENT_MAP to be imported separately.
 */
export function findOperationsByTrigger(
  query: string,
  intentMap: Record<string, OperationIntent>,
): Array<{ id: string; intent: OperationIntent; score: number }> {
  const lower = query.toLowerCase();
  const matches: Array<{ id: string; intent: OperationIntent; score: number }> = [];

  for (const [id, intent] of Object.entries(intentMap)) {
    for (const trigger of intent.triggers) {
      if (lower.includes(trigger)) {
        matches.push({ id, intent, score: trigger.length });
        break;
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}