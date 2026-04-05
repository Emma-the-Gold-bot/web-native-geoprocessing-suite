import type { Artifact, HistoryEvent } from '../../types';
import type { GeometryOperationResult } from '../spatial/types';
import { buildOperationWarnings } from './runtime';

export function buildSingleInputOperationWarnings(
  sourceArtifact: Artifact,
  result: GeometryOperationResult,
): Artifact['warnings'] {
  return buildOperationWarnings({
    sourceWarnings: sourceArtifact.warnings,
    result,
  });
}

export interface BuildSingleInputHistoryEventParams {
  eventId: string;
  sourceArtifact: Artifact;
  artifact: Artifact;
  operationName: string;
  details: Record<string, unknown>;
  result: GeometryOperationResult;
  transformPlanSummary?: string;
}

export function buildSingleInputOperationHistoryEvent(
  params: BuildSingleInputHistoryEventParams,
): HistoryEvent {
  const { eventId, sourceArtifact, artifact, operationName, details, result, transformPlanSummary } = params;

  return {
    id: eventId,
    type: 'operation',
    timestamp: new Date().toISOString(),
    summary: `${operationName.charAt(0).toUpperCase() + operationName.slice(1)} on ${sourceArtifact.name} → ${artifact.name}`,
    inputArtifactIds: [sourceArtifact.id],
    outputArtifactIds: [artifact.id],
    warnings: buildSingleInputOperationWarnings(sourceArtifact, result),
    details: {
      operation: operationName,
      sourceArtifactId: sourceArtifact.id,
      sourceArtifactName: sourceArtifact.name,
      outputArtifactId: artifact.id,
      outputArtifactName: artifact.name,
      outputKind: artifact.outputKind ?? 'spatial-artifact',
      inputStoredCrs: sourceArtifact.crs,
      outputStoredCrs: artifact.crs,
      outputCrsConfidence: artifact.crsProvenance?.confidence,
      outputCrsProvenance: artifact.crsProvenance?.source,
      explicitOutputCrsProduced: Boolean(result.outputCrs),
      transformPlanSummary,
      inputWarningCodes: sourceArtifact.warnings.map((warning) => warning.code),
      outputWarningCodes: artifact.warnings.map((warning) => warning.code),
      ...details,
    },
  };
}
