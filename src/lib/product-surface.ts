import type { Artifact, HistoryEvent, QueryPreview, SavedQuery, WarningRef } from '../types'
import { formatCount } from './utils'
import { getQueryProvenanceStrengthPresentation } from './query-semantics'

export function getSuggestedQueryArtifactName(artifacts: Artifact[]): string {
  return `query_result_${artifacts.filter((artifact) => artifact.kind === 'derived').length + 1}`
}

export function getQueryRunStatusMessage(params: {
  rowCount: number
  matchedArtifactCount: number
  referencedTableCount: number
}): string {
  return `Query produced ${formatCount(params.rowCount, 'row')} from ${formatCount(params.matchedArtifactCount || params.referencedTableCount || 0, 'table reference')}`
}

export function getQueryRenderIssue(queryPreview: QueryPreview, spatial: boolean): string | undefined {
  if (queryPreview.geometryColumn && !spatial) {
    return `Query result includes geometry-like column \`${queryPreview.geometryColumn}\`, but it could not be rendered on the map.`
  }
  return undefined
}

export function buildQueryHistoryEvent(params: {
  eventId: string
  sql: string
  queryPreview: QueryPreview
  sourceArtifacts: Artifact[]
  artifact: Artifact
  artifactId: string
}): HistoryEvent {
  const { eventId, sql, queryPreview, sourceArtifacts, artifact, artifactId } = params
  const eventWarnings = artifact.warnings.map((warning) => ({ ...warning, scope: 'historical' as const }))

  return {
    id: eventId,
    type: 'query',
    timestamp: new Date().toISOString(),
    summary: `Materialized query result → created ${artifact.name}`,
    inputArtifactIds: sourceArtifacts.map((artifact) => artifact.id),
    outputArtifactIds: [artifactId],
    warnings: eventWarnings,
    details: {
      sql,
      rowCount: queryPreview.rows.length,
      sourceTableName: queryPreview.sourceTableName,
      referencedTables: queryPreview.referencedTables,
      sourceArtifactIds: queryPreview.sourceArtifactIds,
      sourceArtifactNames: sourceArtifacts.map((artifact) => artifact.name),
      sourceArtifactCount: sourceArtifacts.length,
      referencedTableCount: queryPreview.referencedTables?.length ?? 0,
      provenanceStrength: queryPreview.materialization?.provenanceStrength,
      outputKindDescription: queryPreview.materialization?.outputKindDescription,
      geometryColumn: queryPreview.geometryColumn,
      outputArtifactId: artifactId,
      outputArtifactName: artifact.name,
      outputKind: artifact.outputKind,
      outputStoredCrs: artifact.crs,
      outputCrsConfidence: artifact.crsProvenance?.confidence,
      outputCrsProvenance: artifact.crsProvenance?.source,
      outputWarningCodes: artifact.warnings.map((warning) => warning.code),
    },
  }
}

export function getExportSuccessStatusMessage(artifact: Artifact, format: 'GeoJSON' | 'JSON'): string {
  return `Exported ${artifact.name} to ${format}`
}

export function getExportFailureStatusMessage(kind: 'missing-selection' | 'geojson' | 'json'): string {
  switch (kind) {
    case 'missing-selection':
      return 'Select an artifact to export'
    case 'geojson':
      return 'Export failed: artifact is not spatial'
    case 'json':
    default:
      return 'Export failed: artifact has no exportable row data'
  }
}

export function renderHistoryDetailRows(details: Record<string, unknown>) {
  const hiddenKeys = new Set(['sql'])

  return Object.entries(details)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const label = key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/^./, (s) => s.toUpperCase())

      let renderedValue = Array.isArray(value)
        ? value.join(', ')
        : typeof value === 'boolean'
          ? (value ? 'yes' : 'no')
          : String(value)

      if (key === 'provenanceStrength' && typeof value === 'string') {
        const presentation = getQueryProvenanceStrengthPresentation(value as 'direct-artifact-match' | 'partial-artifact-match' | 'table-reference-only')
        renderedValue = `${presentation.label} — ${presentation.message}`
      }

      return { key, label, renderedValue }
    })
}

