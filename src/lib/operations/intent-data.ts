/**
 * Intent data for all operations.
 *
 * This file contains the AI-facing natural language metadata for each operation.
 * It should be merged with the OPERATION_REGISTRY via the `intent` field.
 */

import type { OperationIntent } from './types';

export const OPERATION_INTENT_MAP: Record<string, OperationIntent> = {

  // ═══════════════════════════════════════════════════════════════════
  // SINGLE-GEOMETRY FAMILY
  // ═══════════════════════════════════════════════════════════════════

  'buffer': {
    triggers: ['buffer', 'around', 'near', 'within distance', 'proximity', 'distance from', 'expand', 'grow', 'inflate'],
    description: 'Create a zone around features at a specified distance. The output is a new polygon layer representing the buffered area.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to buffer',
        role: 'source',
      },
      {
        name: 'distance',
        type: 'number',
        required: true,
        description: 'Buffer distance',
        unit_hint: 'map units (meters for projected CRS, degrees for geographic CRS)',
      },
    ],
    typical_use: 'Find everything within a certain distance of features. Common for proximity analysis, impact zones, and service areas.',
    examples: [
      {
        query: 'Buffer the rivers by 500 feet',
        resolution: 'Apply buffer-v1 to the rivers artifact with distance=500. Note: unit depends on stored CRS.',
      },
      {
        query: 'Create a 1 mile zone around schools',
        resolution: 'Apply buffer-v1 with distance=5280 (feet) or 1609.34 (meters). AI should confirm unit with user.',
      },
      {
        query: 'What is near the wells?',
        resolution: 'Clarify distance. "Near" is ambiguous — ask how near.',
      },
    ],
    disambiguation: 'Buffer creates new geometry. Do not confuse with "within distance" spatial queries (which filter) or "expand" (which may mean zoom/extent).',
  },

  'centroid': {
    triggers: ['centroid', 'center point', 'middle', 'center of', 'centerpoint', 'geometric center', 'label point'],
    description: 'Find the geometric center point of each feature. Output is a point layer with one point per input feature.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to find centroids of',
        role: 'source',
      },
    ],
    typical_use: 'Convert polygons/lines to points for labeling, point-based analysis, or distance calculations.',
    examples: [
      {
        query: 'Get the center of each parcel',
        resolution: 'Apply centroid-v1 to the parcels artifact.',
      },
      {
        query: 'Create label points for the counties',
        resolution: 'Apply centroid-v1 to the counties artifact.',
      },
    ],
    disambiguation: 'Centroid is a geometric calculation. Do not confuse with "center" as in the center of a map view, or "center of mass" (weighted centroid, not currently supported).',
  },

  'convex-hull-v1': {
    triggers: ['convex hull', 'bounding shape', 'minimum convex', 'hull', 'outline', 'convex polygon', 'smallest convex shape'],
    description: 'Create the smallest convex polygon that contains all features in the input. One output polygon.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to compute the convex hull of (polygon/multipolygon only)',
        role: 'source',
      },
    ],
    typical_use: 'Get a simplified boundary around a complex or scattered set of polygons. Useful for extent approximation, study area definition, or rough boundary generation.',
    examples: [
      {
        query: 'What is the convex hull of the parcels?',
        resolution: 'Apply convex-hull-v1 to the parcels artifact.',
      },
      {
        query: 'Draw the minimum bounding shape around the wetlands',
        resolution: 'Apply convex-hull-v1 to the wetlands artifact.',
      },
    ],
    disambiguation: 'Convex hull is always convex (no concavities). Do not confuse with "envelope" (axis-aligned bounding box) or "concave hull" (not currently supported).',
  },

  'envelope-v1': {
    triggers: ['envelope', 'bounding box', 'extent', 'bounding rectangle', 'bbox', 'bounds', 'bounding polygon', 'min/max coordinates'],
    description: 'Create an axis-aligned bounding box polygon for the input features. One output polygon in the same CRS.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to compute the bounding box of (polygon/multipolygon only)',
        role: 'source',
      },
    ],
    typical_use: 'Get the rectangular extent of a layer. Useful for defining study areas, clipping regions, or map framing.',
    examples: [
      {
        query: 'Get the bounding box of the parcels',
        resolution: 'Apply envelope-v1 to the parcels artifact.',
      },
      {
        query: 'What is the extent of the flood zone?',
        resolution: 'Apply envelope-v1 to the flood zone artifact.',
      },
    ],
    disambiguation: 'Envelope is axis-aligned (follows coordinate axes). Do not confuse with "convex hull" (smallest convex polygon, can be rotated) or "extent" as a map display concept.',
  },

  'simplify-v1': {
    triggers: ['simplify', 'smooth', 'reduce vertices', 'generalize', 'simplification', 'reduce complexity', 'less detailed', 'clean up geometry'],
    description: 'Reduce the number of vertices in polygon geometries while preserving overall shape. Tolerance controls how aggressively vertices are removed.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to simplify (polygon/multipolygon only)',
        role: 'source',
      },
      {
        name: 'tolerance',
        type: 'number',
        required: true,
        description: 'Simplification tolerance — higher values remove more vertices. Interpreted in source CRS units.',
        unit_hint: 'source CRS units (meters for projected CRS)',
      },
    ],
    typical_use: 'Reduce file size, speed up rendering, or generalize detailed boundaries for smaller-scale maps.',
    examples: [
      {
        query: 'Simplify the county boundaries',
        resolution: 'Apply simplify-v1. AI should ask for tolerance or suggest a default.',
      },
      {
        query: 'Reduce the detail on the coastline',
        resolution: 'Apply simplify-v1 to the coastline artifact. Ask for tolerance.',
      },
    ],
    disambiguation: 'Simplify reduces vertices but keeps the same features. Do not confuse with "dissolve" (which merges features) or "generalize" in a cartographic sense (which may also include merging).',
  },

  // ═══════════════════════════════════════════════════════════════════
  // CRS FAMILY
  // ═══════════════════════════════════════════════════════════════════

  'reproject': {
    triggers: ['reproject', 'change CRS', 'convert coordinates', 'transform', 'change projection', 'to lat/lon', 'to WGS84', 'to UTM', 'to state plane', 'EPSG'],
    description: 'Transform coordinates from one coordinate reference system to another. Does not change geometry shape, only the coordinate values.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to reproject',
        role: 'source',
      },
      {
        name: 'target_crs',
        type: 'crs',
        required: true,
        description: 'Target CRS (e.g., "EPSG:4326", "EPSG:3857", "EPSG:2226")',
      },
    ],
    typical_use: 'Align layers with different CRS for overlay operations, or convert to a standard CRS for export/sharing.',
    examples: [
      {
        query: 'Reproject to WGS84',
        resolution: 'Apply reproject with target_crs="EPSG:4326".',
      },
      {
        query: 'Convert to UTM zone 10N',
        resolution: 'Apply reproject with target_crs="EPSG:32610".',
      },
      {
        query: 'Make this layer match the other layer\'s CRS',
        resolution: 'Read the other layer\'s CRS, then apply reproject with that as target.',
      },
    ],
    disambiguation: 'Reproject changes coordinate values. Do not confuse with "display transformation" (which is temporary for map rendering) or "CRS assign" (which only labels, does not transform).',
  },

  'crs-assign': {
    triggers: ['set CRS', 'assign CRS', 'declare CRS', 'this is actually', 'the CRS is', 'fix the CRS', 'wrong CRS', 'missing CRS'],
    description: 'Set or correct the CRS metadata on a layer WITHOUT transforming coordinates. Use when the layer has wrong or missing CRS metadata but the coordinates are already in the intended system.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to assign CRS to',
        role: 'source',
      },
      {
        name: 'crs',
        type: 'crs',
        required: true,
        description: 'The CRS the coordinates are actually in (e.g., "EPSG:4326")',
      },
    ],
    typical_use: 'Fix layers that have missing or incorrect CRS metadata. Common with legacy Shapefiles or data from systems that don\'t embed CRS info.',
    examples: [
      {
        query: 'This shapefile is in state plane but has no CRS defined',
        resolution: 'Apply crs-assign with the correct state plane EPSG code.',
      },
      {
        query: 'Set the CRS to EPSG:2226',
        resolution: 'Apply crs-assign with crs="EPSG:2226". AI should warn that this does NOT transform coordinates.',
      },
    ],
    disambiguation: 'CRS assign is metadata-only — it labels the CRS but does NOT move coordinates. If coordinates need to actually change, use reproject instead. The AI should always clarify which one the user wants.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // TOPOLOGY (TWO-INPUT) FAMILY
  // ═══════════════════════════════════════════════════════════════════

  'clip-v1': {
    triggers: ['clip', 'cut', 'trim to', 'mask', 'crop', 'within boundary', 'inside', 'intersect with boundary', 'limit to', 'constrain to', 'chop'],
    description: 'Cut a spatial layer to fit within a boundary. Features or parts of features outside the boundary are removed. The boundary layer defines the clipping region.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to clip (polygon/multipolygon only)',
        role: 'source',
      },
      {
        name: 'mask',
        type: 'artifact',
        required: true,
        description: 'The boundary layer to clip to (polygon/multipolygon only)',
        role: 'mask',
      },
    ],
    typical_use: 'Reduce a dataset to a study area. Common for county-level analysis, watershed boundaries, or project extents.',
    examples: [
      {
        query: 'Clip the parcels to Butte County',
        resolution: 'Apply clip-v1 with parcels as source and Butte County as mask.',
      },
      {
        query: 'I only want the parcels inside the watershed',
        resolution: 'Apply clip-v1 with parcels as source and watershed as mask.',
      },
      {
        query: 'Trim this to the project boundary',
        resolution: 'Apply clip-v1 with the layer as source and project boundary as mask.',
      },
    ],
    disambiguation: 'Clip cuts geometry. Do not confuse with "filter" (which removes whole features based on attributes) or "intersect" (which finds the overlapping area between two layers).',
  },

  'intersect-v1': {
    triggers: ['intersect', 'overlap', 'where they overlap', 'common area', 'shared area', 'intersection', 'find overlap', 'overlapping areas'],
    description: 'Find the area where two spatial layers overlap. Output contains only the overlapping portions, with attributes from the source layer.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The primary spatial layer (polygon/multipolygon only)',
        role: 'source',
      },
      {
        name: 'overlay',
        type: 'artifact',
        required: true,
        description: 'The overlay layer to find overlap with (polygon/multipolygon only)',
        role: 'overlay',
      },
    ],
    typical_use: 'Find where two layers overlap. Common for suitability analysis, conflict detection, or identifying shared areas.',
    examples: [
      {
        query: 'Find where parcels overlap the flood zone',
        resolution: 'Apply intersect-v1 with parcels as source and flood zone as overlay.',
      },
      {
        query: 'What areas are in both the watershed and the county?',
        resolution: 'Apply intersect-v1 with watershed as source and county as overlay.',
      },
    ],
    disambiguation: 'Intersect finds the overlapping geometry. Do not confuse with "clip" (which cuts to a boundary) or "within" (a spatial query/filter, not a geometry operation).',
  },

  'attribute-join-v1': {
    triggers: ['join', 'merge', 'combine', 'attach data', 'link', 'relate', 'add attributes', 'lookup', 'match by field', 'join by column', 'enrich'],
    description: 'Attach attributes from one table to another by matching a common field. Left join: all source rows are preserved, matching rows from the join table are added. Source geometry is preserved.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The primary artifact (spatial or tabular)',
        role: 'source',
      },
      {
        name: 'join_table',
        type: 'artifact',
        required: true,
        description: 'The table to join attributes from',
        role: 'join_table',
      },
      {
        name: 'source_key',
        type: 'field',
        required: true,
        description: 'Field in the source to match on',
        source: 'primary',
      },
      {
        name: 'join_key',
        type: 'field',
        required: true,
        description: 'Field in the join table to match on',
        source: 'secondary',
      },
      {
        name: 'selected_fields',
        type: 'string',
        required: false,
        description: 'Which fields from the join table to include (default: all)',
      },
    ],
    typical_use: 'Enrich a spatial layer with data from a related table. Common for adding owner names to parcels, attaching census data, or linking any relational data.',
    examples: [
      {
        query: 'Join the ownership data to the parcels by APN',
        resolution: 'Apply attribute-join-v1 with parcels as source, ownership as join_table, source_key="APN", join_key="APN".',
      },
      {
        query: 'Add the census income data to the block groups',
        resolution: 'Apply attribute-join-v1 with block groups as source, census data as join_table. Ask for the key field.',
      },
    ],
    disambiguation: 'Attribute join merges rows by key. Do not confuse with "merge" (combining geometries of the same layer), "dissolve" (aggregating features), or "spatial join" (matching by location, not currently supported).',
  },

  // ═══════════════════════════════════════════════════════════════════
  // MEASUREMENT FAMILY
  // ═══════════════════════════════════════════════════════════════════

  'area-v1': {
    triggers: ['area', 'acreage', 'square footage', 'square meters', 'how big', 'size', 'hectares', 'calculate area', 'measure area', 'square feet', 'sqft'],
    description: 'Calculate the area of each feature. Output is a measurement table with one row per input feature. Results in square meters when CRS uses planar meters.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to measure (polygon/multipolygon only)',
        role: 'source',
      },
    ],
    typical_use: 'Measure how big features are. Common for land area calculations, parcel sizes, or comparing feature sizes.',
    examples: [
      {
        query: 'Calculate the area of each parcel',
        resolution: 'Apply area-v1 to the parcels artifact.',
      },
      {
        query: 'How big is each county?',
        resolution: 'Apply area-v1 to the counties artifact.',
      },
      {
        query: 'What is the acreage of the flood zone?',
        resolution: 'Apply area-v1 to the flood zone. Note: output is square meters; user may want conversion to acres.',
      },
    ],
    disambiguation: 'Area measures geometry. Do not confuse with "area" as a geographic region ("the downtown area") or "area" as a display concept.',
  },

  'perimeter-v1': {
    triggers: ['perimeter', 'boundary length', 'border length', 'edge length', 'how long is the boundary', 'circumference', 'length of boundary'],
    description: 'Calculate the perimeter (boundary length) of each feature. Output is a measurement table with one row per input feature. Results in meters when CRS uses planar meters.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to measure (polygon/multipolygon only)',
        role: 'source',
      },
    ],
    typical_use: 'Measure boundary lengths. Common for fencing requirements, border analysis, or comparing feature shapes.',
    examples: [
      {
        query: 'What is the perimeter of each parcel?',
        resolution: 'Apply perimeter-v1 to the parcels artifact.',
      },
      {
        query: 'How long is the county border?',
        resolution: 'Apply perimeter-v1 to the county artifact.',
      },
    ],
    disambiguation: 'Perimeter measures polygon boundaries. Do not confuse with "length" (which measures line features, not currently supported) or "area" (which measures interior, not boundary).',
  },

  'compactness-v1': {
    triggers: ['compactness', 'shape factor', 'how circular', 'how round', 'shape ratio', 'polbsby-perimeter', 'form factor', 'irregularity'],
    description: 'Calculate how compact (circular) each feature is, using the ratio of area to perimeter. Value of 1.0 = perfect circle; lower values = more elongated or irregular.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to measure (polygon/multipolygon only)',
        role: 'source',
      },
    ],
    typical_use: 'Quantify shape. Common for gerrymandering analysis, comparing district shapes, or identifying irregularly shaped parcels.',
    examples: [
      {
        query: 'How compact are the council districts?',
        resolution: 'Apply compactness-v1 to the districts artifact.',
      },
      {
        query: 'Which parcels are most irregular?',
        resolution: 'Apply compactness-v1 to the parcels. Lower values = more irregular.',
      },
    ],
    disambiguation: 'Compactness is a unitless shape metric. Do not confuse with "area" or "perimeter" (which measure size/length, not shape).',
  },

  // ═══════════════════════════════════════════════════════════════════
  // AGGREGATION FAMILY
  // ═══════════════════════════════════════════════════════════════════

  'dissolve-grouped-v1': {
    triggers: ['dissolve by', 'merge by', 'aggregate by', 'combine by', 'union by', 'group by', 'dissolve into groups', 'merge features by attribute'],
    description: 'Merge features that share the same value in a specified field. Each group becomes one output polygon. The grouping field is preserved.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to dissolve (polygon/multipolygon only)',
        role: 'source',
      },
      {
        name: 'grouping_field',
        type: 'field',
        required: true,
        description: 'The field to group by — features with the same value are merged',
        source: 'primary',
      },
    ],
    typical_use: 'Aggregate features by a shared attribute. Common for merging parcels by owner, combining census tracts by county, or creating regions from sub-units.',
    examples: [
      {
        query: 'Dissolve parcels by owner name',
        resolution: 'Apply dissolve-grouped-v1 with parcels as source, grouping_field="owner_name".',
      },
      {
        query: 'Merge the tracts into counties',
        resolution: 'Apply dissolve-grouped-v1 with tracts as source, grouping_field="county_fips".',
      },
      {
        query: 'Combine all the parcels in each zip code',
        resolution: 'Apply dissolve-grouped-v1 with parcels as source, grouping_field="zip_code".',
      },
    ],
    disambiguation: 'Dissolve merges features by attribute. Do not confuse with "clip" (which cuts to a boundary), "union" (spatial union of two layers), or "merge" (which may mean combining two separate layers, not aggregating within one).',
  },

  'dissolve-global': {
    triggers: ['dissolve all', 'merge all', 'combine all', 'union all', 'one big polygon', 'single polygon', 'merge everything', 'dissolve into one'],
    description: 'Merge ALL features in a layer into a single output polygon. No grouping field — the entire layer becomes one geometry.',
    parameters: [
      {
        name: 'source',
        type: 'artifact',
        required: true,
        description: 'The spatial layer to dissolve (polygon/multipolygon only)',
        role: 'source',
      },
    ],
    typical_use: 'Create a single boundary from many features. Common for creating a study area outline, merging all parcels into a district boundary, or simplifying a complex layer.',
    examples: [
      {
        query: 'Merge all the parcels into one polygon',
        resolution: 'Apply dissolve-global to the parcels artifact.',
      },
      {
        query: 'Create a single boundary for the whole county',
        resolution: 'Apply dissolve-global to the county subdivisions artifact.',
      },
    ],
    disambiguation: 'Global dissolve merges everything into one polygon. Do not confuse with "dissolve by field" (which preserves groups) or "convex hull" (which creates a convex boundary, not a union).',
  },
};