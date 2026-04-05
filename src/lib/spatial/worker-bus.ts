/**
 * Spatial Worker Bus
 * 
 * Orchestrates communication between the main thread and spatial engine workers.
 * 
 * Note: The current implementation doesn't spawn dedicated workers because:
 * - PROJ-WASM has a built-in worker pool (8 workers)
 * - GEOS-WASM can run on main thread for MVP workloads
 */

import type {
  GeometryOperationInput,
  GeometryOperationResult,
  CrsInfo,
  CrsState,
  SpatialEngineCapabilities,
  WarningRef,
} from './types';

// Import capabilities
import { GEOMETRY_CAPABILITIES } from './geometry-engine';
import { CRS_CAPABILITIES } from './crs-engine';

// Import legacy engine implementations from spikes
import { getGeometryEngine } from './geos-spike';
import { getProjEngine, initializeProj } from './proj-spike';

// Import warning codes
import { createWarningFromCode } from './warning-codes';

// Re-export CrsState for convenience
export type { CrsState };

/**
 * Helper to create CrsState from optional CRS string
 * Distinguishes between:
 * - missing: CRS not specified at all (undefined)
 * - unknown: CRS explicitly set to the literal value "unknown"
 * - known: CRS is an actual CRS string like "EPSG:4326"
 */
export function createCrsState(crs: string | undefined): CrsState {
  if (crs === undefined) {
    return { status: 'missing', message: 'CRS not specified in input' };
  }
  if (crs === 'unknown') {
    return { status: 'unknown', message: 'CRS is explicitly set to unknown' };
  }
  return { status: 'known', crs };
}

/**
 * Warning helper functions - now using typed warning codes
 */
function createCrsMissingWarning(operationName?: string): WarningRef {
  return createWarningFromCode('CRS_MISSING', undefined, { operation: operationName });
}

function createCrsUnknownWarning(operationName?: string): WarningRef {
  return createWarningFromCode('CRS_UNKNOWN', undefined, { operation: operationName });
}

function createApproximationWarning(operationName?: string): WarningRef {
  return createWarningFromCode('APPROXIMATE_OP', undefined, { operation: operationName });
}

function createLimitedSupportWarning(operationName?: string): WarningRef {
  return createWarningFromCode('LIMITED_SUPPORT_ENVELOPE', undefined, { operation: operationName });
}

function createTransformRuntimeUnavailableWarning(operationName?: string): WarningRef {
  return createWarningFromCode('TRANSFORM_RUNTIME_UNAVAILABLE', undefined, { operation: operationName });
}

function createDissolveWarning(): WarningRef {
  return createWarningFromCode('LIMITED_SUPPORT_ENVELOPE', {
    severity: 'info',
    title: 'Global dissolve only',
    message: 'This operation currently performs global dissolve only. Grouped dissolve by attribute is not supported.',
  }, { operation: 'dissolve' });
}

/**
 * Detect geometry family types in a FeatureCollection
 * Returns info about what geometry types are present
 */
function detectGeometryFamilies(fc: GeoJSON.FeatureCollection): {
  hasPolygon: boolean;
  hasMultiPolygon: boolean;
  hasLineString: boolean;
  hasMultiLineString: boolean;
  hasPoint: boolean;
  hasMultiPoint: boolean;
  hasMixed: boolean;
  supportedTypes: boolean;
} {
  const types = new Set<string>();
  
  for (const feature of fc.features) {
    if (feature.geometry) {
      types.add(feature.geometry.type);
    }
  }
  
  const hasPolygon = types.has('Polygon');
  const hasMultiPolygon = types.has('MultiPolygon');
  const hasLineString = types.has('LineString');
  const hasMultiLineString = types.has('MultiLineString');
  const hasPoint = types.has('Point');
  const hasMultiPoint = types.has('MultiPoint');
  
  // Dissolve is well-supported only for Polygon and MultiPolygon
  // LineString can work but results may be unexpected
  // Point/MultiPoint don't produce meaningful dissolve results
  const supportedTypes = (hasPolygon || hasMultiPolygon) && 
                         !hasLineString && !hasMultiLineString && 
                         !hasPoint && !hasMultiPoint;
  const hasMixed = types.size > 1;
  
  return {
    hasPolygon,
    hasMultiPolygon,
    hasLineString,
    hasMultiLineString,
    hasPoint,
    hasMultiPoint,
    hasMixed,
    supportedTypes,
  };
}

