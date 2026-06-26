import type { Dispatch, SetStateAction, ChangeEvent } from 'react'
import type { Artifact, HistoryEvent, SavedQuery, WarningRef } from '../types'
import type { CrsProvenance } from '../types'
import { sampleGeoJson } from '../lib/sampleData'
import { getDuckDb } from '../lib/duckdb'
import { inferGeometryType, isFeatureCollection, makeId } from '../lib/utils'
import { rowsToFeatureCollection } from '../lib/wkb'
import { saveProject, loadProject, reRegisterAllArtifactTables } from '../lib/persistence'
import { exportToGeoJson, exportToJson, triggerDownload } from '../lib/export'
import { getExportFailureStatusMessage, getExportSuccessStatusMessage } from '../lib/product-surface'

type BottomTab = 'table' | 'sql' | 'results'
type ImportStage = 'idle' | 'scanning' | 'review' | 'importing'

interface Toast {
  id: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
  dismissible: boolean
}

export interface ImportReviewState {
  fileName: string
  format: string
  supportLevel: 'first-class' | 'compatibility' | 'partial' | 'unsupported'
  rowCount?: number
  geometryType?: string
  spatial: boolean
  crs?: string | 'unknown'
  warnings: WarningRef[]
  data: unknown
  previewRows?: Record<string, unknown>[]
  previewColumns?: string[]
  tableName?: string
}

// Helper to fetch full geometry from a DuckDB table for map rendering
export const fetchFullGeometryFromTable = async (
  tableName: string,
  geometryColumn: string,
): Promise<{ featureCollection: GeoJSON.FeatureCollection | null; geometryType: string | undefined } | null> => {
  try {
    const db = await getDuckDb()
    const conn = await db.connect()
    try {
      const result = await conn.query(`SELECT * FROM ${tableName}`)
      const rows = result.toArray().map((row) => row.toJSON() as Record<string, unknown>)

      if (rows.length === 0) {
        return null
      }

      const featureCollection = rowsToFeatureCollection(rows, geometryColumn)
      if (!featureCollection) {
        return null
      }

      const inferredGeometryType = inferGeometryType(featureCollection)
      return { featureCollection, geometryType: inferredGeometryType }
    } finally {
      await conn.close()
    }
  } catch (error) {
    console.error('Failed to fetch full geometry from table:', error)
    return null
  }
}

/**
 * Extract CRS string from a GeoJSON FeatureCollection if declared
 */
function extractCrsFromFeatureCollection(fc: Record<string, unknown>): string | undefined {
  const crs = fc.crs as Record<string, unknown> | undefined
  if (!crs) return undefined
  if (crs.type !== 'name') return undefined
  const properties = crs.properties as Record<string, unknown> | undefined
  const name = properties?.name as string | undefined
  return name || undefined
}

/**
 * Build CRS provenance for imported artifacts
 */
function buildImportCrsProvenance(declaredCrs?: string): CrsProvenance {
  if (declaredCrs && declaredCrs !== 'unknown') {
    return {
      confidence: 'known',
      declaredCrs,
      source: 'import-metadata',
      warnings: [],
    }
  }
  return {
    confidence: 'unknown',
    source: 'import-metadata',
    warnings: ['CRS not explicitly declared in import. Coordinates are interpreted as WGS84 unless verified.'],
  }
}

interface UseImportExportParams {
  projectName: string
  setProjectName: (name: string) => void
  artifacts: Artifact[]
  setArtifacts: Dispatch<SetStateAction<Artifact[]>>
  history: HistoryEvent[]
  setHistory: Dispatch<SetStateAction<HistoryEvent[]>>
  savedQueries: SavedQuery[]
  setSavedQueries: Dispatch<SetStateAction<SavedQuery[]>>
  selectedArtifactId: string | null
  setSelectedArtifactId: (id: string | null) => void
  bottomTab: BottomTab
  setBottomTab: (tab: BottomTab) => void
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (v: boolean) => void
  showSaveDialog: boolean
  setShowSaveDialog: (v: boolean) => void
  showExportMenu: boolean
  setShowExportMenu: (v: boolean) => void
  queryHasRunSuccessfully: boolean
  setQueryHasRunSuccessfully: (v: boolean) => void
  setStatusMessage: (msg: string) => void
  addToast: (message: string, type?: Toast['type']) => void
  importReview: ImportReviewState | null
  setImportReview: Dispatch<SetStateAction<ImportReviewState | null>>
  importStage: ImportStage
  setImportStage: Dispatch<SetStateAction<ImportStage>>
  importing: boolean
  setImporting: (v: boolean) => void
  selectedArtifact: Artifact | null
  pushArtifactSnapshot: (label: string) => void
}

