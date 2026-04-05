import type { Artifact, HistoryEvent } from '../../types';
import { makeId } from '../../lib/utils';
import { artifactToOperationInput, validateArtifactForGeometryOps } from '../spatial/adapters';
import type { GeometryOperationInput, GeometryOperationResult } from '../spatial/types';
import { buildSingleInputDerivedArtifact } from './artifact-builder';
import { buildSingleInputOperationHistoryEvent } from './provenance-builder';
import { registerOperationArtifactTable } from './runtime';
import { buildOperationTransformPlan } from './transform-planning';
import { getOperationDefinition } from './registry';

export interface AggregationExecutionResult {
  artifact?: Artifact;
  historyEvent?: HistoryEvent;
  error?: string;
}

function getGroupingFieldValues(artifact: Artifact): string[] {
  if (!artifact.spatial || !artifact.data || typeof artifact.data !== 'object' || !('type' in artifact.data) || artifact.data.type !== 'FeatureCollection') {
    return [];
  }

  const featureCollection = artifact.data as GeoJSON.FeatureCollection;
  const fields = new Set<string>();
  for (const feature of featureCollection.features) {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(properties)) fields.add(key);
  }
  return [...fields].sort();
}

function getFeatureCollectionFromArtifact(artifact: Artifact): GeoJSON.FeatureCollection | null {
  if (!artifact.spatial || !artifact.data || typeof artifact.data !== 'object' || !('type' in artifact.data) || artifact.data.type !== 'FeatureCollection') {
    return null;
  }
  return artifact.data as GeoJSON.FeatureCollection;
}

function groupKeyForValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function groupLabelForValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

async function dissolveGroupedFeatureCollection(params: {
  sourceArtifact: Artifact;
  groupingField: string;
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>;
}): Promise<GeometryOperationResult> {
  const sourceFeatureCollection = getFeatureCollectionFromArtifact(params.sourceArtifact);
  if (!sourceFeatureCollection) {
    return {
      success: false,
      warnings: [],
      errors: [{ code: 'INVALID_INPUT', message: 'Source artifact has no valid spatial feature collection.' }],
    };
  }

  const groups = new Map<string, { value: unknown; features: GeoJSON.Feature[] }>();
  for (const feature of sourceFeatureCollection.features) {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const groupValue = properties[params.groupingField];
    const key = groupKeyForValue(groupValue);
    if (!groups.has(key)) {
      groups.set(key, { value: groupValue ?? null, features: [] });
    }
    groups.get(key)!.features.push(feature);
  }

  const outputFeatures: GeoJSON.Feature[] = [];
  const warnings = [] as GeometryOperationResult['warnings'];

  for (const group of groups.values()) {
    const groupInput: GeometryOperationInput = {
      type: 'feature-collection',
      data: {
        type: 'FeatureCollection',
        features: group.features,
      },
      crsState: params.sourceArtifact.crs && params.sourceArtifact.crs !== 'unknown'
        ? { status: 'known', crs: params.sourceArtifact.crs }
        : params.sourceArtifact.crs === 'unknown'
          ? { status: 'unknown', message: 'CRS is explicitly set to unknown' }
          : { status: 'missing', message: 'CRS not specified in artifact' },
    };

    const groupResult = await params.executeOperation(groupInput);
    warnings.push(...groupResult.warnings);

    if (!groupResult.success || !groupResult.output) {
      return {
        success: false,
        warnings,
        errors: groupResult.errors.length > 0
          ? groupResult.errors
          : [{ code: 'GROUPED_DISSOLVE_FAILED', message: `Grouped dissolve failed for group ${groupLabelForValue(group.value)}.` }],
      };
    }

    const firstFeature = groupResult.output.features[0];
    if (!firstFeature?.geometry) {
      return {
        success: false,
        warnings,
        errors: [{ code: 'GROUPED_DISSOLVE_FAILED', message: `Grouped dissolve produced no geometry for group ${groupLabelForValue(group.value)}.` }],
      };
    }

    outputFeatures.push({
      type: 'Feature',
      geometry: firstFeature.geometry,
      properties: {
        [params.groupingField]: group.value ?? null,
      },
    });
  }

  return {
    success: true,
    output: {
      type: 'FeatureCollection',
      features: outputFeatures,
    },
    outputCrs: params.sourceArtifact.crs,
    warnings,
    errors: [],
  };
}

