/**
 * Spatial Engine Module
 * 
 * Provides the geometry and CRS engine interfaces for the web-native 
 * geoprocessing suite using GEOS-WASM and PROJ-WASM.
 * 
 * Architecture:
 * - GeometryEngine: Geometry operations via GEOS-WASM
 * - CrsEngine: CRS operations via PROJ-WASM
 * - Worker Bus: Orchestrates communication (currently uses built-in worker pools)
 * - Adapters: Convert between product artifacts and engine I/O
 * 
 * Capabilities (honest reporting):
 * - Buffer (GEOS): validated on the current local support path
 * - Centroid (GEOS): validated on the current local support path
 * - Dissolve (GEOS): global dissolve plus narrow grouped-dissolve-v1 by one explicit attribute field on the current support path
 * - Clip (GEOS): narrow v1 contract - polygon/multipolygon by polygon/multipolygon only, requires matching CRS
 * - Convex Hull (GEOS): narrow v1 contract - single polygon/multipolygon input only, requires known stored CRS
 * - CRS Transform (PROJ): real coordinate transformation exists, but runtime support is environment-sensitive outside the hardened local setup
 * - CRS Assign (PROJ): metadata only, no transformation
 * - CRS Query (PROJ): limited to common CRS definitions in the current product surface
 */

// ============================================================================
// Types (core interfaces for the engine boundary)
// ============================================================================

export type {
  GeometryOperationInput,
  GeometryOperationResult,
  GeometryError,
  CrsInfo,
  CrsState,
  TransformPair,
  GeometryCapabilities,
  CrsCapabilities,
  SpatialEngineCapabilities,
  WarningRef,
  WarningSeverity,
  WarningScope,
  GeometryWorkerMessage,
  GeometryWorkerResponse,
  CrsWorkerMessage,
  CrsWorkerResponse,
} from './types';

export type {
  OperationDefinition,
  OperationExecutionContext,
  OperationExecutionOutcome,
  OperationFamily,
  OperationRefusal,
  OperationSupportTier,
  GeometryContract,
  CrsContract,
  CrsRequirement,
  CrsExactMatchRequirement,
  TransformExecutionRequirement,
  TransformFutureEligibility,
  TransformOutputCrsMode,
  TransformPlanningContract,
  OutputContract,
  MeasurementContract,
  AggregationContract,
  OperationUiHints,
} from '../operations';

// ============================================================================
// Geometry Engine
// ============================================================================

export {
  GEOMETRY_CAPABILITIES,
} from './geometry-engine';

// ============================================================================
// CRS Engine
// ============================================================================

export { 
  CRS_CAPABILITIES, 
  COMMON_CRS_CODES 
} from './crs-engine';

// ============================================================================
// Combined Engine / Orchestration
// ============================================================================

export { 
  getSpatialEngine,
  GEOMETRY_CAPABILITIES as geometryCapabilities,
  CRS_CAPABILITIES as crsCapabilities,
  createCrsState,
} from './worker-bus';

// ============================================================================
// Adapters (Artifact <-> Engine conversion)
// ============================================================================

export {
  artifactToOperationInput,
  operationResultToArtifactData,
  createArtifactWarnings,
  validateArtifactForGeometryOps,
  getArtifactCrs,
  createDerivedArtifact,
} from './adapters';

// ============================================================================
// Warning Codes (Typed taxonomy for warnings)
// ============================================================================

export {
  createWarningFromCode,
  getWarningCodes,
  getWarningCodeConfig,
  type WarningCode,
} from './warning-codes';

export {
  OPERATION_REGISTRY,
  getOperationDefinition,
  getOperationSupportTier,
  isOperationSupported,
  getOperationSupportEnvelope,
  getArtifactCrsState,
  validateOperationCrsPolicy,
  validateOperationDefinitionCrsContract,
  buildOperationTransformPlan,
  validateOperationDefinitionTransformPlanningContract,
  buildSingleInputDerivedArtifact,
  buildSingleInputOperationHistoryEvent,
  buildOperationOutputCrsProvenance,
  buildOperationWarnings,
  registerOperationArtifactTable,
  getSingleInputOperationPresentation,
  getAggregationOperationPresentation,
  getMeasurementOperationPresentation,
  getSingleInputGeometrySupport,
  getSingleInputOperationInfoWarning,
  getMeasurementUnitDisclosure,
  getMeasurementUnitRefusalWarning,
  getAttributeJoinPresentation,
  getAttributeJoinOutputFieldSelection,
  getOperationSuccessStatusMessage,
  getTopologyFamilyDefinition,
  getTopologyRoleContext,
  validateTopologyOperation,
  createTopologyRefusal,
  executeTopologyOperation,
  executeRegisteredSingleInputOperation,
  executeRegisteredAggregationOperation,
  executeRegisteredMeasurementOperation,
  executeAreaMeasurementOperation,
  executePerimeterMeasurementOperation,
  executeCompactnessMeasurementOperation,
  executeAttributeJoinOperation,
  getJoinableFieldNames,
} from '../operations';

// ============================================================================
// Display Geometry Normalization Layer
// ============================================================================
// Display-safe geometry transformations for map rendering
// Contract: artifact CRS metadata is NEVER modified - display only

export {
  isProjectedCrs,
  needsDisplayTransformation,
  extractBounds,
  extractCoordinates,
  getDisplayBounds,
  getBoundsSync,
  getDisplayFeatureCollection,
  type DisplayBounds,
} from './display-transform';

// ============================================================================
// Operation Helper (Canonical shared execution flow)
// ============================================================================

export {
  executeSpatialOperation,
  executeSimpleOperation,
  executeClipOperation,
  executeIntersectOperation,
  addCrsWarningsToResult,
  addApproximationWarning,
  addUnsupportedGeometryWarning,
  validateForClip,
  createClipRefusal,
  validateForIntersect,
  createIntersectRefusal,
  validateForReproject,
  type OperationExecutionResult,
  type ExecuteOperationParams,
  type SimpleOperationParams,
  type BufferOperationParams,
  type ReprojectOperationParams,
  type ClipValidationResult,
  type ExecuteClipParams,
  type ExecuteIntersectParams,
  type IntersectValidationResult,
} from './operation-helper';

// ============================================================================
// Internal / Testing Utilities
// ============================================================================
// These are for internal development and testing only - not part of product API
// They may change without notice as the spatial engine evolves

// GEOS spike - internal testing only (not exported from public API)
export { 
  GeosWasmEngine, 
  getGeometryEngine as getLegacyGeometryEngine, 
  runGeosValidation,
} from './geos-spike';

// PROJ spike - internal testing only (not exported from public API)
export {
  ProjWasmEngine,
  getProjEngine,
  runProjValidation,
  initializeProj as initProjLegacy,
  testBasicTransformation,
  testUtmTransformation,
  testInverseTransformation
} from './proj-spike';
