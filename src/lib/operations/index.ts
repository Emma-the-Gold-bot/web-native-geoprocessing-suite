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
  JoinContract,
  OperationUiHints,
  AttributePolicy,
  AttributeJoinFieldSelection,
  AttributeJoinExecutionContext,
} from './types';

export { OPERATION_REGISTRY, getOperationDefinition } from './registry';
export { getOperationSupportTier, isOperationSupported, getOperationSupportEnvelope } from './capabilities';
export {
  getArtifactCrsState,
  validateOperationCrsPolicy,
  validateOperationDefinitionCrsContract,
  type ArtifactCrsState,
  type CrsPolicyValidationError,
  type CrsPolicyValidationResult,
} from './crs-policy';
export {
  buildOperationTransformPlan,
  validateOperationDefinitionTransformPlanningContract,
  type OperationTransformPlan,
  type BuildOperationTransformPlanParams,
} from './transform-planning';
export { buildSingleInputDerivedArtifact } from './artifact-builder';
export { buildSingleInputOperationHistoryEvent, buildSingleInputOperationWarnings } from './provenance-builder';
export {
  buildOperationOutputCrsProvenance,
  buildOperationWarnings,
  registerOperationArtifactTable,
  type OperationWarningBuildParams,
} from './runtime';
export {
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
  type SingleInputOperationPresentation,
  type AggregationOperationPresentation,
  type MeasurementOperationPresentation,
  type AttributeJoinPresentation,
} from './presentation';
export {
  getTopologyFamilyDefinition,
  getTopologyRoleContext,
  validateTopologyOperation,
  createTopologyRefusal,
  executeTopologyOperation,
  type TwoInputTopologyOperationDefinition,
  type TopologyRoleContext,
  type TopologyValidationResult,
  type ExecuteTopologyOperationParams,
  type TopologyOperationExecutionResult,
} from './topology';
export {
  executeSingleInputOperation,
  executeRegisteredSingleInputOperation,
  type OperationExecutionResult,
} from './executor';
export {
  executeRegisteredAggregationOperation,
  type AggregationExecutionResult,
} from './aggregation-execution';
export {
  executeRegisteredMeasurementOperation,
  executeAreaMeasurementOperation,
  executePerimeterMeasurementOperation,
  executeCompactnessMeasurementOperation,
  type MeasurementExecutionResult,
} from './measurement-execution';
export {
  executeAttributeJoinOperation,
  getJoinableFieldNames,
  type AttributeJoinExecutionResult,
} from './attribute-join';
