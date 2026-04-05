/**
 * Display Geometry Normalization Layer
 * 
 * Provides display-safe geometry transformations for map rendering.
 * 
 * CONTRACT:
 * - Artifact CRS metadata is NEVER modified - this is the source of truth
 * - Display transformations are computed on-the-fly, never persisted
 * - Only used for map rendering and bounds calculation (fitBounds)
 * - Original artifact.data remains unchanged
 * 
 * This layer solves the problem where:
 * - Projected CRS artifacts (EPSG:3857, UTM, etc.) cannot use MapLibre's fitBounds directly
 * - fitBounds expects geographic lng/lat in WGS84
 * - We need to preserve artifact CRS truth while still enabling auto-fit
 */

import type { Artifact } from '../../types';
import { getSpatialEngine } from './worker-bus';
import { isFeatureCollection } from '../../lib/utils';

interface DisplayFeatureCollectionResult {
  featureCollection: GeoJSON.FeatureCollection;
  status: DisplayTransformStatus;
  wasTransformed: boolean;
}

const displayFeatureCollectionPromiseCache = new WeakMap<Artifact, Promise<DisplayFeatureCollectionResult | null>>();

export interface DisplayBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Determine if a CRS is a projected CRS (non-geographic)
 * 
 * Geographic CRS use angular coordinates (degrees)
 * Projected CRS use linear coordinates (meters, feet, etc.)
 * 
 * This is a heuristic - we check for common projected CRS codes
 */
export function isProjectedCrs(crs: string | undefined): boolean {
  if (!crs || crs === 'unknown' || crs === undefined) {
    return false; // Unknown CRS treated as potentially geographic
  }
  
  // Common projected CRS patterns
  const projectedPatterns = [
    '3857', // Web Mercator
    '326',  // UTM zones (32610, 32611, etc.)
    '327',  // UTM southern hemisphere
    'ESRI:', // ESRI projections
    '+proj=', // PROJ string
  ];
  
  return projectedPatterns.some(pattern => crs.includes(pattern));
}

/**
 * Check if artifact needs display transformation
 * 
 * Returns true if:
 * - Artifact has a known projected CRS
 * - Artifact is spatial with valid FeatureCollection data
 */
export function needsDisplayTransformation(artifact: Artifact): boolean {
  if (!artifact.spatial || !isFeatureCollection(artifact.data)) {
    return false;
  }
  
  return isProjectedCrs(artifact.crs);
}

/**
 * Extract bounds from coordinates
 * Works with any valid coordinate pairs (geographic or projected)
 */
export function extractBounds(coords: [number, number][]): DisplayBounds | null {
  if (coords.length === 0) {
    return null;
  }
  
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  
  for (const [x, y] of coords) {
    if (y > north) north = y;
    if (y < south) south = y;
    if (x > east) east = x;
    if (x < west) west = x;
  }
  
  if (!isFinite(north) || !isFinite(south) || !isFinite(east) || !isFinite(west)) {
    return null;
  }
  
  return { north, south, east, west };
}

/**
 * Extract all coordinates from a FeatureCollection
 * Handles all GeoJSON geometry types
 */
export function extractCoordinates(fc: GeoJSON.FeatureCollection): [number, number][] {
  const coords: [number, number][] = [];
  
  for (const feature of fc.features) {
    if (!feature.geometry) continue;
    
    const geometry = feature.geometry;
    
    // Handle Point
    if (geometry.type === 'Point') {
      coords.push(geometry.coordinates as [number, number]);
    }
    // Handle Polygon - extract all rings (outer + holes)
    else if (geometry.type === 'Polygon') {
      for (const ring of geometry.coordinates) {
        for (const coord of ring) {
          coords.push(coord as [number, number]);
        }
      }
    }
    // Handle MultiPolygon
    else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          for (const coord of ring) {
            coords.push(coord as [number, number]);
          }
        }
      }
    }
    // Handle LineString
    else if (geometry.type === 'LineString') {
      for (const coord of geometry.coordinates) {
        coords.push(coord as [number, number]);
      }
    }
    // Handle MultiLineString
    else if (geometry.type === 'MultiLineString') {
      for (const line of geometry.coordinates) {
        for (const coord of line) {
          coords.push(coord as [number, number]);
        }
      }
    }
    // Handle MultiPoint
    else if (geometry.type === 'MultiPoint') {
      for (const coord of geometry.coordinates) {
        coords.push(coord as [number, number]);
      }
    }
    // Skip GeometryCollection - not supported
  }
  
  return coords;
}

