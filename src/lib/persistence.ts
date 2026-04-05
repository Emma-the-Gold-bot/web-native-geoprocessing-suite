import type { Artifact, HistoryEvent, ProjectState, SavedQuery } from '../types'
import { makeId } from './utils'
import { isFeatureCollection } from './utils'
import { getDuckDb } from './duckdb'

const PROJECT_STORAGE_KEY = 'geoprocessing_project'

// Get serializable artifact data
// Includes artifact data (GeoJSON FeatureCollection) for persistence
// On reload, we'll re-register these tables in DuckDB
const getSerializableArtifact = (artifact: Artifact): Artifact => {
  return {
    id: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    outputKind: artifact.outputKind,
    format: artifact.format,
    spatial: artifact.spatial,
    geometryType: artifact.geometryType,
    rowCount: artifact.rowCount,
    crs: artifact.crs,
    crsProvenance: artifact.crsProvenance,
    displayCrs: artifact.displayCrs,
    warnings: artifact.warnings,
    originEventId: artifact.originEventId,
    inputArtifactIds: artifact.inputArtifactIds,
    tableName: artifact.tableName,
    tableRows: artifact.tableRows,
    // Include data for persistence - needed to restore usable workspace
    // This allows reopened projects to render on the map without re-import
    data: artifact.data,
    renderIssue: artifact.renderIssue,
  }
}

// Re-register an artifact's table in DuckDB from persisted data
const reRegisterArtifactTable = async (artifact: Artifact): Promise<void> => {
  if (!artifact.tableName) return

  let rows: Record<string, unknown>[] | null = null

  if (artifact.tableRows?.length) {
    rows = artifact.tableRows
  } else if (Array.isArray(artifact.data)) {
    rows = artifact.data as Record<string, unknown>[]
  } else if (isFeatureCollection(artifact.data)) {
    const featureCollection = artifact.data as GeoJSON.FeatureCollection
    rows = featureCollection.features.map((feature, featureIndex) => ({
      feature_index: featureIndex,
      ...(feature.properties ?? {}),
      geometry: JSON.stringify(feature.geometry),
    }))
  }

  if (!rows) {
    console.warn(`Cannot re-register table ${artifact.tableName}: no table or feature data available`)
    return
  }
  
  try {
    const db = await getDuckDb()
    const conn = await db.connect()
    try {
      await db.registerFileText(`${artifact.tableName}.json`, JSON.stringify(rows))
      await conn.query(`DROP TABLE IF EXISTS ${artifact.tableName}`)
      conn.insertJSONFromPath(`${artifact.tableName}.json`, { name: artifact.tableName })
      console.log(`Re-registered table: ${artifact.tableName}`)
    } finally {
      await conn.close()
    }
  } catch (error) {
    console.error(`Failed to re-register table ${artifact.tableName}:`, error)
    throw error
  }
}

// Re-register all artifact tables in DuckDB (call after loading a project)
export const reRegisterAllArtifactTables = async (artifacts: Artifact[]): Promise<void> => {
  for (const artifact of artifacts) {
    if (artifact.tableName) {
      await reRegisterArtifactTable(artifact)
    }
  }
}

// Serialize current project state
export const serializeProject = (
  projectName: string,
  artifacts: Artifact[],
  history: HistoryEvent[],
  savedQueries: SavedQuery[],
  selectedArtifactId: string | null,
  activeTab: 'table' | 'sql' | 'results',
): string => {
  const projectState: ProjectState = {
    version: '1.0',
    name: projectName,
    artifacts: artifacts.map(getSerializableArtifact),
    history,
    savedQueries,
    selectedArtifactId,
    activeTab,
    savedAt: new Date().toISOString(),
  }
  return JSON.stringify(projectState)
}

// Save project to localStorage
export const saveProject = (
  projectName: string,
  artifacts: Artifact[],
  history: HistoryEvent[],
  savedQueries: SavedQuery[],
  selectedArtifactId: string | null,
  activeTab: 'table' | 'sql' | 'results',
): void => {
  const serialized = serializeProject(
    projectName,
    artifacts,
    history,
    savedQueries,
    selectedArtifactId,
    activeTab,
  )
  localStorage.setItem(PROJECT_STORAGE_KEY, serialized)
}

// Check if a saved project exists
export const hasSavedProject = (): boolean => {
  return localStorage.getItem(PROJECT_STORAGE_KEY) !== null
}

// Load project from localStorage
export const loadProject = (): ProjectState | null => {
  const stored = localStorage.getItem(PROJECT_STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored) as ProjectState
    // Basic validation
    if (!parsed.version || !parsed.artifacts || !parsed.history) {
      console.warn('Loaded project has invalid structure')
      return null
    }
    return parsed
  } catch (error) {
    console.error('Failed to parse saved project:', error)
    return null
  }
}

// Clear saved project
export const clearSavedProject = (): void => {
  localStorage.removeItem(PROJECT_STORAGE_KEY)
}

// Create a new saved query
export const createSavedQuery = (name: string, sql: string): SavedQuery => {
  return {
    id: makeId('query'),
    name,
    sql,
    createdAt: new Date().toISOString(),
  }
}

// Update last run timestamp for a saved query
export const updateQueryRunTime = (queries: SavedQuery[], queryId: string): SavedQuery[] => {
  return queries.map((q) =>
    q.id === queryId ? { ...q, lastRunAt: new Date().toISOString() } : q,
  )
}
