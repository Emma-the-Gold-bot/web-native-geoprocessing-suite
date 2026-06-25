export type ArtifactKind = 'source' | 'derived'
export type ArtifactOutputKind = 'spatial-artifact' | 'measurement-table' | 'tabular-artifact'
export type EventType = 'import' | 'query' | 'operation'
export type WarningSeverity = 'info' | 'caution' | 'serious' | 'blocking'

export type WarningScope = 'active' | 'inherited' | 'historical'

export interface WarningRef {
  id: string
  severity: WarningSeverity
  title: string
  message: string
  scope?: WarningScope
  /** Warning code from typed taxonomy - canonical warning identity */
  code: string
}

export type CrsConfidence = 'known' | 'unknown' | 'missing'

/**
 * CRS provenance tracking - explicit source and transformation history
 */
export interface CrsProvenance {
  /** Confidence level of the CRS metadata */
  confidence: CrsConfidence
  /** The declared/assigned CRS code (e.g., EPSG:4326, EPSG:3857) */
  declaredCrs?: string
  /** How the CRS was determined */
  source: 'import-metadata' | 'user-assigned' | 'auto-detected' | 'operation-inherited' | 'operation-derived' | 'display-transform'
  /** If display-transform was used, record the transformation */
  displayTransform?: {
    /** The CRS used for map display (typically WGS84) */
    displayCrs: string
    /** Original artifact CRS that was transformed */
    sourceCrs: string
    /** Whether transformation was successful */
    success: boolean
    /** Why fallback occurred when success=false */
    fallbackReason?: 'runtime_unavailable' | 'transform_failed'
  }
  /** Any warnings specific to CRS determination */
  warnings: string[]
}

export interface Artifact {
  id: string
  name: string
  kind: ArtifactKind
  outputKind?: ArtifactOutputKind
  format: string
  spatial: boolean
  geometryType?: string
  rowCount?: number
  /** @deprecated Use crsProvenance for explicit CRS tracking */
  crs?: string | 'unknown'
  /** Explicit CRS provenance - tracks CRS truth through the artifact lifecycle */
  crsProvenance?: CrsProvenance
  /** The CRS used for map display/fitting (may differ from stored if transformed) */
  displayCrs?: string
  warnings: WarningRef[]
  originEventId: string
  inputArtifactIds?: string[]
  tableName?: string
  data?: unknown
  tableRows?: Record<string, unknown>[]
  renderIssue?: string
}

export interface HistoryEvent {
  id: string
  type: EventType
  timestamp: string
  summary: string
  inputArtifactIds: string[]
  outputArtifactIds: string[]
  warnings: WarningRef[]
  details: Record<string, unknown>
}

export type QueryProvenanceStrength = 'direct-artifact-match' | 'partial-artifact-match' | 'table-reference-only'

export interface QueryMaterializationSemantics {
  outputKind: ArtifactOutputKind
  outputKindLabel: string
  outputKindDescription: string
  provenanceStrength: QueryProvenanceStrength
  provenanceLabel: string
  provenanceMessage: string
}

export interface QueryPreview {
  id: string
  columns: string[]
  rows: Record<string, unknown>[]
  spatial: boolean
  geometryColumn?: string
  sourceTableName?: string
  sourceArtifactIds?: string[]
  referencedTables?: string[]
  materializedArtifactId?: string
  materialization?: QueryMaterializationSemantics
}

// Saved SQL query for project persistence
export interface SavedQuery {
  id: string
  name: string
  sql: string
  createdAt: string
  lastRunAt?: string
}

// Serializable project model (excludes runtime-only data)
export interface ProjectState {
  version: string
  name: string
  artifacts: Artifact[]
  history: HistoryEvent[]
  savedQueries: SavedQuery[]
  selectedArtifactId: string | null
  activeTab: 'table' | 'sql' | 'results'
  savedAt: string
}

// Discovery types
export interface BBox {
  west: number
  south: number
  east: number
  north: number
}