/**
 * Create a warning about unsupported geometry families for dissolve
 */
function createDissolveGeometryWarning(geometryInfo: ReturnType<typeof detectGeometryFamilies>): WarningRef {
  const unsupported: string[] = [];
  
  if (geometryInfo.hasPoint || geometryInfo.hasMultiPoint) {
    unsupported.push('Point/MultiPoint');
  }
  if (geometryInfo.hasLineString || geometryInfo.hasMultiLineString) {
    unsupported.push('LineString/MultiLineString');
  }
  
  return createWarningFromCode('UNSUPPORTED_GEOMETRY', undefined, {
    operation: 'dissolve',
    geometryTypes: unsupported.join(', '),
  });
}

function createErrorResult(code: string, message: string): GeometryOperationResult {
  return {
    success: false,
    output: undefined,
    warnings: [],
    errors: [{ code, message }],
  };
}

function createSuccessResult(output: GeoJSON.FeatureCollection, warnings: WarningRef[] = [], outputCrs?: string): GeometryOperationResult {
  return {
    success: true,
    output,
    outputCrs,
    warnings,
    errors: [],
  };
}

// Reusable GeoJSON geometry type alias for internal use
// Excludes GeometryCollection as it doesn't have coordinates in the same way
type GeoJsonGeometry = 
  | GeoJSON.Point 
  | GeoJSON.LineString 
  | GeoJSON.Polygon 
  | GeoJSON.MultiPoint 
  | GeoJSON.MultiLineString 
  | GeoJSON.MultiPolygon;

// Extract geometry from FeatureCollection or return as-is
function extractGeometry(
  input: GeometryOperationInput
): GeoJsonGeometry | null {
  if (input.type === 'feature-collection') {
    const fc = input.data as GeoJSON.FeatureCollection;
    if (!fc.features || fc.features.length === 0) return null;
    const firstGeom = fc.features[0].geometry;
    if (!firstGeom) return null;
    // Check if it's a GeometryCollection - not supported for extract
    if (firstGeom.type === 'GeometryCollection') return null;
    return firstGeom as GeoJsonGeometry;
  }
  // For raw geometry input, assume it's already a simple geometry
  const geom = input.data as GeoJSON.Geometry;
  if (geom.type === 'GeometryCollection') return null;
  return geom as GeoJsonGeometry;
}

/**
 * Transform coordinates in a single GeoJSON geometry using PROJ
 */