export async function executeRegisteredAggregationOperation(params: {
  operationId: string;
  sourceArtifact: Artifact;
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>;
  outputName?: string;
  groupingField?: string;
}): Promise<AggregationExecutionResult> {
  const definition = getOperationDefinition(params.operationId);
  if (!definition) {
    return { error: `Unknown operation definition: ${params.operationId}` };
  }

  if (definition.family !== 'aggregation') {
    return { error: `Operation ${params.operationId} is not an aggregation operation` };
  }

  const validation = validateArtifactForGeometryOps(params.sourceArtifact);
  if (!validation.valid) {
    return { error: validation.errors.join(', ') };
  }

  const operationInput = artifactToOperationInput(params.sourceArtifact);
  if (!operationInput) {
    return { error: 'artifact has no valid spatial data' };
  }

  const sourceGeometry = params.sourceArtifact.geometryType;
  const allowedSourceGeometry = definition.geometryContract.allowedSourceGeometry;
  if (definition.crsContract.sourceRequirement === 'require-known') {
    if (!params.sourceArtifact.crs) {
      return { error: `Source artifact "${params.sourceArtifact.name}" has missing stored CRS. ${definition.label} requires known stored CRS before execution.` };
    }
    if (params.sourceArtifact.crs === 'unknown') {
      return { error: `Source artifact "${params.sourceArtifact.name}" has unknown stored CRS. ${definition.label} requires known stored CRS before execution.` };
    }
  }
  if (sourceGeometry && allowedSourceGeometry?.length && !allowedSourceGeometry.includes(sourceGeometry)) {
    return {
      error: `${definition.label} refuses geometry type "${sourceGeometry}". ${definition.label} v1 supports only ${allowedSourceGeometry.join(' or ')}.`,
    };
  }

  let result: GeometryOperationResult;
  let groupingField = params.groupingField?.trim();

  if (definition.aggregationContract?.groupingFieldMode === 'required-attribute') {
    if (!groupingField) {
      return { error: `${definition.label} requires exactly one explicit grouping field.` };
    }

    const availableFields = getGroupingFieldValues(params.sourceArtifact);
    if (!availableFields.includes(groupingField)) {
      return { error: `Grouping field "${groupingField}" does not exist on ${params.sourceArtifact.name}.` };
    }

    result = await dissolveGroupedFeatureCollection({
      sourceArtifact: params.sourceArtifact,
      groupingField,
      executeOperation: params.executeOperation,
    });
  } else {
    result = await params.executeOperation(operationInput);
  }

  if (!result.success) {
    return { error: result.errors.map((e) => e.message).join(', ') };
  }

  if (!result.output) {
    return { error: 'no output produced' };
  }

  const safeOperationName = definition.id.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const tableName = `${safeOperationName}_${params.sourceArtifact.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${makeId('short').replace(/-/g, '')}`;
  const eventId = makeId('event');
  const artifactId = makeId('artifact');

  const artifact = buildSingleInputDerivedArtifact({
    eventId,
    artifactId,
    tableName,
    sourceArtifact: params.sourceArtifact,
    operationName: definition.id,
    operationFormat: `${definition.label} operation`,
    result,
    outputName: params.outputName,
  });

  if (!artifact) {
    return { error: 'could not create derived artifact' };
  }

  if (definition.outputContract.attributePolicy === 'grouping-field-only' && groupingField) {
    artifact.geometryType = artifact.geometryType ?? 'Polygon';
  }

  try {
    await registerOperationArtifactTable(
      tableName,
      result,
      definition.outputContract.attributePolicy === 'grouping-field-only'
        ? { allowEmptyTable: true }
        : undefined,
    );
  } catch (registerError) {
    console.error('Failed to register aggregation artifact table:', registerError);
  }

  const transformPlanSummary = buildOperationTransformPlan({ definition, sourceArtifact: params.sourceArtifact }).summary;
  const historyEvent = buildSingleInputOperationHistoryEvent({
    eventId,
    sourceArtifact: params.sourceArtifact,
    artifact,
    operationName: definition.id,
    details: {
      aggregationScope: definition.aggregationContract?.scope,
      groupingFieldMode: definition.aggregationContract?.groupingFieldMode,
      outputCardinality: definition.aggregationContract?.outputCardinality,
      groupingField: groupingField ?? null,
      outputFeatureCount: result.output.features.length,
      distinctGroupCount: result.output.features.length,
      outputAttributeSemantics: definition.outputContract.attributePolicy,
      exportMaterializationSemantics: 'Derived spatial artifact with one dissolved feature per group; export/materialization preserve grouped feature rows and grouping-field-only attributes on the current path.',
      persistedQueryableState: 'Derived artifact is materialized as one spatial artifact and registered as one DuckDB table with one row per dissolved group.',
    },
    result,
    transformPlanSummary,
  });

  return { artifact, historyEvent };
}
