/**
 * Spatial Engine Types
 * 
 * Shared types for the geometry and CRS engine interfaces.
 * These define the contract between product truth (artifacts) and 
 * compute truth (GEOS/PROJ engines).
 */

// ============================================================================
// Geometry Operation Types
// ============================================================================

/** Input to a geometry operation */
export interface GeometryOperationInput {
  type: 'feature-collection' | 'geometry';
  data: GeoJSON.FeatureCollection | GeoJSON.Geometry;
  crsState: CrsState;
}

/** Result from a geometry operation */
export interface GeometryOperationResult {
  success: boolean;
  output?: GeoJSON.FeatureCollection;
  outputCrs?: string;
  warnings: WarningRef[];
  errors: GeometryError[];
}

/** Error from a geometry operation */
export interface GeometryError {
  code: string;
  message: string;
  featureIndex?: number;
}

// ============================================================================
// CRS Types
// ============================================================================

/**
 * Explicit CRS state - makes CRS ambiguity explicit rather than implicit
 */
export type CrsState = 
  | { status: 'known'; crs: string }
  | { status: 'unknown'; message?: string }
  | { status: 'missing'; message?: string };

/**
 * CRS metadata */
export interface CrsInfo {
  name: string;
  epsg: string;
  proj4: string;
  areaOfUse?: string;
}

/** Transform pair availability */
export interface TransformPair {
  source: string;
  target: string;
  available: boolean;
}

// ============================================================================
// Capability Reporting
// ============================================================================

/** Support-level contract for operation claims */
export type SupportLevel =
  | 'universal'
  | 'validated_local'
  | 'environment_sensitive'
  | 'partial'
  | 'not_supported';

export interface SupportEnvelope {
  verified: SupportLevel;
  runtimeSensitive?: boolean;
  notes?: string[];
}

/** Geometry engine capabilities */
export interface GeometryCapabilities {
  bufferSupport: SupportEnvelope;
  centroidSupport: SupportEnvelope;
  convexHullSupport?: SupportEnvelope;
  envelopeSupport?: SupportEnvelope;
  simplifySupport?: SupportEnvelope;
  dissolveSupport: SupportEnvelope;
  clipSupport: SupportEnvelope;
  intersectSupport?: SupportEnvelope;
  maxFeatureCount: number;
}

/** CRS engine capabilities */
export interface CrsCapabilities {
  supportedProjections: string[];
  autoTransform: boolean;
  transformSupport: SupportEnvelope;
  assignSupport: SupportEnvelope;
}

/** Combined spatial engine capabilities */
export interface SpatialEngineCapabilities {
  geometry: GeometryCapabilities;
  crs: CrsCapabilities;
  initialized: boolean;
}

// ============================================================================
// Warning Types (re-exported from product types for convenience)
// ============================================================================

export type WarningSeverity = 'info' | 'caution' | 'serious' | 'blocking';
export type WarningScope = 'active' | 'inherited' | 'historical';

export interface WarningRef {
  id: string;
  severity: WarningSeverity;
  title: string;
  message: string;
  scope?: WarningScope;
  /** Warning code from typed taxonomy - canonical warning identity */
  code: string;
}

// ============================================================================
// Worker Message Types
// ============================================================================

/** Message from main thread to geometry worker */
export interface GeometryWorkerMessage {
  type: 'buffer' | 'centroid' | 'dissolve' | 'clip';
  payload: {
    input: GeometryOperationInput;
    distance?: number;
    units?: 'kilometers' | 'miles';
    groupByField?: string;
    clipGeometry?: GeoJSON.Geometry;
  };
  requestId: string;
}

/** Message from geometry worker to main thread */
export interface GeometryWorkerResponse {
  type: 'result' | 'error';
  requestId: string;
  payload: GeometryOperationResult;
}

/** Message from main thread to CRS worker */
export interface CrsWorkerMessage {
  type: 'transform' | 'assign-crs' | 'get-crs-info';
  payload: {
    input?: GeometryOperationInput;
    sourceEpsg?: string;
    targetEpsg?: string;
    epsgCode?: string;
  };
  requestId: string;
}

/** Message from CRS worker to main thread */
export interface CrsWorkerResponse {
  type: 'result' | 'error' | 'crs-info';
  requestId: string;
  payload: GeometryOperationResult | CrsInfo | { error: string };
}
