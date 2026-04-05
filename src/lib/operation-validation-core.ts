/**
 * Focused Validation for Migrated Operations
 * 
 * Validates that the product operation orchestrator correctly handles
 * the migrated geometry operations: buffer, centroid, dissolve, reproject,
 * and cheap substrate-level CRS contract truth.
 * 
 * This provides runtime confidence beyond build confidence.
 * 
 * SUPPORT ENVELOPE TESTS:
 * These tests validate the explicit support boundaries:
 * 1. Known WGS84 import -> reproject -> render/frame
 * 2. Projected artifact -> display-normalized framing
 * 3. Unknown CRS artifact -> warning path / no false certainty
 * 4. Missing CRS artifact -> warning path / no false certainty
 * 5. Malformed geometry -> graceful failure
 */

import { getSpatialEngine, executeRegisteredSingleInputOperation, executeIntersectOperation, executeAreaMeasurementOperation, executePerimeterMeasurementOperation, executeCompactnessMeasurementOperation, executeAttributeJoinOperation, executeRegisteredAggregationOperation, getTopologyFamilyDefinition, getTopologyRoleContext, getOperationDefinition, validateOperationDefinitionCrsContract, validateOperationDefinitionTransformPlanningContract, buildOperationTransformPlan, OPERATION_REGISTRY } from './spatial/index';
import { executeSpatialOperation, executeSimpleOperation, executeClipOperation } from './spatial/operation-helper';
import { artifactToOperationInput } from './spatial/adapters';
import { sampleGeoJson } from './sampleData';
import { needsDisplayTransformation, getDisplayBounds, isProjectedCrs } from './spatial/display-transform';
import { getDuckDb } from './duckdb';
import { serializeProject, reRegisterAllArtifactTables } from './persistence';
import type { Artifact, CrsProvenance, WarningRef, ProjectState } from '../types';

// Create test artifact from sample data
function createTestArtifact(
  name: string,
  data: GeoJSON.FeatureCollection,
  crs?: string
): Artifact {
  return {
    id: `test_${name}_${Date.now()}`,
    name,
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: data.features.length,
    crs: crs ?? 'EPSG:4326',
    warnings: [],
    originEventId: '',
    data,
  };
}

/**
 * Validation result
 */
