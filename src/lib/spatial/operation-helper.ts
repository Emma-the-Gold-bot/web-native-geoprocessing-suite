/**
 * Product Operation Orchestrator
 * 
 * NOTE: This is NOT a pure engine layer - it's the canonical product-level
 * orchestrator that coordinates spatial operations end-to-end.
 * 
 * Provides a unified flow for:
 * - Validating selected artifact
 * - Building operation input (adapting artifact -> engine input)
 * - Running the engine operation (GEOS/PROJ)
 * - Normalizing warnings/errors from engine to product format
 * - Building the derived artifact (engine output -> product artifact)
 * - Building the history event for audit trail
 * - Registering queryable output in DuckDB
 * 
 * This lives at the product/engine boundary, not inside the engine itself.
 * Operations using this helper: buffer, centroid, dissolve, reproject
 * 
 * The underlying engine operations live in geometry-engine.ts and crs-engine.ts.
 */

import type { Artifact } from '../../types';
import type {
  GeometryOperationInput,
  GeometryOperationResult,
} from './types';
import {
  createTopologyRefusal,
  executeRegisteredSingleInputOperation,
  executeSingleInputOperation,
  executeTopologyOperation,
  getOperationDefinition,
  validateOperationCrsPolicy,
  validateTopologyOperation,
  type TopologyValidationResult,
} from '../operations';
import type { OperationExecutionResult } from '../operations';
import { createWarningFromCode } from './warning-codes';

// ============================================================================
// Core Execution Function
// ============================================================================

/**
 * Parameters for executing a geometry operation
 */
export interface ExecuteOperationParams {
  /** The source artifact to operate on */
  sourceArtifact: Artifact;
  /** Name of the operation (e.g., 'buffer', 'centroid') */
  operationName: string;
  /** Human-readable format of the operation (e.g., 'Buffer operation') */
  operationFormat: string;
  /** The actual function that executes the geometry operation */
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>;
  /** Function to provide operation-specific details for the history event */
  getDetails: (sourceArtifact: Artifact) => Record<string, unknown>;
  /** Optional user-provided name for the output artifact */
  outputName?: string;
}

/**
 * Execute a geometry operation using the canonical product orchestrator flow.
 *
 * The actual shared execution substrate now lives under src/lib/operations.
 * This helper remains as the product/engine-boundary facade so existing imports
 * and UI code do not need to churn while the substrate consolidation continues.
 */
export async function executeSpatialOperation(
  params: ExecuteOperationParams
): Promise<OperationExecutionResult> {
  return executeSingleInputOperation(params);
}

// ============================================================================
// Simplified Operation Wrappers
// ============================================================================

/**
 * Parameters for simple operations that don't need extra config
 */
export interface SimpleOperationParams {
  sourceArtifact: Artifact;
  operationName: string;
  operationFormat: string;
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>;
  outputName?: string;
}

/**
 * Execute a simple geometry operation (centroid, dissolve)
 * These operations don't require extra parameters
 */
export async function executeSimpleOperation(
  params: SimpleOperationParams
): Promise<OperationExecutionResult> {
  return executeSpatialOperation({
    ...params,
    getDetails: () => ({}),
  });
}

/**
 * Execute buffer operation with distance parameters
 */
export interface BufferOperationParams {
  sourceArtifact: Artifact;
  distance: number;
  unit: 'kilometers' | 'miles';
  outputName?: string;
}

/**
 * Execute reproject operation with CRS parameters
 */
export interface ReprojectOperationParams {
  sourceArtifact: Artifact;
  sourceCrs: string;
  targetCrs: string;
  outputName?: string;
}

// ============================================================================
// Warning Helpers (for use by operations)
// ============================================================================

/**
 * Add CRS warnings to an operation result based on input CRS state
 */
export function addCrsWarningsToResult(
  result: GeometryOperationResult,
  crsState: { status: 'known' | 'unknown' | 'missing'; crs?: string },
  operationName: string
): GeometryOperationResult {
  const warnings = [...result.warnings];

  if (crsState.status === 'missing') {
    warnings.push(createWarningFromCode('CRS_MISSING', undefined, { operation: operationName }));
  } else if (crsState.status === 'unknown') {
    warnings.push(createWarningFromCode('CRS_UNKNOWN', undefined, { operation: operationName }));
  }

  return {
    ...result,
    warnings,
  };
}

