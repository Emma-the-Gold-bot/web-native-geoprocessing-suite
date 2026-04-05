import type { Artifact, HistoryEvent } from '../../types';
import { makeId } from '../../lib/utils';
import { getDuckDb } from '../../lib/duckdb';
import { getOperationDefinition } from './registry';
import { artifactToOperationInput } from '../spatial/adapters';
import { createWarningFromCode } from '../spatial/warning-codes';
import { buildOperationTransformPlan } from './transform-planning';

export interface MeasurementExecutionResult {
  artifact?: Artifact;
  historyEvent?: HistoryEvent;
  error?: string;
}

const CRS_WITH_LINEAR_METER_UNITS = new Set([
  'EPSG:3857',
  'EPSG:32610',
  'EPSG:32611',
  'EPSG:32612',
]);

function geometryAreaSquareMeters(geometry: GeoJSON.Geometry): number {
  switch (geometry.type) {
    case 'Polygon':
      return polygonAreaSquareMeters(geometry.coordinates);
    case 'MultiPolygon':
      return geometry.coordinates.reduce((sum, polygon) => sum + polygonAreaSquareMeters(polygon), 0);
    default:
      return 0;
  }
}

function polygonAreaSquareMeters(coordinates: number[][][]): number {
  if (!coordinates.length) return 0;
  const [outer, ...holes] = coordinates;
  return Math.abs(ringSignedArea(outer)) - holes.reduce((sum, ring) => sum + Math.abs(ringSignedArea(ring)), 0);
}

function geometryPerimeterMeters(geometry: GeoJSON.Geometry): number {
  switch (geometry.type) {
    case 'Polygon':
      return polygonPerimeterMeters(geometry.coordinates);
    case 'MultiPolygon':
      return geometry.coordinates.reduce((sum, polygon) => sum + polygonPerimeterMeters(polygon), 0);
    default:
      return 0;
  }
}

function polygonPerimeterMeters(coordinates: number[][][]): number {
  if (!coordinates.length) return 0;
  return coordinates.reduce((sum, ring) => sum + ringPerimeterMeters(ring), 0);
}