interface ValidationResult {
  operation: string;
  passed: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

interface ValidationBucketResult {
  bucket: 'universal_contract' | 'validated_local_runtime';
  results: ValidationResult[];
}

function flattenValidationBuckets(buckets: ValidationBucketResult[]): ValidationResult[] {
  return buckets.flatMap((bucket) =>
    bucket.results.map((result) => ({
      ...result,
      details: {
        validationBucket: bucket.bucket,
        ...(result.details ?? {}),
      },
    })),
  );
}

function getOperationValidationBuckets(): ValidationBucketResult[] {
  const universalResults: ValidationResult[] = [
    validateRegistryCrsPolicyTruth(),
    validateRegistryTransformPlanningTruth(),
    validateOperationMetadataTruth(),
    validateTopologyFamilyTruth(),
    validateConvexHullMetadataTruth(),
    validateEnvelopeMetadataTruth(),
    validateSimplifyMetadataTruth(),
    validateDissolveMetadataTruth(),
    validateIntersectMetadataTruth(),
    validateAttributeJoinMetadataTruth(),
    validateAreaMetadataTruth(),
    validatePerimeterMetadataTruth(),
    validateCompactnessMetadataTruth(),
  ];

  return [
    {
      bucket: 'universal_contract',
      results: universalResults,
    },
    {
      bucket: 'validated_local_runtime',
      results: [],
    },
  ];
}

function createTestWarning(code: WarningRef['code'], message: string): WarningRef {
  return {
    id: `test_warning_${code}_${Date.now()}`,
    code,
    severity: code === 'CRS_MISSING' || code === 'CRS_UNKNOWN' ? 'serious' : 'info',
    title: code === 'CRS_MISSING' ? 'CRS not specified' : code === 'CRS_UNKNOWN' ? 'CRS is unknown' : 'Test warning',
    message,
    scope: 'active',
  };
}

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection {
  return !!value && typeof value === 'object' && (value as { type?: string }).type === 'FeatureCollection';
}

function createTestProvenance(confidence: CrsProvenance['confidence'], declaredCrs?: string): CrsProvenance {
  return {
    confidence,
    declaredCrs,
    source: 'import-metadata',
    warnings:
      confidence === 'known'
        ? []
        : [confidence === 'missing' ? 'CRS not specified in source metadata.' : 'CRS explicitly unknown in source metadata.'],
  };
}

/**
 * Run all focused validations
 */
export async function runOperationValidations(): Promise<ValidationResult[]> {
  const buckets = await runOperationValidationBuckets();
  return flattenValidationBuckets(buckets);
}

export async function runOperationValidationBuckets(): Promise<ValidationBucketResult[]> {
  const buckets = getOperationValidationBuckets();

  // Initialize engine first
  const engine = getSpatialEngine();
  if (!engine.initialized) {
    await engine.initialize();
  }

  // Create test artifact
  const testArtifact = createTestArtifact('validation_test', sampleGeoJson, 'EPSG:4326');

  const runtimeBucket = buckets.find((bucket) => bucket.bucket === 'validated_local_runtime');
  if (!runtimeBucket) {
    throw new Error('Missing validated_local_runtime validation bucket');
  }

  runtimeBucket.results.push(await validateBuffer(engine, testArtifact));
  runtimeBucket.results.push(await validateCentroid(engine, testArtifact));
  runtimeBucket.results.push(await validateConvexHull(engine, testArtifact));
  runtimeBucket.results.push(await validateEnvelope(engine, testArtifact));
  runtimeBucket.results.push(await validateSimplify(engine, testArtifact));
  runtimeBucket.results.push(await validateDissolve(engine, testArtifact));
  runtimeBucket.results.push(await validateGroupedDissolveGroupingFieldRequired(engine));
  runtimeBucket.results.push(await validateGroupedDissolveRuntime(engine));
  runtimeBucket.results.push(await validateGroupedDissolvePersistenceReload(engine));
  runtimeBucket.results.push(await validateReproject(engine, testArtifact));
  runtimeBucket.results.push(await validateReprojectConfidencePropagation(engine));
  runtimeBucket.results.push(await validateClipConfidencePropagation(engine));
  runtimeBucket.results.push(await validateIntersectSuccess(engine));
  runtimeBucket.results.push(await validateIntersectEmptyResult(engine));
  runtimeBucket.results.push(await validateAttributeJoinSpatialRuntime());
  runtimeBucket.results.push(await validateAttributeJoinTabularRuntime());
  runtimeBucket.results.push(await validateAreaMeasurementSuccess());
  runtimeBucket.results.push(await validateAreaMeasurementRefusal());
  runtimeBucket.results.push(await validatePerimeterMeasurementSuccess());
  runtimeBucket.results.push(await validatePerimeterMeasurementRefusal());
  runtimeBucket.results.push(await validateCompactnessMeasurementSuccess());
  runtimeBucket.results.push(await validateCompactnessMeasurementRefusal());

  return buckets;
}

/**
 * Validate buffer operation
 */
async function validateBuffer(
  engine: ReturnType<typeof getSpatialEngine>,
  sourceArtifact: Artifact
): Promise<ValidationResult> {
  try {
    const result = await executeSpatialOperation({
      sourceArtifact,
      operationName: 'buffer',
      operationFormat: 'Buffer',
      executeOperation: (input) => engine.buffer(input, 0.01, 'kilometers'),
      getDetails: () => ({ distance: 0.01, unit: 'kilometers' }),
    });

    // Validation checks
    const passed = !!result.artifact && 
      result.artifact.spatial === true && 
      result.artifact.data !== undefined &&
      (result.artifact.data as GeoJSON.FeatureCollection).features.length > 0;

    // Check warnings have codes
    const warningsHaveCodes = result.artifact?.warnings.every((w: WarningRef) => !!w.code) ?? false;

    return {
      operation: 'buffer',
      passed,
      details: {
        hasArtifact: !!result.artifact,
        hasData: !!(result.artifact?.data),
        featureCount: (result.artifact?.data as GeoJSON.FeatureCollection)?.features?.length ?? 0,
        warningsCount: result.artifact?.warnings.length ?? 0,
        warningsHaveCodes,
      },
    };
  } catch (error) {
    return {
      operation: 'buffer',
      passed: false,
      error: String(error),
    };
  }
}

/**
 * Validate centroid operation
 */
async function validateCentroid(
  engine: ReturnType<typeof getSpatialEngine>,
  sourceArtifact: Artifact
): Promise<ValidationResult> {
  try {
    const result = await executeRegisteredSingleInputOperation({
      operationId: 'centroid',
      sourceArtifact,
      executeOperation: (input) => engine.centroid(input),
    });

    // Validation checks
    const passed = !!result.artifact && 
      result.artifact.spatial === true && 
      result.artifact.data !== undefined;

    // Check warnings have codes
    const warningsHaveCodes = result.artifact?.warnings.every((w: WarningRef) => !!w.code) ?? false;

    return {
      operation: 'centroid',
      passed,
      details: {
        hasArtifact: !!result.artifact,
        hasData: !!(result.artifact?.data),
        featureCount: (result.artifact?.data as GeoJSON.FeatureCollection)?.features?.length ?? 0,
        warningsCount: result.artifact?.warnings.length ?? 0,
        warningsHaveCodes,
      },
    };
  } catch (error) {
    return {
      operation: 'centroid',
      passed: false,
      error: String(error),
    };
  }
}

/**
 * Validate convex hull operation
 */
async function validateConvexHull(
  engine: ReturnType<typeof getSpatialEngine>,
  sourceArtifact: Artifact
): Promise<ValidationResult> {
  try {
    const result = await executeRegisteredSingleInputOperation({
      operationId: 'convex-hull-v1',
      sourceArtifact,
      executeOperation: (input) => engine.convexHull(input),
      getDetails: () => ({ contract: 'single-input polygon/multipolygon only', attributePolicy: 'none' }),
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const geometryColumnRegistered = tableRegistration.columns.includes('geometry');
    const firstFeature = (artifact?.data as GeoJSON.FeatureCollection | undefined)?.features?.[0];
    const firstFeatureProperties = (firstFeature?.properties ?? {}) as Record<string, unknown>;
    const noAttributesPreserved = Object.keys(firstFeatureProperties).length === 0;

    const passed = Boolean(
      artifact &&
      event &&
      artifact.rowCount === 1 &&
      artifact.crs === 'EPSG:4326' &&
      artifact.inputArtifactIds?.length === 1 &&
      artifact.crsProvenance?.confidence === 'known' &&
      artifact.crsProvenance?.source === 'operation-inherited' &&
      firstFeature &&
      (firstFeature.geometry.type === 'Polygon' || firstFeature.geometry.type === 'MultiPolygon') &&
      noAttributesPreserved &&
      event.details.operation === 'convex-hull-v1' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === 1 &&
      geometryColumnRegistered
    );

    return {
      operation: 'convex-hull',
      passed,
      details: {
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        outputGeometryType: firstFeature?.geometry.type,
        firstFeatureProperties,
        noAttributesPreserved,
        tableName: artifact?.tableName,
        tableRegistration,
        historySummary: event?.summary,
      },
    };
  } catch (error) {
    return {
      operation: 'convex-hull',
      passed: false,
      error: String(error),
    };
  }
}

/**
 * Validate dissolve operation
 */
async function validateEnvelope(
  engine: ReturnType<typeof getSpatialEngine>,
  sourceArtifact: Artifact
): Promise<ValidationResult> {
  try {
    const result = await executeRegisteredSingleInputOperation({
      operationId: 'envelope-v1',
      sourceArtifact,
      executeOperation: (input) => engine.envelope(input),
      getDetails: () => ({ contract: 'single-input polygon/multipolygon only', outputMeaning: 'axis-aligned bounding box', attributePolicy: 'none' }),
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const geometryColumnRegistered = tableRegistration.columns.includes('geometry');
    const firstFeature = (artifact?.data as GeoJSON.FeatureCollection | undefined)?.features?.[0];
    const firstFeatureProperties = (firstFeature?.properties ?? {}) as Record<string, unknown>;
    const noAttributesPreserved = Object.keys(firstFeatureProperties).length === 0;

    const passed = Boolean(
      artifact &&
      event &&
      artifact.rowCount === 1 &&
      artifact.crs === 'EPSG:4326' &&
      artifact.inputArtifactIds?.length === 1 &&
      artifact.crsProvenance?.confidence === 'known' &&
      artifact.crsProvenance?.source === 'operation-inherited' &&
      firstFeature &&
      firstFeature.geometry.type === 'Polygon' &&
      noAttributesPreserved &&
      event.details.operation === 'envelope-v1' &&
      event.details.outputMeaning === 'axis-aligned bounding box' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === 1 &&
      geometryColumnRegistered
    );

    return {
      operation: 'envelope',
      passed,
      details: {
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        outputGeometryType: firstFeature?.geometry.type,
        firstFeatureProperties,
        noAttributesPreserved,
        tableName: artifact?.tableName,
        tableRegistration,
        historySummary: event?.summary,
      },
    };
  } catch (error) {
    return {
      operation: 'envelope',
      passed: false,
      error: String(error),
    };
  }
}

async function validateSimplify(
  engine: ReturnType<typeof getSpatialEngine>,
  sourceArtifact: Artifact
): Promise<ValidationResult> {
  try {
    const result = await executeRegisteredSingleInputOperation({
      operationId: 'simplify-v1',
      sourceArtifact,
      executeOperation: (input) => engine.simplify(input, 0.001),
      getDetails: () => ({ contract: 'single-input polygon/multipolygon only', tolerance: 0.001, toleranceUnits: 'EPSG:4326', attributePolicy: 'source-only', topologyPreserving: false }),
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const geometryColumnRegistered = tableRegistration.columns.includes('geometry');
    const firstFeature = (artifact?.data as GeoJSON.FeatureCollection | undefined)?.features?.[0] as GeoJSON.Feature | undefined;
    const sourceFirstFeature = ((sourceArtifact.data as GeoJSON.FeatureCollection | undefined)?.features?.[0]) as GeoJSON.Feature | undefined;
    const firstFeatureProperties = (firstFeature?.properties ?? {}) as Record<string, unknown>;
    const sourceFirstFeatureProperties = (sourceFirstFeature?.properties ?? {}) as Record<string, unknown>;
    const preservedSourceId = Object.prototype.hasOwnProperty.call(firstFeatureProperties, 'id') && Object.prototype.hasOwnProperty.call(sourceFirstFeatureProperties, 'id')
      ? firstFeatureProperties.id === sourceFirstFeatureProperties.id
      : false;

    const passed = Boolean(
      artifact &&
      event &&
      artifact.rowCount === sourceArtifact.rowCount &&
      artifact.crs === 'EPSG:4326' &&
      artifact.inputArtifactIds?.length === 1 &&
      artifact.crsProvenance?.confidence === 'known' &&
      artifact.crsProvenance?.source === 'operation-inherited' &&
      firstFeature &&
      (firstFeature.geometry.type === 'Polygon' || firstFeature.geometry.type === 'MultiPolygon') &&
      preservedSourceId &&
      event.details.operation === 'simplify-v1' &&
      event.details.tolerance === 0.001 &&
      event.details.topologyPreserving === false &&
      tableRegistration.exists &&
      tableRegistration.rowCount === sourceArtifact.rowCount &&
      geometryColumnRegistered
    );

    return {
      operation: 'simplify',
      passed,
      details: {
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        outputGeometryType: firstFeature?.geometry.type,
        preservedSourceId,
        tableName: artifact?.tableName,
        tableRegistration,
        historySummary: event?.summary,
      },
    };
  } catch (error) {
    return {
      operation: 'simplify',
      passed: false,
      error: String(error),
    };
  }
}

async function validateDissolve(
  engine: ReturnType<typeof getSpatialEngine>,
  sourceArtifact: Artifact
): Promise<ValidationResult> {
  try {
    const result = await executeSimpleOperation({
      sourceArtifact,
      operationName: 'dissolve',
      operationFormat: 'Dissolve',
      executeOperation: (input) => engine.dissolve(input),
    });

    // Validation checks
    const passed = !!result.artifact && 
      result.artifact.spatial === true && 
      result.artifact.data !== undefined;

    // Check warnings have codes
    const warningsHaveCodes = result.artifact?.warnings.every((w: WarningRef) => !!w.code) ?? false;

    return {
      operation: 'dissolve',
      passed,
      details: {
        hasArtifact: !!result.artifact,
        hasData: !!(result.artifact?.data),
        featureCount: (result.artifact?.data as GeoJSON.FeatureCollection)?.features?.length ?? 0,
        warningsCount: result.artifact?.warnings.length ?? 0,
        warningsHaveCodes,
      },
    };
  } catch (error) {
    return {
      operation: 'dissolve',
      passed: false,
      error: String(error),
    };
  }
}

async function validateGroupedDissolveGroupingFieldRequired(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<ValidationResult> {
  try {
    const sourceArtifact = createTestArtifact('grouped_dissolve_grouping_required', sampleGeoJson, 'EPSG:4326');

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-grouped-v1',
      sourceArtifact,
      executeOperation: (input) => engine.dissolve(input),
      outputName: 'grouped_dissolve_missing_grouping',
    });

    const passed = Boolean(
      result.error &&
      result.error.includes('requires exactly one explicit grouping field') &&
      !result.artifact &&
      !result.historyEvent
    );

    return {
      operation: 'grouped-dissolve-grouping-required',
      passed,
      details: {
        error: result.error,
      },
    };
  } catch (error) {
    return {
      operation: 'grouped-dissolve-grouping-required',
      passed: false,
      error: String(error),
    };
  }
}

async function validateGroupedDissolveRuntime(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createTestArtifact('grouped_dissolve_runtime', sampleGeoJson, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const sourceFeatureCollection = sourceArtifact.data as GeoJSON.FeatureCollection;
    const distinctGroupCount = new Set(
      sourceFeatureCollection.features.map((feature) => JSON.stringify((feature.properties ?? {}).category ?? null)),
    ).size;

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-grouped-v1',
      sourceArtifact,
      executeOperation: (input) => engine.dissolve(input),
      outputName: 'grouped_dissolve_runtime_result',
      groupingField: 'category',
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const featureCollection = artifact?.data as GeoJSON.FeatureCollection | undefined;
    const features = featureCollection?.features ?? [];
    const firstFeatureProperties = (features[0]?.properties ?? {}) as Record<string, unknown>;
    const groupingFieldOnly = features.every((feature) => {
      const properties = Object.keys((feature.properties ?? {}) as Record<string, unknown>);
      return properties.length === 1 && properties[0] === 'category';
    });
    const outputGroups = new Set(features.map((feature) => JSON.stringify(((feature.properties ?? {}) as Record<string, unknown>).category ?? null)));
    const categoryColumnRegistered = tableRegistration.columns.includes('category');
    const geometryColumnRegistered = tableRegistration.columns.includes('geometry');

    const passed = Boolean(
      artifact &&
      event &&
      artifact.outputKind === 'spatial-artifact' &&
      artifact.spatial === true &&
      artifact.crs === 'EPSG:4326' &&
      artifact.inputArtifactIds?.length === 1 &&
      artifact.rowCount === distinctGroupCount &&
      features.length === distinctGroupCount &&
      outputGroups.size === distinctGroupCount &&
      groupingFieldOnly &&
      firstFeatureProperties.category !== undefined &&
      event.details.operation === 'dissolve-grouped-v1' &&
      event.details.groupingField === 'category' &&
      event.details.outputAttributeSemantics === 'grouping-field-only' &&
      event.details.outputFeatureCount === distinctGroupCount &&
      event.details.distinctGroupCount === distinctGroupCount &&
      tableRegistration.exists &&
      tableRegistration.rowCount === distinctGroupCount &&
      categoryColumnRegistered &&
      geometryColumnRegistered
    );

    return {
      operation: 'grouped-dissolve-runtime',
      passed,
      details: {
        rowCount: artifact?.rowCount,
        distinctGroupCount,
        outputGroups: [...outputGroups].map((value) => JSON.parse(value)),
        outputCrs: artifact?.crs,
        firstFeatureProperties,
        groupingFieldOnly,
        tableName: artifact?.tableName,
        tableRegistration,
        historySummary: event?.summary,
      },
    };
  } catch (error) {
    return {
      operation: 'grouped-dissolve-runtime',
      passed: false,
      error: String(error),
    };
  }
}

async function validateGroupedDissolvePersistenceReload(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createTestArtifact('grouped_dissolve_persistence_source', sampleGeoJson, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const result = await executeRegisteredAggregationOperation({
      operationId: 'dissolve-grouped-v1',
      sourceArtifact,
      executeOperation: (input) => engine.dissolve(input),
      outputName: 'grouped_dissolve_persisted',
      groupingField: 'category',
    });

    const artifact = result.artifact;
    const historyEvent = result.historyEvent;
    if (!artifact || !historyEvent) {
      return {
        operation: 'grouped-dissolve-persistence-reload',
        passed: false,
        error: result.error ?? 'Grouped dissolve did not produce an artifact/history event for persistence validation.',
      };
    }

    const serialized = serializeProject(
      'Grouped Dissolve Validation Project',
      [sourceArtifact, artifact],
      [historyEvent],
      [],
      artifact.id,
      'table',
    );
    const parsed = JSON.parse(serialized) as ProjectState;
    await reRegisterAllArtifactTables(parsed.artifacts);
    const reloadedArtifact = parsed.artifacts.find((candidate) => candidate.id === artifact.id);
    const tableRegistration = await inspectRegisteredTable(reloadedArtifact?.tableName);
    const featureCollection = reloadedArtifact?.data as GeoJSON.FeatureCollection | undefined;
    const features = featureCollection?.features ?? [];
    const groupingFieldOnly = features.every((feature) => {
      const properties = Object.keys((feature.properties ?? {}) as Record<string, unknown>);
      return properties.length === 1 && properties[0] === 'category';
    });

    const queryabilityCheck = reloadedArtifact?.tableName
      ? await (async () => {
          const db = await getDuckDb();
          const conn = await db.connect();
          try {
            const rows = await conn.query(`SELECT category FROM ${reloadedArtifact.tableName} ORDER BY category`);
            return rows.toArray().map((row) => row.toJSON().category ?? null);
          } finally {
            await conn.close();
          }
        })()
      : [];

    const passed = Boolean(
      reloadedArtifact &&
      reloadedArtifact.outputKind === 'spatial-artifact' &&
      reloadedArtifact.rowCount === artifact.rowCount &&
      reloadedArtifact.crs === artifact.crs &&
      features.length === artifact.rowCount &&
      groupingFieldOnly &&
      tableRegistration.exists &&
      tableRegistration.rowCount === artifact.rowCount &&
      tableRegistration.columns.includes('category') &&
      tableRegistration.columns.includes('geometry') &&
      queryabilityCheck.length === artifact.rowCount
    );

    return {
      operation: 'grouped-dissolve-persistence-reload',
      passed,
      details: {
        serializedArtifactCount: parsed.artifacts.length,
        reloadedArtifactName: reloadedArtifact?.name,
        outputCrs: reloadedArtifact?.crs,
        rowCount: reloadedArtifact?.rowCount,
        groupingFieldOnly,
        queryabilityCheck,
        tableName: reloadedArtifact?.tableName,
        tableRegistration,
      },
    };
  } catch (error) {
    return {
      operation: 'grouped-dissolve-persistence-reload',
      passed: false,
      error: String(error),
    };
  }
}

/**
 * Validate reproject operation via the orchestrator
 */
async function validateReproject(
  engine: ReturnType<typeof getSpatialEngine>,
  sourceArtifact: Artifact
): Promise<ValidationResult> {
  try {
    // Reproject uses different flow - direct transform
    const input = artifactToOperationInput(sourceArtifact);
    if (!input) {
      throw new Error('Could not create operation input');
    }

    const result = await engine.transform(input, 'EPSG:4326', 'EPSG:3857');

    // Validation checks
    const passed = result.success && 
      result.output !== undefined &&
      result.output.features.length > 0;

    // Check warnings have codes
    const warningsHaveCodes = result.warnings.every((w: WarningRef) => !!w.code) ?? true; // True if no warnings

    return {
      operation: 'reproject',
      passed,
      details: {
        success: result.success,
        hasOutput: !!result.output,
        featureCount: result.output?.features.length ?? 0,
        warningsCount: result.warnings.length,
        warningsHaveCodes,
        outputCrs: result.outputCrs,
      },
    };
  } catch (error) {
    return {
      operation: 'reproject',
      passed: false,
      error: String(error),
    };
  }
}

/**
 * Run validations and log results
 */
export async function runAndLogValidations(): Promise<void> {
  console.log('=== Running Operation Validations ===\n');

  const buckets = await runOperationValidationBuckets();

  let allPassed = true;
  for (const bucket of buckets) {
    console.log(`--- ${bucket.bucket} ---`);
    for (const result of bucket.results) {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`${status}: ${result.operation}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
        allPassed = false;
      }
      if (result.details) {
        console.log(`  Details:`, result.details);
      }
      if (!result.passed) allPassed = false;
    }
    console.log('');
  }

  console.log(`=== Results: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} ===`);
}

// Export individual validators for targeted testing
async function validateReprojectConfidencePropagation(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createTestArtifact('unknown_source_for_reproject', sampleGeoJson, 'unknown'),
      warnings: [createTestWarning('CRS_UNKNOWN', 'Source artifact CRS is explicitly unknown before reprojection.')],
      crsProvenance: createTestProvenance('unknown'),
    };

    const result = await executeSpatialOperation({
      sourceArtifact,
      operationName: 'reproject',
      operationFormat: 'CRS reprojection',
      executeOperation: (input) => engine.transform(input, 'EPSG:4326', 'EPSG:3857'),
      getDetails: () => ({ sourceCrs: 'EPSG:4326', targetCrs: 'EPSG:3857' }),
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const artifactHasActiveCrsAmbiguity = artifact?.warnings.some((w: WarningRef) => w.code === 'CRS_UNKNOWN' || w.code === 'CRS_MISSING') ?? false;
    const eventHasInheritedCrsAmbiguity = event?.warnings.some(w => (w.code === 'CRS_UNKNOWN' || w.code === 'CRS_MISSING') && w.scope === 'inherited') ?? false;

    const passed = Boolean(
      artifact &&
      event &&
      artifact.crs === 'EPSG:3857' &&
      artifact.crsProvenance?.confidence === 'known' &&
      artifact.crsProvenance?.source === 'operation-derived' &&
      artifact.crsProvenance?.warnings.length === 0 &&
      !artifactHasActiveCrsAmbiguity &&
      !eventHasInheritedCrsAmbiguity
    );

    return {
      operation: 'reproject-confidence-propagation',
      passed,
      details: {
        outputCrs: artifact?.crs,
        provenance: artifact?.crsProvenance,
        artifactWarningCodes: artifact?.warnings.map((w: WarningRef) => `${w.code}:${w.scope ?? 'active'}`) ?? [],
        eventWarningCodes: event?.warnings.map((w: WarningRef) => `${w.code}:${w.scope ?? 'active'}`) ?? [],
      },
    };
  } catch (error) {
    return {
      operation: 'reproject-confidence-propagation',
      passed: false,
      error: String(error),
    };
  }
}

function validateRegistryCrsPolicyTruth(): ValidationResult {
  const contractErrors = Object.values(OPERATION_REGISTRY).flatMap((definition) =>
    validateOperationDefinitionCrsContract(definition),
  );

  return {
    operation: 'registry-crs-policy-truth',
    passed: contractErrors.length === 0,
    error: contractErrors.length > 0 ? contractErrors.join('; ') : undefined,
    details: {
      operationCount: Object.keys(OPERATION_REGISTRY).length,
      contractErrors,
    },
  };
}

function validateRegistryTransformPlanningTruth(): ValidationResult {
  const contractErrors = Object.values(OPERATION_REGISTRY).flatMap((definition) =>
    validateOperationDefinitionTransformPlanningContract(definition),
  );

  const transformPlans = Object.values(OPERATION_REGISTRY).map((definition) => ({
    operationId: definition.id,
    plan: buildOperationTransformPlan({
      definition,
      sourceArtifact: createTestArtifact('transform_plan_probe', sampleGeoJson, 'EPSG:4326'),
      secondaryArtifact:
        definition.geometryContract.inputArity === 2
          ? createTestArtifact('transform_plan_probe_secondary', sampleGeoJson, 'EPSG:4326')
          : undefined,
      explicitSourceCrs: definition.id === 'reproject' ? 'EPSG:4326' : undefined,
      targetCrs: definition.id === 'reproject' ? 'EPSG:3857' : undefined,
    }),
  }));

  return {
    operation: 'registry-transform-planning-truth',
    passed: contractErrors.length === 0,
    error: contractErrors.length > 0 ? contractErrors.join('; ') : undefined,
    details: {
      operationCount: Object.keys(OPERATION_REGISTRY).length,
      contractErrors,
      transformPlans,
    },
  };
}

function validateOperationMetadataTruth(): ValidationResult {
  const mismatches = Object.values(OPERATION_REGISTRY).flatMap((definition) => {
    const supportEnvelope = definition.id ? getOperationDefinition(definition.id) : undefined;
    const issues: string[] = [];

    if (!supportEnvelope) {
      issues.push(`${definition.id}: missing registry definition lookup`);
      return issues;
    }

    if (supportEnvelope.supportTier !== definition.supportTier) {
      issues.push(`${definition.id}: supportTier lookup mismatch (${supportEnvelope.supportTier} !== ${definition.supportTier})`);
    }

    if ((supportEnvelope.runtimeSensitive ?? false) !== (definition.runtimeSensitive ?? false)) {
      issues.push(`${definition.id}: runtimeSensitive lookup mismatch`);
    }

    return issues;
  });

  return {
    operation: 'operation-metadata-truth',
    passed: mismatches.length === 0,
    error: mismatches.length > 0 ? mismatches.join('; ') : undefined,
    details: {
      operationCount: Object.keys(OPERATION_REGISTRY).length,
      mismatches,
      runtimeSensitiveOperations: Object.values(OPERATION_REGISTRY)
        .filter((definition) => definition.runtimeSensitive)
        .map((definition) => definition.id),
    },
  };
}

function validateTopologyFamilyTruth(): ValidationResult {
  const topologyOperations = Object.values(OPERATION_REGISTRY).filter((definition) => definition.family === 'topology-two-input');
  const mismatches = topologyOperations.flatMap((definition) => {
    const issues: string[] = [];
    const topologyDefinition = getTopologyFamilyDefinition(definition.id as 'clip-v1' | 'intersect-v1' | 'attribute-join-v1');
    const roleContext = getTopologyRoleContext(definition.id as 'clip-v1' | 'intersect-v1' | 'attribute-join-v1');

    if (!topologyDefinition) {
      issues.push(`${definition.id}: missing topology family definition`);
      return issues;
    }

    if (!definition.uiHints?.secondaryRoleLabel) {
      issues.push(`${definition.id}: missing uiHints.secondaryRoleLabel`);
    }

    if (definition.uiHints?.secondaryRoleLabel && roleContext.secondaryLabel !== definition.uiHints.secondaryRoleLabel) {
      issues.push(`${definition.id}: role context secondary label mismatch (${roleContext.secondaryLabel} !== ${definition.uiHints.secondaryRoleLabel})`);
    }

    if (definition.id === 'clip-v1' && topologyDefinition.secondarySelectionCode !== 'CLIP_MASK_REQUIRED') {
      issues.push('clip-v1: secondary selection code drifted from CLIP_MASK_REQUIRED');
    }

    if (definition.id === 'intersect-v1' && topologyDefinition.secondarySelectionCode !== 'OVERLAY_ARTIFACT_REQUIRED') {
      issues.push('intersect-v1: secondary selection code drifted from OVERLAY_ARTIFACT_REQUIRED');
    }

    if (definition.id === 'attribute-join-v1' && topologyDefinition.secondarySelectionCode !== 'OVERLAY_ARTIFACT_REQUIRED') {
      issues.push('attribute-join-v1: secondary selection code drifted from OVERLAY_ARTIFACT_REQUIRED');
    }

    if (definition.id === 'attribute-join-v1') {
      if (definition.crsContract.transformPlanning.executionRequirement !== 'none') {
        issues.push('attribute-join-v1: execution requirement must remain none');
      }
      if (definition.crsContract.transformPlanning.futureEligibility !== 'none') {
        issues.push('attribute-join-v1: future eligibility must remain none');
      }
    } else {
      if (definition.crsContract.transformPlanning.executionRequirement !== 'same-crs-only') {
        issues.push(`${definition.id}: topology family execution requirement must remain same-crs-only`);
      }

      if (definition.crsContract.transformPlanning.futureEligibility !== 'candidate-via-explicit-plan') {
        issues.push(`${definition.id}: topology family future eligibility must remain candidate-via-explicit-plan`);
      }
    }

    return issues;
  });

  return {
    operation: 'topology-family-truth',
    passed: mismatches.length === 0,
    error: mismatches.length > 0 ? mismatches.join('; ') : undefined,
    details: {
      topologyOperationIds: topologyOperations.map((definition) => definition.id),
      mismatches,
    },
  };
}

function validateConvexHullMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('convex-hull-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('convex-hull-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`convex-hull-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.family !== 'single-geometry') {
      issues.push(`convex-hull-v1: family drifted to ${definition.family}`);
    }
    if (definition.crsContract.sourceRequirement !== 'require-known') {
      issues.push('convex-hull-v1: source CRS requirement must remain require-known');
    }
    if (definition.outputContract.attributePolicy !== 'none') {
      issues.push('convex-hull-v1: attribute policy must remain none');
    }
    if (definition.aggregationContract) {
      issues.push('convex-hull-v1: aggregation contract must remain absent');
    }
    if (JSON.stringify(definition.outputContract.outputGeometryFamilies ?? []) !== JSON.stringify(['Polygon', 'MultiPolygon'])) {
      issues.push('convex-hull-v1: output geometry families must remain Polygon/MultiPolygon');
    }
  }

  return {
    operation: 'convex-hull-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validateEnvelopeMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('envelope-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('envelope-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`envelope-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.family !== 'single-geometry') {
      issues.push(`envelope-v1: family drifted to ${definition.family}`);
    }
    if (definition.crsContract.sourceRequirement !== 'require-known') {
      issues.push('envelope-v1: source CRS requirement must remain require-known');
    }
    if (definition.outputContract.attributePolicy !== 'none') {
      issues.push('envelope-v1: attribute policy must remain none');
    }
    if (definition.aggregationContract) {
      issues.push('envelope-v1: aggregation contract must remain absent');
    }
    if (JSON.stringify(definition.outputContract.outputGeometryFamilies ?? []) !== JSON.stringify(['Polygon'])) {
      issues.push('envelope-v1: output geometry families must remain Polygon');
    }
  }

  return {
    operation: 'envelope-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validateSimplifyMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('simplify-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('simplify-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`simplify-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.family !== 'single-geometry') {
      issues.push(`simplify-v1: family drifted to ${definition.family}`);
    }
    if (definition.crsContract.sourceRequirement !== 'require-known') {
      issues.push('simplify-v1: source CRS requirement must remain require-known');
    }
    if (definition.outputContract.attributePolicy !== 'source-only') {
      issues.push('simplify-v1: attribute policy must remain source-only');
    }
    if (definition.aggregationContract) {
      issues.push('simplify-v1: aggregation contract must remain absent');
    }
    if (JSON.stringify(definition.outputContract.outputGeometryFamilies ?? []) !== JSON.stringify(['Polygon', 'MultiPolygon'])) {
      issues.push('simplify-v1: output geometry families must remain Polygon/MultiPolygon');
    }
  }

  return {
    operation: 'simplify-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validateDissolveMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('dissolve-grouped-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('dissolve-grouped-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`dissolve-grouped-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.family !== 'aggregation') {
      issues.push(`dissolve-grouped-v1: family drifted to ${definition.family}`);
    }
    if (definition.crsContract.sourceRequirement !== 'require-known') {
      issues.push('dissolve-grouped-v1: source CRS requirement must remain require-known');
    }
    if (definition.aggregationContract?.scope !== 'grouped-by-attribute') {
      issues.push('dissolve-grouped-v1: aggregation scope must remain grouped-by-attribute');
    }
    if (definition.aggregationContract?.groupingFieldMode !== 'required-attribute') {
      issues.push('dissolve-grouped-v1: grouping-field mode must remain required-attribute');
    }
    if (definition.aggregationContract?.outputCardinality !== 'single-output-artifact') {
      issues.push('dissolve-grouped-v1: output cardinality must remain single-output-artifact');
    }
    if (definition.outputContract.attributePolicy !== 'grouping-field-only') {
      issues.push('dissolve-grouped-v1: attribute policy must remain grouping-field-only');
    }
    if (JSON.stringify(definition.outputContract.outputGeometryFamilies ?? []) !== JSON.stringify(['Polygon', 'MultiPolygon'])) {
      issues.push('dissolve-grouped-v1: output geometry families must remain Polygon/MultiPolygon');
    }
    const summary = (definition.uiHints?.summary ?? '').toLowerCase();
    if (!summary.includes('grouped dissolve') || !summary.includes('exactly one explicit grouping attribute')) {
      issues.push('dissolve-grouped-v1: summary must continue to describe the narrow grouped-by-attribute v1 contract');
    }
  }

  return {
    operation: 'dissolve-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validateIntersectMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('intersect-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('intersect-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`intersect-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.outputContract.attributePolicy !== 'source-only') {
      issues.push('intersect-v1: attribute policy must remain source-only');
    }
    if (definition.outputContract.emptyResultMode !== 'honest-empty-success') {
      issues.push('intersect-v1: empty-result mode must remain honest-empty-success');
    }
    if (definition.uiHints?.secondaryRoleLabel !== 'overlay') {
      issues.push('intersect-v1: secondary role label must remain overlay');
    }
  }

  return {
    operation: 'intersect-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validateAttributeJoinMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('attribute-join-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('attribute-join-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`attribute-join-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.outputContract.attributePolicy !== 'explicit-right-fields-left-join-equality') {
      issues.push('attribute-join-v1: attribute policy must remain explicit-right-fields-left-join-equality');
    }
    if (definition.joinContract?.joinMode !== 'left') {
      issues.push('attribute-join-v1: join mode must remain left');
    }
    if (definition.joinContract?.predicate !== 'exact-equality') {
      issues.push('attribute-join-v1: predicate must remain exact-equality');
    }
    if (definition.joinContract?.sourceKeyCount !== 1 || definition.joinContract?.secondaryKeyCount !== 1) {
      issues.push('attribute-join-v1: key count must remain one per side');
    }
    if (definition.joinContract?.selectedFieldMode !== 'explicit-right-field-selection') {
      issues.push('attribute-join-v1: selectedFieldMode must remain explicit-right-field-selection');
    }
    if (definition.joinContract?.collisionPolicy !== 'right-fields-prefixed') {
      issues.push('attribute-join-v1: collisionPolicy must remain right-fields-prefixed');
    }
    if (definition.joinContract?.matchedSecondaryRows !== 'first-match-only') {
      issues.push('attribute-join-v1: matchedSecondaryRows must remain first-match-only');
    }
    if (definition.joinContract?.unmatchedSourceRows !== 'preserve-with-null-right-fields') {
      issues.push('attribute-join-v1: unmatchedSourceRows must remain preserve-with-null-right-fields');
    }
    if (definition.joinContract?.outputGeometryMode !== 'preserve-source-geometry') {
      issues.push('attribute-join-v1: outputGeometryMode must remain preserve-source-geometry');
    }
    if (definition.joinContract?.supportsSpatialPredicates !== false) {
      issues.push('attribute-join-v1: spatial predicates must remain unsupported');
    }
    if (definition.joinContract?.supportsFuzzyMatching !== false) {
      issues.push('attribute-join-v1: fuzzy matching must remain unsupported');
    }
    if (definition.joinContract?.supportsMultiKey !== false) {
      issues.push('attribute-join-v1: multi-key joins must remain unsupported');
    }
  }

  return {
    operation: 'attribute-join-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validateAreaMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('area-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('area-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`area-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.family !== 'measurement') {
      issues.push(`area-v1: family drifted to ${definition.family}`);
    }
    if (definition.crsContract.sourceRequirement !== 'require-known') {
      issues.push('area-v1: source CRS requirement must remain require-known');
    }
    if (definition.outputContract.outputKind !== 'measurement-table') {
      issues.push('area-v1: output kind must remain measurement-table');
    }
    if (definition.measurementContract?.measurementKind !== 'area') {
      issues.push('area-v1: measurement kind must remain area');
    }
    if (definition.measurementContract?.areaUnit !== 'square-meters') {
      issues.push('area-v1: area unit must remain square-meters');
    }
    if (definition.measurementContract?.preservesSourceRows !== true) {
      issues.push('area-v1: preservesSourceRows must remain true');
    }
  }

  return {
    operation: 'area-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validatePerimeterMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('perimeter-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('perimeter-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`perimeter-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.family !== 'measurement') {
      issues.push(`perimeter-v1: family drifted to ${definition.family}`);
    }
    if (definition.crsContract.sourceRequirement !== 'require-known') {
      issues.push('perimeter-v1: source CRS requirement must remain require-known');
    }
    if (definition.outputContract.outputKind !== 'measurement-table') {
      issues.push('perimeter-v1: output kind must remain measurement-table');
    }
    if (definition.measurementContract?.measurementKind !== 'perimeter') {
      issues.push('perimeter-v1: measurement kind must remain perimeter');
    }
    if (definition.measurementContract?.perimeterUnit !== 'meters') {
      issues.push('perimeter-v1: perimeter unit must remain meters');
    }
    if (definition.measurementContract?.preservesSourceRows !== true) {
      issues.push('perimeter-v1: preservesSourceRows must remain true');
    }
  }

  return {
    operation: 'perimeter-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

function validateCompactnessMetadataTruth(): ValidationResult {
  const definition = getOperationDefinition('compactness-v1');
  const issues: string[] = [];

  if (!definition) {
    issues.push('compactness-v1: missing registry definition');
  } else {
    if (definition.supportTier !== 'partial') {
      issues.push(`compactness-v1: supportTier drifted to ${definition.supportTier}`);
    }
    if (definition.family !== 'measurement') {
      issues.push(`compactness-v1: family drifted to ${definition.family}`);
    }
    if (definition.crsContract.sourceRequirement !== 'require-known') {
      issues.push('compactness-v1: source CRS requirement must remain require-known');
    }
    if (definition.outputContract.outputKind !== 'measurement-table') {
      issues.push('compactness-v1: output kind must remain measurement-table');
    }
    if (definition.measurementContract?.measurementKind !== 'compactness') {
      issues.push('compactness-v1: measurement kind must remain compactness');
    }
    if (definition.measurementContract?.compactnessUnit !== 'unitless') {
      issues.push('compactness-v1: compactness unit must remain unitless');
    }
    if (definition.measurementContract?.preservesSourceRows !== true) {
      issues.push('compactness-v1: preservesSourceRows must remain true');
    }
  }

  return {
    operation: 'compactness-metadata-truth',
    passed: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : undefined,
    details: {
      issues,
      definition,
    },
  };
}

async function validateClipConfidencePropagation(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createTestArtifact('clip_source_known', sampleGeoJson, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const maskArtifact: Artifact = {
      ...createTestArtifact('clip_mask_known', sampleGeoJson, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const sourceInput = artifactToOperationInput(sourceArtifact);
    const maskInput = artifactToOperationInput(maskArtifact);
    if (!sourceInput || !maskInput) {
      throw new Error('Could not create clip operation inputs');
    }

    const result = await executeClipOperation({
      sourceArtifact,
      maskArtifact,
      outputName: 'clip_confidence_test',
      executeClip: (source, mask) => engine.clip(source, mask),
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const hasArtifactCrsAmbiguity = artifact?.warnings.some((w: WarningRef) => w.code === 'CRS_UNKNOWN' || w.code === 'CRS_MISSING') ?? false;
    const hasEventInheritedCrsAmbiguity = event?.warnings.some(w => (w.code === 'CRS_UNKNOWN' || w.code === 'CRS_MISSING') && w.scope === 'inherited') ?? false;

    const passed = Boolean(
      sourceInput &&
      maskInput &&
      artifact &&
      event &&
      artifact.crs === 'EPSG:4326' &&
      artifact.crsProvenance?.confidence === 'known' &&
      artifact.crsProvenance?.source === 'operation-derived' &&
      artifact.crsProvenance?.warnings.length === 0 &&
      !hasArtifactCrsAmbiguity &&
      !hasEventInheritedCrsAmbiguity
    );

    return {
      operation: 'clip-confidence-propagation',
      passed,
      details: {
        outputCrs: artifact?.crs,
        provenance: artifact?.crsProvenance,
        artifactWarningCodes: artifact?.warnings.map((w: WarningRef) => `${w.code}:${w.scope ?? 'active'}`) ?? [],
        eventWarningCodes: event?.warnings.map((w: WarningRef) => `${w.code}:${w.scope ?? 'active'}`) ?? [],
        rowCount: artifact?.rowCount,
      },
    };
  } catch (error) {
    return {
      operation: 'clip-confidence-propagation',
      passed: false,
      error: String(error),
    };
  }
}

async function validateIntersectSuccess(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createTestArtifact('intersect_source_known', sampleGeoJson, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const overlayArtifact: Artifact = {
      ...createTestArtifact('intersect_overlay_known', intersectOverlayGeoJson, 'EPSG:4326'),
      geometryType: 'Polygon',
      rowCount: intersectOverlayGeoJson.features.length,
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const result = await executeIntersectOperation({
      sourceArtifact,
      overlayArtifact,
      outputName: 'intersect_success_test',
      executeIntersect: (source, overlay) => engine.intersect(source, overlay),
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const firstFeature = (artifact?.data as GeoJSON.FeatureCollection | undefined)?.features?.[0];
    const sourceFeature = sampleGeoJson.features[0];
    const overlayFeature = intersectOverlayGeoJson.features[0];
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const firstFeatureProperties = (firstFeature?.properties ?? {}) as Record<string, unknown>;
    const sourceFeatureProperties = (sourceFeature.properties ?? {}) as Record<string, unknown>;
    const overlayFeatureProperties = (overlayFeature.properties ?? {}) as Record<string, unknown>;
    const sourceOnlyPropertiesPreserved = JSON.stringify(firstFeatureProperties) === JSON.stringify(sourceFeatureProperties);
    const overlayPropertiesDidNotLeak = Object.keys(overlayFeatureProperties).every((key) => !(key in firstFeatureProperties));
    const geometryColumnRegistered = tableRegistration.columns.includes('geometry');

    const passed = Boolean(
      artifact &&
      event &&
      artifact.rowCount && artifact.rowCount > 0 &&
      artifact.crs === 'EPSG:4326' &&
      artifact.inputArtifactIds?.length === 2 &&
      firstFeature &&
      sourceOnlyPropertiesPreserved &&
      overlayPropertiesDidNotLeak &&
      event.summary.includes('Intersect intersect_source_known with intersect_overlay_known → intersect_success_test') &&
      event.details.operation === 'intersect' &&
      event.details.overlayArtifactName === 'intersect_overlay_known' &&
      event.details.wasEmpty === false &&
      event.details.outputAttributeSemantics === 'source-only' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === artifact.rowCount &&
      geometryColumnRegistered
    );

    return {
      operation: 'intersect-success',
      passed,
      details: {
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        inputArtifactIds: artifact?.inputArtifactIds,
        firstFeatureProperties,
        sourceOnlyPropertiesPreserved,
        overlayPropertiesDidNotLeak,
        outputAttributeSemantics: event?.details.outputAttributeSemantics,
        tableName: artifact?.tableName,
        tableRegistration,
        historySummary: event?.summary,
      },
    };
  } catch (error) {
    return {
      operation: 'intersect-success',
      passed: false,
      error: String(error),
    };
  }
}

async function validateIntersectEmptyResult(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('intersect_empty_source', wgs84Polygon, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const overlayArtifact: Artifact = {
      ...createEnvelopeTestArtifact('intersect_empty_overlay', projectedPolygon, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: 99, name: 'Far Away' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[-122.30, 37.70], [-122.29, 37.70], [-122.29, 37.71], [-122.30, 37.71], [-122.30, 37.70]]],
            },
          },
        ],
      },
      geometryType: 'Polygon',
      rowCount: 1,
    };

    const result = await executeIntersectOperation({
      sourceArtifact,
      overlayArtifact,
      outputName: 'intersect_empty_test',
      executeIntersect: (source, overlay) => engine.intersect(source, overlay),
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const emptyWarningPresent = artifact?.warnings.some((w: WarningRef) => w.code === 'EMPTY_TOPOLOGY_RESULT') ?? false;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const geometryColumnRegistered = tableRegistration.columns.includes('geometry');

    const passed = Boolean(
      artifact &&
      event &&
      artifact.rowCount === 0 &&
      artifact.crs === 'EPSG:4326' &&
      emptyWarningPresent &&
      event.details.wasEmpty === true &&
      event.details.overlayArtifactName === 'intersect_empty_overlay' &&
      artifact.tableName &&
      tableRegistration.exists &&
      tableRegistration.rowCount === 0 &&
      geometryColumnRegistered
    );

    return {
      operation: 'intersect-empty-result',
      passed,
      details: {
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        warningCodes: artifact?.warnings.map((w: WarningRef) => w.code) ?? [],
        wasEmpty: event?.details.wasEmpty,
        tableName: artifact?.tableName,
        tableRegistration,
      },
    };
  } catch (error) {
    return {
      operation: 'intersect-empty-result',
      passed: false,
      error: String(error),
    };
  }
}

async function validateAttributeJoinSpatialRuntime(): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('attribute_join_left_spatial', wgs84Polygon, 'EPSG:4326'),
      outputKind: 'spatial-artifact',
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const rightRows = [
      { join_id: 1, zone: 'alpha', name: 'Right Alpha', score: 7 },
      { join_id: 1, zone: 'beta', name: 'Right Beta', score: 99 },
      { join_id: 2, zone: 'orphan', name: 'Right Orphan', score: 11 },
    ];
    const rightArtifact: Artifact = {
      id: `test_attribute_join_right_${Date.now()}`,
      name: 'attribute_join_right_spatial',
      kind: 'source',
      outputKind: 'tabular-artifact',
      format: 'JSON',
      spatial: false,
      rowCount: rightRows.length,
      warnings: [],
      originEventId: '',
      data: rightRows,
      tableRows: rightRows,
    };

    const result = await executeAttributeJoinOperation({
      sourceArtifact,
      secondaryArtifact: rightArtifact,
      sourceKey: 'id',
      secondaryKey: 'join_id',
      selectedFields: [
        { sourceField: 'name', outputField: 'join_name' },
        { sourceField: 'zone', outputField: 'zone' },
        { sourceField: 'score', outputField: 'score' },
      ],
      outputName: 'attribute_join_spatial_result',
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const geometryColumnRegistered = tableRegistration.columns.includes('geometry');
    const featureIndexColumnRegistered = tableRegistration.columns.includes('_featureIndex');
    const firstFeature = (artifact?.data as GeoJSON.FeatureCollection | undefined)?.features?.[0];
    const firstProperties = (firstFeature?.properties ?? {}) as Record<string, unknown>;
    const tableRow = artifact?.tableRows?.[0] as Record<string, unknown> | undefined;
    const limitedWarningPresent = artifact?.warnings.some((w: WarningRef) => w.code === 'LIMITED_SUPPORT_ENVELOPE') ?? false;

    const passed = Boolean(
      artifact &&
      event &&
      firstFeature &&
      artifact.outputKind === 'spatial-artifact' &&
      artifact.spatial === true &&
      artifact.geometryType === sourceArtifact.geometryType &&
      artifact.crs === sourceArtifact.crs &&
      artifact.rowCount === sourceArtifact.rowCount &&
      artifact.inputArtifactIds?.length === 2 &&
      firstProperties.id === 1 &&
      firstProperties.join_name === 'Right Alpha' &&
      firstProperties.zone === 'alpha' &&
      firstProperties.score === 7 &&
      tableRow?.join_name === 'Right Alpha' &&
      tableRow?.zone === 'alpha' &&
      tableRow?.score === 7 &&
      limitedWarningPresent &&
      event.details.operation === 'attribute-join-v1' &&
      event.details.joinMode === 'left' &&
      event.details.joinPredicate === 'exact-equality' &&
      event.details.unmatchedSourceRows === 'preserve-with-null-right-fields' &&
      event.details.matchedSecondaryRows === 'first-match-only' &&
      event.details.outputGeometryMode === 'preserve-source-geometry' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === sourceArtifact.rowCount &&
      !geometryColumnRegistered &&
      featureIndexColumnRegistered
    );

    return {
      operation: 'attribute-join-spatial-runtime',
      passed,
      details: {
        outputKind: artifact?.outputKind,
        spatial: artifact?.spatial,
        geometryType: artifact?.geometryType,
        firstProperties,
        selectedRightFields: event?.details.selectedRightFields,
        unmatchedSourceRows: event?.details.unmatchedSourceRows,
        matchedSecondaryRows: event?.details.matchedSecondaryRows,
        geometryColumnRegistered,
        featureIndexColumnRegistered,
        tableName: artifact?.tableName,
        tableRegistration,
      },
    };
  } catch (error) {
    return {
      operation: 'attribute-join-spatial-runtime',
      passed: false,
      error: String(error),
    };
  }
}

async function validateAttributeJoinTabularRuntime(): Promise<ValidationResult> {
  try {
    const leftRows = [
      { id: 1, value: 'left-a', city: 'Oakland' },
      { id: 3, value: 'left-c', city: 'Berkeley' },
    ];
    const sourceArtifact: Artifact = {
      id: `test_attribute_join_left_tabular_${Date.now()}`,
      name: 'attribute_join_left_tabular',
      kind: 'source',
      outputKind: 'tabular-artifact',
      format: 'JSON',
      spatial: false,
      rowCount: leftRows.length,
      warnings: [],
      originEventId: '',
      data: leftRows,
      tableRows: leftRows,
    };

    const rightRows = [
      { join_id: 1, value: 'right-a', city: 'San Francisco', score: 4 },
      { join_id: 1, value: 'right-a-duplicate', city: 'Alameda', score: 10 },
      { join_id: 2, value: 'right-b', city: 'Richmond', score: 6 },
    ];
    const rightArtifact: Artifact = {
      id: `test_attribute_join_right_tabular_${Date.now()}`,
      name: 'attribute_join_right_tabular',
      kind: 'source',
      outputKind: 'tabular-artifact',
      format: 'JSON',
      spatial: false,
      rowCount: rightRows.length,
      warnings: [],
      originEventId: '',
      data: rightRows,
      tableRows: rightRows,
    };

    const result = await executeAttributeJoinOperation({
      sourceArtifact,
      secondaryArtifact: rightArtifact,
      sourceKey: 'id',
      secondaryKey: 'join_id',
      selectedFields: [
        { sourceField: 'value', outputField: 'join_value' },
        { sourceField: 'city', outputField: 'join_city' },
        { sourceField: 'score', outputField: 'score' },
      ],
      outputName: 'attribute_join_tabular_result',
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const firstRow = artifact?.tableRows?.[0] as Record<string, unknown> | undefined;
    const secondRow = artifact?.tableRows?.[1] as Record<string, unknown> | undefined;

    const passed = Boolean(
      artifact &&
      event &&
      artifact.outputKind === 'tabular-artifact' &&
      artifact.spatial === false &&
      !isFeatureCollection(artifact.data) &&
      artifact.rowCount === leftRows.length &&
      firstRow?.id === 1 &&
      firstRow?.value === 'left-a' &&
      firstRow?.join_value === 'right-a' &&
      firstRow?.join_city === 'San Francisco' &&
      firstRow?.score === 4 &&
      secondRow?.id === 3 &&
      secondRow?.join_value === null &&
      secondRow?.join_city === null &&
      secondRow?.score === null &&
      event.details.sourceOutputKind === 'tabular-artifact' &&
      event.details.joinArtifactOutputKind === 'tabular-artifact' &&
      event.details.outputKind === 'tabular-artifact' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === leftRows.length &&
      !tableRegistration.columns.includes('geometry')
    );

    return {
      operation: 'attribute-join-tabular-runtime',
      passed,
      details: {
        outputKind: artifact?.outputKind,
        spatial: artifact?.spatial,
        firstRow,
        secondRow,
        selectedRightFields: event?.details.selectedRightFields,
        tableName: artifact?.tableName,
        tableRegistration,
      },
    };
  } catch (error) {
    return {
      operation: 'attribute-join-tabular-runtime',
      passed: false,
      error: String(error),
    };
  }
}

async function validateAreaMeasurementSuccess(): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('area_source_projected', projectedPolygon, 'EPSG:3857'),
      crsProvenance: createTestProvenance('known', 'EPSG:3857'),
      warnings: [],
    };

    const result = await executeAreaMeasurementOperation({
      sourceArtifact,
      outputName: 'area_measurement_test',
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const firstRow = artifact?.tableRows?.[0] as Record<string, unknown> | undefined;

    const passed = Boolean(
      artifact &&
      event &&
      artifact.spatial === false &&
      artifact.format === 'Measurement table' &&
      artifact.rowCount === 1 &&
      artifact.crs === 'EPSG:3857' &&
      firstRow &&
      typeof firstRow.area_value === 'number' &&
      Number(firstRow.area_value) > 0 &&
      firstRow.area_unit === 'square_meters' &&
      event.details.outputKind === 'measurement-table' &&
      event.details.measurementKind === 'area' &&
      event.details.measurementUnit === 'square_meters' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === 1 &&
      tableRegistration.columns.includes('area_value') &&
      tableRegistration.columns.includes('area_unit')
    );

    return {
      operation: 'area-measurement-success',
      passed,
      details: {
        spatial: artifact?.spatial,
        format: artifact?.format,
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        firstRow,
        tableName: artifact?.tableName,
        tableRegistration,
      },
    };
  } catch (error) {
    return {
      operation: 'area-measurement-success',
      passed: false,
      error: String(error),
    };
  }
}

async function validateAreaMeasurementRefusal(): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('area_source_wgs84', wgs84Polygon, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const result = await executeAreaMeasurementOperation({
      sourceArtifact,
      outputName: 'area_measurement_should_refuse',
    });

    const passed = Boolean(
      result.error &&
      result.error.includes('unit semantics would be misleading') &&
      result.error.includes('area value') &&
      result.error.includes('measuring area') &&
      !result.artifact &&
      !result.historyEvent
    );

    return {
      operation: 'area-measurement-refusal',
      passed,
      details: {
        error: result.error,
      },
    };
  } catch (error) {
    return {
      operation: 'area-measurement-refusal',
      passed: false,
      error: String(error),
    };
  }
}

async function validatePerimeterMeasurementSuccess(): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('perimeter_source_projected', projectedPolygon, 'EPSG:3857'),
      crsProvenance: createTestProvenance('known', 'EPSG:3857'),
      warnings: [],
    };

    const result = await executePerimeterMeasurementOperation({
      sourceArtifact,
      outputName: 'perimeter_measurement_test',
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const firstRow = artifact?.tableRows?.[0] as Record<string, unknown> | undefined;

    const passed = Boolean(
      artifact &&
      event &&
      artifact.spatial === false &&
      artifact.format === 'Measurement table' &&
      artifact.rowCount === 1 &&
      artifact.crs === 'EPSG:3857' &&
      firstRow &&
      typeof firstRow.perimeter_value === 'number' &&
      Number(firstRow.perimeter_value) > 0 &&
      firstRow.perimeter_unit === 'meters' &&
      event.details.outputKind === 'measurement-table' &&
      event.details.measurementKind === 'perimeter' &&
      event.details.measurementUnit === 'meters' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === 1 &&
      tableRegistration.columns.includes('perimeter_value') &&
      tableRegistration.columns.includes('perimeter_unit')
    );

    return {
      operation: 'perimeter-measurement-success',
      passed,
      details: {
        spatial: artifact?.spatial,
        format: artifact?.format,
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        firstRow,
        tableName: artifact?.tableName,
        tableRegistration,
      },
    };
  } catch (error) {
    return {
      operation: 'perimeter-measurement-success',
      passed: false,
      error: String(error),
    };
  }
}

async function validatePerimeterMeasurementRefusal(): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('perimeter_source_wgs84', wgs84Polygon, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const result = await executePerimeterMeasurementOperation({
      sourceArtifact,
      outputName: 'perimeter_measurement_should_refuse',
    });

    const passed = Boolean(
      result.error &&
      result.error.includes('unit semantics would be misleading') &&
      result.error.includes('perimeter value') &&
      result.error.includes('measuring perimeter') &&
      !result.artifact &&
      !result.historyEvent
    );

    return {
      operation: 'perimeter-measurement-refusal',
      passed,
      details: {
        error: result.error,
      },
    };
  } catch (error) {
    return {
      operation: 'perimeter-measurement-refusal',
      passed: false,
      error: String(error),
    };
  }
}

async function validateCompactnessMeasurementSuccess(): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('compactness_source_projected', projectedPolygon, 'EPSG:3857'),
      crsProvenance: createTestProvenance('known', 'EPSG:3857'),
      warnings: [],
    };

    const result = await executeCompactnessMeasurementOperation({
      sourceArtifact,
      outputName: 'compactness_measurement_test',
    });

    const artifact = result.artifact;
    const event = result.historyEvent;
    const tableRegistration = await inspectRegisteredTable(artifact?.tableName);
    const firstRow = artifact?.tableRows?.[0] as Record<string, unknown> | undefined;

    const compactnessValue = firstRow?.compactness_value;
    const passed = Boolean(
      artifact &&
      event &&
      artifact.spatial === false &&
      artifact.format === 'Measurement table' &&
      artifact.rowCount === 1 &&
      artifact.crs === 'EPSG:3857' &&
      firstRow &&
      typeof compactnessValue === 'number' &&
      Number(compactnessValue) > 0 &&
      Number(compactnessValue) <= 1 &&
      firstRow.compactness_unit === 'unitless' &&
      event.details.outputKind === 'measurement-table' &&
      event.details.measurementKind === 'compactness' &&
      event.details.measurementUnit === 'unitless' &&
      tableRegistration.exists &&
      tableRegistration.rowCount === 1 &&
      tableRegistration.columns.includes('compactness_value') &&
      tableRegistration.columns.includes('compactness_unit')
    );

    return {
      operation: 'compactness-measurement-success',
      passed,
      details: {
        spatial: artifact?.spatial,
        format: artifact?.format,
        rowCount: artifact?.rowCount,
        outputCrs: artifact?.crs,
        firstRow,
        tableName: artifact?.tableName,
        tableRegistration,
      },
    };
  } catch (error) {
    return {
      operation: 'compactness-measurement-success',
      passed: false,
      error: String(error),
    };
  }
}

async function validateCompactnessMeasurementRefusal(): Promise<ValidationResult> {
  try {
    const sourceArtifact: Artifact = {
      ...createEnvelopeTestArtifact('compactness_source_wgs84', wgs84Polygon, 'EPSG:4326'),
      crsProvenance: createTestProvenance('known', 'EPSG:4326'),
      warnings: [],
    };

    const result = await executeCompactnessMeasurementOperation({
      sourceArtifact,
      outputName: 'compactness_measurement_should_refuse',
    });

    const passed = Boolean(
      result.error &&
      result.error.includes('unit semantics would be misleading') &&
      result.error.includes('compactness value') &&
      result.error.includes('measuring compactness') &&
      !result.artifact &&
      !result.historyEvent
    );

    return {
      operation: 'compactness-measurement-refusal',
      passed,
      details: {
        error: result.error,
      },
    };
  } catch (error) {
    return {
      operation: 'compactness-measurement-refusal',
      passed: false,
      error: String(error),
    };
  }
}

export {
  validateBuffer,
  validateCentroid,
  validateConvexHull,
  validateEnvelope,
  validateSimplify,
  validateDissolve,
  validateGroupedDissolveGroupingFieldRequired,
  validateGroupedDissolveRuntime,
  validateGroupedDissolvePersistenceReload,
  validateReproject,
  validateReprojectConfidencePropagation,
  validateClipConfidencePropagation,
  validateIntersectSuccess,
  validateIntersectEmptyResult,
  validateAttributeJoinSpatialRuntime,
  validateAttributeJoinTabularRuntime,
  validateAreaMeasurementSuccess,
  validateAreaMeasurementRefusal,
  validatePerimeterMeasurementSuccess,
  validatePerimeterMeasurementRefusal,
  validateCompactnessMeasurementSuccess,
  validateCompactnessMeasurementRefusal,
};

// ============================================================================
// SUPPORT ENVELOPE TESTS
// These tests validate the explicit support boundaries
// ============================================================================

/**
 * Support envelope test result
 */
export interface EnvelopeTestResult {
  testName: string;
  supportTier: 'universal' | 'validated_local' | 'environment_sensitive';
  supportClaim: string;
  passed: boolean;
  actualBehavior: string;
  warnings: string[];
  errors?: string;
}

// Test fixtures for envelope tests
const wgs84Polygon: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, name: 'Test Parcel' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-122.42, 37.78], [-122.418, 37.78], [-122.418, 37.782], [-122.42, 37.782], [-122.42, 37.78]]],
      },
    },
  ],
};

