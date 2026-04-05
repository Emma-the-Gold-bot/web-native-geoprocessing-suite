/**
 * GEOS-WASM Proof-of-Life Implementation
 * 
 * This is a spike file demonstrating GEOS-WASM integration for the spatial engine.
 * It validates the package choice and basic operations (buffer, centroid).
 * 
 * Key findings:
 * - geos-wasm package works in browser via ESM import
 * - Helper functions exist for GeoJSON <-> GEOS geometry conversion
 * - Memory management is manual (allocate/free pointers)
 * - Operations return geometry pointers that must be converted back to GeoJSON
 */

import initGeosJs from 'geos-wasm';
import { geojsonToGeosGeom, geosGeomToGeojson } from 'geos-wasm/helpers';

export interface GeometryEngine {
  initialized: boolean;
  initialize(): Promise<void>;
  buffer(input: GeoJSON.Geometry | GeoJSON.Feature, distance: number, units: 'kilometers' | 'miles'): Promise<GeoJSON.Geometry | null>;
  centroid(input: GeoJSON.Geometry | GeoJSON.Feature): Promise<GeoJSON.Geometry | null>;
  convexHull(input: GeoJSON.FeatureCollection): Promise<GeoJSON.Geometry | null>;
  envelope(input: GeoJSON.FeatureCollection): Promise<GeoJSON.Geometry | null>;
  simplify(input: GeoJSON.FeatureCollection, tolerance: number): Promise<GeoJSON.FeatureCollection | null>;
  dissolve(input: GeoJSON.FeatureCollection): Promise<GeoJSON.Geometry | null>;
  clip(input: GeoJSON.FeatureCollection, clipGeometry: GeoJSON.Geometry): Promise<GeoJSON.FeatureCollection | null>;
  intersect(input: GeoJSON.FeatureCollection, overlay: GeoJSON.FeatureCollection): Promise<GeoJSON.FeatureCollection | null>;
}

/**
 * Minimal GEOS-WASM implementation for proof-of-life validation.
 * This demonstrates the integration path without full engine implementation.
 */
