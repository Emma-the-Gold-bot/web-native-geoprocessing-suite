import type { Artifact, HistoryEvent } from '../../types';
import { makeId } from '../../lib/utils';
import { getDuckDb } from '../../lib/duckdb';
import { getOperationDefinition } from './registry';
import type { AttributeJoinExecutionContext, AttributeJoinFieldSelection } from './types';

type JoinRow = Record<string, unknown>;

export interface AttributeJoinExecutionResult {
  artifact?: Artifact;
  historyEvent?: HistoryEvent;
  error?: string;
}

function getArtifactRows(artifact: Artifact): JoinRow[] | null {
  if (artifact.tableRows?.length) return artifact.tableRows;
  if (Array.isArray(artifact.data)) return artifact.data as JoinRow[];
  if (artifact.spatial && artifact.data && typeof artifact.data === 'object' && 'type' in artifact.data && artifact.data.type === 'FeatureCollection') {
    const featureCollection = artifact.data as GeoJSON.FeatureCollection;
    return featureCollection.features.map((feature, featureIndex) => ({
      _featureIndex: featureIndex,
      ...(feature.properties ?? {}),
    }));
  }
  return null;
}

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection {
  return !!value && typeof value === 'object' && (value as { type?: string }).type === 'FeatureCollection';
}

function getFieldNames(rows: JoinRow[]): string[] {
  const fields = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) fields.add(key);
  }
  return [...fields].sort();
}

function validateFieldSelection(selectedFields: AttributeJoinFieldSelection[], secondaryFields: string[]): string | null {
  if (!selectedFields.length) return 'Select at least one right-side field to carry into the output.';
  for (const field of selectedFields) {
    if (!secondaryFields.includes(field.sourceField)) {
      return `Selected right-side field "${field.sourceField}" does not exist on the join artifact.`;
    }
    if (!field.outputField.trim()) {
      return `Selected right-side field "${field.sourceField}" needs a non-empty output name.`;
    }
  }
  return null;
}

export function getJoinableFieldNames(artifact: Artifact): string[] {
  const rows = getArtifactRows(artifact);
  return rows ? getFieldNames(rows) : [];
}