async function transformGeometryCoordinates(
  projEngine: ReturnType<typeof getProjEngine>,
  geometry: GeoJsonGeometry,
  sourceEpsg: string,
  targetEpsg: string
): Promise<GeoJsonGeometry | null> {
  const transformCoord = (coords: number[]): number[] => {
    // For Point: [lon, lat] or [lon, lat, z]
    // For LineString/Polygon: array of points
    // For Multi*: array of geometries
    return coords;
  };

  // Extract all coordinates from geometry
  const extractCoords = (geom: GeoJsonGeometry): number[][] => {
    const coords: number[][] = [];
    
    if (geom.type === 'Point') {
      if (geom.coordinates) {
        coords.push(geom.coordinates as number[]);
      }
    } else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
      if (geom.coordinates) {
        coords.push(...(geom.coordinates as number[][]));
      }
    } else if (geom.type === 'Polygon' || geom.type === 'MultiLineString') {
      if (geom.coordinates) {
        for (const ring of geom.coordinates as number[][][]) {
          coords.push(...ring);
        }
      }
    } else if (geom.type === 'MultiPolygon') {
      if (geom.coordinates) {
        for (const polygon of geom.coordinates as number[][][][]) {
          for (const ring of polygon) {
            coords.push(...ring);
          }
        }
      }
    }
    
    return coords;
  };

  const originalCoords = extractCoords(geometry);
  if (originalCoords.length === 0) {
    return geometry; // No coordinates to transform
  }

  try {
    // Transform all coordinates at once
    const transformedCoords = await projEngine.transform(sourceEpsg, targetEpsg, originalCoords);
    
    // Rebuild geometry with transformed coordinates
    let coordIndex = 0;
    
    const rebuildCoords = (geom: GeoJsonGeometry): GeoJsonGeometry => {
      const result = { ...geom } as GeoJsonGeometry;
      
      if (geom.type === 'Point') {
        result.coordinates = transformedCoords[coordIndex++] as GeoJSON.Point['coordinates'];
      } else if (geom.type === 'MultiPoint') {
        (result as GeoJSON.MultiPoint).coordinates = transformedCoords.slice(coordIndex, coordIndex + (geom.coordinates as number[][]).length) as GeoJSON.MultiPoint['coordinates'];
        coordIndex += (geom.coordinates as number[][]).length;
      } else if (geom.type === 'LineString') {
        (result as GeoJSON.LineString).coordinates = transformedCoords.slice(coordIndex, coordIndex + (geom.coordinates as number[][]).length) as GeoJSON.LineString['coordinates'];
        coordIndex += (geom.coordinates as number[][]).length;
      } else if (geom.type === 'MultiLineString') {
        const lines = geom.coordinates as number[][][];
        const newLines: number[][][] = [];
        for (const line of lines) {
          newLines.push(transformedCoords.slice(coordIndex, coordIndex + line.length));
          coordIndex += line.length;
        }
        (result as GeoJSON.MultiLineString).coordinates = newLines;
      } else if (geom.type === 'Polygon') {
        const rings = geom.coordinates as number[][][];
        const newRings: number[][][] = [];
        for (const ring of rings) {
          newRings.push(transformedCoords.slice(coordIndex, coordIndex + ring.length));
          coordIndex += ring.length;
        }
        (result as GeoJSON.Polygon).coordinates = newRings;
      } else if (geom.type === 'MultiPolygon') {
        const polygons = geom.coordinates as number[][][][];
        const newPolygons: number[][][][] = [];
        for (const polygon of polygons) {
          const newPolygon: number[][][] = [];
          for (const ring of polygon) {
            newPolygon.push(transformedCoords.slice(coordIndex, coordIndex + ring.length));
            coordIndex += ring.length;
          }
          newPolygons.push(newPolygon);
        }
        (result as GeoJSON.MultiPolygon).coordinates = newPolygons;
      }
      
      return result;
    };
    
    return rebuildCoords(geometry);
  } catch (error) {
    console.error('[SpatialEngine] Coordinate transformation error:', error);
    return null;
  }
}

/**
 * Transform a FeatureCollection between CRS
 */
async function transformFeatureCollection(
  projEngine: ReturnType<typeof getProjEngine>,
  fc: GeoJSON.FeatureCollection,
  sourceEpsg: string,
  targetEpsg: string
): Promise<GeoJSON.FeatureCollection | null> {
  const transformedFeatures: GeoJSON.Feature[] = [];
  
  for (const feature of fc.features) {
    if (!feature.geometry) continue;
    
    // Skip GeometryCollection - not supported for transformation
    if (feature.geometry.type === 'GeometryCollection') continue;
    
    const transformedGeom = await transformGeometryCoordinates(
      projEngine,
      feature.geometry as GeoJsonGeometry,
      sourceEpsg,
      targetEpsg
    );
    
    if (transformedGeom) {
      transformedFeatures.push({
        ...feature,
        geometry: transformedGeom,
      });
    } else {
      // If any geometry fails to transform, the whole thing fails
      return null;
    }
  }
  
  return {
    type: 'FeatureCollection',
    features: transformedFeatures,
  };
}

/**
 * Combined spatial engine that orchestrates geometry and CRS operations
 */
export class SpatialEngine implements SpatialEngineCapabilities {
  private geometryEngine: ReturnType<typeof getGeometryEngine> | null = null;
  private projEngine: ReturnType<typeof getProjEngine> | null = null;
  private _initialized = false;

  get initialized(): boolean {
    return this._initialized;
  }

  get geometry() {
    return GEOMETRY_CAPABILITIES;
  }

  get crs() {
    return CRS_CAPABILITIES;
  }

  /**
   * Getter for PROJ engine - needed for display transformation
   * @internal This is for display-layer use only, not for general operations
   */
  get projEngineAvailable(): boolean {
    return this.projEngine !== null;
  }

