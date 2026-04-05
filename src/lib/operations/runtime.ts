import type { Artifact, CrsProvenance } from '../../types';
import { getDuckDb } from '../../lib/duckdb';
import { createWarningFromCode } from '../spatial/warning-codes';
import type { GeometryOperationResult } from '../spatial/types';

export interface OperationWarningBuildParams {
  sourceWarnings?: Artifact['warnings'];
  validationWarnings?: Artifact['warnings'];
  result: GeometryOperationResult;
  emptyResultOperation?: string;
  transformPlanSummary?: string;
}

function shouldCarryForwardCrsAmbiguity(
  warning: Artifact['warnings'][number] | GeometryOperationResult['warnings'][number],
  result: GeometryOperationResult,
): boolean {
  if (result.outputCrs && (warning.code === 'CRS_UNKNOWN' || warning.code === 'CRS_MISSING')) {
    return false;
  }

  return true;
}

export function buildOperationOutputCrsProvenance(params: {
  sourceArtifact: Artifact;
  result: GeometryOperationResult;
  outputCrs: string | 'unknown' | undefined;
  explicitSource?: 'operation-derived' | 'operation-inherited';
}): CrsProvenance {
  const { sourceArtifact, result, outputCrs, explicitSource } = params;
  const explicitOutputCrs = result.outputCrs;
  const hasKnownExplicitOutput = Boolean(explicitOutputCrs && explicitOutputCrs !== 'unknown');

  if (hasKnownExplicitOutput) {
    return {
      confidence: 'known',
      declaredCrs: outputCrs,
      source: 'operation-derived',
      displayTransform: sourceArtifact.crsProvenance?.displayTransform,
      warnings: [],
    };
  }

  if (!outputCrs || outputCrs === 'unknown') {
    return {
      confidence: sourceArtifact.crsProvenance?.confidence ?? 'unknown',
      declaredCrs: outputCrs,
      source: explicitSource ?? 'operation-inherited',
      displayTransform: sourceArtifact.crsProvenance?.displayTransform,
      warnings: sourceArtifact.crsProvenance?.warnings ?? [],
    };
  }

  return {
    confidence: sourceArtifact.crsProvenance?.confidence ?? 'known',
    declaredCrs: outputCrs,
    source: explicitSource ?? 'operation-inherited',
    displayTransform: sourceArtifact.crsProvenance?.displayTransform,
    warnings: sourceArtifact.crsProvenance?.warnings ?? [],
  };
}

export function buildOperationWarnings(params: OperationWarningBuildParams): Artifact['warnings'] {
  const { sourceWarnings = [], validationWarnings = [], result, emptyResultOperation, transformPlanSummary } = params;

  const inheritedWarnings = sourceWarnings
    .filter((warning) => shouldCarryForwardCrsAmbiguity(warning, result))
    .map((warning) => ({
      ...warning,
      scope: warning.scope === 'historical' ? 'historical' as const : 'inherited' as const,
    }));

  const outputWarnings = result.warnings
    .filter((warning) => shouldCarryForwardCrsAmbiguity(warning, result))
    .map((warning) => ({ ...warning, scope: 'historical' as const }));

  const warnings = [
    ...inheritedWarnings,
    ...validationWarnings,
    ...outputWarnings,
  ];

  if (emptyResultOperation && result.output && result.output.features.length === 0) {
    warnings.push(
      createWarningFromCode('EMPTY_TOPOLOGY_RESULT', { scope: 'historical' }, { operation: emptyResultOperation }),
    );
  }

  void transformPlanSummary;

  return warnings;
}

export async function registerOperationArtifactTable(
  tableName: string,
  result: GeometryOperationResult,
  options?: { allowEmptyTable?: boolean },
): Promise<void> {
  const db = await getDuckDb();
  const conn = await db.connect();
  try {
    await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
    const rows = result.output?.features.map((feature) => ({
      ...(feature.properties ?? {}),
      geometry: JSON.stringify(feature.geometry),
    })) ?? [];

    if (rows.length > 0) {
      await db.registerFileText(`${tableName}.json`, JSON.stringify(rows));
      conn.insertJSONFromPath(`${tableName}.json`, { name: tableName });
    } else if (options?.allowEmptyTable) {
      await conn.query(`CREATE TABLE ${tableName} (geometry JSON)`);
    }
  } finally {
    await conn.close();
  }
}