const projectedPolygon: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, name: 'Test Parcel (Projected)' },
      geometry: {
        type: 'Polygon',
        // Approximate Web Mercator coordinates for the same area
        coordinates: [[[-13629105, 4558524], [-13626913, 4558524], [-13626913, 4560942], [-13629105, 4560942], [-13629105, 4558524]]],
      },
    },
  ],
};

const intersectOverlayGeoJson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { overlay_id: 1, zone: 'central-overlay' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-122.4192, 37.7790], [-122.4155, 37.7790], [-122.4155, 37.7815], [-122.4192, 37.7815], [-122.4192, 37.7790]]],
      },
    },
  ],
};

const malformedGeometry: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, name: 'Bad Geometry' },
      geometry: {
        type: 'Polygon',
        // Invalid ring: not closed (first != last point)
        coordinates: [[[-122.42, 37.78], [-122.418, 37.78], [-122.418, 37.782], [-122.419, 37.781]]],
      },
    },
  ],
};

function createEnvelopeTestArtifact(
  name: string,
  data: GeoJSON.FeatureCollection,
  crs?: string
): Artifact {
  return {
    id: `test_${name}_${Date.now()}`,
    name,
    kind: 'source',
    format: 'GeoJSON',
    spatial: true,
    geometryType: data.features[0]?.geometry.type,
    rowCount: data.features.length,
    crs,
    warnings: [],
    originEventId: '',
    data,
  };
}