export function getHistoryDetailGroups(details: Record<string, unknown>) {
  const rows = renderHistoryDetailRows(details)
  const groups = [
    {
      title: 'Inputs',
      keys: new Set([
        'sourceArtifactId', 'sourceArtifactName', 'sourceArtifactIds', 'sourceArtifactNames',
        'maskArtifactId', 'maskArtifactName', 'overlayArtifactId', 'overlayArtifactName', 'inputArtifactIds', 'inputStoredCrs', 'inputCRS',
        'sourceStoredCrs', 'maskStoredCrs', 'overlayStoredCrs', 'sourceTableName', 'referencedTables',
      ]),
    },
    {
      title: 'Outputs',
      keys: new Set([
        'outputArtifactId', 'outputArtifactName', 'outputKind', 'outputStoredCrs', 'rowCount', 'geometryColumn', 'wasEmpty',
      ]),
    },
    {
      title: 'CRS truth',
      keys: new Set([
        'sourceCrs', 'maskCrs', 'sourceCrs', 'targetCrs', 'outputCrsConfidence', 'outputCrsProvenance',
        'explicitOutputCrsProduced', 'contractRequiresMatchingStoredCrs',
      ]),
    },
    {
      title: 'Provenance interpretation',
      keys: new Set([
        'operation', 'provenanceStrength', 'contractRequiresPolygonalInputs', 'sourceArtifactCount', 'referencedTableCount',
      ]),
    },
    {
      title: 'Warning lineage',
      keys: new Set(['inputWarningCodes', 'outputWarningCodes']),
    },
  ]

  const grouped = groups
    .map((group) => ({
      title: group.title,
      rows: rows.filter((row) => group.keys.has(row.key)),
    }))
    .filter((group) => group.rows.length > 0)

  const usedKeys = new Set(grouped.flatMap((group) => group.rows.map((row) => row.key)))
  const remaining = rows.filter((row) => !usedKeys.has(row.key))
  if (remaining.length > 0) {
    grouped.push({ title: 'Additional details', rows: remaining })
  }

  return grouped
}

export function getWarningScope(warning: WarningRef) {
  return warning.scope ?? 'active'
}

export function getWarningScopeLabel(warning: WarningRef) {
  const scope = warning.scope ?? 'active'
  if (scope === 'inherited') return 'inherited from input'
  if (scope === 'historical') return 'recorded in history'
  return 'active on artifact'
}

export function isInfoNote(warning: WarningRef) {
  return warning.severity === 'info'
}

export function isWarning(warning: WarningRef) {
  return warning.severity !== 'info'
}

export function getWarningRecoveryHint(warning: WarningRef) {
  if (warning.severity === 'blocking') return 'Resolve this issue before import or query materialization can continue.'
  if (warning.scope === 'inherited' && isInfoNote(warning)) return 'This note was carried forward from an input artifact. Inspect the source artifact if you need the original context.'
  if (warning.scope === 'inherited') return 'This warning was carried forward from an input artifact. The derived artifact may still be usable, but the underlying source condition has not been repaired here.'
  if (warning.scope === 'historical' && isInfoNote(warning)) return 'This note is retained in history for provenance. It describes how the artifact got here, not necessarily a current condition.'
  if (warning.scope === 'historical') return 'This warning is retained in history for provenance. It may explain lineage without describing an active condition on the current artifact.'
  if (warning.severity === 'serious') return 'Proceed carefully. The artifact may still be usable, but this condition materially affects how much trust to place in it.'
  if (warning.severity === 'caution') return 'Review the consequence before relying on this artifact for downstream work.'
  return 'No immediate action required.'
}

export function getSeverityLabel(warning: WarningRef) {
  if (warning.severity === 'info') return 'info'
  return warning.severity
}

export function getCurrentNotes(warnings: WarningRef[]) {
  return warnings.filter((warning) => isInfoNote(warning) && getWarningScope(warning) !== 'historical')
}

export function getProvenanceNotes(warnings: WarningRef[]) {
  return warnings.filter((warning) => isInfoNote(warning) && getWarningScope(warning) === 'historical')
}

export function getActiveWarnings(warnings: WarningRef[]) {
  return warnings.filter(isWarning)
}

export function getLoadedQueryStatusMessage(query: SavedQuery): string {
  return `Loaded query "${query.name}"`
}

export function getDeletedQueryStatusMessage(): string {
  return 'Query deleted'
}
