import type { Artifact, HistoryEvent } from '../../types';
import { makeId } from '../../lib/utils';
import { artifactToOperationInput, validateArtifactForGeometryOps } from '../spatial/adapters';
import type {
  GeometryOperationInput,
  GeometryOperationResult,
} from '../spatial/types';
import { getOperationDefinition } from './registry';
import { buildSingleInputDerivedArtifact } from './artifact-builder';
import { buildSingleInputOperationHistoryEvent } from './provenance-builder';
import { registerOperationArtifactTable } from './runtime';
import { buildOperationTransformPlan } from './transform-planning';

export interface OperationExecutionResult {
  artifact?: Artifact;
  historyEvent?: HistoryEvent;
  error?: string;
}

export interface ExecuteSingleInputOperationParams {
  sourceArtifact: Artifact;
  operationName: string;
  operationFormat: string;
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>;
  getDetails: (sourceArtifact: Artifact) => Record<string, unknown>;
  outputName?: string;
  validationErrorPrefix?: string;
}

export async function executeSingleInputOperation(
  params: ExecuteSingleInputOperationParams,
): Promise<OperationExecutionResult> {
  const {
    sourceArtifact,
    operationName,
    operationFormat,
    executeOperation,
    getDetails,
    outputName,
    validationErrorPrefix,
  } = params;

  const validation = validateArtifactForGeometryOps(sourceArtifact);
  if (!validation.valid) {
    const prefix = validationErrorPrefix ? `${validationErrorPrefix}: ` : '';
    return { error: `${prefix}${validation.errors.join(', ')}` };
  }

  const operationInput = artifactToOperationInput(sourceArtifact);
  if (!operationInput) {
    return { error: 'artifact has no valid spatial data' };
  }

  const definition = getOperationDefinition(operationName);
  const transformPlanSummary = definition
    ? buildOperationTransformPlan({ definition, sourceArtifact }).summary
    : undefined;

  if (definition) {
    const sourceGeometry = sourceArtifact.geometryType;
    const allowedSourceGeometry = definition.geometryContract.allowedSourceGeometry;
    if (definition.crsContract.sourceRequirement === 'require-known') {
      if (!sourceArtifact.crs) {
        return { error: `Source artifact "${sourceArtifact.name}" has missing stored CRS. ${definition.label} requires known stored CRS before execution.` };
      }
      if (sourceArtifact.crs === 'unknown') {
        return { error: `Source artifact "${sourceArtifact.name}" has unknown stored CRS. ${definition.label} requires known stored CRS before execution.` };
      }
    }
    if (sourceGeometry && allowedSourceGeometry?.length && !allowedSourceGeometry.includes(sourceGeometry)) {
      return {
        error: `${validationErrorPrefix ?? definition.label} refuses geometry type "${sourceGeometry}". ${definition.label} v1 supports only ${allowedSourceGeometry.join(' or ')}.`,
      };
    }
  }

  const result = await executeOperation(operationInput);

  if (!result.success) {
    return { error: result.errors.map((e) => e.message).join(', ') };
  }

  if (!result.output) {
    return { error: 'no output produced' };
  }

  const safeOperationName = operationName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const tableName = `${safeOperationName}_${sourceArtifact.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${makeId('short').replace(/-/g, '')}`;
  const eventId = makeId('event');
  const artifactId = makeId('artifact');

  const artifact = buildSingleInputDerivedArtifact({
    eventId,
    artifactId,
    tableName,
    sourceArtifact,
    operationName,
    operationFormat,
    result,
    outputName,
  });

  if (!artifact) {
    return { error: 'could not create derived artifact' };
  }

  try {
    await registerOperationArtifactTable(tableName, result);
  } catch (registerError) {
    console.error('Failed to register operation artifact table:', registerError);
  }

  const historyEvent = buildSingleInputOperationHistoryEvent({
    eventId,
    sourceArtifact,
    artifact,
    operationName,
    details: getDetails(sourceArtifact),
    result,
    transformPlanSummary,
  });

  return { artifact, historyEvent };
}

export async function executeRegisteredSingleInputOperation(params: {
  operationId: string;
  sourceArtifact: Artifact;
  executeOperation: Parameters<typeof executeSingleInputOperation>[0]['executeOperation'];
  getDetails?: (sourceArtifact: Artifact) => Record<string, unknown>;
  outputName?: string;
}): Promise<OperationExecutionResult> {
  const definition = getOperationDefinition(params.operationId);
  if (!definition) {
    return { error: `Unknown operation definition: ${params.operationId}` };
  }

  if (definition.geometryContract.inputArity !== 1) {
    return { error: `Operation ${params.operationId} is not a single-input operation` };
  }

  return executeSingleInputOperation({
    sourceArtifact: params.sourceArtifact,
    operationName: definition.id,
    operationFormat: `${definition.label} operation`,
    executeOperation: params.executeOperation,
    getDetails: params.getDetails ?? (() => ({})),
    outputName: params.outputName,
    validationErrorPrefix: definition.label,
  });
}
