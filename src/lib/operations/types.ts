import type { Artifact, ArtifactOutputKind, HistoryEvent } from '../../types';
import type { GeometryOperationInput, GeometryOperationResult } from '../spatial/types';
import type { WarningCode } from '../spatial/warning-codes';

export type OperationFamily =
  | 'single-geometry'
  | 'topology-two-input'
  | 'crs'
  | 'measurement'
  | 'aggregation';

export type OperationSupportTier =
  | 'universal'
  | 'validated_local'
  | 'environment_sensitive'
  | 'partial'
  | 'not_supported';

export interface GeometryContract {
  inputArity: 1 | 2;
  allowedSourceGeometry?: string[];
  allowedSecondaryGeometry?: string[];
  refuseMixedGeometryCollections?: boolean;
}

export type CrsRequirement = 'allow-any' | 'require-known' | 'require-known-or-explicit';
export type CrsExactMatchRequirement = 'none' | 'source-secondary-known-match';
export type TransformExecutionRequirement = 'none' | 'same-crs-only' | 'explicit-transform';
export type TransformFutureEligibility = 'none' | 'candidate-via-explicit-plan' | 'implemented-explicit-transform';
export type TransformOutputCrsMode = 'inherit-source' | 'explicit-target';

export interface TransformPlanningContract {
  executionRequirement: TransformExecutionRequirement;
  futureEligibility: TransformFutureEligibility;
  outputCrsMode: TransformOutputCrsMode;
}

export interface CrsContract {
  sourceRequirement: CrsRequirement;
  secondaryRequirement?: CrsRequirement;
  exactMatchRequirement?: CrsExactMatchRequirement;
  transformPlanning: TransformPlanningContract;
}

export type AttributePolicy =
  | 'source-only'
  | 'grouping-field-only'
  | 'none'
  | 'merged-later'
  | 'explicit-right-fields-left-join-equality';

export interface JoinContract {
  joinMode: 'left';
  predicate: 'exact-equality';
  sourceKeyCount: 1;
  secondaryKeyCount: 1;
  selectedFieldMode: 'explicit-right-field-selection';
  collisionPolicy: 'right-fields-prefixed';
  outputGeometryMode: 'preserve-source-geometry';
  unmatchedSourceRows: 'preserve-with-null-right-fields';
  matchedSecondaryRows: 'first-match-only';
  supportsSpatialPredicates: false;
  supportsFuzzyMatching: false;
  supportsMultiKey: false;
}

export interface OutputContract {
  attributePolicy?: AttributePolicy;
  emptyResultMode?: 'honest-empty-success' | 'error';
  outputGeometryFamilies?: string[];
  outputKind?: ArtifactOutputKind;
}

export interface MeasurementContract {
  measurementKind: 'area' | 'perimeter' | 'compactness';
  valueField: string;
  unitField: string;
  areaUnit?: 'square-meters';
  perimeterUnit?: 'meters';
  compactnessUnit?: 'unitless';
  preservesSourceRows: boolean;
}

export interface AggregationContract {
  scope: 'global-only' | 'grouped-by-attribute';
  groupingFieldMode: 'none' | 'required-attribute';
  outputCardinality: 'single-output-artifact' | 'one-output-per-group';
}

export interface OperationUiHints {
  secondaryRoleLabel?: string;
  summary?: string;
}

export interface AttributeJoinFieldSelection {
  sourceField: string;
  outputField: string;
}

export interface AttributeJoinExecutionContext {
  sourceArtifact: Artifact;
  secondaryArtifact: Artifact;
  sourceKey: string;
  secondaryKey: string;
  selectedFields: AttributeJoinFieldSelection[];
  outputName?: string;
}

export interface OperationDefinition {
  id: string;
  label: string;
  family: OperationFamily;
  supportTier: OperationSupportTier;
  runtimeSensitive?: boolean;
  geometryContract: GeometryContract;
  crsContract: CrsContract;
  outputContract: OutputContract;
  aggregationContract?: AggregationContract;
  measurementContract?: MeasurementContract;
  joinContract?: JoinContract;
  warningCodes: WarningCode[];
  refusalCodes: WarningCode[];
  uiHints?: OperationUiHints;
}

export interface OperationExecutionContext {
  sourceArtifact: Artifact;
  secondaryArtifact?: Artifact;
  outputName?: string;
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>;
}

export interface OperationExecutionOutcome {
  ok: boolean;
  artifact?: Artifact;
  historyEvent?: HistoryEvent;
  warnings: Artifact['warnings'];
  refusal?: Artifact['warnings'][number];
  runtimeNotes?: Artifact['warnings'];
  error?: string;
}

export interface OperationRefusal {
  code: WarningCode;
  message: string;
}
