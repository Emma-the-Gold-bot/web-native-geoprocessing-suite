import type { Artifact } from '../../types';
import { inferGeometryType } from '../../lib/utils';
import { createDerivedArtifact } from '../spatial/adapters';
import type { GeometryOperationResult } from '../spatial/types';
import { buildOperationOutputCrsProvenance } from './runtime';

export interface BuildSingleInputDerivedArtifactParams {
  eventId: string;
  artifactId: string;
  tableName: string;
  sourceArtifact: Artifact;
  operationName: string;
  operationFormat: string;
  result: GeometryOperationResult;
  outputName?: string;
}

export function buildSingleInputDerivedArtifact(
  params: BuildSingleInputDerivedArtifactParams,
): Artifact | null {
  const {
    eventId,
    artifactId,
    tableName,
    sourceArtifact,
    operationName,
    operationFormat,
    result,
    outputName,
  } = params;

  const derivedPartial = createDerivedArtifact(sourceArtifact, operationName, result, tableName);
  if (!derivedPartial || !result.output) {
    return null;
  }

  const outputCrs = result.outputCrs || sourceArtifact.crs;
  const crsProvenance = buildOperationOutputCrsProvenance({
    sourceArtifact,
    result,
    outputCrs,
    explicitSource: 'operation-inherited',
  });

  return {
    id: artifactId,
    name: outputName || derivedPartial.name || `${sourceArtifact.name}_${operationName}`,
    kind: 'derived',
    outputKind: 'spatial-artifact',
    format: operationFormat,
    spatial: true,
    geometryType: inferGeometryType(result.output),
    rowCount: result.output.features.length,
    crs: outputCrs,
    crsProvenance,
    warnings: derivedPartial.warnings || [],
    originEventId: eventId,
    inputArtifactIds: [sourceArtifact.id],
    tableName: derivedPartial.tableName,
    data: result.output,
  };
}