  /**
   * Initialize both geometry and CRS engines
   * GEOS (geometry) is essential, PROJ (CRS) is for reprojection
   * We allow GEOS to work even if PROJ fails to initialize
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    console.log('[SpatialEngine] Initializing...');

    // Initialize GEOS (geometry engine) - essential
    this.geometryEngine = getGeometryEngine();
    await this.geometryEngine.initialize();
    console.log('[SpatialEngine] Geometry engine ready');

    // Initialize PROJ (CRS engine) - for reprojection, but optional
    // Use a timeout to avoid hanging if PROJ workers fail
    let projSucceeded = false;
    const projPromise = initializeProj()
      .then(() => {
        projSucceeded = true;
        this.projEngine = getProjEngine();
        console.log('[SpatialEngine] CRS engine ready (PROJ-WASM)');
      })
      .catch((error) => {
        console.warn('[SpatialEngine] CRS engine initialization failed, reprojection unavailable:', error);
      });

    // Race the PROJ init against a 5-second timeout
    // Only warn about timeout if PROJ genuinely didn't succeed
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!projSucceeded) {
          console.warn('[SpatialEngine] CRS engine init timed out, reprojection may be unavailable');
        }
        resolve();
      }, 5000);
    });

    await Promise.race([projPromise, timeoutPromise]);

    this._initialized = true;
    console.log('[SpatialEngine] Fully initialized');
  }

  /**
   * Get capabilities for the spatial engine
   */
  getCapabilities(): SpatialEngineCapabilities {
    return {
      geometry: GEOMETRY_CAPABILITIES,
      crs: CRS_CAPABILITIES,
      initialized: this._initialized,
    };
  }

  /**
   * Get warnings based on CRS state
   */
  private getCrsWarnings(input: GeometryOperationInput, operationName?: string): WarningRef[] {
    const warnings: WarningRef[] = [];
    const { crsState } = input;
    
    if (crsState.status === 'missing') {
      warnings.push(createCrsMissingWarning(operationName));
    } else if (crsState.status === 'unknown') {
      warnings.push(createCrsUnknownWarning(operationName));
    }
    
    return warnings;
  }

  /**
   * Perform a buffer operation
   */
  async buffer(
    input: GeometryOperationInput,
    distance: number,
    units: 'kilometers' | 'miles' = 'kilometers'
  ): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    const warnings = this.getCrsWarnings(input, 'buffer');
    // Always include approximation warning since we don't do full reprojection
    warnings.push(createApproximationWarning('buffer'));
    warnings.push(createLimitedSupportWarning('buffer'));

