/**
 * Spatial Engine Adapters
 * 
 * Converts between product artifacts and engine input/output formats.
 * This module handles the boundary between product truth (artifacts) 
 * and runtime truth (GEOS/PROJ).
 */

import type { Artifact } from '../../types';
import type { GeometryOperationInput, GeometryOperationResult, WarningRef, CrsState } from './types';
import { createWarningFromCode } from './warning-codes';

/**
 * Convert artifact CRS to explicit CrsState
 * Distinguishes between:
 * - missing: CRS not specified at all (undefined)
 * - unknown: CRS explicitly set to the literal value "unknown"
 * - known: CRS is an actual CRS string like "EPSG:4326"
 */
function artifactCrsToState(artifact: Artifact): CrsState {
  if (artifact.crs === undefined) {
    return { status: 'missing', message: 'CRS not specified in artifact' };
  }
  if (artifact.crs === 'unknown') {
    return { status: 'unknown', message: 'CRS is explicitly set to unknown' };
  }
  return { status: 'known', crs: artifact.crs };
}

/**
 * Convert an artifact to a geometry operation input
 */
export function artifactToOperationInput(artifact: Artifact): GeometryOperationInput | null {
  if (!artifact.spatial || !artifact.data) {
    return null;
  }

  // Check if data is a FeatureCollection
  if (typeof artifact.data === 'object' && 
      artifact.data !== null &&
      'type' in artifact.data &&
      artifact.data.type === 'FeatureCollection') {
    return {
      type: 'feature-collection',
      data: artifact.data as GeoJSON.FeatureCollection,
      crsState: artifactCrsToState(artifact),
    };
  }

  return null;
}

/**
 * Convert operation result to artifact-compatible data
 */
export function operationResultToArtifactData(
  result: GeometryOperationResult
): GeoJSON.FeatureCollection | null {
  if (!result.success || !result.output) {
    return null;
  }
  return result.output;
}

/**
 * Create warnings for common artifact issues
 */
export function createArtifactWarnings(artifact: Artifact): WarningRef[] {
  const warnings: WarningRef[] = [];

  // Check CRS - distinguish between missing (not set) and unknown (explicitly "unknown")
  if (artifact.crs === undefined) {
    warnings.push(createWarningFromCode('CRS_MISSING'));
  } else if (artifact.crs === 'unknown') {
    warnings.push(createWarningFromCode('CRS_UNKNOWN'));
  }

  // Check for existing warnings from artifact
  warnings.push(...artifact.warnings);

  return warnings;
}

/**
 * Validate that artifact can be used for geometry operations
 */
export function validateArtifactForGeometryOps(
  artifact: Artifact
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!artifact.spatial) {
    errors.push('Artifact is not spatial');
  }

  if (!artifact.data) {
    errors.push('Artifact has no data');
  }

  if (artifact.data && typeof artifact.data === 'object') {
    const data = artifact.data as Record<string, unknown>;
    if (data.type !== 'FeatureCollection') {
      errors.push('Artifact data is not a FeatureCollection');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get CRS from artifact, with fallback
 */
export function getArtifactCrs(artifact: Artifact): string | undefined {
  if (artifact.crs && artifact.crs !== 'unknown') {
    return artifact.crs;
  }
  return undefined;
}

/**
 * Create a derived artifact from a geometry operation result
 * 
 * Note: Geometry operation results (buffer, centroid, etc.) are now registered
 * as DuckDB tables and are queryable via SQL. Registration happens in the
 * App layer after createDerivedArtifact returns.
 */
export function createDerivedArtifact(
  sourceArtifact: Artifact,
  operationName: string,
  result: GeometryOperationResult,
  newTableName?: string
): Partial<Artifact> | null {
  if (!result.success || !result.output) {
    return null;
  }

  const inputWarnings = sourceArtifact.warnings
    .filter((warning) => {
      // If an operation produced an explicit output CRS, do not carry forward
      // source-CRS ambiguity warnings into the derived artifact as active/inherited truth.
      // The source history still preserves them, but the output artifact should not look
      // more uncertain than the operation result actually is.
      if (!result.outputCrs) return true;
      return warning.code !== 'CRS_UNKNOWN' && warning.code !== 'CRS_MISSING';
    })
    .map(w => ({
      ...w,
      scope: w.scope === 'historical' ? 'historical' as const : 'inherited' as const,
    }));

  // Note: Operation-derived artifacts are now registered in DuckDB and are queryable.
  // The queryability warning was removed as part of debt paydown.

  const resultWarnings = result.warnings.filter((warning) => {
    // Reprojection and other explicit-output-CRS operations may legitimately emit
    // provenance/history notes about unverified source metadata, but those should not
    // survive as active output ambiguity on the derived artifact once the output CRS
    // is explicit and known.
    if (!result.outputCrs) return true;
    return warning.code !== 'CRS_UNKNOWN' && warning.code !== 'CRS_MISSING';
  });

  const allWarnings = [...inputWarnings, ...resultWarnings];

  return {
    name: `${sourceArtifact.name}_${operationName}`,
    kind: 'derived',
    format: `Derived from ${sourceArtifact.format}`,
    spatial: true,
    geometryType: inferGeometryType(result.output),
    rowCount: result.output.features.length,
    crs: result.outputCrs || sourceArtifact.crs,
    warnings: allWarnings,
    inputArtifactIds: [sourceArtifact.id],
    tableName: newTableName, // Registered in DuckDB by the App layer
    data: result.output,
  };
}

/**
 * Infer geometry type from a FeatureCollection
 */
function inferGeometryType(fc: GeoJSON.FeatureCollection): string | undefined {
  if (!fc.features || fc.features.length === 0) {
    return undefined;
  }

  const firstGeom = fc.features[0]?.geometry;
  if (!firstGeom) return undefined;

  return firstGeom.type;
}