export class GeosWasmEngine implements GeometryEngine {
  private geos: Awaited<ReturnType<typeof initGeosJs>> | null = null;
  public initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[GEOS-WASM] Initializing...');
    this.geos = await initGeosJs();
    this.initialized = true;
    console.log('[GEOS-WASM] Initialized successfully');
  }

  /**
   * Apply a buffer operation to a geometry
   * 
   * Note: For accurate geodesic buffers, we need projection handling.
   * This implementation uses degree-based buffering for simplicity.
   * A production implementation would project to a local coordinate system first.
   */
  async buffer(
    input: GeoJSON.Geometry | GeoJSON.Feature, 
    distance: number, 
    units: 'kilometers' | 'miles' = 'kilometers'
  ): Promise<GeoJSON.Geometry | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    const geometry = input.type === 'Feature' ? input.geometry : input;
    if (!geometry) {
      console.error('[GEOS-WASM] Buffer: No geometry provided');
      return null;
    }

    try {
      // Convert GeoJSON to GEOS geometry pointer
      const geomPtr = geojsonToGeosGeom(geometry, this.geos);
      
      // Convert distance to degrees (approximate for spike)
      // 1 degree ≈ 111km at equator
      const degreesPerKm = 1 / 111;
      const distanceInDegrees = units === 'kilometers' 
        ? distance * degreesPerKm 
        : distance * degreesPerKm * 1.60934;
      
      // Perform buffer operation (quadsegs = 8 for reasonable circle approximation)
      const bufferPtr = this.geos.GEOSBuffer(geomPtr, distanceInDegrees, 8);
      
      // Check if buffer succeeded (null pointer indicates failure)
      if (!bufferPtr) {
        console.error('[GEOS-WASM] Buffer operation failed');
        this.geos.GEOSGeom_destroy(geomPtr);
        return null;
      }
      
      // Convert result back to GeoJSON
      const resultGeoJson = geosGeomToGeojson(bufferPtr, this.geos) as GeoJSON.Geometry;
      
      // Clean up GEOS memory
      this.geos.GEOSGeom_destroy(geomPtr);
      this.geos.GEOSGeom_destroy(bufferPtr);
      
      return resultGeoJson;
    } catch (error) {
      console.error('[GEOS-WASM] Buffer error:', error);
      return null;
    }
  }

  /**
   * Calculate the centroid of a geometry
   */
  async centroid(input: GeoJSON.Geometry | GeoJSON.Feature): Promise<GeoJSON.Geometry | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    const geometry = input.type === 'Feature' ? input.geometry : input;
    if (!geometry) {
      console.error('[GEOS-WASM] Centroid: No geometry provided');
      return null;
    }

    try {
      // Convert GeoJSON to GEOS geometry pointer
      const geomPtr = geojsonToGeosGeom(geometry, this.geos);
      
      // Calculate centroid
      const centroidPtr = this.geos.GEOSGetCentroid(geomPtr);
      
      // Check if centroid calculation succeeded
      if (!centroidPtr) {
        console.error('[GEOS-WASM] Centroid operation failed');
        this.geos.GEOSGeom_destroy(geomPtr);
        return null;
      }
      
      // Convert result back to GeoJSON
      const resultGeoJson = geosGeomToGeojson(centroidPtr, this.geos) as GeoJSON.Geometry;
      
      // Clean up GEOS memory
      this.geos.GEOSGeom_destroy(geomPtr);
      this.geos.GEOSGeom_destroy(centroidPtr);
      
      return resultGeoJson;
    } catch (error) {
      console.error('[GEOS-WASM] Centroid error:', error);
      return null;
    }
  }

  async convexHull(input: GeoJSON.FeatureCollection): Promise<GeoJSON.Geometry | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    if (!input.features || input.features.length === 0) {
      console.error('[GEOS-WASM] Convex hull: No features provided');
      return null;
    }

    try {
      const geomPtrs: number[] = [];
      for (const feature of input.features) {
        if (!feature.geometry) continue;
        const geomPtr = geojsonToGeosGeom(feature.geometry, this.geos);
        if (geomPtr) {
          geomPtrs.push(geomPtr);
        }
      }

      if (geomPtrs.length === 0) {
        console.error('[GEOS-WASM] Convex hull: No valid geometries to process');
        return null;
      }

      let combinedPtr = geomPtrs[0];
      for (let i = 1; i < geomPtrs.length; i++) {
        const nextPtr = geomPtrs[i];
        const unionResult = this.geos.GEOSUnion(combinedPtr, nextPtr);
        this.geos.GEOSGeom_destroy(combinedPtr);
        this.geos.GEOSGeom_destroy(nextPtr);

        if (!unionResult) {
          console.error(`[GEOS-WASM] Convex hull: Union failed at step ${i}`);
          return null;
        }

        combinedPtr = unionResult;
      }

      const hullPtr = this.geos.GEOSConvexHull(combinedPtr);
      this.geos.GEOSGeom_destroy(combinedPtr);

      if (!hullPtr) {
        console.error('[GEOS-WASM] Convex hull operation failed');
        return null;
      }

      const resultGeoJson = geosGeomToGeojson(hullPtr, this.geos) as GeoJSON.Geometry;
      this.geos.GEOSGeom_destroy(hullPtr);
      return resultGeoJson;
    } catch (error) {
      console.error('[GEOS-WASM] Convex hull error:', error);
      return null;
    }
  }

  async envelope(input: GeoJSON.FeatureCollection): Promise<GeoJSON.Geometry | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    if (!input.features || input.features.length === 0) {
      console.error('[GEOS-WASM] Envelope: No features provided');
      return null;
    }

    try {
      const geomPtrs: number[] = [];
      for (const feature of input.features) {
        if (!feature.geometry) continue;
        const geomPtr = geojsonToGeosGeom(feature.geometry, this.geos);
        if (geomPtr) {
          geomPtrs.push(geomPtr);
        }
      }

      if (geomPtrs.length === 0) {
        console.error('[GEOS-WASM] Envelope: No valid geometries to process');
        return null;
      }

      let combinedPtr = geomPtrs[0];
      for (let i = 1; i < geomPtrs.length; i++) {
        const nextPtr = geomPtrs[i];
        const unionResult = this.geos.GEOSUnion(combinedPtr, nextPtr);
        this.geos.GEOSGeom_destroy(combinedPtr);
        this.geos.GEOSGeom_destroy(nextPtr);

        if (!unionResult) {
          console.error(`[GEOS-WASM] Envelope: Union failed at step ${i}`);
          return null;
        }

        combinedPtr = unionResult;
      }

      const envelopePtr = this.geos.GEOSEnvelope(combinedPtr);
      this.geos.GEOSGeom_destroy(combinedPtr);

      if (!envelopePtr) {
        console.error('[GEOS-WASM] Envelope operation failed');
        return null;
      }

      const resultGeoJson = geosGeomToGeojson(envelopePtr, this.geos) as GeoJSON.Geometry;
      this.geos.GEOSGeom_destroy(envelopePtr);
      return resultGeoJson;
    } catch (error) {
      console.error('[GEOS-WASM] Envelope error:', error);
      return null;
    }
  }

  async simplify(input: GeoJSON.FeatureCollection, tolerance: number): Promise<GeoJSON.FeatureCollection | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    if (!input.features || input.features.length === 0) {
      console.error('[GEOS-WASM] Simplify: No features provided');
      return null;
    }

    if (!(Number.isFinite(tolerance)) || tolerance < 0) {
      console.error('[GEOS-WASM] Simplify: Invalid tolerance', tolerance);
      return null;
    }

    try {
      const simplifiedFeatures: GeoJSON.Feature[] = [];

      for (const feature of input.features) {
        if (!feature.geometry) continue;

        const sourceGeomPtr = geojsonToGeosGeom(feature.geometry, this.geos);
        if (!sourceGeomPtr) continue;

        const simplifiedPtr = this.geos.GEOSSimplify(sourceGeomPtr, tolerance);
        this.geos.GEOSGeom_destroy(sourceGeomPtr);

        if (!simplifiedPtr) {
          console.error('[GEOS-WASM] Simplify: GEOSSimplify returned null');
          return null;
        }

        const isEmpty = this.geos.GEOSisEmpty(simplifiedPtr);
        if (isEmpty) {
          this.geos.GEOSGeom_destroy(simplifiedPtr);
          continue;
        }

        const resultGeometry = geosGeomToGeojson(simplifiedPtr, this.geos) as GeoJSON.Geometry;
        this.geos.GEOSGeom_destroy(simplifiedPtr);

        if (resultGeometry && (resultGeometry.type === 'Polygon' || resultGeometry.type === 'MultiPolygon')) {
          simplifiedFeatures.push({
            type: 'Feature',
            geometry: resultGeometry,
            properties: { ...(feature.properties ?? {}) },
          });
        }
      }

      return {
        type: 'FeatureCollection',
        features: simplifiedFeatures,
      };
    } catch (error) {
      console.error('[GEOS-WASM] Simplify error:', error);
      return null;
    }
  }

  /**
   * Dissolve/union all geometries in a FeatureCollection into a single geometry
   * 
   * Note: This implements global dissolve only (combines all geometries into one).
   * Grouped dissolve by attribute is not supported in this implementation.
   * Uses iterative union to combine geometries.
   * 
   * Supported geometry types: Polygon, MultiPolygon
   * Limited support: LineString, MultiLineString (may produce unexpected results)
   * Not supported: Point, MultiPoint (will likely produce empty/null results)
   */
  async dissolve(input: GeoJSON.FeatureCollection): Promise<GeoJSON.Geometry | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    if (!input.features || input.features.length === 0) {
      console.error('[GEOS-WASM] Dissolve: No features provided');
      return null;
    }

    try {
      // Convert all features to GEOS geometries
      const geomPtrs: number[] = [];
      const geometryTypes = new Set<string>();
      
      for (const feature of input.features) {
        if (!feature.geometry) continue;
        geometryTypes.add(feature.geometry.type);
        const geomPtr = geojsonToGeosGeom(feature.geometry, this.geos);
        if (geomPtr) {
          geomPtrs.push(geomPtr);
        }
      }

      // Log geometry family composition for diagnostics
      console.log(`[GEOS-WASM] Dissolve: Processing ${geomPtrs.length} geometries, types: ${[...geometryTypes].join(', ')}`);

      if (geomPtrs.length === 0) {
        console.error('[GEOS-WASM] Dissolve: No valid geometries to dissolve');
        return null;
      }

      if (geomPtrs.length === 1) {
        // Only one geometry - just return it directly
        const resultGeoJson = geosGeomToGeojson(geomPtrs[0], this.geos) as GeoJSON.Geometry;
        this.geos.GEOSGeom_destroy(geomPtrs[0]);
        return resultGeoJson;
      }

      // Union geometries iteratively
      // Start with the first geometry and union each subsequent geometry
      let combinedPtr = geomPtrs[0];
      
      for (let i = 1; i < geomPtrs.length; i++) {
        const nextPtr = geomPtrs[i];
        
        // Union the combined result with the next geometry
        const unionResult = this.geos.GEOSUnion(combinedPtr, nextPtr);
        
        // Clean up the previous combined geometry
        this.geos.GEOSGeom_destroy(combinedPtr);
        this.geos.GEOSGeom_destroy(nextPtr);
        
        if (!unionResult) {
          console.error(`[GEOS-WASM] Dissolve: Union failed at step ${i}`);
          // Check for unsupported geometry types that commonly cause union failures
          if (geometryTypes.has('Point') || geometryTypes.has('MultiPoint')) {
            console.error('[GEOS-WASM] Dissolve: Point geometries detected - union may fail for point-only collections');
          }
          return null;
        }
        
        combinedPtr = unionResult;
      }

      // Convert result back to GeoJSON
      const resultGeoJson = geosGeomToGeojson(combinedPtr, this.geos) as GeoJSON.Geometry;

      // Clean up the final combined geometry
      this.geos.GEOSGeom_destroy(combinedPtr);

      return resultGeoJson;
    } catch (error) {
      console.error('[GEOS-WASM] Dissolve error:', error);
      return null;
    }
  }

  /**
   * Clip (intersection) source features by a clip mask geometry
   * 
   * This implements the narrow clip v1 contract:
   * - Source: Polygon or MultiPolygon FeatureCollection
   * - Mask: Polygon or MultiPolygon geometry
   * - Output: FeatureCollection with source attributes preserved for surviving features
   * 
   * Uses GEOSIntersection to compute the geometric intersection.
   * Each source feature is clipped individually, and its properties are preserved.
   * 
   * Note: Empty intersections (no overlap) result in the feature being excluded from output.
   */
  async clip(
    sourceFeatures: GeoJSON.FeatureCollection,
    clipGeometry: GeoJSON.Geometry
  ): Promise<GeoJSON.FeatureCollection | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    if (!sourceFeatures.features || sourceFeatures.features.length === 0) {
      console.error('[GEOS-WASM] Clip: No features in source');
      return null;
    }

    if (!clipGeometry) {
      console.error('[GEOS-WASM] Clip: No clip geometry provided');
      return null;
    }

    // Check for GeometryCollection - not supported for clip
    if (clipGeometry.type === 'GeometryCollection') {
      console.error('[GEOS-WASM] Clip: GeometryCollection is not supported as clip mask');
      return null;
    }

    try {
      // Convert clip geometry to GEOS
      const clipGeomPtr = geojsonToGeosGeom(clipGeometry, this.geos);
      if (!clipGeomPtr) {
        console.error('[GEOS-WASM] Clip: Failed to convert clip geometry');
        return null;
      }

      const clippedFeatures: GeoJSON.Feature[] = [];

      // Process each source feature individually
      for (const feature of sourceFeatures.features) {
        if (!feature.geometry) continue;

        // Convert source geometry to GEOS
        const sourceGeomPtr = geojsonToGeosGeom(feature.geometry, this.geos);
        if (!sourceGeomPtr) continue;

        // Compute intersection
        const intersectionPtr = this.geos.GEOSIntersection(sourceGeomPtr, clipGeomPtr);

        // Clean up source geometry
        this.geos.GEOSGeom_destroy(sourceGeomPtr);

        if (!intersectionPtr) {
          // No intersection - feature is completely outside the mask
          // This is expected behavior for non-overlapping features
          continue;
        }

        // Check if the result is empty (GEOS can return empty geometries)
        const isEmpty = this.geos.GEOSisEmpty(intersectionPtr);
        if (isEmpty) {
          this.geos.GEOSGeom_destroy(intersectionPtr);
          continue;
        }

        // Convert result back to GeoJSON
        const resultGeometry = geosGeomToGeojson(intersectionPtr, this.geos) as GeoJSON.Geometry;
        
        // Clean up intersection result
        this.geos.GEOSGeom_destroy(intersectionPtr);

        if (resultGeometry) {
          // Preserve source attributes
          clippedFeatures.push({
            type: 'Feature',
            geometry: resultGeometry,
            properties: { ...feature.properties }, // Shallow copy of properties
          });
        }
      }

      // Clean up clip geometry
      this.geos.GEOSGeom_destroy(clipGeomPtr);

      // Return the clipped FeatureCollection (may be empty if no overlaps)
      return {
        type: 'FeatureCollection',
        features: clippedFeatures,
      };
    } catch (error) {
      console.error('[GEOS-WASM] Clip error:', error);
      return null;
    }
  }

  async intersect(
    sourceFeatures: GeoJSON.FeatureCollection,
    overlayFeatures: GeoJSON.FeatureCollection
  ): Promise<GeoJSON.FeatureCollection | null> {
    if (!this.geos || !this.initialized) {
      throw new Error('GEOS not initialized');
    }

    if (!sourceFeatures.features || sourceFeatures.features.length === 0) {
      console.error('[GEOS-WASM] Intersect: No features in source');
      return null;
    }

    if (!overlayFeatures.features || overlayFeatures.features.length === 0) {
      console.error('[GEOS-WASM] Intersect: No features in overlay');
      return null;
    }

    const overlayFeature = overlayFeatures.features[0];
    if (!overlayFeature?.geometry) {
      console.error('[GEOS-WASM] Intersect: Overlay has no valid geometry');
      return null;
    }

    if (overlayFeature.geometry.type === 'GeometryCollection') {
      console.error('[GEOS-WASM] Intersect: GeometryCollection is not supported as overlay');
      return null;
    }

    try {
      const overlayGeomPtr = geojsonToGeosGeom(overlayFeature.geometry, this.geos);
      if (!overlayGeomPtr) {
        console.error('[GEOS-WASM] Intersect: Failed to convert overlay geometry');
        return null;
      }

      const intersectedFeatures: GeoJSON.Feature[] = [];

      for (const feature of sourceFeatures.features) {
        if (!feature.geometry) continue;

        const sourceGeomPtr = geojsonToGeosGeom(feature.geometry, this.geos);
        if (!sourceGeomPtr) continue;

        const intersectionPtr = this.geos.GEOSIntersection(sourceGeomPtr, overlayGeomPtr);
        this.geos.GEOSGeom_destroy(sourceGeomPtr);

        if (!intersectionPtr) {
          continue;
        }

        const isEmpty = this.geos.GEOSisEmpty(intersectionPtr);
        if (isEmpty) {
          this.geos.GEOSGeom_destroy(intersectionPtr);
          continue;
        }

        const resultGeometry = geosGeomToGeojson(intersectionPtr, this.geos) as GeoJSON.Geometry;
        this.geos.GEOSGeom_destroy(intersectionPtr);

        if (resultGeometry && (resultGeometry.type === 'Polygon' || resultGeometry.type === 'MultiPolygon')) {
          intersectedFeatures.push({
            type: 'Feature',
            geometry: resultGeometry,
            properties: { ...feature.properties },
          });
        }
      }

      this.geos.GEOSGeom_destroy(overlayGeomPtr);

      return {
        type: 'FeatureCollection',
        features: intersectedFeatures,
      };
    } catch (error) {
      console.error('[GEOS-WASM] Intersect error:', error);
      return null;
    }
  }
}