    try {
      const geometry = extractGeometry(input);
      if (!geometry) {
        return createErrorResult('EMPTY_INPUT', 'Feature collection is empty or no valid geometry found');
      }

      // Call the GEOS buffer operation - pass as Feature to match interface
      const resultGeometry = await this.geometryEngine.buffer(
        { type: 'Feature', geometry, properties: {} },
        distance,
        units
      );

      if (!resultGeometry) {
        return createErrorResult('BUFFER_FAILED', 'Buffer operation returned null');
      }

      // Wrap result in FeatureCollection
      const output: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: resultGeometry,
            properties: {},
          },
        ],
      };

      return createSuccessResult(output, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResult('BUFFER_ERROR', message);
    }
  }

  /**
   * Calculate centroid of geometry
   */
  async centroid(input: GeometryOperationInput): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    const warnings = this.getCrsWarnings(input, 'centroid');
    warnings.push(createLimitedSupportWarning('centroid'));

    try {
      const geometry = extractGeometry(input);
      if (!geometry) {
        return createErrorResult('EMPTY_INPUT', 'Feature collection is empty or no valid geometry found');
      }

      const resultGeometry = await this.geometryEngine.centroid(
        { type: 'Feature', geometry, properties: {} }
      );

      if (!resultGeometry) {
        return createErrorResult('CENTROID_FAILED', 'Centroid operation returned null');
      }

      const output: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: resultGeometry,
            properties: {},
          },
        ],
      };

      return createSuccessResult(output, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResult('CENTROID_ERROR', message);
    }
  }

  /**
   * Assign CRS to an artifact (metadata only, no transformation)
   * 
   * This explicitly DOES NOT transform coordinates - it only assigns
   * CRS metadata. Use transform() for actual reprojection.
   */
  async assignCRS(
    input: GeometryOperationInput,
    epsgCode: string
  ): Promise<GeometryOperationResult> {
    // This is a metadata operation - no actual PROJ call needed
    let output: GeoJSON.FeatureCollection;
    
    if (input.type === 'feature-collection') {
      output = input.data as GeoJSON.FeatureCollection;
    } else {
      output = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: input.data as unknown as GeoJSON.Geometry, properties: {} }]
      };
    }

    return createSuccessResult(output, [{
      id: `crs_assigned_${Date.now()}`,
      code: 'CRS_MISSING',
      severity: 'info',
      title: 'CRS assigned (metadata only)',
      message: `CRS metadata set to ${epsgCode}. NO coordinate transformation was performed. Use transform() to reproject coordinates.`,
      scope: 'active',
    }], epsgCode);
  }

  /**
   * Get CRS info
   */
  async getCRSInfo(epsgCode: string): Promise<CrsInfo | null> {
    // Common CRS definitions - PROJ-WASM has full database via proj.db
    const crsDefinitions: Record<string, CrsInfo> = {
      'EPSG:4326': {
        name: 'WGS84',
        epsg: 'EPSG:4326',
        proj4: '+proj=longlat +datum=WGS84 +no_defs',
        areaOfUse: 'World',
      },
      'EPSG:3857': {
        name: 'Web Mercator',
        epsg: 'EPSG:3857',
        proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +x=0 +y=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
        areaOfUse: 'World',
      },
    };

    return crsDefinitions[epsgCode] || null;
  }

  async convexHull(input: GeometryOperationInput): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    const warnings = this.getCrsWarnings(input, 'convex hull');
    warnings.push(createLimitedSupportWarning('convex hull'));

    if (input.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Convex hull requires a FeatureCollection input');
    }

    const fc = input.data as GeoJSON.FeatureCollection;
    if (!fc.features || fc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Feature collection is empty');
    }

    try {
      const resultGeometry = await this.geometryEngine.convexHull(fc);

      if (!resultGeometry) {
        return createErrorResult('CONVEX_HULL_FAILED', 'Convex hull operation returned null. Check that input geometries are valid polygons.');
      }

      const output: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: resultGeometry,
            properties: {},
          },
        ],
      };

      return createSuccessResult(output, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResult('CONVEX_HULL_ERROR', message);
    }
  }

  async envelope(input: GeometryOperationInput): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    const warnings = this.getCrsWarnings(input, 'envelope');
    warnings.push(createLimitedSupportWarning('envelope'));

    if (input.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Envelope requires a FeatureCollection input');
    }

    const fc = input.data as GeoJSON.FeatureCollection;
    if (!fc.features || fc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Feature collection is empty');
    }

    try {
      const resultGeometry = await this.geometryEngine.envelope(fc);

      if (!resultGeometry) {
        return createErrorResult('ENVELOPE_FAILED', 'Envelope operation returned null. Check that input geometries are valid polygons.');
      }

      const output: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: resultGeometry,
            properties: {},
          },
        ],
      };

      return createSuccessResult(output, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResult('ENVELOPE_ERROR', message);
    }
  }

  async simplify(input: GeometryOperationInput, tolerance: number): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    const warnings = this.getCrsWarnings(input, 'simplify');
    warnings.push(createLimitedSupportWarning('simplify'));

    if (input.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Simplify requires a FeatureCollection input');
    }

    if (!Number.isFinite(tolerance) || tolerance < 0) {
      return createErrorResult('INVALID_TOLERANCE', 'Simplify tolerance must be a non-negative finite number');
    }

    const fc = input.data as GeoJSON.FeatureCollection;
    if (!fc.features || fc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Feature collection is empty');
    }

    try {
      const output = await this.geometryEngine.simplify(fc, tolerance);

      if (!output) {
        return createErrorResult('SIMPLIFY_FAILED', 'Simplify operation returned null. Check that input geometries are valid polygons and tolerance is appropriate for the source CRS units.');
      }

      return createSuccessResult(output, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResult('SIMPLIFY_ERROR', message);
    }
  }

  /**
   * Dissolve (union) all geometries in a FeatureCollection
   * 
   * Note: Currently implements global dissolve only. Grouped dissolve by attribute
   * would require additional logic to group features before union.
   * 
   * Supported geometry families: Polygon, MultiPolygon
   * Known limitations: Point, MultiPoint, LineString, MultiLineString may produce
   * unexpected or empty results
   */
  async dissolve(
    input: GeometryOperationInput,
    _groupByField?: string
  ): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    const warnings = this.getCrsWarnings(input, 'dissolve');

    // Always include the global-dissolve-only warning
    warnings.push(createDissolveWarning());
    warnings.push(createLimitedSupportWarning('global dissolve'));

    // Validate input is a FeatureCollection
    if (input.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Dissolve requires a FeatureCollection input');
    }

    const fc = input.data as GeoJSON.FeatureCollection;
    if (!fc.features || fc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Feature collection is empty');
    }

    // Detect geometry families and warn about unsupported types
    const geometryInfo = detectGeometryFamilies(fc);
    if (!geometryInfo.supportedTypes) {
      warnings.push(createDissolveGeometryWarning(geometryInfo));
    }

    try {
      // Call the GEOS dissolve operation
      const resultGeometry = await this.geometryEngine.dissolve(fc);

      if (!resultGeometry) {
        return createErrorResult('DISSOLVE_FAILED', 'Dissolve operation returned null. This may occur with incompatible geometry types.');
      }

      // Wrap result in FeatureCollection
      const output: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: resultGeometry,
            properties: {},
          },
        ],
      };

      return createSuccessResult(output, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResult('DISSOLVE_ERROR', message);
    }
  }

  /**
   * Clip (intersect) source geometry by a clip mask geometry
   * 
   * This implements the narrow clip v1 contract:
   * - Source: Polygon or MultiPolygon
   * - Clip mask: Polygon or MultiPolygon
   * - Both must have known matching CRS
   * - Source attributes are preserved for surviving features
   * 
   * The clip operation uses GEOSIntersection to compute the geometric
   * intersection of each source feature with the clip mask.
   */
  async clip(
    input: GeometryOperationInput,
    clipInput: GeometryOperationInput
  ): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    // Validate input is a FeatureCollection
    if (input.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Clip requires a FeatureCollection input for the source');
    }

    if (clipInput.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Clip requires a FeatureCollection input for the clip mask');
    }

    const sourceFc = input.data as GeoJSON.FeatureCollection;
    const maskFc = clipInput.data as GeoJSON.FeatureCollection;

    if (!sourceFc.features || sourceFc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Source FeatureCollection is empty');
    }

    if (!maskFc.features || maskFc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Clip mask FeatureCollection is empty');
    }

    // Get the clip mask geometry - use the first feature's geometry
    // For clip, we need a single geometry to clip against
    const clipFeature = maskFc.features[0];
    if (!clipFeature || !clipFeature.geometry) {
      return createErrorResult('INVALID_INPUT', 'Clip mask has no valid geometry');
    }

    const warnings: WarningRef[] = [];

    // Add limited support envelope warning
    warnings.push(createWarningFromCode('LIMITED_SUPPORT_ENVELOPE', undefined, { operation: 'clip' }));

    try {
      // Call the GEOS clip operation - this preserves source attributes
      const resultGeometry = await this.geometryEngine.clip(sourceFc, clipFeature.geometry);

      if (!resultGeometry) {
        return createErrorResult('CLIP_FAILED', 'Clip operation returned null. Check that input geometries are valid polygons.');
      }

      // Check if result is empty (no overlapping features)
      if (resultGeometry.features.length === 0) {
        warnings.push(createWarningFromCode('EMPTY_TOPOLOGY_RESULT', undefined, { operation: 'clip' }));
        return createSuccessResult(resultGeometry, warnings);
      }

      return createSuccessResult(resultGeometry, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: undefined,
        warnings,
        errors: [{ code: 'TOPOLOGY_OPERATION_FAILED', message: `Clip failed: ${message}` }],
      };
    }
  }

  async intersect(
    input: GeometryOperationInput,
    overlayInput: GeometryOperationInput
  ): Promise<GeometryOperationResult> {
    if (!this._initialized || !this.geometryEngine) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    if (input.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Intersect requires a FeatureCollection input for the source');
    }

    if (overlayInput.type !== 'feature-collection') {
      return createErrorResult('INVALID_INPUT', 'Intersect requires a FeatureCollection input for the overlay');
    }

    const sourceFc = input.data as GeoJSON.FeatureCollection;
    const overlayFc = overlayInput.data as GeoJSON.FeatureCollection;

    if (!sourceFc.features || sourceFc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Source FeatureCollection is empty');
    }

    if (!overlayFc.features || overlayFc.features.length === 0) {
      return createErrorResult('EMPTY_INPUT', 'Overlay FeatureCollection is empty');
    }

    const warnings: WarningRef[] = [];
    warnings.push(createWarningFromCode('LIMITED_SUPPORT_ENVELOPE', undefined, { operation: 'intersect' }));

    try {
      const resultGeometry = await this.geometryEngine.intersect(sourceFc, overlayFc);

      if (!resultGeometry) {
        return createErrorResult('INTERSECT_FAILED', 'Intersect operation returned null. Check that input geometries are valid polygons.');
      }

      if (resultGeometry.features.length === 0) {
        warnings.push(createWarningFromCode('EMPTY_TOPOLOGY_RESULT', undefined, { operation: 'intersect' }));
        return createSuccessResult(resultGeometry, warnings);
      }

      return createSuccessResult(resultGeometry, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: undefined,
        warnings,
        errors: [{ code: 'TOPOLOGY_OPERATION_FAILED', message: `Intersect failed: ${message}` }],
      };
    }
  }

  /**
   * Transform coordinates between CRS using PROJ
   * 
   * This actually reprojects the geometry coordinates. Use assignCRS()
   * if you only need to set metadata without transforming.
   */
  async transform(
    input: GeometryOperationInput,
    sourceEpsg: string,
    targetEpsg: string
  ): Promise<GeometryOperationResult> {
    if (!this._initialized) {
      return createErrorResult('NOT_INITIALIZED', 'Spatial engine not initialized');
    }

    if (!this.projEngine) {
      return {
        success: false,
        output: undefined,
        warnings: [createTransformRuntimeUnavailableWarning('reproject')],
        errors: [{ code: 'CRS_ENGINE_UNAVAILABLE', message: 'CRS engine (PROJ-WASM) failed to initialize. Reprojection is not available in this environment. Check that the browser supports SharedArrayBuffer or try a different browser.' }],
      };
    }

    const warnings: WarningRef[] = [createLimitedSupportWarning('reproject')];
    
    // Warn if source CRS doesn't match input CRS metadata
    if (input.crsState.status === 'known' && input.crsState.crs !== sourceEpsg) {
      warnings.push({
        id: `warning_crs_mismatch_${Date.now()}`,
        code: 'CRS_UNKNOWN',
        severity: 'caution',
        title: 'Source CRS override differs from stored metadata',
        message: `Stored CRS metadata says ${input.crsState.crs}, but this reprojection is being forced to start from ${sourceEpsg}. Proceed only if the stored metadata is wrong and the coordinates are actually in ${sourceEpsg}.`,
        scope: 'active',
      });
    } else if (input.crsState.status !== 'known') {
      warnings.push({
        id: `warning_crs_unverified_${Date.now()}`,
        code: input.crsState.status === 'missing' ? 'CRS_MISSING' : 'CRS_UNKNOWN',
        severity: 'info',
        title: 'Source CRS supplied by user for this reprojection',
        message: `Stored metadata did not verify the source CRS, so this reprojection proceeds using your selected source CRS (${sourceEpsg}) to produce output in ${targetEpsg}.`,
        scope: 'active',
      });
    }

    try {
      let result: GeoJSON.FeatureCollection | null = null;
      
      if (input.type === 'feature-collection') {
        result = await transformFeatureCollection(
          this.projEngine,
          input.data as GeoJSON.FeatureCollection,
          sourceEpsg,
          targetEpsg
        );
      } else {
        const transformedGeom = await transformGeometryCoordinates(
          this.projEngine,
          input.data as GeoJsonGeometry,
          sourceEpsg,
          targetEpsg
        );
        
        if (transformedGeom) {
          result = {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: transformedGeom,
              properties: {},
            }],
          };
        }
      }

      if (!result) {
        return createErrorResult('TRANSFORM_FAILED', 'Coordinate transformation failed. Check that input coordinates are valid for the source CRS.');
      }

      return createSuccessResult(result, warnings, targetEpsg);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResult('TRANSFORM_ERROR', message);
    }
  }
}

// Singleton instance
let spatialEngineInstance: SpatialEngine | null = null;

export function getSpatialEngine(): SpatialEngine {
  if (!spatialEngineInstance) {
    spatialEngineInstance = new SpatialEngine();
  }
  return spatialEngineInstance;
}

export { GEOMETRY_CAPABILITIES, CRS_CAPABILITIES };

// Export validation functions for testing
export { getGeometryEngine } from './geos-spike';
export { getProjEngine, initializeProj } from './proj-spike';