function ringPerimeterMeters(ring: number[][]): number {
  if (ring.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return sum;
}

function ringSignedArea(ring: number[][]): number {
  if (ring.length < 4) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function isMeasurementUnitSafe(crs?: string): boolean {
  if (!crs || crs === 'unknown') return false;
  return CRS_WITH_LINEAR_METER_UNITS.has(crs);
}

function getMeasurementUnit(measurementKind: 'area' | 'perimeter' | 'compactness'): 'square_meters' | 'meters' | 'unitless' {
  if (measurementKind === 'area') return 'square_meters';
  if (measurementKind === 'perimeter') return 'meters';
  return 'unitless';
}

function getMeasurementPrefix(measurementKind: 'area' | 'perimeter' | 'compactness'): string {
  if (measurementKind === 'area') return 'measurement_area';
  if (measurementKind === 'perimeter') return 'measurement_perimeter';
  return 'measurement_compactness';
}

function getDefaultOutputName(sourceArtifact: Artifact, measurementKind: 'area' | 'perimeter' | 'compactness'): string {
  if (measurementKind === 'area') return `${sourceArtifact.name}_area`;
  if (measurementKind === 'perimeter') return `${sourceArtifact.name}_perimeter`;
  return `${sourceArtifact.name}_compactness`;
}

function geometryCompactness(geometry: GeoJSON.Geometry): number {
  const area = geometryAreaSquareMeters(geometry);
  const perimeter = geometryPerimeterMeters(geometry);
  if (area <= 0 || perimeter <= 0) return 0;
  return (4 * Math.PI * area) / (perimeter * perimeter);
}

export async function executeRegisteredMeasurementOperation(params: {
  operationId: 'area-v1' | 'perimeter-v1' | 'compactness-v1';
  sourceArtifact: Artifact;
  outputName?: string;
}): Promise<MeasurementExecutionResult> {
  const { operationId, sourceArtifact, outputName } = params;
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.family !== 'measurement' || !definition.measurementContract) {
    return { error: `Missing ${operationId} measurement definition` };
  }

  if (!sourceArtifact.spatial) {
    return { error: `Source artifact "${sourceArtifact.name}" is not spatial. ${definition.label} requires polygon or multipolygon geometry.` };
  }

  const input = artifactToOperationInput(sourceArtifact);
  if (!input || input.type !== 'feature-collection') {
    return { error: `Source artifact "${sourceArtifact.name}" has no usable spatial feature collection.` };
  }

  if (!sourceArtifact.crs) {
    return { error: `Source artifact "${sourceArtifact.name}" has missing stored CRS. ${definition.label} requires known stored CRS before execution.` };
  }

  if (sourceArtifact.crs === 'unknown') {
    return { error: `Source artifact "${sourceArtifact.name}" has unknown stored CRS. ${definition.label} requires known stored CRS before execution.` };
  }

  const allowedSourceGeometry = definition.geometryContract.allowedSourceGeometry ?? [];
  if (sourceArtifact.geometryType && !allowedSourceGeometry.includes(sourceArtifact.geometryType)) {
    return { error: `${definition.label} refuses geometry type "${sourceArtifact.geometryType}". ${definition.label} v1 supports only Polygon or MultiPolygon.` };
  }

  if (!isMeasurementUnitSafe(sourceArtifact.crs)) {
    return {
      error: createWarningFromCode('MISLEADING_UNIT_SEMANTICS', undefined, {
        operation: definition.label.toLowerCase(),
        crs: sourceArtifact.crs,
      }).message,
    };
  }

  const transformPlanSummary = buildOperationTransformPlan({
    definition,
    sourceArtifact,
  }).summary;

  const featureCollection = input.data as GeoJSON.FeatureCollection;
  const measurementKind = definition.measurementContract.measurementKind;
  const valueField = definition.measurementContract.valueField;
  const unitField = definition.measurementContract.unitField;
  const outputUnit = getMeasurementUnit(measurementKind);

  const measurementRows = featureCollection.features.map((feature: GeoJSON.Feature, featureIndex: number) => ({
    feature_index: featureIndex,
    ...((feature.properties ?? {}) as Record<string, unknown>),
    [valueField]: measurementKind === 'area'
      ? geometryAreaSquareMeters(feature.geometry)
      : measurementKind === 'perimeter'
        ? geometryPerimeterMeters(feature.geometry)
        : geometryCompactness(feature.geometry),
    [unitField]: outputUnit,
    measured_geometry_type: feature.geometry.type,
    source_artifact_id: sourceArtifact.id,
    source_artifact_name: sourceArtifact.name,
    stored_crs: sourceArtifact.crs,
  }));

  const eventId = makeId('event');
  const artifactId = makeId('artifact');
  const measurementPrefix = getMeasurementPrefix(measurementKind);
  const defaultOutputName = getDefaultOutputName(sourceArtifact, measurementKind);
  const tableName = `${measurementPrefix}_${sourceArtifact.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${makeId('short').replace(/-/g, '')}`;
  const artifactWarnings = [
    ...sourceArtifact.warnings.map((warning) => ({
      ...warning,
      scope: warning.scope === 'historical' ? 'historical' as const : 'inherited' as const,
    })),
    createWarningFromCode('LIMITED_SUPPORT_ENVELOPE', { scope: 'historical' }, { operation: definition.label.toLowerCase() }),
  ];

  const artifact: Artifact = {
    id: artifactId,
    name: outputName || defaultOutputName,
    kind: 'derived',
    outputKind: definition.outputContract.outputKind ?? 'measurement-table',
    format: 'Measurement table',
    spatial: false,
    geometryType: undefined,
    rowCount: measurementRows.length,
    crs: sourceArtifact.crs,
    crsProvenance: {
      confidence: sourceArtifact.crsProvenance?.confidence ?? 'known',
      declaredCrs: sourceArtifact.crs,
      source: 'operation-inherited',
      warnings: sourceArtifact.crsProvenance?.warnings ?? [],
    },
    warnings: artifactWarnings,
    originEventId: eventId,
    inputArtifactIds: [sourceArtifact.id],
    tableName,
    data: measurementRows,
    tableRows: measurementRows,
  };

  const db = await getDuckDb();
  const conn = await db.connect();
  try {
    await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
    await db.registerFileText(`${tableName}.json`, JSON.stringify(measurementRows));
    conn.insertJSONFromPath(`${tableName}.json`, { name: tableName });
  } finally {
    await conn.close();
  }

  const historyEvent: HistoryEvent = {
    id: eventId,
    type: 'operation',
    timestamp: new Date().toISOString(),
    summary: `${definition.label} on ${sourceArtifact.name} → ${artifact.name}`,
    inputArtifactIds: [sourceArtifact.id],
    outputArtifactIds: [artifactId],
    warnings: artifactWarnings.map((warning) => ({ ...warning, scope: 'historical' as const })),
    details: {
      operation: operationId,
      measurementKind,
      outputKind: artifact.outputKind ?? 'measurement-table',
      sourceArtifactId: sourceArtifact.id,
      sourceArtifactName: sourceArtifact.name,
      outputArtifactId: artifactId,
      outputArtifactName: artifact.name,
      inputStoredCrs: sourceArtifact.crs,
      outputStoredCrs: artifact.crs,
      outputCrsConfidence: artifact.crsProvenance?.confidence,
      outputCrsProvenance: artifact.crsProvenance?.source,
      measurementValueField: valueField,
      measurementUnitField: unitField,
      measurementUnit: outputUnit,
      preservesSourceRows: true,
      transformPlanSummary,
      inputWarningCodes: sourceArtifact.warnings.map((warning) => warning.code),
      outputWarningCodes: artifact.warnings.map((warning) => warning.code),
      outputRowCount: measurementRows.length,
    },
  };

  return { artifact, historyEvent };
}

export async function executeAreaMeasurementOperation(params: {
  sourceArtifact: Artifact;
  outputName?: string;
}): Promise<MeasurementExecutionResult> {
  return executeRegisteredMeasurementOperation({
    operationId: 'area-v1',
    sourceArtifact: params.sourceArtifact,
    outputName: params.outputName,
  });
}

export async function executePerimeterMeasurementOperation(params: {
  sourceArtifact: Artifact;
  outputName?: string;
}): Promise<MeasurementExecutionResult> {
  return executeRegisteredMeasurementOperation({
    operationId: 'perimeter-v1',
    sourceArtifact: params.sourceArtifact,
    outputName: params.outputName,
  });
}

export async function executeCompactnessMeasurementOperation(params: {
  sourceArtifact: Artifact;
  outputName?: string;
}): Promise<MeasurementExecutionResult> {
  return executeRegisteredMeasurementOperation({
    operationId: 'compactness-v1',
    sourceArtifact: params.sourceArtifact,
    outputName: params.outputName,
  });
}