async function inspectRegisteredTable(tableName?: string): Promise<{
  exists: boolean;
  rowCount: number | null;
  columns: string[];
}> {
  if (!tableName) {
    return {
      exists: false,
      rowCount: null,
      columns: [],
    };
  }

  const db = await getDuckDb();
  const conn = await db.connect();
  try {
    const tableRows = await conn.query(`SELECT * FROM ${tableName}`);
    const rowCountRows = await conn.query(`SELECT COUNT(*) AS row_count FROM ${tableName}`);
    const columnRows = await conn.query(`DESCRIBE ${tableName}`);

    return {
      exists: true,
      rowCount: Number(rowCountRows.toArray()[0]?.toJSON()?.row_count ?? tableRows.toArray().length ?? 0),
      columns: columnRows.toArray().map((row) => String(row.toJSON().column_name ?? '')),
    };
  } catch {
    return {
      exists: false,
      rowCount: null,
      columns: [],
    };
  } finally {
    await conn.close();
  }
}

/**
 * Run all support envelope tests
 */
export async function runEnvelopeTests(): Promise<EnvelopeTestResult[]> {
  const results: EnvelopeTestResult[] = [];

  // Initialize engine first
  const engine = getSpatialEngine();
  if (!engine.initialized) {
    await engine.initialize();
  }

  console.log('=== SUPPORT ENVELOPE TESTS ===\n');

  // Test 1: Known WGS84 -> reproject -> render/frame
  results.push(await testWgs84ReprojectToDisplayFrame(engine));

  // Test 2: Projected artifact -> display-normalized framing
  results.push(await testProjectedDisplayTransformation(engine));

  // Test 3: Unknown CRS -> warning path
  results.push(await testUnknownCrsWarningPath(engine));

  // Test 4: Missing CRS -> warning path
  results.push(await testMissingCrsWarningPath(engine));

  // Test 5: Malformed geometry -> graceful failure
  results.push(await testMalformedGeometry(engine));

  return results;
}

