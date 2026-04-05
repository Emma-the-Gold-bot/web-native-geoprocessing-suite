import type { Artifact, HistoryEvent } from '../../types';
import { inferGeometryType, makeId } from '../../lib/utils';
import { artifactToOperationInput, createDerivedArtifact } from '../spatial/adapters';
import type { GeometryOperationInput, GeometryOperationResult } from '../spatial/types';
import { getOperationDefinition } from './registry';
import {
  getTopologyFamilyDefinition,
  getTopologyRoleContext,
  validateTopologyOperation,
  type TopologyValidationResult,
} from './topology-contract';
import {
  buildOperationOutputCrsProvenance,
  buildOperationWarnings,
  registerOperationArtifactTable,
} from './runtime';
import { buildOperationTransformPlan } from './transform-planning';

export interface ExecuteTopologyOperationParams {
  operationId: 'clip-v1' | 'intersect-v1';
  sourceArtifact: Artifact;
  secondaryArtifact: Artifact;
  outputName?: string;
  executeTopology: (sourceInput: GeometryOperationInput, secondaryInput: GeometryOperationInput) => Promise<GeometryOperationResult>;
}

export interface TopologyOperationExecutionResult {
  artifact?: Artifact;
  historyEvent?: HistoryEvent;
  error?: string;
}


function buildTopologyHistoryEvent(params: {
  eventId: string;
  artifactId: string;
  operationId: 'clip-v1' | 'intersect-v1';
  sourceArtifact: Artifact;
  secondaryArtifact: Artifact;
  artifact: Artifact;
  warnings: Artifact['warnings'];
  result: GeometryOperationResult;
  transformPlanSummary?: string;
}): HistoryEvent {
  const { eventId, artifactId, operationId, sourceArtifact, secondaryArtifact, artifact, warnings, result, transformPlanSummary } = params;
  const operation = getTopologyFamilyDefinition(operationId);
  const roleContext = getTopologyRoleContext(operationId);
  const definition = getOperationDefinition(operationId);

  if (!definition || definition.family !== 'topology-two-input') {
    throw new Error(`Missing topology operation definition for ${operationId}`);
  }

  return {
    id: eventId,
    type: 'operation',
    timestamp: new Date().toISOString(),
    summary: `${definition.label} ${sourceArtifact.name} ${operation.summaryVerb} ${secondaryArtifact.name} → ${artifact.name}`,
    inputArtifactIds: [sourceArtifact.id, secondaryArtifact.id],
    outputArtifactIds: [artifactId],
    warnings: warnings.map((warning) => ({ ...warning, scope: 'historical' as const })),
    details: {
      operation: definition.label.toLowerCase(),
      sourceArtifactId: sourceArtifact.id,
      sourceArtifactName: sourceArtifact.name,
      [`${roleContext.secondaryLabel}ArtifactId`]: secondaryArtifact.id,
      [`${roleContext.secondaryLabel}ArtifactName`]: secondaryArtifact.name,
      outputArtifactId: artifactId,
      outputArtifactName: artifact.name,
      outputKind: artifact.outputKind ?? 'spatial-artifact',
      sourceStoredCrs: sourceArtifact.crs,
      [`${roleContext.secondaryLabel}StoredCrs`]: secondaryArtifact.crs,
      outputStoredCrs: artifact.crs,
      outputCrsConfidence: artifact.crsProvenance?.confidence,
      outputCrsProvenance: artifact.crsProvenance?.source,
      transformPlanSummary,
      contractRequiresMatchingStoredCrs: true,
      contractRequiresPolygonalInputs: true,
      wasEmpty: (result.output?.features.length ?? 0) === 0,
      outputAttributeSemantics: definition.outputContract.attributePolicy ?? 'none',
      inputWarningCodes: [
        ...sourceArtifact.warnings.map((warning) => `source:${warning.code}`),
        ...secondaryArtifact.warnings.map((warning) => `${roleContext.secondaryLabel}:${warning.code}`),
      ],
      outputWarningCodes: artifact.warnings.map((warning) => warning.code),
    },
  };
}

export async function executeTopologyOperation(
  params: ExecuteTopologyOperationParams,
): Promise<TopologyOperationExecutionResult> {
  const { operationId, sourceArtifact, secondaryArtifact, outputName, executeTopology } = params;
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.family !== 'topology-two-input') {
    throw new Error(`Missing topology operation definition for ${operationId}`);
  }

  const validation: TopologyValidationResult = validateTopologyOperation(operationId, sourceArtifact, secondaryArtifact);
  if (!validation.valid) {
    return { error: validation.errors.map((error) => error.message).join('; ') };
  }

  const transformPlanSummary = buildOperationTransformPlan({
    definition,
    sourceArtifact,
    secondaryArtifact,
  }).summary;

  const sourceInput = artifactToOperationInput(sourceArtifact);
  const secondaryInput = artifactToOperationInput(secondaryArtifact);
  if (!sourceInput || !secondaryInput) {
    return { error: 'One or both artifacts have no valid spatial data' };
  }

  const result = await executeTopology(sourceInput, secondaryInput);
  if (!result.success) {
    return { error: result.errors.map((error) => error.message).join(', ') };
  }
  if (!result.output) {
    return { error: 'no output produced' };
  }

  const tableName = `${definition.label.toLowerCase()}_${sourceArtifact.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${makeId('short').replace(/-/g, '')}`;
  const derivedPartial = createDerivedArtifact(sourceArtifact, definition.label.toLowerCase(), result, tableName);
  if (!derivedPartial) {
    return { error: 'could not create derived artifact' };
  }

  const eventId = makeId('event');
  const artifactId = makeId('artifact');
  const outputCrs = result.outputCrs || sourceArtifact.crs;
  const warnings = buildOperationWarnings({
    validationWarnings: validation.warnings,
    result,
    emptyResultOperation: definition.label.toLowerCase(),
    transformPlanSummary,
  });

  const artifact: Artifact = {
    id: artifactId,
    name: outputName || derivedPartial.name || `${sourceArtifact.name}_${definition.label.toLowerCase()}`,
    kind: 'derived',
    outputKind: definition.outputContract.outputKind ?? 'spatial-artifact',
    format: `${definition.label} operation`,
    spatial: true,
    geometryType: inferGeometryType(result.output),
    rowCount: result.output.features.length,
    crs: outputCrs,
    crsProvenance: buildOperationOutputCrsProvenance({
      sourceArtifact,
      result,
      outputCrs,
      explicitSource: 'operation-derived',
    }),
    warnings,
    originEventId: eventId,
    inputArtifactIds: [sourceArtifact.id, secondaryArtifact.id],
    tableName: derivedPartial.tableName,
    data: result.output,
  };

  try {
    await registerOperationArtifactTable(tableName, result, { allowEmptyTable: true });
  } catch (error) {
    console.error(`Failed to register ${definition.label.toLowerCase()} artifact table:`, error);
  }

  const historyEvent = buildTopologyHistoryEvent({
    eventId,
    artifactId,
    operationId,
    sourceArtifact,
    secondaryArtifact,
    artifact,
    warnings,
    result,
    transformPlanSummary,
  });

  return { artifact, historyEvent };
}
