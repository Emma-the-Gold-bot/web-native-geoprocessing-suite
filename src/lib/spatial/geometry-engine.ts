/**
 * Geometry Engine Interface
 * 
 * Provides geometry operations using GEOS-WASM.
 * This module defines the boundary between product artifacts and 
 * GEOS compute operations.
 */

import type {
  GeometryOperationInput,
  GeometryOperationResult,
  GeometryCapabilities,
  WarningRef,
} from './types';
import { createWarningFromCode } from './warning-codes';

export interface GeometryEngine {
  readonly initialized: boolean;
  initialize(): Promise<void>;
  buffer(input: GeometryOperationInput, distance: number, units: 'kilometers' | 'miles'): Promise<GeometryOperationResult>;
  centroid(input: GeometryOperationInput): Promise<GeometryOperationResult>;
  convexHull(input: GeometryOperationInput): Promise<GeometryOperationResult>;
  envelope(input: GeometryOperationInput): Promise<GeometryOperationResult>;
  simplify(input: GeometryOperationInput, tolerance: number): Promise<GeometryOperationResult>;
  dissolve(input: GeometryOperationInput, groupByField?: string): Promise<GeometryOperationResult>;
  clip(input: GeometryOperationInput, clipInput: GeometryOperationInput): Promise<GeometryOperationResult>;
  intersect(input: GeometryOperationInput, overlayInput: GeometryOperationInput): Promise<GeometryOperationResult>;
  getCapabilities(): GeometryCapabilities;
}

/**
 * Geometry engine capabilities - reflects what's actually implemented
 */
export const GEOMETRY_CAPABILITIES: GeometryCapabilities = {
  bufferSupport: {
    verified: 'validated_local',
    notes: ['Approximation caveats apply on the current support path.'],
  },
  centroidSupport: {
    verified: 'validated_local',
  },
  convexHullSupport: {
    verified: 'partial',
    notes: ['Convex hull v1: single-input Polygon or MultiPolygon only. Requires known stored CRS. Produces one derived polygon hull and preserves no source attributes.'],
  },
  envelopeSupport: {
    verified: 'partial',
    notes: ['Envelope v1: single-input Polygon or MultiPolygon only. Requires known stored CRS. Produces one derived polygon bounding box and preserves no source attributes.'],
  },
  simplifySupport: {
    verified: 'partial',
    notes: ['Simplify v1: single-input Polygon or MultiPolygon only. Requires known stored CRS. Uses a user-provided tolerance interpreted in source CRS units, preserves stored CRS, preserves source attributes, and does not claim auto-transform or topology-preserving behavior.'],
  },
  dissolveSupport: {
    verified: 'partial',
    notes: ['Global dissolve only. Grouped dissolve is not supported.'],
  },
  clipSupport: {
    verified: 'partial',
    notes: ['Clip v1: polygon/multipolygon source clipped by polygon/multipolygon mask only. Requires known matching CRS. Source attributes preserved for surviving features.'],
  },
  intersectSupport: {
    verified: 'partial',
    notes: ['Intersect v1: polygon/multipolygon source intersected with polygon/multipolygon overlay only. Requires known matching CRS. Preserves source attributes only and surfaces honest empty results.'],
  },
  maxFeatureCount: 10000, // Practical limit for browser-based GEOS
};

/**
 * Creates a warning for CRS ambiguity - uses typed warning code factory
 */
function createCrsWarning(): WarningRef {
  return createWarningFromCode('CRS_MISSING');
}

/**
 * Creates an error result
 */
function createErrorResult(code: string, message: string): GeometryOperationResult {
  return {
    success: false,
    output: undefined,
    warnings: [],
    errors: [{ code, message }],
  };
}

/**
 * Creates a success result
 */
function createSuccessResult(output: GeoJSON.FeatureCollection, warnings: WarningRef[] = []): GeometryOperationResult {
  return {
    success: true,
    output,
    warnings,
    errors: [],
  };
}

/**
 * Wraps a single geometry as a FeatureCollection
 */
function wrapAsFeatureCollection(geometry: GeoJSON.Geometry): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry,
        properties: {},
      },
    ],
  };
}

export {
  createCrsWarning,
  createErrorResult,
  createSuccessResult,
  wrapAsFeatureCollection,
};