// Singleton instance for the spike
let engineInstance: GeosWasmEngine | null = null;

export const getGeometryEngine = (): GeometryEngine => {
  if (!engineInstance) {
    engineInstance = new GeosWasmEngine();
  }
  return engineInstance;
};

// Validation test function
interface TestResult {
  success: boolean;
  input?: GeoJSON.Geometry;
  output?: GeoJSON.Geometry;
  error?: string;
}

export const runGeosValidation = async (): Promise<{
  success: boolean;
  bufferTest: TestResult;
  centroidTest: TestResult;
}> => {
  const result = {
    success: false,
    bufferTest: { success: false } as TestResult,
    centroidTest: { success: false } as TestResult,
  };

  try {
    // Initialize GEOS
    const engine = getGeometryEngine();
    await engine.initialize();
    console.log('[GEOS-WASM] Validation: Engine initialized');

    // Test geometry: a simple polygon (a square)
    const testPolygon: GeoJSON.Geometry = {
      type: 'Polygon',
      coordinates: [[
        [-122.4, 37.75],
        [-122.35, 37.75],
        [-122.35, 37.8],
        [-122.4, 37.8],
        [-122.4, 37.75],
      ]],
    };

    // Test 1: Buffer
    console.log('[GEOS-WASM] Validation: Testing buffer...');
    const bufferResult = await engine.buffer(testPolygon, 2, 'kilometers');
    if (bufferResult) {
      result.bufferTest = { success: true, input: testPolygon, output: bufferResult };
      console.log('[GEOS-WASM] Validation: Buffer test PASSED');
    } else {
      result.bufferTest = { success: false, error: 'Buffer returned null' };
      console.error('[GEOS-WASM] Validation: Buffer test FAILED');
    }

    // Test 2: Centroid
    console.log('[GEOS-WASM] Validation: Testing centroid...');
    const centroidResult = await engine.centroid(testPolygon);
    if (centroidResult) {
      result.centroidTest = { success: true, input: testPolygon, output: centroidResult };
      console.log('[GEOS-WASM] Validation: Centroid test PASSED');
    } else {
      result.centroidTest = { success: false, error: 'Centroid returned null' };
      console.error('[GEOS-WASM] Validation: Centroid test FAILED');
    }

    result.success = result.bufferTest.success && result.centroidTest.success;
    console.log('[GEOS-WASM] Validation: Overall result:', result.success ? 'PASSED' : 'FAILED');

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[GEOS-WASM] Validation error:', errorMsg);
    result.bufferTest.error = errorMsg;
    result.centroidTest.error = errorMsg;
  }

  return result;
};

export default GeosWasmEngine;