/**
 * Get display-safe bounds for an artifact
 * 
 * If artifact CRS is geographic (WGS84), returns bounds from original coordinates
 * If artifact CRS is projected, attempts to transform to WGS84 for bounds
 * 
 * Returns null if:
 * - Artifact is not spatial
 * - No valid coordinates found
 * - Transformation fails (for projected CRS)
 * 
 * NOTE: This does NOT modify artifact.data - it's display-only
 */
export type DisplayTransformStatus =
  | 'none_needed'
  | 'transformed'
  | 'fallback_runtime_unavailable'
  | 'fallback_transform_failed';

export async function getDisplayBounds(
  artifact: Artifact
): Promise<{ bounds: DisplayBounds; status: DisplayTransformStatus; wasTransformed: boolean } | null> {
  if (!artifact.spatial || !isFeatureCollection(artifact.data)) {
    return null;
  }

  const coords = extractCoordinates(artifact.data);

  if (coords.length === 0) {
    return null;
  }

  // If CRS is geographic or unknown, use original coordinates.
  if (!isProjectedCrs(artifact.crs)) {
    const bounds = extractBounds(coords);
    if (!bounds) return null;
    return { bounds, status: 'none_needed', wasTransformed: false };
  }

  // For projected CRS, only return bounds once they have been truthfully
  // normalized into WGS84. Returning raw projected bounds here leaks bad data
  // into map framing and re-opens the crash seam.
  const engine = getSpatialEngine();
  if (!engine.initialized || !engine.projEngineAvailable) {
    console.warn('[DisplayTransform] CRS engine not available; refusing projected bounds for display framing');
    return null;
  }

  try {
    const result = await engine.transform(
      {
        type: 'feature-collection',
        data: artifact.data,
        crsState: { status: 'known' as const, crs: artifact.crs! }
      },
      artifact.crs!,
      'EPSG:4326'
    );

    if (!result.success || !result.output) {
      console.warn('[DisplayTransform] Transform failed; refusing projected bounds for display framing');
      return null;
    }

    const transformedCoords = extractCoordinates(result.output);
    const bounds = extractBounds(transformedCoords);

    if (!bounds) return null;

    return { bounds, status: 'transformed', wasTransformed: true };
  } catch (error) {
    console.warn('[DisplayTransform] Transform error:', error);
    return null;
  }
}

/**
 * Synchronous version of getDisplayBounds that returns original coords
 * for geographic CRS, or attempts transformation if PROJ is available
 * 
 * This is a simpler version that can be used when async is inconvenient
 */
export function getBoundsSync(artifact: Artifact): DisplayBounds | null {
  if (!artifact.spatial || !isFeatureCollection(artifact.data)) {
    return null;
  }
  
  const coords = extractCoordinates(artifact.data);
  return extractBounds(coords);
}

export async function getDisplayFeatureCollection(
  artifact: Artifact,
): Promise<DisplayFeatureCollectionResult | null> {
  const cached = displayFeatureCollectionPromiseCache.get(artifact);
  if (cached) {
    return cached;
  }

  const pending = (async (): Promise<DisplayFeatureCollectionResult | null> => {
    if (!artifact.spatial || !isFeatureCollection(artifact.data)) {
      return null;
    }

    if (!isProjectedCrs(artifact.crs)) {
      return {
        featureCollection: artifact.data,
        status: 'none_needed',
        wasTransformed: false,
      };
    }

    const engine = getSpatialEngine();
    if (!engine.initialized || !engine.projEngineAvailable) {
      console.warn('[DisplayTransform] CRS engine not available, using original projected geometry for display data');
      return {
        featureCollection: artifact.data,
        status: 'fallback_runtime_unavailable',
        wasTransformed: false,
      };
    }

    try {
      const result = await engine.transform(
        {
          type: 'feature-collection',
          data: artifact.data,
          crsState: { status: 'known' as const, crs: artifact.crs! },
        },
        artifact.crs!,
        'EPSG:4326',
      );

      if (!result.success || !result.output) {
        console.warn('[DisplayTransform] Transform failed, using original projected geometry for display data');
        return {
          featureCollection: artifact.data,
          status: 'fallback_transform_failed',
          wasTransformed: false,
        };
      }

      return {
        featureCollection: result.output,
        status: 'transformed',
        wasTransformed: true,
      };
    } catch (error) {
      console.warn('[DisplayTransform] Transform error while building display feature collection:', error);
      return {
        featureCollection: artifact.data,
        status: 'fallback_transform_failed',
        wasTransformed: false,
      };
    }
  })();

  displayFeatureCollectionPromiseCache.set(artifact, pending);
  return pending;
}