export function useImportExport(params: UseImportExportParams) {
  const {
    projectName, setProjectName,
    artifacts, setArtifacts,
    history, setHistory,
    savedQueries, setSavedQueries,
    selectedArtifactId, setSelectedArtifactId,
    bottomTab, setBottomTab,
    hasUnsavedChanges, setHasUnsavedChanges,
    showSaveDialog, setShowSaveDialog,
    showExportMenu, setShowExportMenu,
    queryHasRunSuccessfully, setQueryHasRunSuccessfully,
    setStatusMessage, addToast,
    importReview, setImportReview,
    importStage, setImportStage,
    importing, setImporting,
    selectedArtifact,
    pushArtifactSnapshot,
  } = params

  const saveProjectFn = () => {
    saveProject(
      projectName,
      artifacts,
      history,
      savedQueries,
      selectedArtifactId,
      bottomTab,
    )
    setHasUnsavedChanges(false)
    setShowSaveDialog(false)
    setStatusMessage(`Project "${projectName}" saved successfully`)
    addToast(`Project "${projectName}" saved successfully`, 'success')
  }

  const openProject = async () => {
    const loaded = loadProject()
    if (!loaded) {
      setStatusMessage('No saved project found')
      addToast('No saved project found', 'warning')
      return
    }

    setProjectName(loaded.name)
    setSavedQueries(loaded.savedQueries || [])
    setSelectedArtifactId(loaded.selectedArtifactId)
    setBottomTab(loaded.activeTab || 'table')

    try {
      await reRegisterAllArtifactTables(loaded.artifacts)
    } catch (error) {
      console.error('Error re-registering tables:', error)
    }

    setArtifacts(loaded.artifacts)
    setHistory(loaded.history || [])
    setHasUnsavedChanges(false)
    setQueryHasRunSuccessfully(false)
    setStatusMessage(`Project "${loaded.name}" loaded successfully`)
    addToast(`Project "${loaded.name}" loaded successfully`, 'success')
  }

  const newProject = () => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Create new project anyway?')) {
        return
      }
    }
    setProjectName('Untitled Project')
    setArtifacts([])
    setHistory([])
    setSavedQueries([])
    setSelectedArtifactId(null)
    setBottomTab('table')
    setHasUnsavedChanges(false)
    setQueryHasRunSuccessfully(false)
    setStatusMessage('New project created')
    addToast('New project created', 'success')
  }

  const exportGeoJson = () => {
    if (!selectedArtifact) {
      setStatusMessage(getExportFailureStatusMessage('missing-selection'))
      addToast(getExportFailureStatusMessage('missing-selection'), 'error')
      return
    }
    const result = exportToGeoJson(selectedArtifact)
    if (result) {
      triggerDownload(result.blob, result.filename)
      setStatusMessage(getExportSuccessStatusMessage(selectedArtifact, 'GeoJSON'))
      addToast(getExportSuccessStatusMessage(selectedArtifact, 'GeoJSON'), 'success')
    } else {
      setStatusMessage(getExportFailureStatusMessage('geojson'))
      addToast(getExportFailureStatusMessage('geojson'), 'error')
    }
    setShowExportMenu(false)
  }

  const exportJSON = async () => {
    if (!selectedArtifact) {
      setStatusMessage(getExportFailureStatusMessage('missing-selection'))
      addToast(getExportFailureStatusMessage('missing-selection'), 'error')
      return
    }
    const result = await exportToJson(selectedArtifact)
    if (result) {
      triggerDownload(result.blob, result.filename)
      setStatusMessage(getExportSuccessStatusMessage(selectedArtifact, 'JSON'))
      addToast(getExportSuccessStatusMessage(selectedArtifact, 'JSON'), 'success')
    } else {
      setStatusMessage(getExportFailureStatusMessage('json'))
      addToast(getExportFailureStatusMessage('json'), 'error')
    }
    setShowExportMenu(false)
  }

  const loadSample = () => {
    setImportStage('review')
    const declaredCrs = extractCrsFromFeatureCollection(sampleGeoJson as unknown as Record<string, unknown>)
    const warnings: WarningRef[] = []
    if (!declaredCrs) {
      warnings.push({
        id: makeId('warning'),
        code: 'CRS_UNKNOWN',
        severity: 'caution',
        scope: 'active',
        title: 'No CRS metadata found',
        message: 'Sample GeoJSON does not carry explicit CRS metadata. Coordinates are currently interpreted as WGS84.',
      })
    }

    setImportReview({
      fileName: 'sample-parcels.geojson',
      format: 'GeoJSON',
      supportLevel: 'first-class',
      rowCount: sampleGeoJson.features.length,
      geometryType: inferGeometryType(sampleGeoJson),
      spatial: true,
      crs: declaredCrs ?? 'unknown',
      warnings,
      data: sampleGeoJson,
    })
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportStage('scanning')
    const lowerName = file.name.toLowerCase()

    if (lowerName.endsWith('.parquet') || lowerName.endsWith('.geoparquet')) {
      const warnings: WarningRef[] = [
        {
          id: makeId('warning'),
          code: 'GEOMETRY_DECODE_FAILED',
          severity: 'caution',
          scope: 'active',
          title: 'GeoParquet import',
          message: 'This GeoParquet import supports schema preview, DuckDB registration, SQL queries, and table inspection. Map preview is shown when geometry can be decoded from the file.',
        },
      ]

      try {
        const buffer = new Uint8Array(await file.arrayBuffer())
        const db = await getDuckDb()
        const conn = await db.connect()
        const tempFileName = `preflight_${makeId('gpq')}.parquet`
        try {
          await db.registerFileBuffer(tempFileName, buffer)
          const preview = await conn.query(`SELECT * FROM read_parquet('${tempFileName}') LIMIT 25`)
          const count = await conn.query(`SELECT COUNT(*) AS row_count FROM read_parquet('${tempFileName}')`)
          const previewRows = preview.toArray().map((row) => row.toJSON() as Record<string, unknown>)
          const rowCount = Number(count.toArray()[0]?.toJSON()?.row_count ?? previewRows.length)
          const previewColumns = preview.schema.fields.map((field) => field.name)
          const geometryColumn = previewColumns.find((name) => /geometry|geom|wkb/i.test(name))
          const previewFeatureCollection = geometryColumn
            ? rowsToFeatureCollection(previewRows, geometryColumn)
            : null
          if (geometryColumn && previewFeatureCollection) {
            warnings.push({
              id: makeId('warning'),
              code: 'GEOMETRY_DECODE_FAILED',
              severity: 'info',
              scope: 'historical',
              title: 'Geometry preview available',
              message: `A geometry preview was detected from \`${geometryColumn}\` and can be shown on the map during import review.`,
            })
          } else if (geometryColumn) {
            warnings.push({
              id: makeId('warning'),
              code: 'GEOMETRY_DECODE_FAILED',
              severity: 'caution',
              scope: 'active',
              title: 'Geometry column detected but preview unavailable',
              message: `A likely geometry column was detected (\`${geometryColumn}\`), but its preview could not be shown on the map from the current file contents.`,
            })
          }

          setImportReview({
            fileName: file.name,
            format: 'GeoParquet',
            supportLevel: 'first-class',
            rowCount,
            geometryType: previewFeatureCollection ? inferGeometryType(previewFeatureCollection) ?? 'geometry preview available' : geometryColumn ? 'geometry column present' : 'tabular preview only',
            spatial: Boolean(previewFeatureCollection),
            crs: 'unknown',
            warnings,
            data: previewFeatureCollection ?? buffer,
            previewRows,
            previewColumns,
            tableName: geometryColumn,
          })
          setImportStage('review')
        } finally {
          await conn.close()
        }
      } catch (error) {
        setImportReview({
          fileName: file.name,
          format: 'GeoParquet',
          supportLevel: 'partial',
          spatial: false,
          warnings: [
            {
              id: makeId('warning'),
              code: 'GEOMETRY_DECODE_FAILED',
              severity: 'blocking',
              scope: 'active',
              title: 'GeoParquet preflight failed',
              message: error instanceof Error ? error.message : 'Unknown GeoParquet preflight error',
            },
          ],
          data: null,
        })
        setImportStage('review')
      }
      return
    }

    const text = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setImportReview({
        fileName: file.name,
        format: 'Unknown',
        supportLevel: 'unsupported',
        spatial: false,
        warnings: [
          {
            id: makeId('warning'),
            code: 'GEOMETRY_DECODE_FAILED',
            severity: 'blocking',
            scope: 'active',
            title: 'Could not parse file',
            message: 'The selected file is not valid JSON. This import flow supports GeoJSON and basic GeoParquet files.',
          },
        ],
        data: null,
      })
      setImportStage('review')
      return
    }

    const warnings: WarningRef[] = []
    const spatial = isFeatureCollection(parsed)
    const parsedFeatureCollection: GeoJSON.FeatureCollection | null = spatial
      ? (parsed as GeoJSON.FeatureCollection)
      : null
    const declaredCrs = spatial
      ? extractCrsFromFeatureCollection(parsed as unknown as Record<string, unknown>)
      : undefined
    if (!spatial) {
      warnings.push({
        id: makeId('warning'),
        code: 'GEOMETRY_DECODE_FAILED',
        severity: 'blocking',
        scope: 'active',
        title: 'Unsupported structure',
        message: 'This JSON import flow currently accepts GeoJSON FeatureCollection files.',
      })
    } else if (!declaredCrs) {
      warnings.push({
        id: makeId('warning'),
        code: 'CRS_UNKNOWN',
        severity: 'caution',
        scope: 'active',
        title: 'No CRS metadata found',
        message: 'GeoJSON rarely carries CRS metadata. Coordinates are currently interpreted as WGS84 unless you verify otherwise.',
      })
    }

    setImportReview({
      fileName: file.name,
      format: spatial ? 'GeoJSON' : 'Unknown',
      supportLevel: spatial ? 'first-class' : 'unsupported',
      rowCount: parsedFeatureCollection ? parsedFeatureCollection.features.length : undefined,
      geometryType: parsedFeatureCollection ? inferGeometryType(parsedFeatureCollection) : undefined,
      spatial,
      crs: spatial ? (declaredCrs ?? 'unknown') : undefined,
      warnings,
      data: parsedFeatureCollection,
    })
    setImportStage('review')
  }

  const confirmImport = (discoveryOverride?: {
    featureCollection: GeoJSON.FeatureCollection
    name: string
    format: string
    crs: string
    source?: string
    trace?: string[]
    onClose?: () => void
  }) => {
    if (!discoveryOverride && (!importReview || !importReview.data || importReview.supportLevel === 'unsupported')) return
    if (discoveryOverride && !isFeatureCollection(discoveryOverride.featureCollection)) return

    setImporting(true)
    setImportStage('importing')

    const eventId = makeId('event')
    const artifactId = makeId('artifact')

    const artifactName = discoveryOverride
      ? discoveryOverride.name
      : importReview!.fileName.replace(/\.[^.]+$/, '')
    const importFormat = discoveryOverride ? discoveryOverride.format : importReview!.format
    const importData = discoveryOverride ? discoveryOverride.featureCollection : importReview!.data
    const importCrs = discoveryOverride ? discoveryOverride.crs : importReview!.crs
    const importSpatial = true
    const importGeometryType = discoveryOverride
      ? inferGeometryType(discoveryOverride.featureCollection)
      : importReview!.geometryType
    const importRowCount = discoveryOverride
      ? discoveryOverride.featureCollection.features.length
      : importReview!.rowCount

    const tableName = artifactName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'dataset'
    const crsProvenance = buildImportCrsProvenance(importCrs === 'unknown' ? undefined : importCrs)

    const importWarnings: WarningRef[] = discoveryOverride
      ? [
          ...(discoveryOverride.trace?.length
            ? [{
                id: makeId('warning'),
                code: 'DISCOVERY_PROVENANCE',
                severity: 'info' as const,
                scope: 'historical' as const,
                title: 'Discovery provenance',
                message: discoveryOverride.trace.join('; '),
              }]
            : []),
        ]
      : importReview!.warnings

    const artifact: Artifact = {
      id: artifactId,
      name: artifactName,
      kind: 'source',
      outputKind: discoveryOverride ? 'spatial-artifact' : (importReview!.spatial ? 'spatial-artifact' : 'tabular-artifact'),
      format: importFormat,
      spatial: discoveryOverride ? true : importReview!.spatial,
      geometryType: importGeometryType,
      rowCount: importRowCount,
      crs: importCrs,
      crsProvenance,
      warnings: importWarnings,
      originEventId: eventId,
      tableName,
      data: importData,
      tableRows: discoveryOverride ? undefined : importReview!.previewRows,
    }

    const historyEventWarnings = importWarnings.map((warning) => ({ ...warning, scope: 'historical' as const }))

    const historyEvent: HistoryEvent = {
      id: eventId,
      type: 'import',
      timestamp: new Date().toISOString(),
      summary: discoveryOverride
        ? `Imported ${artifact.name} from ${discoveryOverride.source ?? 'discovery'}`
        : `Imported ${artifact.name} from ${importFormat}`,
      inputArtifactIds: [],
      outputArtifactIds: [artifactId],
      warnings: historyEventWarnings,
      details: discoveryOverride
        ? {
            format: importFormat,
            rowCount: importRowCount,
            geometryType: importGeometryType,
            crs: importCrs,
            source: discoveryOverride.source,
          }
        : {
            format: importFormat,
            rowCount: importRowCount,
            geometryType: importGeometryType,
            crs: importCrs,
          },
    }

    void (async () => {
      let artifactData = importData
      let artifactGeometryType = importGeometryType
      let artifactSpatial = discoveryOverride ? true : importReview!.spatial
      let artifactRenderIssue: string | undefined = !discoveryOverride && importReview!.format === 'GeoParquet' && !importReview!.spatial
        ? 'This GeoParquet layer is registered and queryable, but map rendering is not available for the detected geometry column.'
        : undefined

      try {
        const db = await getDuckDb()
        const conn = await db.connect()
        try {
          if (!discoveryOverride && importReview!.format === 'GeoParquet' && importReview!.data instanceof Uint8Array) {
            const parquetName = `${tableName}.parquet`
            await db.registerFileBuffer(parquetName, importReview!.data)
            await conn.query(`DROP TABLE IF EXISTS ${tableName}`)
            await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${parquetName}')`)

            const geometryColumn = importReview!.tableName
            if (geometryColumn) {
              const fullGeometry = await fetchFullGeometryFromTable(tableName, geometryColumn)
              if (fullGeometry && fullGeometry.featureCollection) {
                artifactData = fullGeometry.featureCollection
                artifactGeometryType = fullGeometry.geometryType
                artifactSpatial = true
                artifactRenderIssue = undefined
              }
            }
          } else if (isFeatureCollection(artifact.data)) {
            const rows = (artifact.data as GeoJSON.FeatureCollection).features.map((feature) => ({
              ...(feature.properties ?? {}),
              geometry: JSON.stringify(feature.geometry),
            }))
            await db.registerFileText(`${tableName}.json`, JSON.stringify(rows))
            await conn.query(`DROP TABLE IF EXISTS ${tableName}`)
            conn.insertJSONFromPath(`${tableName}.json`, { name: tableName })
          }
        } finally {
          await conn.close()
        }

        const updatedArtifact: Artifact = {
          ...artifact,
          data: artifactData,
          spatial: artifactSpatial,
          geometryType: artifactGeometryType,
          renderIssue: artifactRenderIssue,
        }

        if (!discoveryOverride && updatedArtifact.format === 'GeoParquet' && updatedArtifact.spatial && isFeatureCollection(updatedArtifact.data)) {
          updatedArtifact.warnings = updatedArtifact.warnings.filter(
            (warning) => warning.title !== 'GeoParquet import'
          )
        }

        pushArtifactSnapshot(`Import: ${updatedArtifact.name}`)
        setArtifacts((current: Artifact[]) => [...current, updatedArtifact])
        setHistory((current: HistoryEvent[]) => [historyEvent, ...current])
        setSelectedArtifactId(artifactId)
        setBottomTab('table')

        if (discoveryOverride) {
          discoveryOverride.onClose?.()
        } else {
          setImportReview(null)
          setImportStage('idle')
        }

        setStatusMessage(`Imported ${artifact.name}`)
        addToast(`Imported ${artifact.name}`, 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown import/runtime error'
        setStatusMessage(`Import failed: ${message}. Review the import sheet and either fix the file or cancel the transaction.`)
        addToast(`Import failed: ${message}. Review the import sheet and either fix the file or cancel the transaction.`, 'error')
        if (discoveryOverride) {
          discoveryOverride.onClose?.()
        } else {
          setImportStage('review')
        }
      } finally {
        setImporting(false)
      }
    })()
  }

  return {
    saveProject: saveProjectFn,
    openProject,
    newProject,
    exportGeoJson,
    exportJSON,
    loadSample,
    importFile,
    confirmImport,
  }
}