/**
 * Add approximation warning to an operation result
 */
export function addApproximationWarning(
  result: GeometryOperationResult,
  operationName: string
): GeometryOperationResult {
  return {
    ...result,
    warnings: [
      ...result.warnings,
      createWarningFromCode('APPROXIMATE_OP', undefined, { operation: operationName }),
    ],
  };
}

/**
 * Add unsupported geometry warning to an operation result
 */
export function addUnsupportedGeometryWarning(
  result: GeometryOperationResult,
  geometryTypes: string[],
  operationName: string
): GeometryOperationResult {
  return {
    ...result,
    warnings: [
      ...result.warnings,
      createWarningFromCode('UNSUPPORTED_GEOMETRY', undefined, {
        operation: operationName,
        geometryTypes: geometryTypes.join(', '),
      }),
    ],
  };
}

// ============================================================================
// Topology-family Validation / Execution Wrappers
// ============================================================================

export type ClipValidationResult = TopologyValidationResult;
export type IntersectValidationResult = TopologyValidationResult;

export function validateForClip(
  sourceArtifact: Artifact,
  maskArtifact: Artifact
): ClipValidationResult {
  return validateTopologyOperation('clip-v1', sourceArtifact, maskArtifact);
}

export function createClipRefusal(
  validationResult: ClipValidationResult
): GeometryOperationResult {
  return createTopologyRefusal(validationResult);
}

export function validateForIntersect(
  sourceArtifact: Artifact,
  overlayArtifact: Artifact
): IntersectValidationResult {
  return validateTopologyOperation('intersect-v1', sourceArtifact, overlayArtifact);
}

export function createIntersectRefusal(
  validationResult: IntersectValidationResult
): GeometryOperationResult {
  return createTopologyRefusal(validationResult);
}

// ============================================================================
// Clip-specific Execution (Two-input)
// ============================================================================

/**
 * Parameters for executing a clip operation with two inputs
 */
export interface ExecuteClipParams {
  sourceArtifact: Artifact;
  maskArtifact: Artifact;
  outputName?: string;
  executeClip: (sourceInput: GeometryOperationInput, maskInput: GeometryOperationInput) => Promise<GeometryOperationResult>;
}

export interface ExecuteIntersectParams {
  sourceArtifact: Artifact;
  overlayArtifact: Artifact;
  outputName?: string;
  executeIntersect: (sourceInput: GeometryOperationInput, overlayInput: GeometryOperationInput) => Promise<GeometryOperationResult>;
}

export interface ReprojectContractValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
}

export function validateForReproject(
  sourceArtifact: Artifact,
  explicitSourceCrs?: string,
): ReprojectContractValidationResult {
  const definition = getOperationDefinition('reproject');
  if (!definition) {
    return {
      valid: false,
      errors: [{ code: 'CRS_MISSING', message: 'Missing operation definition for reproject.' }],
    };
  }

  const crsValidation = validateOperationCrsPolicy({
    definition,
    sourceArtifact,
    explicitSourceCrs,
  });

  return {
    valid: crsValidation.valid,
    errors: crsValidation.errors,
  };
}

export async function executeClipOperation(
  params: ExecuteClipParams
): Promise<OperationExecutionResult> {
  const { sourceArtifact, maskArtifact, outputName, executeClip } = params;
  return executeTopologyOperation({
    operationId: 'clip-v1',
    sourceArtifact,
    secondaryArtifact: maskArtifact,
    outputName,
    executeTopology: executeClip,
  });
}

export async function executeIntersectOperation(
  params: ExecuteIntersectParams
): Promise<OperationExecutionResult> {
  const { sourceArtifact, overlayArtifact, outputName, executeIntersect } = params;
  return executeTopologyOperation({
    operationId: 'intersect-v1',
    sourceArtifact,
    secondaryArtifact: overlayArtifact,
    outputName,
    executeTopology: executeIntersect,
  });
}

export type { OperationExecutionResult };
export { executeRegisteredSingleInputOperation };