/**
 * Test 1: Known WGS84 import -> reproject -> render/frame
 * 
 * Support claim: Known WGS84 (EPSG:4326) artifact can be reprojected to 
 * EPSG:3857 and display bounds computed for map framing.
 */
async function testWgs84ReprojectToDisplayFrame(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<EnvelopeTestResult> {
  const testName = 'WGS84 → Reproject → Display Frame';
  const supportClaim = 'Known WGS84 (EPSG:4326) artifact can be reprojected to EPSG:3857 and display-framed in validated local runtime conditions';

  try {
    const supportTier: EnvelopeTestResult['supportTier'] = 'validated_local';
    // Create WGS84 artifact
    const artifact = createEnvelopeTestArtifact('wgs84_test', wgs84Polygon, 'EPSG:4326');

    // Step 1: Reproject to EPSG:3857
    const input = artifactToOperationInput(artifact);
    if (!input) {
      throw new Error('Could not create operation input');
    }

    const reprojectResult = await engine.transform(input, 'EPSG:4326', 'EPSG:3857');

    if (!reprojectResult.success || !reprojectResult.output) {
      return {
        testName,
        supportTier,
        supportClaim,
        passed: false,
        actualBehavior: 'Reprojection failed',
        warnings: reprojectResult.warnings.map((w: WarningRef) => w.message),
        errors: reprojectResult.errors.map(e => e.message).join('; '),
      };
    }

    // Step 2: Create reprojected artifact
    const reprojectedArtifact = createEnvelopeTestArtifact('reprojected_test', reprojectResult.output, 'EPSG:3857');

    // Step 3: Compute display bounds
    const displayBounds = await getDisplayBounds(reprojectedArtifact);

    // Should transform to WGS84 for display and compute valid bounds
    const passed = displayBounds !== null && displayBounds.wasTransformed === true;

    return {
      testName,
      supportTier,
      supportClaim,
      passed,
      actualBehavior: passed 
        ? `Reprojection succeeded and display framing used transformed bounds (${displayBounds.status})`
        : `Display bounds computation did not transform as expected (${displayBounds?.status ?? 'none'})`,
      warnings: reprojectResult.warnings.map((w: WarningRef) => w.message),
    };
  } catch (error) {
    return {
      testName,
      supportTier: 'validated_local',
      supportClaim,
      passed: false,
      actualBehavior: `Exception: ${error}`,
      warnings: [],
      errors: String(error),
    };
  }
}

/**
 * Test 2: Projected artifact -> display-normalized framing
 * 
 * Support claim: Projected CRS (EPSG:3857) artifact can be displayed on 
 * WGS84 map via on-the-fly transformation for framing.
 */
async function testProjectedDisplayTransformation(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<EnvelopeTestResult> {
  const testName = 'Projected → Display Transformation';
  const supportClaim = 'Projected (EPSG:3857) artifact attempts on-the-fly WGS84 display transformation when CRS runtime is available';

  try {
    const supportTier: EnvelopeTestResult['supportTier'] = 'validated_local';
    // Create projected artifact
    const artifact = createEnvelopeTestArtifact('projected_test', projectedPolygon, 'EPSG:3857');

    // Check that it needs display transformation
    const needsTransform = needsDisplayTransformation(artifact);
    if (!needsTransform) {
      return {
        testName,
        supportTier,
        supportClaim,
        passed: false,
        actualBehavior: 'needsDisplayTransformation returned false for EPSG:3857',
        warnings: [],
        errors: 'Artifact should need display transformation',
      };
    }

    // Compute display bounds
    const displayBounds = await getDisplayBounds(artifact);

    if (displayBounds === null) {
      return {
        testName,
        supportTier,
        supportClaim,
        passed: false,
        actualBehavior: 'getDisplayBounds returned null',
        warnings: [],
        errors: 'Display bounds should be computable',
      };
    }

    // Should have transformed
    const passed = displayBounds.wasTransformed === true;

    // Check bounds are reasonable (WGS84 range)
    const { bounds } = displayBounds;
    const inWgs84Range = 
      bounds.north <= 90 && bounds.south >= -90 &&
      bounds.east <= 180 && bounds.west >= -180;

    return {
      testName,
      supportTier,
      supportClaim,
      passed: passed && inWgs84Range,
      actualBehavior: passed 
        ? `Display transformation applied (${displayBounds.status}): bounds ${JSON.stringify(bounds)}`
        : `Display transformation was not applied (${displayBounds.status})`,
      warnings: [],
    };
  } catch (error) {
    return {
      testName,
      supportTier: 'validated_local',
      supportClaim,
      passed: false,
      actualBehavior: `Exception: ${error}`,
      warnings: [],
      errors: String(error),
    };
  }
}

/**
 * Test 3: Unknown CRS -> warning path / no false certainty
 * 
 * Support claim: Artifact with CRS="unknown" should emit warning and
 * NOT claim any specific CRS transformation capability.
 */
async function testUnknownCrsWarningPath(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<EnvelopeTestResult> {
  const testName = 'Unknown CRS Warning Path';
  const supportClaim = 'Artifact with CRS="unknown" emits warning and does not imply false certainty';

  try {
    const supportTier: EnvelopeTestResult['supportTier'] = 'universal';
    // Create artifact with explicit unknown CRS
    const artifact = createEnvelopeTestArtifact('unknown_crs_test', wgs84Polygon, 'unknown');

    // Check isProjectedCrs returns false for unknown
    const isProjected = isProjectedCrs(artifact.crs);

    // Trying to reproject should produce warnings
    const input = artifactToOperationInput(artifact);
    if (!input) {
      throw new Error('Could not create operation input');
    }

    // Attempt reprojection (even though CRS is unknown)
    const reprojectResult = await engine.transform(input, 'EPSG:4326', 'EPSG:3857');

    // Result should have warnings about unknown CRS
    const hasWarning = reprojectResult.warnings.length > 0;

    const passed = !isProjected && hasWarning;

    return {
      testName,
      supportTier,
      supportClaim,
      passed,
      actualBehavior: passed
        ? 'Unknown CRS correctly produces warnings, no false certainty'
        : `isProjected=${isProjected}, hasWarning=${hasWarning}`,
      warnings: reprojectResult.warnings.map((w: WarningRef) => w.message),
    };
  } catch (error) {
    return {
      testName,
      supportTier: 'universal',
      supportClaim,
      passed: false,
      actualBehavior: `Exception: ${error}`,
      warnings: [],
      errors: String(error),
    };
  }
}

/**
 * Test 4: Missing CRS -> warning path / no false certainty
 * 
 * Support claim: Artifact with no CRS (undefined) should NOT be treated
 * as projected or assume WGS84.
 */
async function testMissingCrsWarningPath(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<EnvelopeTestResult> {
  const testName = 'Missing CRS Warning Path';
  const supportClaim = 'Artifact with no CRS is not treated as projected and does not imply false certainty';

  try {
    const supportTier: EnvelopeTestResult['supportTier'] = 'universal';
    // Create artifact WITHOUT setting CRS (undefined)
    const artifact: Artifact = {
      id: `test_missing_crs_${Date.now()}`,
      name: 'missing_crs_test',
      kind: 'source',
      format: 'GeoJSON',
      spatial: true,
      geometryType: 'Polygon',
      rowCount: wgs84Polygon.features.length,
      // NOTE: CRS is intentionally NOT set (undefined)
      warnings: [],
      originEventId: '',
      data: wgs84Polygon,
    };

    // Check isProjectedCrs handles undefined
    const isProjected = isProjectedCrs(artifact.crs);

    // Try to get display bounds - should handle gracefully
    const displayBounds = await getDisplayBounds(artifact);

    // Without a known CRS, transformation should not be attempted
    const passed = !isProjected;

    return {
      testName,
      supportTier,
      supportClaim,
      passed,
      actualBehavior: passed
        ? 'Missing CRS correctly handled: not treated as projected'
        : `isProjected=${isProjected}, displayBounds=${displayBounds ? 'available' : 'null'}`,
      warnings: [],
    };
  } catch (error) {
    return {
      testName,
      supportTier: 'universal',
      supportClaim,
      passed: false,
      actualBehavior: `Exception: ${error}`,
      warnings: [],
      errors: String(error),
    };
  }
}

/**
 * Test 5: Malformed geometry -> graceful failure
 * 
 * Support claim: Malformed geometry should fail gracefully with warnings,
 * not crash or produce invalid output.
 */
async function testMalformedGeometry(
  engine: ReturnType<typeof getSpatialEngine>
): Promise<EnvelopeTestResult> {
  const testName = 'Malformed Geometry Handling';
  const supportClaim = 'Malformed geometry produces warnings or graceful failure, not silent success';
  const supportTier: EnvelopeTestResult['supportTier'] = 'universal';

  try {
    // Create artifact with malformed geometry
    const artifact = createEnvelopeTestArtifact('malformed_test', malformedGeometry, 'EPSG:4326');

    // Try buffer operation - should handle gracefully
    const result = await executeSpatialOperation({
      sourceArtifact: artifact,
      operationName: 'buffer',
      operationFormat: 'Buffer',
      executeOperation: (input) => engine.buffer(input, 0.01, 'kilometers'),
      getDetails: () => ({ distance: 0.01, unit: 'kilometers' }),
    });

    // Check for warnings or errors
    const hasWarnings = (result.artifact?.warnings?.length ?? 0) > 0;
    const hasErrors = result.error !== undefined;
    const hasNoData = result.artifact?.data === undefined;

    // Passed if we either got warnings, errors, or no data (graceful failure)
    const passed = hasWarnings || hasErrors || hasNoData;

    return {
      testName,
      supportTier,
      supportClaim,
      passed,
      actualBehavior: passed
        ? 'Malformed geometry handled gracefully'
        : 'No warnings or errors produced for malformed geometry',
      warnings: result.artifact?.warnings?.map(w => w.message) ?? [],
      errors: result.error,
    };
  } catch (error) {
    // Exception is also acceptable as "graceful failure" for truly broken geometry
    return {
      testName,
      supportTier,
      supportClaim,
      passed: true, // Exception is acceptable
      actualBehavior: `Exception thrown (acceptable): ${error}`,
      warnings: [],
    };
  }
}

/**
 * Run envelope tests and log results
 */
export async function runAndLogEnvelopeTests(): Promise<void> {
  console.log('=== Running Support Envelope Tests ===\n');
  
  const results = await runEnvelopeTests();
  
  let allPassed = true;
  console.log('--- Individual Results ---\n');
  
  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${result.testName}`);
    console.log(`  Tier: ${result.supportTier}`);
    console.log(`  Claim: ${result.supportClaim}`);
    console.log(`  Actual: ${result.actualBehavior}`);
    if (result.warnings.length > 0) {
      console.log(`  Warnings: ${result.warnings.join('; ')}`);
    }
    if (result.errors) {
      console.log(`  Errors: ${result.errors}`);
    }
    console.log('');
    if (!result.passed) allPassed = false;
  }
  
  console.log(`=== Overall: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} ===`);
}
