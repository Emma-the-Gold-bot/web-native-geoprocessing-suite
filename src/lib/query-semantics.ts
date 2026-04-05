import type { Artifact, ArtifactOutputKind, CrsProvenance, QueryPreview, WarningRef } from '../types'

export type QueryProvenanceStrength = 'direct-artifact-match' | 'partial-artifact-match' | 'table-reference-only'

export interface QueryMaterializationSemantics {
  outputKind: ArtifactOutputKind
  outputKindLabel: string
  outputKindDescription: string
  provenanceStrength: QueryProvenanceStrength
  provenanceLabel: string
  provenanceMessage: string
}

export interface BuildQueryPreviewParams {
  id: string
  columns: string[]
  rows: Record<string, unknown>[]
  geometryColumn?: string
  referencedTables?: string[]
  sourceArtifacts?: Artifact[]
}

export interface BuildMaterializedQueryArtifactParams {
  eventId: string
  artifactId: string
  name: string
  tableName: string
  rows: Record<string, unknown>[]
  spatial: boolean
  geometryType?: string
  sourceArtifacts: Artifact[]
  data: unknown
  renderIssue?: string
}

export function getArtifactOutputKindLabel(outputKind: ArtifactOutputKind): string {
  switch (outputKind) {
    case 'measurement-table':
      return 'measurement table'
    case 'tabular-artifact':
      return 'tabular artifact'
    case 'spatial-artifact':
    default:
      return 'spatial artifact'
  }
}

export function getOutputKindDescription(outputKind: ArtifactOutputKind): string {
  switch (outputKind) {
    case 'measurement-table':
      return 'This output is intentionally tabular and non-spatial. It records measurements rather than derived geometry.'
    case 'tabular-artifact':
      return 'This output is a first-class non-spatial artifact: queryable, persistable, and exportable as row-based JSON without pretending to be geometry.'
    case 'spatial-artifact':
    default:
      return 'This output is a geometry-bearing derived artifact that can participate in map rendering when its geometry is renderable.'
  }
}

export function getQueryProvenanceStrength(
  referencedTableCount: number,
  matchedArtifactCount: number,
): QueryProvenanceStrength {
  if (matchedArtifactCount <= 0) return 'table-reference-only'
  if (matchedArtifactCount === referencedTableCount) return 'direct-artifact-match'
  return 'partial-artifact-match'
}

export function getQueryProvenanceStrengthPresentation(
  strength: QueryProvenanceStrength,
): { label: string; message: string } {
  switch (strength) {
    case 'direct-artifact-match':
      return {
        label: 'Direct artifact match',
        message: 'All referenced tables mapped directly to workspace artifacts.',
      }
    case 'partial-artifact-match':
      return {
        label: 'Partial artifact match',
        message: 'Some referenced tables mapped directly to workspace artifacts, but lineage remains partly conservative.',
      }
    case 'table-reference-only':
      return {
        label: 'Table reference only',
        message: 'Table references were detected, but artifact matching stayed conservative.',
      }
  }
}

export function getQueryResultOutputKind(params: { spatial: boolean }): ArtifactOutputKind {
  return params.spatial ? 'spatial-artifact' : 'tabular-artifact'
}

export function buildQueryMaterializationSemantics(params: {
  spatial: boolean
  referencedTableCount: number
  matchedArtifactCount: number
}): QueryMaterializationSemantics {
  const outputKind = getQueryResultOutputKind({ spatial: params.spatial })
  const provenanceStrength = getQueryProvenanceStrength(params.referencedTableCount, params.matchedArtifactCount)
  const provenance = getQueryProvenanceStrengthPresentation(provenanceStrength)

  return {
    outputKind,
    outputKindLabel: getArtifactOutputKindLabel(outputKind),
    outputKindDescription: getOutputKindDescription(outputKind),
    provenanceStrength,
    provenanceLabel: provenance.label,
    provenanceMessage: provenance.message,
  }
}

export function buildQueryPreview(params: BuildQueryPreviewParams): QueryPreview {
  const sourceArtifacts = params.sourceArtifacts ?? []
  const referencedTables = params.referencedTables ?? []
  const semantics = buildQueryMaterializationSemantics({
    spatial: Boolean(params.geometryColumn),
    referencedTableCount: referencedTables.length,
    matchedArtifactCount: sourceArtifacts.length,
  })

  return {
    id: params.id,
    columns: params.columns,
    rows: params.rows,
    spatial: Boolean(params.geometryColumn),
    geometryColumn: params.geometryColumn,
    sourceTableName: referencedTables.join(', '),
    sourceArtifactIds: sourceArtifacts.map((artifact) => artifact.id),
    referencedTables,
    materialization: semantics,
  }
}

export function buildMaterializedQueryWarnings(sourceArtifacts: Artifact[]): WarningRef[] {
  const inheritedWarnings = sourceArtifacts.flatMap((artifact) =>
    artifact.warnings.map((warning) => ({
      ...warning,
      scope: warning.scope === 'historical' ? 'historical' : 'inherited',
    } satisfies WarningRef)),
  )

  return Array.from(new Map(inheritedWarnings.map((warning) => [warning.id, warning])).values())
}

export function buildMaterializedQueryCrsProvenance(
  sourceArtifact: Artifact | undefined,
  outputCrs?: string,
): CrsProvenance {
  if (!sourceArtifact) {
    return {
      confidence: 'unknown',
      source: 'operation-inherited',
      warnings: ['No source artifact - CRS unknown.'],
    }
  }

  const sourceProvenance = sourceArtifact.crsProvenance
  const sourceCrs = outputCrs ?? sourceArtifact.crs

  if (!sourceCrs || sourceCrs === 'unknown') {
    return {
      confidence: 'unknown',
      source: 'operation-inherited',
      warnings: ['Source artifact has unknown CRS. Output inherits unknown CRS.'],
    }
  }

  return {
    confidence: sourceProvenance?.confidence ?? 'known',
    declaredCrs: sourceCrs,
    source: 'operation-inherited',
    warnings: sourceProvenance?.warnings ?? [],
  }
}

export function buildMaterializedQueryArtifact(params: BuildMaterializedQueryArtifactParams): Artifact {
  const warnings = buildMaterializedQueryWarnings(params.sourceArtifacts)
  const outputKind = getQueryResultOutputKind({ spatial: params.spatial })

  return {
    id: params.artifactId,
    name: params.name,
    kind: 'derived',
    outputKind,
    format: 'Derived from query',
    spatial: params.spatial,
    geometryType: params.geometryType,
    rowCount: params.rows.length,
    crs: params.sourceArtifacts[0]?.crs,
    crsProvenance: buildMaterializedQueryCrsProvenance(params.sourceArtifacts[0], params.sourceArtifacts[0]?.crs),
    warnings,
    originEventId: params.eventId,
    inputArtifactIds: params.sourceArtifacts.map((artifact) => artifact.id),
    tableName: params.tableName,
    data: params.data,
    tableRows: params.rows,
    renderIssue: params.renderIssue,
  }
}