export async function executeAttributeJoinOperation(context: AttributeJoinExecutionContext): Promise<AttributeJoinExecutionResult> {
  const definition = getOperationDefinition('attribute-join-v1');
  if (!definition || !definition.joinContract) {
    return { error: 'Missing attribute-join-v1 definition.' };
  }

  const leftRows = getArtifactRows(context.sourceArtifact);
  const rightRows = getArtifactRows(context.secondaryArtifact);

  if (!leftRows) {
    return { error: `Source artifact "${context.sourceArtifact.name}" has no joinable rows on the current path.` };
  }
  if (!rightRows) {
    return { error: `Join artifact "${context.secondaryArtifact.name}" has no joinable rows on the current path.` };
  }

  const leftFields = getFieldNames(leftRows);
  const rightFields = getFieldNames(rightRows);

  if (!leftFields.includes(context.sourceKey)) {
    return { error: `Source join key "${context.sourceKey}" does not exist on ${context.sourceArtifact.name}.` };
  }
  if (!rightFields.includes(context.secondaryKey)) {
    return { error: `Join key "${context.secondaryKey}" does not exist on ${context.secondaryArtifact.name}.` };
  }

  const fieldValidationError = validateFieldSelection(context.selectedFields, rightFields);
  if (fieldValidationError) {
    return { error: fieldValidationError };
  }

  const duplicateOutputs = new Set<string>();
  for (const selection of context.selectedFields) {
    const outputField = selection.outputField.trim();
    if (duplicateOutputs.has(outputField)) {
      return { error: `Output field "${outputField}" is selected more than once. Right-side output names must be unique.` };
    }
    duplicateOutputs.add(outputField);
  }

  const rightIndex = new Map<string, JoinRow>();
  for (const row of rightRows) {
    const joinValue = row[context.secondaryKey];
    if (joinValue === undefined || joinValue === null) continue;
    const key = JSON.stringify(joinValue);
    if (!rightIndex.has(key)) {
      rightIndex.set(key, row);
    }
  }

  const outputRows = leftRows.map((leftRow) => {
    const joinValue = leftRow[context.sourceKey];
    const matchedRight = joinValue === undefined || joinValue === null ? undefined : rightIndex.get(JSON.stringify(joinValue));
    const enriched: JoinRow = { ...leftRow };
    for (const selection of context.selectedFields) {
      enriched[selection.outputField.trim()] = matchedRight ? matchedRight[selection.sourceField] ?? null : null;
    }
    return enriched;
  });

  const eventId = makeId('event');
  const artifactId = makeId('artifact');
  const tableName = `attribute_join_${context.sourceArtifact.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${makeId('short').replace(/-/g, '')}`;

  let artifactData: unknown = outputRows;
  let tableRows = outputRows;
  if (context.sourceArtifact.spatial && isFeatureCollection(context.sourceArtifact.data)) {
    const sourceFc = context.sourceArtifact.data as GeoJSON.FeatureCollection;
    artifactData = {
      ...sourceFc,
      features: sourceFc.features.map((feature, index) => ({
        ...feature,
        properties: outputRows[index],
      })),
    } satisfies GeoJSON.FeatureCollection;
  }

  const artifact: Artifact = {
    id: artifactId,
    name: context.outputName?.trim() || `${context.sourceArtifact.name}_attribute_join`,
    kind: 'derived',
    outputKind: context.sourceArtifact.outputKind ?? (context.sourceArtifact.spatial ? 'spatial-artifact' : 'tabular-artifact'),
    format: context.sourceArtifact.format,
    spatial: context.sourceArtifact.spatial,
    geometryType: context.sourceArtifact.geometryType,
    rowCount: context.sourceArtifact.rowCount ?? outputRows.length,
    crs: context.sourceArtifact.crs,
    crsProvenance: context.sourceArtifact.crsProvenance
      ? {
          ...context.sourceArtifact.crsProvenance,
          source: 'operation-inherited',
        }
      : undefined,
    warnings: [
      ...context.sourceArtifact.warnings.map((warning) => ({
        ...warning,
        scope: warning.scope === 'historical' ? 'historical' as const : 'inherited' as const,
      })),
      {
        id: `${artifactId}-attribute-join-v1-limited`,
        code: 'LIMITED_SUPPORT_ENVELOPE',
        severity: 'info',
        scope: 'historical',
        title: 'Narrow attribute join v1',
        message: 'This output was created by the narrow attribute-join-v1 path: exact-equality left join only, one key per side, explicit right-field selection, and first-match-only semantics on duplicate right-side keys.',
      },
    ],
    originEventId: eventId,
    inputArtifactIds: [context.sourceArtifact.id, context.secondaryArtifact.id],
    tableName,
    data: artifactData,
    tableRows,
  };

  const db = await getDuckDb();
  const conn = await db.connect();
  try {
    await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
    await db.registerFileText(`${tableName}.json`, JSON.stringify(tableRows));
    conn.insertJSONFromPath(`${tableName}.json`, { name: tableName });
  } finally {
    await conn.close();
  }

  const historyEvent: HistoryEvent = {
    id: eventId,
    type: 'operation',
    timestamp: new Date().toISOString(),
    summary: `Attribute join ${context.sourceArtifact.name} with ${context.secondaryArtifact.name} → ${artifact.name}`,
    inputArtifactIds: [context.sourceArtifact.id, context.secondaryArtifact.id],
    outputArtifactIds: [artifactId],
    warnings: artifact.warnings.map((warning) => ({ ...warning, scope: 'historical' as const })),
    details: {
      operation: 'attribute-join-v1',
      sourceArtifactId: context.sourceArtifact.id,
      sourceArtifactName: context.sourceArtifact.name,
      joinArtifactId: context.secondaryArtifact.id,
      joinArtifactName: context.secondaryArtifact.name,
      outputArtifactId: artifactId,
      outputArtifactName: artifact.name,
      outputKind: artifact.outputKind,
      outputStoredCrs: artifact.crs,
      outputCrsConfidence: artifact.crsProvenance?.confidence,
      outputCrsProvenance: artifact.crsProvenance?.source,
      joinMode: definition.joinContract.joinMode,
      joinPredicate: definition.joinContract.predicate,
      sourceJoinKey: context.sourceKey,
      joinArtifactKey: context.secondaryKey,
      selectedRightFields: context.selectedFields.map((field) => `${field.sourceField}→${field.outputField}`),
      collisionPolicy: definition.joinContract.collisionPolicy,
      unmatchedSourceRows: definition.joinContract.unmatchedSourceRows,
      matchedSecondaryRows: definition.joinContract.matchedSecondaryRows,
      outputGeometryMode: definition.joinContract.outputGeometryMode,
      outputAttributeSemantics: definition.outputContract.attributePolicy,
      outputRowCount: outputRows.length,
      sourceOutputKind: context.sourceArtifact.outputKind ?? (context.sourceArtifact.spatial ? 'spatial-artifact' : 'tabular-artifact'),
      joinArtifactOutputKind: context.secondaryArtifact.outputKind ?? (context.secondaryArtifact.spatial ? 'spatial-artifact' : 'tabular-artifact'),
      supportsSpatialPredicates: false,
      supportsFuzzyMatching: false,
      supportsMultiKey: false,
    },
  };

  return { artifact, historyEvent };
}
