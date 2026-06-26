import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Search, Plus, MessageSquare, History, Settings, FilePlus, Save, FolderOpen, Undo2, Redo2, Download } from 'lucide-react'
import type { DisplayTransformStatus } from './lib/spatial/display-transform'
import maplibregl from 'maplibre-gl'
import type { Artifact, BBox, HistoryEvent, QueryPreview, SavedQuery, WarningRef, CrsProvenance, CrsConfidence, LayerSettings } from './types'
import { sampleGeoJson } from './lib/sampleData'
import { getDuckDb } from './lib/duckdb'
import { formatTimestamp, inferGeometryType, getGeometryTypeSummary, getArtifactGeometryLabel, isFeatureCollection, makeId, formatCount } from './lib/utils'
import { rowsToFeatureCollection } from './lib/wkb'
import { saveProject, loadProject, hasSavedProject, clearSavedProject, createSavedQuery, reRegisterAllArtifactTables } from './lib/persistence'
import { exportToGeoJson, exportToJson, triggerDownload, getArtifactExportOptions } from './lib/export'
import { buildMaterializedQueryArtifact, buildQueryPreview, getQueryProvenanceStrengthPresentation } from './lib/query-semantics'
import {
  reconcileLayerSettings,
  toggleLayerVisibility as toggleLayerVisibilityPure,
  changeLayerOpacity as changeLayerOpacityPure,
  reorderLayer as reorderLayerPure,
} from './lib/layer-controls'
import { getActiveWarnings, getCurrentNotes, getDeletedQueryStatusMessage, getExportFailureStatusMessage, getExportSuccessStatusMessage, getHistoryDetailGroups, getLoadedQueryStatusMessage, getProvenanceNotes, getQueryRenderIssue, getQueryRunStatusMessage, getSeverityLabel, getSuggestedQueryArtifactName, getWarningRecoveryHint, getWarningScope, getWarningScopeLabel, isWarning, buildQueryHistoryEvent } from './lib/product-surface'
import { getSpatialEngine, executeRegisteredSingleInputOperation, executeRegisteredAggregationOperation, executeClipOperation, executeIntersectOperation, executeRegisteredMeasurementOperation, executeAttributeJoinOperation, getJoinableFieldNames, getDisplayBounds, getDisplayFeatureCollection, getSingleInputOperationPresentation, getAggregationOperationPresentation, getMeasurementOperationPresentation, getSingleInputGeometrySupport, getSingleInputOperationInfoWarning, getMeasurementUnitDisclosure, getMeasurementUnitRefusalWarning, getAttributeJoinPresentation, getAttributeJoinOutputFieldSelection, getOperationSuccessStatusMessage, getTopologyRoleContext, isProjectedCrs, needsDisplayTransformation, validateForClip, validateForIntersect, validateForReproject } from './lib/spatial'
import { OperationContractDisplay, OperationExecutionShell, OperationOutputSemantics, OperationSecondarySelector, OperationSourceSummary, OperationFieldCheckboxList, TypedWarningPanel, artifactSummaryText, getArtifactOutputKind, getArtifactOutputKindLabel, getOperationWarningTone } from './components/operation-ui'
import { NLQueryPanel } from './components/NLQueryPanel'
import { DiscoveryPanel } from './components/DiscoveryPanel'
import type { DiscoveryResult as ApiDiscoveryResult } from './lib/discovery'
import LayersPanel from './components/LayersPanel'

type BottomTab = 'table' | 'sql' | 'results'
type ImportStage = 'idle' | 'scanning' | 'review' | 'importing'
type MaterializeStage = 'idle' | 'naming' | 'materializing'

const SAMPLE_SQL = `SELECT id, name, category, area_acres, geometry
FROM sample_parcels
WHERE area_acres >= 5
ORDER BY area_acres DESC`

// Helper to fetch full geometry from a DuckDB table for map rendering
const fetchFullGeometryFromTable = async (
  tableName: string,
  geometryColumn: string,
): Promise<{ featureCollection: GeoJSON.FeatureCollection | null; geometryType: string | undefined } | null> => {
  try {
    const db = await getDuckDb()
    const conn = await db.connect()
    try {
      // Fetch all rows from the table
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

interface ImportReviewState {
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

/**
 * Creates a derived artifact and history event from an operation result.
 * 
 * This is the shared core of geometry operations (buffer, centroid, etc.):
 * - Validates the artifact has spatial data
 * - Converts to operation input
 * - Executes the operation
 * - Creates the derived artifact with proper warnings
 * - Creates the history event
 * - Updates app state
 * 
 * Callers only need to provide the operation-specific execute function and details.
 */
import type { GeometryOperationInput, GeometryOperationResult } from './lib/spatial'

interface OperationExecutionResult {
  artifact?: Artifact
  historyEvent?: HistoryEvent
  error?: string
}

/**
 * Wrapper that delegates to the shared operation helper from lib/spatial.
 * This preserves the same interface while using the canonical shared implementation.
 */
async function executeGeometryOperation(
  sourceArtifact: Artifact,
  operationName: string,
  _operationFormat: string,
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>,
  getDetails: (sourceArtifact: Artifact) => Record<string, unknown>
): Promise<OperationExecutionResult> {
  return executeRegisteredSingleInputOperation({
    operationId: operationName === 'dissolve' ? 'dissolve-global' : operationName,
    sourceArtifact,
    executeOperation,
    getDetails,
  })
}

/**
 * Extract CRS string from a GeoJSON FeatureCollection if declared
 * Follows the older GeoJSON spec (RFC 7946 obsoleted the "crs" member,
 * but many producers still include it).
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
 * Import assumes unknown CRS unless explicitly declared (GeoJSON rarely has CRS)
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

/**
 * Get human-readable label for CRS provenance source
 */
function getCrsProvenanceLabel(source: CrsProvenance['source']): string {
  switch (source) {
    case 'import-metadata':
      return 'imported metadata'
    case 'operation-inherited':
      return 'inherited from source artifact'
    case 'operation-derived':
      return 'derived by operation'
    case 'user-assigned':
      return 'user-assigned'
    case 'auto-detected':
      return 'auto-detected'
    case 'display-transform':
      return 'display transform'
    default:
      return 'unknown'
  }
}

function getCrsConfidenceLabel(confidence: CrsConfidence): string {
  switch (confidence) {
    case 'known':
      return 'known CRS'
    case 'unknown':
      return 'unknown CRS'
    case 'missing':
      return 'missing CRS'
    default:
      return confidence
  }
}

/**
 * Check if artifact needs display transformation for map rendering
 * Returns the display CRS if transformation is needed, null otherwise
 */
function getDisplayCrsIfNeeded(artifact: Artifact): string | null {
  if (artifact.crsProvenance?.displayTransform?.displayCrs) {
    return artifact.crsProvenance.displayTransform.displayCrs
  }
  if (!artifact.spatial) return null
  if (!artifact.crs || artifact.crs === 'unknown') return null
  if (isProjectedCrs(artifact.crs)) {
    return 'EPSG:4326' // Display uses WGS84
  }
  return null
}

/**
 * Build CRS provenance for derived artifacts from operations
 */
function getDisplayStatusMeta(status: DisplayTransformStatus): {
  badge: 'display only' | 'display fallback'
  message: string
  warning?: WarningRef
  provenanceWarning?: string
} | null {
  if (status === 'transformed') {
    return {
      badge: 'display only',
      message: 'Display normalized to EPSG:4326 for map only; stored CRS metadata is unchanged',
    }
  }

  if (status === 'fallback_runtime_unavailable') {
    return {
      badge: 'display fallback',
      message: 'Display framing fell back while targeting EPSG:4326 because transform runtime was unavailable; stored CRS metadata is unchanged',
      warning: {
        id: 'display_transform_fallback_runtime',
        code: 'DISPLAY_TRANSFORM_FALLBACK',
        severity: 'caution',
        scope: 'active',
        title: 'Display transform fallback',
        message: 'Display framing fell back because transform runtime was unavailable. Stored CRS metadata is unchanged, but map framing may be unreliable.',
      },
      provenanceWarning: 'Display framing fell back because transform runtime was unavailable.',
    }
  }

  if (status === 'fallback_transform_failed') {
    return {
      badge: 'display fallback',
      message: 'Display framing fell back while targeting EPSG:4326 because coordinate transformation failed; stored CRS metadata is unchanged',
      warning: {
        id: 'display_transform_fallback_transform',
        code: 'DISPLAY_TRANSFORM_FALLBACK',
        severity: 'caution',
        scope: 'active',
        title: 'Display transform fallback',
        message: 'Display framing fell back because coordinate transformation failed. Stored CRS metadata is unchanged, but map framing may be unreliable.',
      },
      provenanceWarning: 'Display framing fell back because coordinate transformation failed.',
    }
  }

  return null
}

function getArtifactCrsWarning(artifact: Artifact, operationNoun: string): WarningRef | null {
  if (!artifact.crs || artifact.crs === 'unknown') {
    return {
      id: `${artifact.id}-${operationNoun}-crs-warning`,
      code: artifact.crs ? 'CRS_UNKNOWN' : 'CRS_MISSING',
      severity: 'caution',
      scope: 'active',
      title: 'Stored CRS is not verified',
      message: `${artifact.name} does not currently verify its stored CRS. ${operationNoun} results should be treated cautiously unless the coordinates are known and the contract allows this path.`,
    }
  }
  return null
}

function getDissolveGeometryWarning(artifact: Artifact): WarningRef | null {
  const geometrySupport = getSingleInputGeometrySupport('dissolve-grouped-v1', artifact)
  if (!geometrySupport || geometrySupport.sourceAllowed || !artifact.geometryType) return null

  return {
    id: `${artifact.id}-dissolve-geometry-warning`,
    code: 'UNSUPPORTED_GEOMETRY',
    severity: 'caution',
    scope: 'active',
    title: 'Non-standard geometry type',
    message: geometrySupport.unsupportedMessage,
  }
}

function getSingleInputDialogContract(operationId: 'buffer' | 'centroid' | 'convex-hull-v1' | 'envelope-v1' | 'simplify-v1' | 'dissolve-grouped-v1' | 'reproject' | 'area-v1' | 'perimeter-v1' | 'compactness-v1', artifact: Artifact) {
  const presentation = getSingleInputOperationPresentation(operationId)
  const aggregationPresentation = operationId === 'dissolve-grouped-v1' ? getAggregationOperationPresentation(operationId) : null
  const measurementPresentation = operationId === 'area-v1' || operationId === 'perimeter-v1' || operationId === 'compactness-v1' ? getMeasurementOperationPresentation(operationId) : null
  const geometrySupport = getSingleInputGeometrySupport(operationId, artifact)
  const infoWarning = getSingleInputOperationInfoWarning(operationId)
  const measurementUnitDisclosure = operationId === 'area-v1' || operationId === 'perimeter-v1' || operationId === 'compactness-v1'
    ? getMeasurementUnitDisclosure(operationId)
    : null
  const measurementUnitWarning = operationId === 'area-v1' || operationId === 'perimeter-v1' || operationId === 'compactness-v1'
    ? getMeasurementUnitRefusalWarning(operationId, artifact)
    : null
  return { presentation, aggregationPresentation, measurementPresentation, geometrySupport, infoWarning, measurementUnitDisclosure, measurementUnitWarning }
}

function toPanelWarnings(warnings: WarningRef[]) {
  return warnings.map((warning) => ({
    title: warning.title,
    message: warning.message,
    tone: getOperationWarningTone(warning),
  }))
}

function buildInfoWarningRef(artifact: Artifact, suffix: string, infoWarning: ReturnType<typeof getSingleInputOperationInfoWarning>): WarningRef | null {
  if (!infoWarning) return null
  return {
    id: `${artifact.id}-${suffix}-info`,
    code: 'LIMITED_SUPPORT_ENVELOPE',
    severity: infoWarning.severity,
    scope: 'active',
    title: infoWarning.title,
    message: infoWarning.message,
  }
}

function getAttributeJoinKeyPriority(field: string): number {
  const normalized = field.trim().toLowerCase()
  if (!normalized) return 0
  if (normalized === 'id') return 100
  if (normalized === 'join_id') return 95
  if (normalized.endsWith('_id')) return 90
  if (normalized.includes('id')) return 70
  if (normalized === 'name') return 50
  if (normalized.endsWith('_name')) return 45
  if (normalized.includes('name')) return 35
  if (normalized === 'category' || normalized.endsWith('_code') || normalized.endsWith('_key')) return 30
  if (normalized === '_featureindex') return -100
  return 10
}

function getPreferredAttributeJoinKeys(leftFields: string[], rightFields: string[]): { sourceKey: string; secondaryKey: string } {
  const rightFieldSet = new Set(rightFields)
  const sharedFields = leftFields.filter((field) => rightFieldSet.has(field))
  const rankedSharedFields = [...sharedFields].sort((a, b) => {
    const scoreDiff = getAttributeJoinKeyPriority(b) - getAttributeJoinKeyPriority(a)
    return scoreDiff !== 0 ? scoreDiff : a.localeCompare(b)
  })
  const preferredSharedField = rankedSharedFields[0]
  if (preferredSharedField) {
    return {
      sourceKey: preferredSharedField,
      secondaryKey: preferredSharedField,
    }
  }

  const rankedLeftFields = [...leftFields].sort((a, b) => {
    const scoreDiff = getAttributeJoinKeyPriority(b) - getAttributeJoinKeyPriority(a)
    return scoreDiff !== 0 ? scoreDiff : a.localeCompare(b)
  })
  const rankedRightFields = [...rightFields].sort((a, b) => {
    const scoreDiff = getAttributeJoinKeyPriority(b) - getAttributeJoinKeyPriority(a)
    return scoreDiff !== 0 ? scoreDiff : a.localeCompare(b)
  })

  return {
    sourceKey: rankedLeftFields[0] ?? '',
    secondaryKey: rankedRightFields[0] ?? '',
  }
}

function getDefaultAttributeJoinSelectedFields(leftFields: string[], rightFields: string[], secondaryKey: string): string[] {
  const selectableFields = rightFields.filter((field) => field !== secondaryKey)
  const collisionFree = selectableFields.filter((field) => !leftFields.includes(field))
  if (collisionFree[0]) return [collisionFree[0]]
  if (selectableFields[0]) return [selectableFields[0]]
  return []
}

function getAttributeJoinDialogDefaults(selectedArtifact: Artifact, candidateArtifact: Artifact | null): {
  artifactId: string;
  sourceKey: string;
  secondaryKey: string;
  selectedFields: string[];
  outputName: string;
} {
  const leftFields = getJoinableFieldNames(selectedArtifact)
  const rightFields = candidateArtifact ? getJoinableFieldNames(candidateArtifact) : []
  const preferredKeys = getPreferredAttributeJoinKeys(leftFields, rightFields)
  return {
    artifactId: candidateArtifact?.id ?? '',
    sourceKey: preferredKeys.sourceKey,
    secondaryKey: preferredKeys.secondaryKey,
    selectedFields: getDefaultAttributeJoinSelectedFields(leftFields, rightFields, preferredKeys.secondaryKey),
    outputName: `${selectedArtifact.name}_attribute_join`,
  }
}

function AccordionSection({ title, defaultOpen, children, badge }: {
  title: string
  defaultOpen?: boolean
  badge?: string | number
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} style={{ marginBottom: 8 }}>
      <summary style={{ cursor: 'pointer', padding: '8px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b949e', fontWeight: 600, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, transition: 'transform 0.15s' }}>▸</span>
        {title}
        {badge && <span className="badge" style={{ marginLeft: 'auto' }}>{badge}</span>}
      </summary>
      <div style={{ paddingLeft: 0, paddingTop: 4 }}>
        {children}
      </div>
    </details>
  )
}

function App() {
  const debugParams = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        logMapSync: false,
        deferOperationSelection: false,
        disableOperationSelection: false,
      }
    }
    const params = new URLSearchParams(window.location.search)
    const has = (key: string) => params.get(key) === '1'
    return {
      logMapSync: has('debugLogMapSync'),
      deferOperationSelection: has('debugDeferOperationSelection'),
      disableOperationSelection: has('debugDisableOperationSelection'),
    }
  }, [])

  const [projectName, setProjectName] = useState<string>('Untitled Project')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({})
  const [pendingPostCommitSelectedArtifactId, setPendingPostCommitSelectedArtifactId] = useState<string | null>(null)
  const [bottomTab, setBottomTab] = useState<BottomTab>('table')
  const [bottomDockExpanded, setBottomDockExpanded] = useState(false)
  const [sql, setSql] = useState(SAMPLE_SQL)
  const [queryPreview, setQueryPreview] = useState<QueryPreview | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryRunning, setQueryRunning] = useState(false)
  const [queryHasRunSuccessfully, setQueryHasRunSuccessfully] = useState(false)
  const [importReview, setImportReview] = useState<ImportReviewState | null>(null)
  const [importStage, setImportStage] = useState<ImportStage>('idle')
  const [importing, setImporting] = useState(false)
  const [selectedHistoryEventId, setSelectedHistoryEventId] = useState<string | null>(null)
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'history'>('details')
  const [statusMessage, setStatusMessage] = useState<string>('Ready to import')
  
  // Toast notification system
  interface Toast {
    id: string
    message: string
    type: 'success' | 'info' | 'warning' | 'error'
    dismissible: boolean
  }
  const [toasts, setToasts] = useState<Toast[]>([])
  
  function addToast(message: string, type: Toast['type'] = 'info', dismissible = true) {
    const id = makeId('toast')
    setToasts(prev => [...prev, { id, message, type, dismissible }])
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 5000)
    }
  }
  
  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Slice 8: Undo/Redo stack
  interface UndoEntry {
    artifacts: Artifact[]
    label: string
    timestamp: number
  }
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])

  function pushArtifactSnapshot(label: string) {
    undoStack.current.push({ artifacts: [...artifacts], label, timestamp: Date.now() })
    redoStack.current = []
  }

  function handleUndo() {
    const entry = undoStack.current.pop()
    if (!entry) { addToast('Nothing to undo', 'info'); return }
    redoStack.current.push({ artifacts: [...artifacts], label: entry.label, timestamp: Date.now() })
    setArtifacts(entry.artifacts)
    const remainingIds = new Set(entry.artifacts.map(a => a.id))
    setLayerSettings(prev => {
      const cleaned: Record<string, LayerSettings> = {}
      for (const [id, settings] of Object.entries(prev)) {
        if (remainingIds.has(id)) cleaned[id] = settings
      }
      return cleaned
    })
    addToast(`Undid: ${entry.label}`, 'info')
  }

  function handleRedo() {
    const entry = redoStack.current.pop()
    if (!entry) { addToast('Nothing to redo', 'info'); return }
    undoStack.current.push({ artifacts: [...artifacts], label: entry.label, timestamp: Date.now() })
    setArtifacts(entry.artifacts)
    const remainingIds = new Set(entry.artifacts.map(a => a.id))
    setLayerSettings(prev => {
      const cleaned: Record<string, LayerSettings> = {}
      for (const [id, settings] of Object.entries(prev)) {
        if (remainingIds.has(id)) cleaned[id] = settings
      }
      return cleaned
    })
    addToast(`Redid: ${entry.label}`, 'info')
  }

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0
  const undoLabel = canUndo ? undoStack.current[undoStack.current.length - 1].label : null
  const redoLabel = canRedo ? redoStack.current[redoStack.current.length - 1].label : null

  const handleUndoRef = useRef<() => void>(() => {})
  const handleRedoRef = useRef<() => void>(() => {})
  handleUndoRef.current = handleUndo
  handleRedoRef.current = handleRedo

  const commandInputRef = useRef<HTMLInputElement>(null)
  const handleOpenProjectRef = useRef<() => void>(() => {})
  const handleNewProjectRef = useRef<() => void>(() => {})
  const toggleSidebarRef = useRef<(mode: SidebarMode) => void>(() => {})
  const selectedArtifactRef = useRef<Artifact | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Cmd/Ctrl+S always prevents browser default, even when typing
      if (e.key === 's') {
        e.preventDefault()
        setShowSaveDialog(true)
        return
      }

      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      if (isTyping) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndoRef.current()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        handleRedoRef.current()
      } else if (e.key === 'o') {
        e.preventDefault()
        handleOpenProjectRef.current()
      } else if (e.key === 'n') {
        e.preventDefault()
        handleNewProjectRef.current()
      } else if (e.key === 'k') {
        e.preventDefault()
        commandInputRef.current?.focus()
      } else if (e.key === 'b') {
        e.preventDefault()
        toggleSidebarRef.current('layers')
      } else if (e.key === 'e') {
        e.preventDefault()
        if (selectedArtifactRef.current) {
          setShowExportMenu(true)
        }
      } else if (e.key === '/') {
        e.preventDefault()
        addToast('Shortcuts: ⌘S Save · ⌘O Open · ⌘N New · ⌘K Command bar · ⌘B Layers · ⌘E Export · ⌘⇧Z Redo · ⌘/ Help', 'info')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Slice 1: map-first shell state
  type SidebarMode = 'layers' | 'discover' | 'query' | 'chain' | null
  const [activeSidebar, setActiveSidebar] = useState<SidebarMode>(null)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [commandFocused, setCommandFocused] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  // Slice 6c: Discovery prefix routing state
  const [discoverySource, setDiscoverySource] = useState<string | null>(null)
  const [discoverySeedQuery, setDiscoverySeedQuery] = useState('')

  // Slice 6b: Bbox preview overlay state
  const [bboxPreview, setBboxPreview] = useState<BBox | null>(null)

  function toggleSidebar(mode: SidebarMode) {
    setActiveSidebar(prev => (prev === mode ? null : mode))
  }
  toggleSidebarRef.current = toggleSidebar

  function handleCommandChange(value: string) {
    setCommandInput(value)
    if (value.startsWith('/')) {
      setActiveSidebar('query')
      const sqlText = value.slice(1).trimStart()
      if (sqlText) setSql(sqlText)
      // Clear discovery state when leaving @ prefix
      setDiscoverySource(null)
      setDiscoverySeedQuery('')
    } else if (value.startsWith('@')) {
      setActiveSidebar('discover')
      const firstToken = value.split(' ')[0].slice(1)
      const knownSources = ['osm', 'ckan', 'stac', 'arcgis']
      if (knownSources.includes(firstToken)) {
        // Route to DiscoveryPanel with source + seed query
        setDiscoverySource(firstToken)
        const seedText = value.slice(firstToken.length + 1).trimStart()
        setDiscoverySeedQuery(seedText)
      } else {
        // Just @ prefix without a known source — still open panel but no source pin
        setDiscoverySource(null)
        const seedText = value.slice(1).trimStart()
        setDiscoverySeedQuery(seedText)
      }
    } else if (value.trim()) {
      setActiveSidebar('chain')
      // Clear discovery state when leaving @ prefix
      setDiscoverySource(null)
      setDiscoverySeedQuery('')
    } else {
      setActiveSidebar(null)
      setDiscoverySource(null)
      setDiscoverySeedQuery('')
    }
  }

  function applyExampleQuery(example: string) {
    setCommandInput(example)
    handleCommandChange(example)
  }

  const commandExamples = [
    'Buffer the parcels by 500 feet',
    'Clip parcels to Butte County and calculate area',
    'Show me what\'s near the rivers',
    'Join ownership to parcels by APN',
    'Find the median income by census tract',
  ]

  // Project persistence state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  
  // Saved query management state
  const [showSaveQueryDialog, setShowSaveQueryDialog] = useState(false)
  const [newQueryName, setNewQueryName] = useState('')
  
  // Export state
  const [showExportMenu, setShowExportMenu] = useState(false)
  
  // Materialization naming state
  const [materializeStage, setMaterializeStage] = useState<MaterializeStage>('idle')
  const [derivedArtifactName, setDerivedArtifactName] = useState<string>('')
  const [materializing, setMaterializing] = useState(false)
  
  // Buffer operation state
  const [showBufferDialog, setShowBufferDialog] = useState(false)
  const [bufferDistance, setBufferDistance] = useState<string>('1')
  const [bufferDistanceUnit, setBufferDistanceUnit] = useState<'kilometers' | 'miles'>('kilometers')
  const [bufferName, setBufferName] = useState<string>('')
  const [bufferRunning, setBufferRunning] = useState(false)
  
  // Centroid operation state
  const [showCentroidDialog, setShowCentroidDialog] = useState(false)
  const [centroidName, setCentroidName] = useState<string>('')
  const [centroidRunning, setCentroidRunning] = useState(false)
  const [showConvexHullDialog, setShowConvexHullDialog] = useState(false)
  const [convexHullName, setConvexHullName] = useState<string>('')
  const [convexHullRunning, setConvexHullRunning] = useState(false)
  const [showEnvelopeDialog, setShowEnvelopeDialog] = useState(false)
  const [envelopeName, setEnvelopeName] = useState<string>('')
  const [envelopeRunning, setEnvelopeRunning] = useState(false)
  const [showSimplifyDialog, setShowSimplifyDialog] = useState(false)
  const [simplifyName, setSimplifyName] = useState<string>('')
  const [simplifyTolerance, setSimplifyTolerance] = useState<string>('0.001')
  const [simplifyRunning, setSimplifyRunning] = useState(false)
  
  // Dissolve operation state
  const [showDissolveDialog, setShowDissolveDialog] = useState(false)
  const [dissolveGroupingField, setDissolveGroupingField] = useState<string>('')
  const [dissolveName, setDissolveName] = useState<string>('')
  const [dissolveRunning, setDissolveRunning] = useState(false)
  
  // Reproject operation state
  const [showReprojectDialog, setShowReprojectDialog] = useState(false)
  const [reprojectSourceCrs, setReprojectSourceCrs] = useState<string>('')
  const [reprojectTargetCrs, setReprojectTargetCrs] = useState<string>('EPSG:4326')
  const [reprojectName, setReprojectName] = useState<string>('')
  const [reprojectRunning, setReprojectRunning] = useState(false)
  
  // Clip operation state
  const [showClipDialog, setShowClipDialog] = useState(false)
  const [clipMaskArtifactId, setClipMaskArtifactId] = useState<string>('')
  const [clipName, setClipName] = useState<string>('')
  const [clipRunning, setClipRunning] = useState(false)
  
  // Intersect operation state (v1 narrow topology path)
  const [showIntersectDialog, setShowIntersectDialog] = useState(false)
  const [overlayArtifactId, setOverlayArtifactId] = useState<string>('')
  const [intersectName, setIntersectName] = useState<string>('')
  const [intersectRunning, setIntersectRunning] = useState(false)

  // Attribute join v1 state
  const [showAttributeJoinDialog, setShowAttributeJoinDialog] = useState(false)
  const [attributeJoinArtifactId, setAttributeJoinArtifactId] = useState<string>('')
  const [attributeJoinSourceKey, setAttributeJoinSourceKey] = useState<string>('')
  const [attributeJoinSecondaryKey, setAttributeJoinSecondaryKey] = useState<string>('')
  const [attributeJoinSelectedFields, setAttributeJoinSelectedFields] = useState<string[]>([])
  const [attributeJoinName, setAttributeJoinName] = useState<string>('')
  const [attributeJoinRunning, setAttributeJoinRunning] = useState(false)

  // Measurement operation state
  const [showAreaDialog, setShowAreaDialog] = useState(false)
  const [areaName, setAreaName] = useState<string>('')
  const [areaRunning, setAreaRunning] = useState(false)
  const [showPerimeterDialog, setShowPerimeterDialog] = useState(false)
  const [perimeterName, setPerimeterName] = useState<string>('')
  const [perimeterRunning, setPerimeterRunning] = useState(false)
  const [showCompactnessDialog, setShowCompactnessDialog] = useState(false)
  const [compactnessName, setCompactnessName] = useState<string>('')
  const [compactnessRunning, setCompactnessRunning] = useState(false)
  
  const [spatialEngineInitialized, setSpatialEngineInitialized] = useState(false)
  const [selectedArtifactDisplayStatus, setSelectedArtifactDisplayStatus] = useState<DisplayTransformStatus | null>(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  
  // Initialize spatial engine on mount
  useEffect(() => {
    const initSpatial = async () => {
      try {
        const engine = getSpatialEngine()
        await engine.initialize()
        setSpatialEngineInitialized(true)
        console.log('[App] Spatial engine initialized')
      } catch (error) {
        console.error('[App] Failed to initialize spatial engine:', error)
      }
    }
    initSpatial()
  }, [])
  
  const mapNodeRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapSyncGenerationRef = useRef(0)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const artifactsRef = useRef<Artifact[]>([])
  const selectedArtifactIdRef = useRef<string | null>(null)
  const pendingPostCommitSelectedArtifactIdRef = useRef<string | null>(null)

  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
    [artifacts, selectedArtifactId],
  )
  selectedArtifactRef.current = selectedArtifact

  const selectableSecondaryArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.id !== selectedArtifactId && artifact.spatial),
    [artifacts, selectedArtifactId],
  )

  const clipMaskArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === clipMaskArtifactId) ?? null,
    [artifacts, clipMaskArtifactId],
  )

  const intersectOverlayArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === overlayArtifactId) ?? null,
    [artifacts, overlayArtifactId],
  )

  const attributeJoinArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === attributeJoinArtifactId) ?? null,
    [artifacts, attributeJoinArtifactId],
  )

  useEffect(() => {
    artifactsRef.current = artifacts
  }, [artifacts])

  useEffect(() => {
    selectedArtifactIdRef.current = selectedArtifactId
  }, [selectedArtifactId])

  useEffect(() => {
    pendingPostCommitSelectedArtifactIdRef.current = pendingPostCommitSelectedArtifactId
  }, [pendingPostCommitSelectedArtifactId])

  useEffect(() => {
    if (!pendingPostCommitSelectedArtifactId) return
    const pendingArtifactId = pendingPostCommitSelectedArtifactId
    const artifactExists = artifacts.some((artifact) => artifact.id === pendingArtifactId)
    if (!artifactExists) return
    if (selectedArtifactId === pendingArtifactId) {
      setPendingPostCommitSelectedArtifactId(null)
      return
    }
    setSelectedArtifactId(pendingArtifactId)
    setPendingPostCommitSelectedArtifactId(null)
  }, [artifacts, pendingPostCommitSelectedArtifactId, selectedArtifactId])

  // Initialize layer settings for new artifacts (ephemeral, not persisted)
  useEffect(() => {
    setLayerSettings((prev) => {
      const { next, changed } = reconcileLayerSettings(
        prev,
        artifacts.map((a) => ({ id: a.id, spatial: a.spatial ?? false })),
      )
      return changed ? next : prev
    })
  }, [artifacts])

  // Layer control helpers
  const toggleLayerVisibility = (artifactId: string) => {
    setLayerSettings((prev) => toggleLayerVisibilityPure(prev, artifactId))
  }

  const changeLayerOpacity = (artifactId: string, opacity: number) => {
    setLayerSettings((prev) => changeLayerOpacityPure(prev, artifactId, opacity))
  }

  const reorderLayer = (artifactId: string, direction: 'up' | 'down') => {
    setLayerSettings((prev) => reorderLayerPure(prev, artifactId, direction))
  }

  useEffect(() => {
    const container = mapNodeRef.current
    if (!container) return

    // React StrictMode double-invokes mount effects in development.
    // Always tear down any stale map instance before creating a fresh one
    // so the second mount does not inherit a removed MapLibre instance.
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    let map: maplibregl.Map | null = null
    try {
      map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '&copy; OpenStreetMap contributors',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [-122.4194, 37.779],
        zoom: 12,
      })

      map.addControl(new maplibregl.NavigationControl(), 'top-right')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      map.on('error', (event) => {
        console.warn('[App] Map error:', event)
      })

      mapRef.current = map
    } catch (err) {
      console.error('[App] Error creating map:', err)
    }

    return () => {
      if (map) {
        map.remove()
      }
      if (mapRef.current === map) {
        mapRef.current = null
      }
    }
  }, [])

  // Sync artifacts to map sources and layers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const spatialArtifacts = artifacts.filter(
      (artifact) => artifact.spatial && isFeatureCollection(artifact.data),
    )
    // Sort by zIndex (ascending — lower zIndex renders first / below)
    spatialArtifacts.sort((a, b) => {
      const za = layerSettings[a.id]?.zIndex ?? 0
      const zb = layerSettings[b.id]?.zIndex ?? 0
      return za - zb
    })

    let cancelled = false
    const syncGeneration = ++mapSyncGenerationRef.current

    const mapSyncDebug = (() => {
      if (typeof window === 'undefined') {
        return {
          disableBaseSourceSync: false,
          disableSelectedSourceSync: false,
          disableDisplayTransformForBase: false,
          disableDisplayTransformForSelected: false,
          disableLayerSync: false,
          disablePolygonFill: false,
          polygonLineOnly: false,
          disableAutoFit: false,
          logMapSync: false,
        }
      }
      const params = new URLSearchParams(window.location.search)
      const has = (key: string) => params.get(key) === '1'
      return {
        disableBaseSourceSync: has('debugDisableBaseSourceSync'),
        disableSelectedSourceSync: has('debugDisableSelectedSourceSync'),
        disableDisplayTransformForBase: has('debugDisableDisplayTransformForBase'),
        disableDisplayTransformForSelected: has('debugDisableDisplayTransformForSelected'),
        disableLayerSync: has('debugDisableLayerSync'),
        disablePolygonFill: has('debugDisablePolygonFill'),
        polygonLineOnly: has('debugPolygonLineOnly'),
        disableAutoFit: has('debugDisableAutoFit'),
        logMapSync: has('debugLogMapSync'),
      }
    })()

    const syncLayers = async () => {
      if (mapSyncDebug.logMapSync) {
        console.log('[App][map-sync] start', {
          syncGeneration,
          selectedArtifactId,
          artifactIds: spatialArtifacts.map((artifact) => artifact.id),
        })
      }
      const existingSourceIds = new Set(Object.keys(map.getStyle().sources))
      for (const [index, artifact] of spatialArtifacts.entries()) {
        if (cancelled) return
        const sourceId = `artifact-source-${artifact.id}`
        const fillId = `artifact-fill-${artifact.id}`
        const lineId = `artifact-line-${artifact.id}`
        const pointId = `artifact-point-${artifact.id}`
        const selectedSourceId = `artifact-selected-source-${artifact.id}`
        const selectedFillId = `artifact-selected-fill-${artifact.id}`
        const selectedLineId = `artifact-selected-line-${artifact.id}`
        const selectedPointId = `artifact-selected-point-${artifact.id}`
        const isSelected = artifact.id === selectedArtifactId
        if (mapSyncDebug.logMapSync) {
          console.log('[App][map-sync] artifact', {
            syncGeneration,
            artifactId: artifact.id,
            artifactName: artifact.name,
            isSelected,
            geometryType: artifact.geometryType,
            featureCount: isFeatureCollection(artifact.data) ? artifact.data.features.length : null,
          })
        }
        
        // Layer settings: visibility gate + opacity
        const settings = layerSettings[artifact.id] ?? { visible: true, opacity: 1.0, zIndex: 0 }
        // Z-order: layers are added in sorted order on first render; subsequent
        // changes use map.moveLayer() in the reconciliation pass below.
        const baseOpacity = settings.opacity
        const fillOpacity = isSelected ? Math.min(baseOpacity + 0.2, 1.0) : baseOpacity
        const lineWidth = isSelected ? 3 : 2
        // Bright fill color - blue for selected, teal otherwise
        const fillColor = isSelected ? '#3b82f6' : '#14b8a6' // blue-500 vs teal-500
        const lineColor = isSelected ? '#93c5fd' : '#5eead4' // lighter blue vs lighter teal

        // Only call display transform when at least one render path needs it.
        // The transform is async and calls PROJ WASM for projected CRS —
        // skipping it avoids a crash seam in headless/Playwright environments.
        const needsDisplayTransform = !mapSyncDebug.disableDisplayTransformForBase
          || !mapSyncDebug.disableDisplayTransformForSelected
        const displayFeatureCollectionResult = needsDisplayTransform
          ? await getDisplayFeatureCollection(artifact)
          : null
        if (cancelled || mapSyncGenerationRef.current !== syncGeneration) return
        const displayFeatureCollection = displayFeatureCollectionResult?.featureCollection ?? (artifact.data as GeoJSON.FeatureCollection)
        const rawFeatureCollection = artifact.data as GeoJSON.FeatureCollection

        const withFeatureIndex = (featureCollection: GeoJSON.FeatureCollection) => ({
          type: 'FeatureCollection' as const,
          features: featureCollection.features.map((feature, featureIndex) => ({
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              __featureIndex: featureIndex,
            },
          })),
        })

        const baseFeatureCollection = withFeatureIndex(
          mapSyncDebug.disableDisplayTransformForBase ? rawFeatureCollection : displayFeatureCollection,
        )
        const selectedBaseFeatureCollection = withFeatureIndex(
          mapSyncDebug.disableDisplayTransformForSelected ? rawFeatureCollection : displayFeatureCollection,
        )

        if (!mapSyncDebug.disableBaseSourceSync) {
          if (mapSyncDebug.logMapSync) {
            console.log('[App][map-sync] base-source', {
              artifactId: artifact.id,
              sourceId,
              action: map.getSource(sourceId) ? 'setData' : 'addSource',
              featureCount: baseFeatureCollection.features.length,
            })
          }
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: 'geojson',
              data: baseFeatureCollection,
            })
          } else {
            ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(baseFeatureCollection)
          }
        }

        const selectedFeatureCollection =
          artifact.id === selectedArtifactId &&
          selectedRowIndex !== null &&
          isFeatureCollection(selectedBaseFeatureCollection) &&
          selectedBaseFeatureCollection.features[selectedRowIndex]
            ? {
                type: 'FeatureCollection' as const,
                features: [selectedBaseFeatureCollection.features[selectedRowIndex]],
              }
            : { type: 'FeatureCollection' as const, features: [] }

        if (!mapSyncDebug.disableSelectedSourceSync) {
          if (mapSyncDebug.logMapSync) {
            console.log('[App][map-sync] selected-source', {
              artifactId: artifact.id,
              selectedSourceId,
              action: map.getSource(selectedSourceId) ? 'setData' : 'addSource',
              featureCount: selectedFeatureCollection.features.length,
              isSelected,
            })
          }
          if (!map.getSource(selectedSourceId)) {
            map.addSource(selectedSourceId, {
              type: 'geojson',
              data: selectedFeatureCollection,
            })
          } else {
            ;(map.getSource(selectedSourceId) as maplibregl.GeoJSONSource).setData(selectedFeatureCollection)
          }
        }

        if (mapSyncDebug.disableLayerSync) {
          existingSourceIds.delete(sourceId)
          existingSourceIds.delete(selectedSourceId)
          continue
        }

        // Visibility gate: if layer is hidden, remove existing layers but keep source synced
        if (!settings.visible) {
          if (map.getLayer(fillId)) map.removeLayer(fillId)
          if (map.getLayer(lineId)) map.removeLayer(lineId)
          if (map.getLayer(pointId)) map.removeLayer(pointId)
          if (map.getLayer(selectedFillId)) map.removeLayer(selectedFillId)
          if (map.getLayer(selectedLineId)) map.removeLayer(selectedLineId)
          if (map.getLayer(selectedPointId)) map.removeLayer(selectedPointId)
          existingSourceIds.delete(sourceId)
          existingSourceIds.delete(selectedSourceId)
          continue
        }

        const beforeId = undefined
        const geometryType = artifact.geometryType ?? ''
        const baseSource = map.getSource(sourceId)
        const selectedSource = map.getSource(selectedSourceId)
        
        // Handle Polygon and MultiPolygon (fill + line layers)
        if (geometryType.includes('Polygon')) {
          const shouldRenderPolygonFill = !mapSyncDebug.disablePolygonFill && !mapSyncDebug.polygonLineOnly

          if (shouldRenderPolygonFill && baseSource) {
            if (!map.getLayer(fillId)) {
              map.addLayer(
                {
                  id: fillId,
                  type: 'fill',
                  source: sourceId,
                  paint: {
                    'fill-color': fillColor,
                    'fill-opacity': fillOpacity,
                  },
                },
                beforeId,
              )
              map.on('click', fillId, (event) => {
                if (artifact.id !== selectedArtifactId) return
                const featureIndex = event.features?.[0]?.properties?.__featureIndex
                if (featureIndex !== undefined) {
                  setSelectedRowIndex(Number(featureIndex))
                  setBottomTab('table')
                }
              })
            } else {
              map.setPaintProperty(fillId, 'fill-color', fillColor)
              map.setPaintProperty(fillId, 'fill-opacity', fillOpacity)
            }
          } else if (map.getLayer(fillId)) {
            map.removeLayer(fillId)
          }

          if (baseSource && !map.getLayer(lineId)) {
            map.addLayer({
              id: lineId,
              type: 'line',
              source: sourceId,
              paint: { 'line-color': lineColor, 'line-width': lineWidth },
            })
            map.on('click', lineId, (event) => {
              if (artifact.id !== selectedArtifactId) return
              const featureIndex = event.features?.[0]?.properties?.__featureIndex
              if (featureIndex !== undefined) {
                setSelectedRowIndex(Number(featureIndex))
                setBottomTab('table')
              }
            })
          } else {
            map.setPaintProperty(lineId, 'line-color', lineColor)
            map.setPaintProperty(lineId, 'line-width', lineWidth)
          }

          if (shouldRenderPolygonFill && selectedSource) {
            if (!map.getLayer(selectedFillId)) {
              map.addLayer({
                id: selectedFillId,
                type: 'fill',
                source: selectedSourceId,
                paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.25 },
              })
            }
          } else if (map.getLayer(selectedFillId)) {
            map.removeLayer(selectedFillId)
          }
          if (selectedSource && !map.getLayer(selectedLineId)) {
            map.addLayer({
              id: selectedLineId,
              type: 'line',
              source: selectedSourceId,
              paint: { 'line-color': '#fbbf24', 'line-width': 4 },
            })
          }
        }
        
        // Handle LineString and MultiLineString (line layer)
        if (geometryType.includes('LineString')) {
          if (baseSource && !map.getLayer(lineId)) {
            map.addLayer({
              id: lineId,
              type: 'line',
              source: sourceId,
              paint: { 'line-color': fillColor, 'line-width': lineWidth + 1 },
            })
          } else {
            map.setPaintProperty(lineId, 'line-color', fillColor)
            map.setPaintProperty(lineId, 'line-width', lineWidth + 1)
          }

          if (selectedSource && !map.getLayer(selectedLineId)) {
            map.addLayer({
              id: selectedLineId,
              type: 'line',
              source: selectedSourceId,
              paint: { 'line-color': '#fbbf24', 'line-width': 5 },
            })
          }
        }
        
        // Handle Point and MultiPoint (circle layer)
        if (geometryType.includes('Point')) {
          if (baseSource && !map.getLayer(pointId)) {
            map.addLayer({
              id: pointId,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-radius': isSelected ? 8 : 6,
                'circle-color': fillColor,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
              },
            })
            map.on('click', pointId, (event) => {
              if (artifact.id !== selectedArtifactId) return
              const featureIndex = event.features?.[0]?.properties?.__featureIndex
              if (featureIndex !== undefined) {
                setSelectedRowIndex(Number(featureIndex))
                setBottomTab('table')
              }
            })
          } else {
            map.setPaintProperty(pointId, 'circle-radius', isSelected ? 8 : 6)
            map.setPaintProperty(pointId, 'circle-color', fillColor)
            map.setPaintProperty(pointId, 'circle-stroke-color', '#ffffff')
            map.setPaintProperty(pointId, 'circle-stroke-width', 2)
          }

          if (selectedSource && !map.getLayer(selectedPointId)) {
            map.addLayer({
              id: selectedPointId,
              type: 'circle',
              source: selectedSourceId,
              paint: {
                'circle-radius': 10,
                'circle-color': '#f59e0b',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 3,
              },
            })
          }
        }

        existingSourceIds.delete(sourceId)
        existingSourceIds.delete(selectedSourceId)
        void index
      }

      // Z-order reconciliation pass
      // MapLibre renders layers in add-order; on subsequent renders we need
      // map.moveLayer() to keep render order in sync with zIndex changes.
      const sortedVisibleArtifacts = spatialArtifacts
        .filter((a) => layerSettings[a.id]?.visible !== false)
        .sort((a, b) => {
          const za = layerSettings[a.id]?.zIndex ?? 0
          const zb = layerSettings[b.id]?.zIndex ?? 0
          return za - zb
        })

      for (let i = 0; i < sortedVisibleArtifacts.length; i++) {
        const artifact = sortedVisibleArtifacts[i]
        const nextArtifact = sortedVisibleArtifacts[i + 1]

        // Compute layer IDs (matching existing pattern)
        const fillId = `artifact-fill-${artifact.id}`
        const lineId = `artifact-line-${artifact.id}`
        const pointId = `artifact-point-${artifact.id}`

        // The "before" layer is the fill layer of the next-higher-zIndex artifact.
        // For the topmost artifact, no beforeId → moves to top.
        let beforeFillId: string | undefined
        if (nextArtifact) {
          beforeFillId = `artifact-fill-${nextArtifact.id}`
        }

        // Move each layer type if it exists.
        if (map.getLayer(fillId) && beforeFillId && map.getLayer(beforeFillId)) {
          map.moveLayer(fillId, beforeFillId)
        } else if (map.getLayer(fillId)) {
          map.moveLayer(fillId) // move to top
        }
        if (map.getLayer(lineId) && beforeFillId && map.getLayer(beforeFillId)) {
          map.moveLayer(lineId, beforeFillId)
        } else if (map.getLayer(lineId)) {
          map.moveLayer(lineId)
        }
        if (map.getLayer(pointId) && beforeFillId && map.getLayer(beforeFillId)) {
          map.moveLayer(pointId, beforeFillId)
        } else if (map.getLayer(pointId)) {
          map.moveLayer(pointId)
        }
      }

      for (const sourceId of existingSourceIds) {
        if (!sourceId.startsWith('artifact-')) continue
        // Defensive: never clean up internal overlay sources (bbox preview, etc.)
        if (sourceId.startsWith('__')) continue
        const fillId = sourceId.replace('-source-', '-fill-')
        const lineId = sourceId.replace('-source-', '-line-')
        const pointId = sourceId.replace('-source-', '-point-')
        const selectedFillId = sourceId.replace('-source-', '-selected-fill-')
        const selectedLineId = sourceId.replace('-source-', '-selected-line-')
        const selectedPointId = sourceId.replace('-source-', '-selected-point-')
        if (mapSyncDebug.logMapSync) {
          console.log('[App][map-sync] cleanup-source', {
            sourceId,
            hasFill: Boolean(map.getLayer(fillId)),
            hasLine: Boolean(map.getLayer(lineId)),
            hasPoint: Boolean(map.getLayer(pointId)),
            hasSelectedFill: Boolean(map.getLayer(selectedFillId)),
            hasSelectedLine: Boolean(map.getLayer(selectedLineId)),
            hasSelectedPoint: Boolean(map.getLayer(selectedPointId)),
            hasSource: Boolean(map.getSource(sourceId)),
          })
        }
        if (map.getLayer(selectedFillId)) map.removeLayer(selectedFillId)
        if (map.getLayer(selectedLineId)) map.removeLayer(selectedLineId)
        if (map.getLayer(selectedPointId)) map.removeLayer(selectedPointId)
        if (map.getLayer(fillId)) map.removeLayer(fillId)
        if (map.getLayer(lineId)) map.removeLayer(lineId)
        if (map.getLayer(pointId)) map.removeLayer(pointId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }
    }

    // Use a more robust approach: always wait for the map's load event
    // For inline styles, we use map.loaded() which returns true when fully initialized
    const trySync = () => {
      if (cancelled) return
      if (!mapRef.current) return

      // Check if map is fully loaded and ready
      if (map.loaded()) {
        syncLayers().catch((e) => {
          console.warn('[App] Error syncing layers:', e)
          setTimeout(trySync, 100)
        })
      } else {
        setTimeout(trySync, 50)
      }
    }

    trySync()

    return () => {
      cancelled = true
    }
  }, [artifacts, selectedArtifactId, layerSettings])

  // Slice 6b: Bbox preview overlay — renders semi-transparent rectangle on map
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const sourceId = '__bbox-preview'
    const fillId = '__bbox-preview-fill'
    const lineId = '__bbox-preview-line'

    const cleanup = () => {
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getLayer(fillId)) map.removeLayer(fillId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }

    if (!bboxPreview) {
      cleanup()
      return
    }

    const bboxPolygon: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [bboxPreview.west, bboxPreview.south],
          [bboxPreview.east, bboxPreview.south],
          [bboxPreview.east, bboxPreview.north],
          [bboxPreview.west, bboxPreview.north],
          [bboxPreview.west, bboxPreview.south],
        ]],
      },
    }

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: bboxPolygon,
      })
    } else {
      ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(bboxPolygon)
    }

    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#22d3ee',
          'fill-opacity': 0.12,
        },
      })
    }

    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#22d3ee',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      })
    }

    return cleanup
  }, [bboxPreview])

  // Auto-fit map to selected artifact bounds
  // Uses display geometry normalization to handle projected CRS artifacts
  useEffect(() => {
    const debugDisableAutoFit = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('debugDisableAutoFit') === '1'
    if (debugDisableAutoFit) return
    if (!selectedArtifact || !selectedArtifact.spatial || !isFeatureCollection(selectedArtifact.data)) return
    if (selectedRowIndex !== null) return
    const map = mapRef.current
    if (!map) return

    // Use display bounds - this handles CRS transformation for projected artifacts
    // The transformation is display-only; artifact CRS metadata is preserved
    getDisplayBounds(selectedArtifact).then((result) => {
      if (!result) {
        console.warn('[App] Could not compute display bounds for artifact')
        setSelectedArtifactDisplayStatus(
          needsDisplayTransformation(selectedArtifact)
            ? 'fallback_transform_failed'
            : null,
        )
        return
      }

      const { bounds, wasTransformed, status } = result
      setSelectedArtifactDisplayStatus(status)

      if (wasTransformed) {
        console.log('[App] Display-transformed bounds for projected CRS artifact:', selectedArtifact.crs, '→ WGS84')
      } else if (status !== 'none_needed') {
        console.warn('[App] Display transform fallback used for projected CRS artifact:', selectedArtifact.crs, status)
      }

      const projectedArtifactWithoutDisplayTransform = needsDisplayTransformation(selectedArtifact) && !wasTransformed
      if (projectedArtifactWithoutDisplayTransform) {
        console.warn('[App] Skipping fitBounds for projected CRS artifact because display normalization to WGS84 was unavailable:', selectedArtifact.crs, status)
        return
      }

      try {
        // Convert DisplayBounds to MapLibre LngLatBounds
        // bounds.south/west define the SW corner, bounds.north/east define the NE corner
        const sw = new maplibregl.LngLat(bounds.west, bounds.south)
        const ne = new maplibregl.LngLat(bounds.east, bounds.north)
        const mapBounds = new maplibregl.LngLatBounds(sw, ne)

        const padding = 30

        map.fitBounds(mapBounds, {
          padding,
          maxZoom: 16,
          duration: 500
        })
      } catch (fitError) {
        console.warn('[App] fitBounds failed:', fitError)
      }
    }).catch((error) => {
      console.warn('[App] Display bounds computation failed:', error)
      setSelectedArtifactDisplayStatus(null)
    })
  }, [selectedArtifact, selectedRowIndex])

  // Scroll selected row into view when selectedRowIndex changes
  useEffect(() => {
    if (selectedRowIndex === null || !tableContainerRef.current) return
    
    const container = tableContainerRef.current
    const rows = container.querySelectorAll('tbody tr')
    const targetRow = rows[selectedRowIndex]
    
    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedRowIndex])

  useEffect(() => {
    setSelectedArtifactDisplayStatus(null)
    setSelectedRowIndex(null)
  }, [selectedArtifactId])

  // Track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(true)
  }, [artifacts, history, savedQueries])

  // Check for saved project on mount
  useEffect(() => {
    if (hasSavedProject()) {
      setStatusMessage('Found saved project. Click "Open Project" to load it.')
      addToast('Found saved project. Click "Open Project" to load it.', 'info')
    }
  }, [])

  // Project persistence functions
  const handleSaveProject = () => {
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

  const handleOpenProject = async () => {
    const loaded = loadProject()
    if (!loaded) {
      setStatusMessage('No saved project found')
      addToast('No saved project found', 'warning')
      return
    }

    // Restore project state
    setProjectName(loaded.name)
    setSavedQueries(loaded.savedQueries || [])
    setSelectedArtifactId(loaded.selectedArtifactId)
    setBottomTab(loaded.activeTab || 'table')
    
    // Re-register tables in DuckDB for each artifact to restore queryability
    try {
      await reRegisterAllArtifactTables(loaded.artifacts)
    } catch (error) {
      console.error('Error re-registering tables:', error)
      // Continue anyway - artifacts still have their data for rendering
    }

    setArtifacts(loaded.artifacts)
    setHistory(loaded.history || [])
    setHasUnsavedChanges(false)
    setQueryHasRunSuccessfully(false)
    setStatusMessage(`Project "${loaded.name}" loaded successfully`)
    addToast(`Project "${loaded.name}" loaded successfully`, 'success')
  }
  handleOpenProjectRef.current = handleOpenProject

  const handleNewProject = () => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Create new project anyway?')) {
        return
      }
    }
    // Only clear saved project if there were unsaved changes
    // Otherwise preserve the saved project so user can "Open Project" later
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
  handleNewProjectRef.current = handleNewProject

  // Export functions
  const handleExportGeoJson = () => {
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

  const handleExportJson = async () => {
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

  // Saved query functions
  const handleSaveQuery = () => {
    if (!newQueryName.trim()) {
      setStatusMessage('Please enter a name for the query')
      addToast('Please enter a name for the query', 'warning')
      return
    }
    const newQuery = createSavedQuery(newQueryName.trim(), sql)
    setSavedQueries((prev) => [...prev, newQuery])
    setNewQueryName('')
    setShowSaveQueryDialog(false)
    setStatusMessage(`Query "${newQueryName}" saved`)
    addToast(`Query "${newQueryName}" saved`, 'success')
  }

  const handleLoadQuery = (query: SavedQuery) => {
    setSql(query.sql)
    setBottomTab('sql')
    setStatusMessage(getLoadedQueryStatusMessage(query))
    addToast(getLoadedQueryStatusMessage(query), 'info')
  }

  const handleDeleteQuery = (queryId: string) => {
    setSavedQueries((prev) => prev.filter((q) => q.id !== queryId))
    setStatusMessage(getDeletedQueryStatusMessage())
    addToast(getDeletedQueryStatusMessage(), 'info')
  }

  const openSampleImport = () => {
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

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    // File import path: requires importReview state
    if (!discoveryOverride && (!importReview || !importReview.data || importReview.supportLevel === 'unsupported')) return
    // Discovery path: validate FeatureCollection
    if (discoveryOverride && !isFeatureCollection(discoveryOverride.featureCollection)) return

    setImporting(true)
    setImportStage('importing')

    const eventId = makeId('event')
    const artifactId = makeId('artifact')

    // Resolve values from either importReview or discovery override
    const artifactName = discoveryOverride
      ? discoveryOverride.name
      : importReview!.fileName.replace(/\.[^.]+$/, '')
    const importFormat = discoveryOverride ? discoveryOverride.format : importReview!.format
    const importData = discoveryOverride ? discoveryOverride.featureCollection : importReview!.data
    const importCrs = discoveryOverride ? discoveryOverride.crs : importReview!.crs
    const importSpatial = true // Discovery vector results are always spatial
    const importGeometryType = discoveryOverride
      ? inferGeometryType(discoveryOverride.featureCollection)
      : importReview!.geometryType
    const importRowCount = discoveryOverride
      ? discoveryOverride.featureCollection.features.length
      : importReview!.rowCount

    const tableName = artifactName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'dataset'
    const crsProvenance = buildImportCrsProvenance(importCrs === 'unknown' ? undefined : importCrs)

    // Build warnings — discovery imports get a provenance warning from trace
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
      let artifactRenderIssue = !discoveryOverride && importReview!.format === 'GeoParquet' && !importReview!.spatial
        ? 'This GeoParquet artifact is registered and queryable, but map rendering is not available for the detected geometry column.'
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
            
            // For GeoParquet, fetch full geometry from the registered table for map rendering
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

        // Update artifact with full geometry data
        const updatedArtifact: Artifact = {
          ...artifact,
          data: artifactData,
          spatial: artifactSpatial,
          geometryType: artifactGeometryType,
          renderIssue: artifactRenderIssue,
        }

        // If the GeoParquet path successfully produced renderable map features,
        // clear the early import warning that claimed map rendering was not available.
        if (!discoveryOverride && updatedArtifact.format === 'GeoParquet' && updatedArtifact.spatial && isFeatureCollection(updatedArtifact.data)) {
          updatedArtifact.warnings = updatedArtifact.warnings.filter(
            (warning) => warning.title !== 'GeoParquet import'
          )
        }

        pushArtifactSnapshot(`Import: ${updatedArtifact.name}`)
        setArtifacts((current) => [...current, updatedArtifact])
        setHistory((current) => [historyEvent, ...current])
        setSelectedArtifactId(artifactId)
        setBottomTab('table')

        if (discoveryOverride) {
          // Discovery path: close panel and clean up
          discoveryOverride.onClose?.()
        } else {
          // File import path: reset import review state
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

  // Slice 6a: Discovery import handler — routes into confirmImport with override
  const handleDiscoveryImport = useCallback((result: ApiDiscoveryResult) => {
    if (result.kind !== 'vector' || !result.data) {
      addToast('Only vector discovery results can be imported to the workspace.', 'info')
      return
    }
    const fc = result.data as GeoJSON.FeatureCollection
    if (!isFeatureCollection(fc)) {
      addToast('Discovery result is not a valid FeatureCollection.', 'warning')
      return
    }
    // Derive a human-readable name from source + query/bbox
    const sourceLabel = result.provenance.source ?? 'discovery'
    const featureCount = fc.features.length
    const artifactName = `${sourceLabel}-${featureCount}-features`

    confirmImport({
      featureCollection: fc,
      name: artifactName,
      format: result.format ?? 'GeoJSON',
      crs: 'EPSG:4326',
      source: sourceLabel,
      trace: result.trace,
      onClose: () => {
        // Close discovery panel after successful import
        setActiveSidebar(null)
        setBboxPreview(null)
      },
    })
  }, [])

  // Slice 6b: Bbox preview handler
  const handleBboxPreview = useCallback((bbox: BBox | null) => {
    setBboxPreview(bbox)
  }, [])

  const runQuery = async () => {
    const queryableArtifacts = artifacts.filter((artifact) => artifact.tableName)
    if (queryableArtifacts.length === 0) {
      setQueryError('Import a GeoJSON or GeoParquet dataset first. Queries can only run against registered artifact tables.')
      setStatusMessage('Query blocked: no registered tables exist yet. Import a dataset first.')
      addToast('Query blocked: no registered tables exist yet. Import a dataset first.', 'warning')
      return
    }

    setQueryRunning(true)
    setQueryError(null)

    try {
      const db = await getDuckDb()
      const conn = await db.connect()
      try {
        const referencedTables = await conn.getTableNames(sql)
        const sourceArtifacts = queryableArtifacts.filter((artifact) =>
          artifact.tableName ? referencedTables.includes(artifact.tableName) : false,
        )

        const result = await conn.query(sql)
        const rows = result.toArray().map((row) => row.toJSON() as Record<string, unknown>)
        const columns = result.schema.fields.map((field) => field.name)
        const geometryColumn = columns.find((field) => /geometry|geom|wkb/i.test(field))
        setQueryPreview(buildQueryPreview({
          id: makeId('preview'),
          columns,
          rows,
          geometryColumn,
          referencedTables,
          sourceArtifacts,
        }))
        setQueryHasRunSuccessfully(true)
        setBottomTab('results')
        setBottomDockExpanded(true)
        setStatusMessage(getQueryRunStatusMessage({
          rowCount: rows.length,
          matchedArtifactCount: sourceArtifacts.length,
          referencedTableCount: referencedTables.length,
        }))
        addToast(getQueryRunStatusMessage({
          rowCount: rows.length,
          matchedArtifactCount: sourceArtifacts.length,
          referencedTableCount: referencedTables.length,
        }), 'info')
      } finally {
        await conn.close()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown query error'
      setQueryError(message)
      setStatusMessage(`Query failed: ${message}. Check table names, SQL syntax, and whether the selected data was actually registered.`)
      addToast(`Query failed: ${message}. Check table names, SQL syntax, and whether the selected data was actually registered.`, 'error')
    } finally {
      setQueryRunning(false)
    }
  }

  // Initiate the materialization naming flow
  const initiateMaterialization = () => {
    if (!queryPreview) return
    setDerivedArtifactName(getSuggestedQueryArtifactName(artifacts))
    setMaterializeStage('naming')
  }

  // Confirm and execute the materialization with the provided name
  const confirmMaterialize = async () => {
    if (!queryPreview || !derivedArtifactName.trim()) return

    setMaterializeStage('materializing')
    setMaterializing(true)

    const sourceArtifacts = (queryPreview.sourceArtifactIds ?? [])
      .map((id) => artifacts.find((artifact) => artifact.id === id))
      .filter((artifact): artifact is Artifact => Boolean(artifact))

    const derivedTableName = `derived_${derivedArtifactName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${makeId('short').replace(/-/g, '')}`
    const derivedName = derivedArtifactName.trim()

    let derivedData: unknown = queryPreview.rows
    let spatial = false
    let geometryType: string | undefined
    let renderIssue: string | undefined

    // Try to decode geometry from preview rows first
    if (queryPreview.geometryColumn) {
      const previewFeatureCollection = rowsToFeatureCollection(queryPreview.rows, queryPreview.geometryColumn)
      if (previewFeatureCollection) {
        derivedData = previewFeatureCollection
        spatial = true
        geometryType = inferGeometryType(previewFeatureCollection)
      }
    }

    try {
      const db = await getDuckDb()
      const conn = await db.connect()
      try {
        await db.registerFileText(`${derivedTableName}.json`, JSON.stringify(queryPreview.rows))
        await conn.query(`DROP TABLE IF EXISTS ${derivedTableName}`)
        conn.insertJSONFromPath(`${derivedTableName}.json`, { name: derivedTableName })
        
        // For spatial results, try to fetch full geometry from the registered table for better map rendering
        if (queryPreview.geometryColumn && !spatial) {
          const fullGeometry = await fetchFullGeometryFromTable(derivedTableName, queryPreview.geometryColumn)
          if (fullGeometry && fullGeometry.featureCollection) {
            derivedData = fullGeometry.featureCollection
            spatial = true
            geometryType = fullGeometry.geometryType
          }
        } else if (queryPreview.geometryColumn && spatial) {
          // Even if preview worked, try to get full geometry for better rendering
          const fullGeometry = await fetchFullGeometryFromTable(derivedTableName, queryPreview.geometryColumn)
          if (fullGeometry && fullGeometry.featureCollection) {
            derivedData = fullGeometry.featureCollection
            geometryType = fullGeometry.geometryType
          }
        }
      } finally {
        await conn.close()
      }
    } catch (error) {
      setStatusMessage(`Derived table registration failed: ${error instanceof Error ? error.message : 'unknown error'}. The preview still exists, but the result was not materialized into workspace truth.`)
      addToast(`Derived table registration failed: ${error instanceof Error ? error.message : 'unknown error'}. The preview still exists, but the result was not materialized into workspace truth.`, 'error')
      setMaterializeStage('idle')
      setMaterializing(false)
      return
    }

    renderIssue = getQueryRenderIssue(queryPreview, spatial)

    const eventId = makeId('event')
    const artifactId = makeId('artifact')
    const artifact = buildMaterializedQueryArtifact({
      eventId,
      artifactId,
      name: derivedName,
      tableName: derivedTableName,
      rows: queryPreview.rows,
      spatial,
      geometryType,
      sourceArtifacts,
      data: derivedData,
      renderIssue,
    })

    const eventRecord = buildQueryHistoryEvent({
      eventId,
      sql,
      queryPreview,
      sourceArtifacts,
      artifact,
      artifactId,
    })

    pushArtifactSnapshot(`Query: ${artifact.name}`)
    setArtifacts((current) => [...current, artifact])
    setHistory((current) => [eventRecord, ...current])
    setSelectedArtifactId(artifactId)
    setStatusMessage(`Created derived artifact ${artifact.name}`)
    addToast(`Created derived artifact ${artifact.name}`, 'success')
    
    // Mark the preview as materialized so we don't show the "materialize" message anymore
    if (queryPreview) {
      setQueryPreview({ ...queryPreview, materializedArtifactId: artifactId })
    }
    
    // Reset materialization state
    setMaterializeStage('idle')
    setMaterializing(false)
    setDerivedArtifactName('')
  }

  // Open buffer dialog with suggested name
  const openBufferDialog = () => {
    if (!selectedArtifact) return
    const suggestedName = `${selectedArtifact.name}_buffer`
    setBufferName(suggestedName)
    setBufferDistance('1')
    setBufferDistanceUnit('kilometers')
    setShowBufferDialog(true)
  }

  // Run buffer operation
  const runBuffer = async () => {
    if (!selectedArtifact) return
    
    const distance = parseFloat(bufferDistance)
    if (isNaN(distance) || distance <= 0) {
      setStatusMessage('Buffer distance must be a positive number')
      addToast('Buffer distance must be a positive number', 'warning')
      return
    }

    setBufferRunning(true)
    setShowBufferDialog(false)

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'buffer',
        'Buffer operation',
        (input) => engine.buffer(input, distance, bufferDistanceUnit),
        () => ({ distance, unit: bufferDistanceUnit })
      )

      if (result.error) {
        setStatusMessage(`Buffer failed: ${result.error}`)
        addToast(`Buffer failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        // Override name with user-provided name
        result.artifact.name = bufferName.trim() || `${selectedArtifact.name}_buffer`
        result.historyEvent.summary = `Buffer ${distance} ${bufferDistanceUnit} on ${selectedArtifact.name} → ${result.artifact.name}`
        
        pushArtifactSnapshot(`Buffer: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(`Buffer created: ${result.artifact!.name}`)
        addToast(`Buffer created: ${result.artifact!.name}`, 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Buffer failed: ${message}`)
      addToast(`Buffer failed: ${message}`, 'error')
    } finally {
      setBufferRunning(false)
      setBufferName('')
    }
  }

  // Open centroid dialog with suggested name
  const openCentroidDialog = () => {
    if (!selectedArtifact) return
    const suggestedName = `${selectedArtifact.name}_centroid`
    setCentroidName(suggestedName)
    setShowCentroidDialog(true)
  }

  const openConvexHullDialog = () => {
    if (!selectedArtifact) return
    const suggestedName = `${selectedArtifact.name}_convex_hull`
    setConvexHullName(suggestedName)
    setShowConvexHullDialog(true)
  }

  const openEnvelopeDialog = () => {
    if (!selectedArtifact) return
    const suggestedName = `${selectedArtifact.name}_envelope`
    setEnvelopeName(suggestedName)
    setShowEnvelopeDialog(true)
  }

  const openSimplifyDialog = () => {
    if (!selectedArtifact) return
    const suggestedName = `${selectedArtifact.name}_simplified`
    setSimplifyName(suggestedName)
    setSimplifyTolerance('0.001')
    setShowSimplifyDialog(true)
  }

  // Run centroid operation
  const runCentroid = async () => {
    if (!selectedArtifact) return

    setCentroidRunning(true)
    setShowCentroidDialog(false)

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'centroid',
        'Centroid operation',
        (input) => engine.centroid(input),
        () => ({})
      )

      if (result.error) {
        setStatusMessage(`Centroid failed: ${result.error}`)
        addToast(`Centroid failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        // Override name with user-provided name
        result.artifact.name = centroidName.trim() || `${selectedArtifact.name}_centroid`
        
        pushArtifactSnapshot(`Centroid: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(`Centroid created: ${result.artifact!.name}`)
        addToast(`Centroid created: ${result.artifact!.name}`, 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Centroid failed: ${message}`)
      addToast(`Centroid failed: ${message}`, 'error')
    } finally {
      setCentroidRunning(false)
      setCentroidName('')
    }
  }

  const runConvexHull = async () => {
    if (!selectedArtifact) return

    setConvexHullRunning(true)
    setShowConvexHullDialog(false)

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'convex-hull-v1',
        'Convex Hull operation',
        (input) => engine.convexHull(input),
        () => ({ contract: 'single-input polygon/multipolygon only', attributePolicy: 'none' })
      )

      if (result.error) {
        const refusal = getSingleInputOperationPresentation('convex-hull-v1')
        setStatusMessage(`${refusal?.refusalPrefix ?? 'Convex hull refused'}: ${result.error}`)
        addToast(`${refusal?.refusalPrefix ?? 'Convex hull refused'}: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        result.artifact.name = convexHullName.trim() || `${selectedArtifact.name}_convex_hull`
        result.historyEvent.summary = `Convex hull on ${selectedArtifact.name} → ${result.artifact.name}`

        pushArtifactSnapshot(`Convex hull: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(`Convex hull created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Output is a single derived hull with no source attributes carried forward.`)
        addToast(`Convex hull created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Output is a single derived hull with no source attributes carried forward.`, 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Convex hull failed: ${message}`)
      addToast(`Convex hull failed: ${message}`, 'error')
    } finally {
      setConvexHullRunning(false)
      setConvexHullName('')
    }
  }

  const runEnvelope = async () => {
    if (!selectedArtifact) return

    setEnvelopeRunning(true)
    setShowEnvelopeDialog(false)

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'envelope-v1',
        'Envelope operation',
        (input) => engine.envelope(input),
        () => ({ contract: 'single-input polygon/multipolygon only', outputMeaning: 'axis-aligned bounding box in source stored CRS', attributePolicy: 'none' })
      )

      if (result.error) {
        const refusal = getSingleInputOperationPresentation('envelope-v1')
        setStatusMessage(`${refusal?.refusalPrefix ?? 'Envelope refused'}: ${result.error}`)
        addToast(`${refusal?.refusalPrefix ?? 'Envelope refused'}: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        result.artifact.name = envelopeName.trim() || `${selectedArtifact.name}_envelope`
        result.historyEvent.summary = `Envelope on ${selectedArtifact.name} → ${result.artifact.name}`

        pushArtifactSnapshot(`Envelope: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(`Envelope created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Output is one axis-aligned bounding box polygon with no source attributes carried forward.`)
        addToast(`Envelope created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Output is one axis-aligned bounding box polygon with no source attributes carried forward.`, 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Envelope failed: ${message}`)
      addToast(`Envelope failed: ${message}`, 'error')
    } finally {
      setEnvelopeRunning(false)
      setEnvelopeName('')
    }
  }

  const runSimplify = async () => {
    if (!selectedArtifact) return

    const tolerance = parseFloat(simplifyTolerance)
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      setStatusMessage('Simplify tolerance must be a non-negative number')
      addToast('Simplify tolerance must be a non-negative number', 'warning')
      return
    }

    setSimplifyRunning(true)
    setShowSimplifyDialog(false)

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'simplify-v1',
        'Simplify operation',
        (input) => engine.simplify(input, tolerance),
        () => ({ contract: 'single-input polygon/multipolygon only', tolerance, toleranceUnits: selectedArtifact.crs, attributePolicy: 'source-only', topologyPreserving: false })
      )

      if (result.error) {
        const refusal = getSingleInputOperationPresentation('simplify-v1')
        setStatusMessage(`${refusal?.refusalPrefix ?? 'Simplify refused'}: ${result.error}`)
        addToast(`${refusal?.refusalPrefix ?? 'Simplify refused'}: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        result.artifact.name = simplifyName.trim() || `${selectedArtifact.name}_simplified`
        result.historyEvent.summary = `Simplify on ${selectedArtifact.name} → ${result.artifact.name}`

        pushArtifactSnapshot(`Simplify: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(`Simplify created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Tolerance ${tolerance} was interpreted in source CRS units, source attributes were preserved, and no topology-preservation claim is made on this v1 path.`)
        addToast(`Simplify created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Tolerance ${tolerance} was interpreted in source CRS units, source attributes were preserved, and no topology-preservation claim is made on this v1 path.`, 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Simplify failed: ${message}`)
      addToast(`Simplify failed: ${message}`, 'error')
    } finally {
      setSimplifyRunning(false)
      setSimplifyName('')
    }
  }

  // Open dissolve dialog with suggested name
  const openNamedOperationDialog = (
    suggestedSuffix: string,
    setName: (value: string) => void,
    setOpen: (value: boolean) => void,
  ) => {
    if (!selectedArtifact) return
    setName(`${selectedArtifact.name}_${suggestedSuffix}`)
    setOpen(true)
  }

  const openDissolveDialog = () => {
    if (!selectedArtifact) return
    const joinableFields = getJoinableFieldNames(selectedArtifact)
    setDissolveGroupingField(joinableFields[0] ?? '')
    openNamedOperationDialog('grouped_dissolve', setDissolveName, setShowDissolveDialog)
  }

  const openAreaDialog = () => {
    openNamedOperationDialog('area', setAreaName, setShowAreaDialog)
  }

  const openPerimeterDialog = () => {
    openNamedOperationDialog('perimeter', setPerimeterName, setShowPerimeterDialog)
  }

  const openCompactnessDialog = () => {
    openNamedOperationDialog('compactness', setCompactnessName, setShowCompactnessDialog)
  }

  // Reproject dialog state helpers
  const openReprojectDialog = () => {
    if (!selectedArtifact) return
    // Set source CRS from artifact, default to 4326 if unknown/missing
    const sourceCrs = selectedArtifact.crs && selectedArtifact.crs !== 'unknown' 
      ? selectedArtifact.crs 
      : 'EPSG:4326'
    setReprojectSourceCrs(sourceCrs)
    setReprojectTargetCrs('EPSG:4326')
    const suggestedName = `${selectedArtifact.name}_reprojected`
    setReprojectName(suggestedName)
    setShowReprojectDialog(true)
  }

  // Run reproject operation - actual coordinate transformation
  const runReproject = async () => {
    if (!selectedArtifact) return

    // Validate source and target CRS
    if (!reprojectSourceCrs || !reprojectTargetCrs) {
      setStatusMessage('Please select both source and target CRS')
      addToast('Please select both source and target CRS', 'warning')
      return
    }

    if (reprojectSourceCrs === reprojectTargetCrs) {
      setStatusMessage('Source and target CRS are the same. No coordinate transformation is needed; use Assign CRS when metadata-only assignment lands.')
      addToast('Source and target CRS are the same. No coordinate transformation is needed; use Assign CRS when metadata-only assignment lands.', 'warning')
      return
    }

    const validation = validateForReproject(selectedArtifact, reprojectSourceCrs)
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join('; ')
      setStatusMessage(`Reproject refused: ${errorMessages}`)
      addToast(`Reproject refused: ${errorMessages}`, 'error')
      setShowReprojectDialog(false)
      return
    }

    setReprojectRunning(true)
    setShowReprojectDialog(false)

    try {
      const engine = getSpatialEngine()
      
      // Use the transform operation - actual coordinate reprojection
      const result = await executeGeometryOperation(
        selectedArtifact,
        'reproject',
        'CRS reprojection',
        (input) => engine.transform(input, reprojectSourceCrs, reprojectTargetCrs),
        () => ({ sourceCrs: reprojectSourceCrs, targetCrs: reprojectTargetCrs })
      )

      if (result.error) {
        setStatusMessage(`Reproject failed: ${result.error}`)
        addToast(`Reproject failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        // Override name with user-provided name
        result.artifact.name = reprojectName.trim() || `${selectedArtifact.name}_reprojected`
        result.artifact.crs = reprojectTargetCrs // The output CRS after transformation
        result.artifact.crsProvenance = {
          confidence: 'known',
          declaredCrs: reprojectTargetCrs,
          source: 'operation-derived', // Explicit reprojection produces a known output CRS
          warnings: [],
        }
        result.historyEvent.summary = `Reproject ${selectedArtifact.name} from ${reprojectSourceCrs} to ${reprojectTargetCrs} → ${result.artifact.name}`
        
        pushArtifactSnapshot(`Reproject: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(`Reprojected: ${result.artifact!.name} (${reprojectSourceCrs} → ${reprojectTargetCrs})`)
        addToast(`Reprojected: ${result.artifact!.name} (${reprojectSourceCrs} → ${reprojectTargetCrs})`, 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Reproject failed: ${message}`)
      addToast(`Reproject failed: ${message}`, 'error')
    } finally {
      setReprojectRunning(false)
      setReprojectName('')
    }
  }

  // Assign CRS - metadata only, no transformation
  // NOTE: This is a planned feature. Currently the reproject dialog handles CRS changes.
  // When implementing, set artifact.crs and artifact.crsProvenance without transforming coordinates.
  const assignCrs = async (targetCrs: string) => {
    if (!selectedArtifact) return

    // TODO: Implement actual CRS assignment - update metadata without coordinate transformation
    // This should: set artifact.crs, update crsProvenance with source: 'user-assigned', confidence: 'known'
    setStatusMessage(`Assign CRS is not yet implemented. Use Reproject to transform coordinates to a new CRS.`)
    addToast(`Assign CRS is not yet implemented. Use Reproject to transform coordinates to a new CRS.`, 'warning')
  }

  // Open clip dialog with suggested name
  const openClipDialog = () => {
    if (!selectedArtifact) return
    // Pre-select a different spatial artifact as the mask if available
    const otherSpatial = artifacts.find(a => a.id !== selectedArtifact.id && a.spatial)
    const suggestedName = `${selectedArtifact.name}_clipped`
    setClipName(suggestedName)
    setClipMaskArtifactId(otherSpatial?.id ?? '')
    setShowClipDialog(true)
  }

  // Run clip operation with validation
  const runClip = async () => {
    if (!selectedArtifact) return

    const clipRoleContext = getTopologyRoleContext('clip-v1')
    const maskArtifact = artifacts.find(a => a.id === clipMaskArtifactId)
    if (!maskArtifact) {
      setStatusMessage(clipRoleContext.secondarySelectionPrompt)
      addToast(clipRoleContext.secondarySelectionPrompt, 'warning')
      return
    }

    // Validate clip operation according to v1 contract
    const validation = validateForClip(selectedArtifact, maskArtifact)
    if (!validation.valid) {
      // Construct detailed error message from validation errors
      const errorMessages = validation.errors.map(e => e.message).join('; ')
      setStatusMessage(`Clip refused: ${errorMessages}`)
      addToast(`Clip refused: ${errorMessages}`, 'error')
      setShowClipDialog(false)
      return
    }

    setClipRunning(true)
    setShowClipDialog(false)

    try {
      const engine = getSpatialEngine()
      
      // Use the new two-input clip execution
      const result = await executeClipOperation({
        sourceArtifact: selectedArtifact,
        maskArtifact: maskArtifact,
        outputName: clipName.trim() || `${selectedArtifact.name}_clipped`,
        executeClip: (sourceInput, maskInput) => engine.clip(sourceInput, maskInput),
      })

      if (result.error) {
        setStatusMessage(`Clip failed: ${result.error}`)
        addToast(`Clip failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        pushArtifactSnapshot(`Clip: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(
          result.artifact!.rowCount === 0
            ? `Clip created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. No overlap was found, so the result artifact is intentionally empty.`
            : `Clip created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}.`
        )
        addToast(
          result.artifact!.rowCount === 0
            ? `Clip created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. No overlap was found, so the result artifact is intentionally empty.`
            : `Clip created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}.`,
          'success'
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Clip failed: ${message}`)
      addToast(`Clip failed: ${message}`, 'error')
    } finally {
      setClipRunning(false)
      setClipName('')
      setClipMaskArtifactId('')
    }
  }

  // Open intersect dialog with suggested name
  const openIntersectDialog = () => {
    if (!selectedArtifact) return
    // Pre-select a different spatial artifact as the overlay if available
    const otherSpatial = artifacts.find(a => a.id !== selectedArtifact.id && a.spatial)
    const suggestedName = `${selectedArtifact.name}_intersected`
    setIntersectName(suggestedName)
    setOverlayArtifactId(otherSpatial?.id ?? '')
    setShowIntersectDialog(true)
  }

  const openAttributeJoinDialog = () => {
    if (!selectedArtifact) return
    const otherArtifact = artifacts.find(a => a.id !== selectedArtifact.id) ?? null
    const defaults = getAttributeJoinDialogDefaults(selectedArtifact, otherArtifact)
    setAttributeJoinArtifactId(defaults.artifactId)
    setAttributeJoinSourceKey(defaults.sourceKey)
    setAttributeJoinSecondaryKey(defaults.secondaryKey)
    setAttributeJoinSelectedFields(defaults.selectedFields)
    setAttributeJoinName(defaults.outputName)
    setShowAttributeJoinDialog(true)
  }

  // Run intersect operation with validation
  const runIntersect = async () => {
    if (!selectedArtifact) return

    const intersectRoleContext = getTopologyRoleContext('intersect-v1')
    const overlayArtifact = artifacts.find(a => a.id === overlayArtifactId)
    if (!overlayArtifact) {
      setStatusMessage(intersectRoleContext.secondarySelectionPrompt)
      addToast(intersectRoleContext.secondarySelectionPrompt, 'warning')
      return
    }

    const validation = validateForIntersect(selectedArtifact, overlayArtifact)
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join('; ')
      setStatusMessage(`Intersect refused: ${errorMessages}`)
      addToast(`Intersect refused: ${errorMessages}`, 'error')
      setShowIntersectDialog(false)
      return
    }

    setIntersectRunning(true)
    setShowIntersectDialog(false)

    try {
      const engine = getSpatialEngine()
      const result = await executeIntersectOperation({
        sourceArtifact: selectedArtifact,
        overlayArtifact,
        outputName: intersectName.trim() || `${selectedArtifact.name}_intersected`,
        executeIntersect: (sourceInput, overlayInput) => engine.intersect(sourceInput, overlayInput),
      })

      if (result.error) {
        setStatusMessage(`Intersect failed: ${result.error}`)
        addToast(`Intersect failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        pushArtifactSnapshot(`Intersect: ${result.artifact.name}`)
        setArtifacts(current => [...current, result.artifact!])
        setHistory(current => [result.historyEvent!, ...current])
        setSelectedArtifactId(result.artifact!.id)
        setStatusMessage(
          result.artifact!.rowCount === 0
            ? `Intersect created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. No overlapping area was found, so the result artifact is intentionally empty.`
            : `Intersect created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Source attributes were preserved; overlay attributes are not merged in v1.`
        )
        addToast(
          result.artifact!.rowCount === 0
            ? `Intersect created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. No overlapping area was found, so the result artifact is intentionally empty.`
            : `Intersect created: ${result.artifact!.name}. Stored CRS remains ${result.artifact!.crs ?? 'unknown'}. Source attributes were preserved; overlay attributes are not merged in v1.`,
          'success'
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Intersect failed: ${message}`)
      addToast(`Intersect failed: ${message}`, 'error')
    } finally {
      setIntersectRunning(false)
      setIntersectName('')
      setOverlayArtifactId('')
    }
  }

  const runAttributeJoin = async () => {
    if (!selectedArtifact) return
    const joinArtifact = artifacts.find((artifact) => artifact.id === attributeJoinArtifactId)
    const presentation = getAttributeJoinPresentation()

    if (!joinArtifact) {
      setStatusMessage('Please select a join artifact.')
      addToast('Please select a join artifact.', 'warning')
      return
    }

    if (!attributeJoinSourceKey) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one left-side join key.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one left-side join key.`, 'error')
      return
    }

    if (!attributeJoinSecondaryKey) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one right-side join key.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one right-side join key.`, 'error')
      return
    }

    const leftFields = getJoinableFieldNames(selectedArtifact)
    const rightFields = getJoinableFieldNames(joinArtifact)
    if (!leftFields.includes(attributeJoinSourceKey)) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: left-side join key "${attributeJoinSourceKey}" does not exist.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: left-side join key "${attributeJoinSourceKey}" does not exist.`, 'error')
      return
    }
    if (!rightFields.includes(attributeJoinSecondaryKey)) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: right-side join key "${attributeJoinSecondaryKey}" does not exist.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: right-side join key "${attributeJoinSecondaryKey}" does not exist.`, 'error')
      return
    }
    if (attributeJoinSelectedFields.length === 0) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: select at least one explicit right-side field.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: select at least one explicit right-side field.`, 'error')
      return
    }

    setAttributeJoinRunning(true)
    setShowAttributeJoinDialog(false)

    try {
      const selectedFields = getAttributeJoinOutputFieldSelection({
        sourceFieldNames: leftFields,
        rightFieldNames: rightFields,
        selectedRightFields: attributeJoinSelectedFields,
      })
      const result = await executeAttributeJoinOperation({
        sourceArtifact: selectedArtifact,
        secondaryArtifact: joinArtifact,
        sourceKey: attributeJoinSourceKey,
        secondaryKey: attributeJoinSecondaryKey,
        selectedFields,
        outputName: attributeJoinName.trim() || `${selectedArtifact.name}_attribute_join`,
      })

      if (result.error) {
        setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: ${result.error}`)
        addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: ${result.error}`, 'error')
        return
      }

      applyOperationResult(result, {
        statusMessage: result.artifact
          ? `Attribute join created: ${result.artifact.name}. Left output kind and geometry semantics were preserved; selected right-side fields were added with nulls for unmatched left rows and join_ prefixes on collisions.`
          : undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Attribute join failed: ${message}`)
      addToast(`Attribute join failed: ${message}`, 'error')
    } finally {
      setAttributeJoinRunning(false)
      setAttributeJoinName('')
      setAttributeJoinArtifactId('')
      setAttributeJoinSourceKey('')
      setAttributeJoinSecondaryKey('')
      setAttributeJoinSelectedFields([])
    }
  }

  const applyOperationResult = (
    result: { artifact?: Artifact; historyEvent?: HistoryEvent },
    options?: { bottomTab?: BottomTab; statusMessage?: string; splitSelectionIntoNextCommit?: boolean },
  ) => {
    if (!result.artifact || !result.historyEvent) return
    const artifact = result.artifact
    const historyEvent = result.historyEvent
    const shouldSplitSelectionIntoNextCommit = options?.splitSelectionIntoNextCommit === true
    if (debugParams.logMapSync) {
      console.log('[App][operation-result] applying', {
        artifactId: artifact.id,
        artifactName: artifact.name,
        selectedArtifactIdBefore: selectedArtifactId,
        artifactsBefore: artifacts.map((entry) => entry.id),
        historyEventId: historyEvent.id,
        disableOperationSelection: debugParams.disableOperationSelection,
        deferOperationSelection: debugParams.deferOperationSelection,
        splitSelectionIntoNextCommit: shouldSplitSelectionIntoNextCommit,
      })
    }
    pushArtifactSnapshot(`Operation: ${artifact.name}`)
    setArtifacts(current => {
      if (debugParams.logMapSync) {
        console.log('[App][operation-result] commit artifacts', {
          artifactId: artifact.id,
          beforeIds: current.map((entry) => entry.id),
          afterIds: [...current.map((entry) => entry.id), artifact.id],
        })
      }
      return [...current, artifact]
    })
    setHistory(current => [historyEvent, ...current])
    if (debugParams.disableOperationSelection) {
      if (debugParams.logMapSync) {
        console.log('[App][operation-result] selection suppressed', { artifactId: artifact.id })
      }
      setPendingPostCommitSelectedArtifactId(null)
    } else if (shouldSplitSelectionIntoNextCommit) {
      if (debugParams.logMapSync) {
        console.log('[App][operation-result] phase-splitting selection into next commit', { artifactId: artifact.id })
      }
      setPendingPostCommitSelectedArtifactId(artifact.id)
    } else if (debugParams.deferOperationSelection) {
      if (debugParams.logMapSync) {
        console.log('[App][operation-result] deferring selection', { artifactId: artifact.id })
      }
      setTimeout(() => {
        if (debugParams.logMapSync) {
          console.log('[App][operation-result] deferred selection fire', { artifactId: artifact.id })
        }
        setSelectedArtifactId(artifact.id)
      }, 0)
    } else {
      setSelectedArtifactId(artifact.id)
      setPendingPostCommitSelectedArtifactId(null)
    }
    if (options?.bottomTab) {
      setBottomTab(options.bottomTab)
    }
    if (options?.statusMessage) {
      setStatusMessage(options.statusMessage)
      if (options?.statusMessage) addToast(options.statusMessage, 'success')
    }
  }

  const runDissolve = async () => {
    if (!selectedArtifact) return

    if (debugParams.logMapSync) {
      console.log('[App][grouped-dissolve] run start', {
        selectedArtifactId: selectedArtifact.id,
        selectedArtifactName: selectedArtifact.name,
        dissolveGroupingField,
        dissolveName,
      })
    }

    setDissolveRunning(true)
    setShowDissolveDialog(false)

    try {
      const engine = getSpatialEngine()
      const result = await executeRegisteredAggregationOperation({
        operationId: 'dissolve-grouped-v1',
        sourceArtifact: selectedArtifact,
        executeOperation: (input) => engine.dissolve(input),
        outputName: dissolveName.trim() || `${selectedArtifact.name}_grouped_dissolve`,
        groupingField: dissolveGroupingField,
      })

      if (result.error) {
        if (debugParams.logMapSync) {
          console.log('[App][grouped-dissolve] result error', { error: result.error })
        }
        setStatusMessage(`Grouped dissolve failed: ${result.error}`)
        addToast(`Grouped dissolve failed: ${result.error}`, 'error')
        return
      }

      if (debugParams.logMapSync) {
        console.log('[App][grouped-dissolve] result success', {
          artifactId: result.artifact?.id ?? null,
          artifactName: result.artifact?.name ?? null,
          historyEventId: result.historyEvent?.id ?? null,
        })
      }

      if (typeof window !== 'undefined' && debugParams.logMapSync) {
        ;(window as typeof window & {
          __debugLastGroupedResult?: {
            artifactId: string | null
            artifactName: string | null
            selectedArtifactIdAtSuccess: string | null
            artifactIdsAtSuccess: string[]
            pendingPostCommitSelectedArtifactIdAtSuccess: string | null
            timestamp: string
          }
        }).__debugLastGroupedResult = {
          artifactId: result.artifact?.id ?? null,
          artifactName: result.artifact?.name ?? null,
          selectedArtifactIdAtSuccess: selectedArtifactIdRef.current,
          artifactIdsAtSuccess: artifactsRef.current.map((artifact) => artifact.id),
          pendingPostCommitSelectedArtifactIdAtSuccess: pendingPostCommitSelectedArtifactIdRef.current,
          timestamp: new Date().toISOString(),
        }
      }

      if (result.artifact && result.historyEvent) {
        result.artifact.name = dissolveName.trim() || `${selectedArtifact.name}_grouped_dissolve`
      }

      applyOperationResult(result, {
        statusMessage: result.artifact
          ? getOperationSuccessStatusMessage('dissolve-grouped-v1', result.artifact, selectedArtifact) ?? `Grouped dissolve created: ${result.artifact.name}`
          : undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Grouped dissolve failed: ${message}`)
      addToast(`Grouped dissolve failed: ${message}`, 'error')
    } finally {
      setDissolveRunning(false)
      setDissolveName('')
      setDissolveGroupingField('')
    }
  }

  const runMeasurementOperation = async (
    operationId: 'area-v1' | 'perimeter-v1' | 'compactness-v1',
    outputName: string,
    setRunning: (value: boolean) => void,
    setOpen: (value: boolean) => void,
    clearName: () => void,
  ) => {
    if (!selectedArtifact) return

    const presentation = getMeasurementOperationPresentation(operationId)
    setRunning(true)
    setOpen(false)

    try {
      const result = await executeRegisteredMeasurementOperation({
        operationId,
        sourceArtifact: selectedArtifact,
        outputName,
      })

      if (result.error) {
        setStatusMessage(`${presentation?.refusalPrefix ?? 'Measurement refused'}: ${result.error}`)
        addToast(`${presentation?.refusalPrefix ?? 'Measurement refused'}: ${result.error}`, 'error')
        return
      }

      applyOperationResult(result, {
        bottomTab: 'table',
        statusMessage: result.artifact
          ? getOperationSuccessStatusMessage(operationId, result.artifact, selectedArtifact) ?? `${presentation?.title ?? 'Measurement'} created: ${result.artifact.name}.`
          : undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`${presentation?.title ?? 'Measurement'} failed: ${message}`)
      addToast(`${presentation?.title ?? 'Measurement'} failed: ${message}`, 'error')
    } finally {
      setRunning(false)
      clearName()
    }
  }

  const runArea = async () => {
    if (!selectedArtifact) return
    await runMeasurementOperation(
      'area-v1',
      areaName.trim() || `${selectedArtifact.name}_area`,
      setAreaRunning,
      setShowAreaDialog,
      () => setAreaName(''),
    )
  }

  const runPerimeter = async () => {
    if (!selectedArtifact) return
    await runMeasurementOperation(
      'perimeter-v1',
      perimeterName.trim() || `${selectedArtifact.name}_perimeter`,
      setPerimeterRunning,
      setShowPerimeterDialog,
      () => setPerimeterName(''),
    )
  }

  const runCompactness = async () => {
    if (!selectedArtifact) return
    await runMeasurementOperation(
      'compactness-v1',
      compactnessName.trim() || `${selectedArtifact.name}_compactness`,
      setCompactnessRunning,
      setShowCompactnessDialog,
      () => setCompactnessName(''),
    )
  }

  const rowsForSelected = useMemo(() => {
    if (!selectedArtifact) return []
    if (isFeatureCollection(selectedArtifact.data)) {
      return selectedArtifact.data.features.map((feature, featureIndex) => ({
        _featureIndex: featureIndex,
        ...(feature.properties ?? {}),
        geometry: feature.geometry?.type ?? null,
      }))
    }
    if (selectedArtifact.tableRows?.length) {
      return selectedArtifact.tableRows
    }
    if (Array.isArray(selectedArtifact.data)) {
      return selectedArtifact.data as Record<string, unknown>[]
    }
    return []
  }, [selectedArtifact])

  const selectedArtifactOriginEvent = selectedArtifact
    ? history.find((event) => event.id === selectedArtifact.originEventId) ?? null
    : null
  const selectedArtifactOutputKind = selectedArtifact ? getArtifactOutputKind(selectedArtifact) : null
  const selectedArtifactExportOptions = useMemo(
    () => (selectedArtifact ? getArtifactExportOptions(selectedArtifact) : []),
    [selectedArtifact],
  )
  const queryPreviewMaterializedOutputKind = queryPreview?.materialization?.outputKind ?? null
  const queryPreviewProvenancePresentation = queryPreview?.materialization
    ? getQueryProvenanceStrengthPresentation(queryPreview.materialization.provenanceStrength)
    : null
  const selectedFeatureGeometry = useMemo(() => {
    if (!selectedArtifact || !isFeatureCollection(selectedArtifact.data) || selectedRowIndex === null) return null
    const feature = selectedArtifact.data.features[selectedRowIndex]
    return feature?.geometry ?? null
  }, [selectedArtifact, selectedRowIndex])
  const selectedFeatureProperties = useMemo(() => {
    if (!selectedArtifact || !isFeatureCollection(selectedArtifact.data) || selectedRowIndex === null) return null
    return selectedArtifact.data.features[selectedRowIndex]?.properties ?? null
  }, [selectedArtifact, selectedRowIndex])
  const selectedHistoryEvent = selectedHistoryEventId
    ? history.find((event) => event.id === selectedHistoryEventId) ?? null
    : null


  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>Web-native Geoprocessing Suite</strong>
          <div className="muted small">
            {projectName}
            {hasUnsavedChanges && <span style={{ color: '#e11d48' }}> •</span>}
          </div>
        </div>
        <div className="actions" style={{ marginTop: 0, gap: 8 }}>
          <button
            className="secondary"
            onClick={handleUndo}
            disabled={!canUndo}
            title={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}
            aria-label="Undo"
          >
            <Undo2 size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            className="secondary"
            onClick={handleRedo}
            disabled={!canRedo}
            title={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'}
            aria-label="Redo"
          >
            <Redo2 size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button className="secondary" onClick={handleNewProject} aria-label="New project">
            <FilePlus size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="btn-text">New</span>
          </button>
          <button className="secondary" onClick={() => setShowSaveDialog(true)} aria-label="Save project">
            <Save size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="btn-text">Save Project</span>
          </button>
          <button className="secondary" onClick={handleOpenProject} aria-label="Open project">
            <FolderOpen size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="btn-text">Open Project</span>
          </button>
          {selectedArtifact && (
            <div style={{ position: 'relative' }}>
              <button
                className="secondary"
                onClick={() => setShowExportMenu(prev => !prev)}
                disabled={selectedArtifactExportOptions.length === 0}
                title={selectedArtifactExportOptions.length === 0 ? 'No export formats available' : 'Export selected artifact'}
                aria-label="Export"
              >
                <Download size={18} strokeWidth={1.5} aria-hidden="true" />
                <span className="btn-text">Export</span>
              </button>
              {showExportMenu && selectedArtifactExportOptions.length > 0 && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowExportMenu(false)} />
                  <div className="export-dropdown" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100 }}>
                    {selectedArtifactExportOptions.map((option) => (
                      <button
                        key={option.kind}
                        className="export-option"
                        onClick={() => {
                          if (option.kind === 'geojson') handleExportGeoJson()
                          else if (option.kind === 'json') handleExportJson()
                        }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'inherit', padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
                      >
                        <strong>{option.label}</strong>
                        <div className="small muted" style={{ marginTop: 2 }}>{option.description}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            className="secondary"
            title="Settings"
            aria-label="Settings"
            onClick={() => addToast('Settings panel coming in a later slice.', 'info')}
          >
            <Settings size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Sidebar icon rail */}
      <nav className="sidebar-rail">
        <button
          className={`sidebar-rail-btn ${activeSidebar === 'layers' ? 'active' : ''}`}
          title="Layers"
          aria-label="Layers"
          onClick={() => toggleSidebar('layers')}
        >
          <Layers size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="sidebar-rail-label">Layers</span>
        </button>
        <button
          className={`sidebar-rail-btn ${activeSidebar === 'discover' ? 'active' : ''}`}
          title="Discover"
          aria-label="Discover"
          onClick={() => toggleSidebar('discover')}
        >
          <Search size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="sidebar-rail-label">Discover</span>
        </button>
        <button
          className="sidebar-rail-btn import-btn"
          title="Import"
          aria-label="Import"
          onClick={() => importFileRef.current?.click()}
        >
          <Plus size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="sidebar-rail-label">Import</span>
        </button>
        <button
          className={`sidebar-rail-btn ${activeSidebar === 'query' ? 'active' : ''}`}
          title="Query"
          aria-label="Query"
          onClick={() => toggleSidebar('query')}
        >
          <MessageSquare size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="sidebar-rail-label">Query</span>
        </button>
        <button
          className={`sidebar-rail-btn ${rightPanelOpen ? 'active' : ''}`}
          title="History"
          aria-label="History"
          onClick={() => setRightPanelOpen(prev => !prev)}
        >
          <History size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="sidebar-rail-label">History</span>
        </button>
        <input
          ref={importFileRef}
          className="input-file"
          type="file"
          accept=".json,.geojson,.parquet,.geoparquet"
          onChange={handleFileImport}
          style={{ display: 'none' }}
        />
      </nav>

      {/* Bottom tab bar — mobile only (hidden on desktop via CSS) */}
      <nav className="bottom-tab-bar" aria-label="Primary navigation">
        <button className={`bottom-tab ${activeSidebar === 'layers' ? 'active' : ''}`} onClick={() => toggleSidebar('layers')}>
          <Layers size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="bottom-tab-label">Layers</span>
        </button>
        <button className={`bottom-tab ${activeSidebar === 'discover' ? 'active' : ''}`} onClick={() => toggleSidebar('discover')}>
          <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="bottom-tab-label">Discover</span>
        </button>
        <button className="bottom-tab" onClick={() => importFileRef.current?.click()}>
          <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="bottom-tab-label">Import</span>
        </button>
        <button className={`bottom-tab ${activeSidebar === 'query' ? 'active' : ''}`} onClick={() => toggleSidebar('query')}>
          <MessageSquare size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="bottom-tab-label">Query</span>
        </button>
        <button className={`bottom-tab ${rightPanelOpen ? 'active' : ''}`} onClick={() => setRightPanelOpen(prev => !prev)}>
          <History size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="bottom-tab-label">History</span>
        </button>
      </nav>

      {/* Sidebar drawer backdrop (mobile) */}
      <div
        className={`sidebar-drawer-backdrop ${activeSidebar ? 'open' : ''}`}
        onClick={() => setActiveSidebar(null)}
      />

      {/* Sidebar drawer */}
      {activeSidebar && (
        <aside className="sidebar-drawer">
          {activeSidebar === 'layers' && (
            <LayersPanel
              projectName={projectName}
              statusMessage={statusMessage}
              artifacts={artifacts}
              selectedArtifactId={selectedArtifactId}
              setSelectedArtifactId={setSelectedArtifactId}
              setRightPanelOpen={setRightPanelOpen}
              savedQueries={savedQueries}
              handleLoadQuery={handleLoadQuery}
              handleDeleteQuery={handleDeleteQuery}
              setShowSaveQueryDialog={setShowSaveQueryDialog}
              layerSettings={layerSettings}
              onToggleVisibility={toggleLayerVisibility}
              onChangeOpacity={changeLayerOpacity}
              onReorder={reorderLayer}
              onImportFile={() => importFileRef.current?.click()}
              onLoadSampleData={openSampleImport}
              onOpenDiscover={() => setActiveSidebar('discover')}
            />
          )}

          {activeSidebar === 'discover' && (
            <DiscoveryPanel
              onImport={handleDiscoveryImport}
              onBboxPreview={handleBboxPreview}
              source={discoverySource}
              initialQuery={discoverySeedQuery}
            />
          )}

          {activeSidebar === 'query' && (
            <>
              <h2 className="panel-title">SQL Query</h2>
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="row">
                  <strong>{artifacts.filter((artifact) => artifact.tableName).length === 0 ? 'No data loaded' : `${artifacts.filter((artifact) => artifact.tableName).length} tables loaded`}</strong>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  {artifacts.filter((artifact) => artifact.tableName).length === 0
                    ? 'Import a GeoJSON file or discover data to enable SQL queries.'
                    : artifacts
                        .filter((artifact) => artifact.tableName)
                        .map((artifact) => `${artifact.tableName} (${artifact.kind})`)
                        .join(', ')}
                </div>
                {artifacts.filter((artifact) => artifact.tableName).length === 0 && (
                  <div className="small muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
                    <button
                      className="secondary"
                      style={{ padding: '2px 8px', fontSize: 'inherit' }}
                      onClick={() => importFileRef.current?.click()}
                    >
                      Import data
                    </button>
                    {' '}or{' '}
                    <button
                      className="empty-state-link"
                      style={{ padding: '2px 8px', fontSize: 'inherit' }}
                      onClick={() => setActiveSidebar('discover')}
                    >
                      discover data
                    </button>
                  </div>
                )}
              </div>
              <div className="small muted" style={{ marginBottom: 4, fontStyle: 'italic' }}>
                Example query — import data to run this.
              </div>
              <textarea className="sql-editor" value={sql} onChange={(event) => setSql(event.target.value)} />
              {queryError && (
                <div className="card danger" style={{ marginTop: 12 }}>
                  <strong>Query failed</strong>
                  <div className="small muted" style={{ marginTop: 6 }}>{queryError}</div>
                  <div className="small" style={{ marginTop: 6 }}>Recovery: verify table names, SQL syntax, and that the referenced artifact tables are registered in the workspace.</div>
                </div>
              )}
              <div className="actions">
                <button className="primary" onClick={runQuery} disabled={queryRunning || artifacts.filter((artifact) => artifact.tableName).length === 0}>{queryRunning ? 'Running…' : 'Run query'}</button>
                <button className="secondary" onClick={() => setShowSaveQueryDialog(true)} disabled={!queryHasRunSuccessfully}>Save Query</button>
                <button className="secondary" onClick={() => setSql(SAMPLE_SQL)}>Reset to example</button>
              </div>

              <h3 className="panel-title" style={{ marginTop: 16 }}>Saved Queries</h3>
              <div className="artifact-list">
                {savedQueries.length === 0 && <div className="card muted">No saved queries yet.</div>}
                {savedQueries.map((query) => (
                  <div
                    key={query.id}
                    className="card"
                    style={{ textAlign: 'left' }}
                    onClick={() => handleLoadQuery(query)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLoadQuery(query) }}
                  >
                    <div className="row">
                      <strong>{query.name}</strong>
                      <button
                        className="secondary"
                        style={{ padding: '2px 6px', fontSize: 11 }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteQuery(query.id) }}
                      >
                        ×
                      </button>
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {query.sql.substring(0, 50)}{query.sql.length > 50 ? '...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

        </aside>
      )}

      <main className="main-pane">
        <div ref={mapNodeRef} className="map-container" />
        {/* Centered overlay removed — empty state CTAs moved to bottom sheet, warnings handled by toasts */}
        {importStage === 'scanning' && (
          <div className="import-overlay">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }}>Scanning import</h3>
                <div className="muted small">Inspecting file structure, metadata, geometry, and queryability…</div>
              </div>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <div className="small muted">Preflight in progress. The workspace remains live while the file is inspected.</div>
            </div>
          </div>
        )}
        {importReview && importStage !== 'scanning' && (
          <div className="import-overlay">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }}>Import review</h3>
                <div className="muted small">Inspect before committing the file into the workspace.</div>
              </div>
              <button className="secondary" onClick={() => { setImportReview(null); setImportStage('idle') }}>Close</button>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row"><strong>{importReview.fileName}</strong><span className="badge">{importReview.supportLevel}</span></div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {importReview.format} · {importReview.rowCount ?? '?'} rows · {getArtifactGeometryLabel(importReview)}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>CRS: {importReview.crs ?? 'unknown'}</div>
            </div>
            {/* Notes section - informational current-state notes only */}
            {getCurrentNotes(importReview.warnings).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: '#93c5fd' }}>Notes</strong>
                <div className="artifact-list" style={{ marginTop: 8 }}>
                  {getCurrentNotes(importReview.warnings).map((warning) => (
                    <div key={warning.id} className="card" style={{ borderColor: '#1e3a5f', background: '#0a1525' }}>
                      <div className="row">
                        <strong>{warning.title}</strong>
                        <span className="badge info">{getSeverityLabel(warning)}</span>
                      </div>
                      <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                      <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Warnings section - for caution/serious/blocking only */}
            {importReview.warnings.some(isWarning) && (
              <div style={{ marginTop: 12 }}>
                <strong>Warnings</strong>
                <div className="artifact-list" style={{ marginTop: 8 }}>
                  {importReview.warnings.filter(isWarning).map((warning) => (
                    <div key={warning.id} className="card">
                      <div className="row">
                        <strong>{warning.title}</strong>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span className={`badge ${warning.severity}`}>{getSeverityLabel(warning)}</span>
                          <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                        </div>
                      </div>
                      <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                      <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {importReview.warnings.length === 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>Warnings</strong>
                <div className="artifact-list" style={{ marginTop: 8 }}>
                  <div className="card muted">No warnings detected.</div>
                </div>
              </div>
            )}
            <div className="actions">
              <button className="primary" disabled={importing || importReview.supportLevel === 'unsupported'} onClick={() => confirmImport()}>
                {importing ? 'Importing…' : 'Import into workspace'}
              </button>
              <button className="secondary" onClick={() => { setImportReview(null); setImportStage('idle') }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Save Project Dialog */}
        {showSaveDialog && (
          <div className="import-overlay">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }}>Save Project</h3>
                <div className="muted small">Enter a name for your project.</div>
              </div>
              <button className="secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project name..."
                style={{ width: '100%', padding: '8px', fontSize: '14px' }}
              />
            </div>
            <div className="actions">
              <button className="primary" onClick={handleSaveProject}>
                Save
              </button>
            </div>
          </div>
        )}

        {/* Save Query Dialog */}
        {showSaveQueryDialog && (
          <div className="import-overlay">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }}>Save Query</h3>
                <div className="muted small">Give this SQL query a name to save it.</div>
              </div>
              <button className="secondary" onClick={() => setShowSaveQueryDialog(false)}>Cancel</button>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <input
                type="text"
                value={newQueryName}
                onChange={(e) => setNewQueryName(e.target.value)}
                placeholder="Query name..."
                style={{ width: '100%', padding: '8px', fontSize: '14px' }}
              />
              <div className="small muted" style={{ marginTop: 8 }}>SQL Preview:</div>
              <pre className="card code-block" style={{ marginTop: 4, maxHeight: 100, overflow: 'auto' }}>
                {sql.substring(0, 200)}{sql.length > 200 ? '...' : ''}
              </pre>
            </div>
            <div className="actions">
              <button className="primary" onClick={handleSaveQuery} disabled={!newQueryName.trim()}>
                Save Query
              </button>
            </div>
          </div>
        )}

        {/* Buffer Operation Dialog */}
        {showBufferDialog && selectedArtifact && (() => {
          const { presentation, infoWarning } = getSingleInputDialogContract('buffer', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Buffer'),
            infoWarning ? {
              id: `${selectedArtifact.id}-buffer-info`,
              code: 'APPROXIMATE_OP',
              severity: infoWarning.severity,
              scope: 'active' as const,
              title: infoWarning.title,
              message: infoWarning.message,
            } : null,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Buffer Operation</h3>
                  <div className="muted small">Create a buffer around {selectedArtifact.name} on the current validated support path</div>
                </div>
                <button className="secondary" onClick={() => setShowBufferDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label="Source artifact"
                  artifact={selectedArtifact}
                  description="This artifact is the only input on the current buffer path."
                />

                <div style={{ marginTop: 12 }}>
                  <TypedWarningPanel
                    title="Warnings"
                    warnings={warnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: getOperationWarningTone(warning),
                    }))}
                  />
                </div>

                <OperationContractDisplay
                  title={`${presentation?.title ?? 'Buffer'} contract`}
                  geometryStatement={presentation?.geometryStatement}
                  crsStatement={presentation?.crsStatement ?? 'Buffer does not require known stored CRS to run on the current path, but unknown or missing CRS still reduces trust in the result.'}
                />

                <OperationOutputSemantics
                  title="Output semantics"
                  body={presentation?.outputSemantics ?? 'Buffer creates a derived artifact around the source geometry. On the current shipped path it does not broaden claims beyond the validated local runtime, and distance behavior remains approximation-sensitive.'}
                  outputKind={presentation?.outputKind}
                  outputKindLabel={presentation?.outputKindLabel}
                  outputKindDescription={presentation?.outputKindDescription}
                />

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Distance</strong>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      value={bufferDistance}
                      onChange={(e) => setBufferDistance(e.target.value)}
                      placeholder="Enter distance..."
                      min="0"
                      step="0.1"
                      style={{ flex: 1, padding: '8px', fontSize: '14px' }}
                    />
                    <select
                      value={bufferDistanceUnit}
                      onChange={(e) => setBufferDistanceUnit(e.target.value as 'kilometers' | 'miles')}
                      style={{ padding: '8px', fontSize: '14px' }}
                    >
                      <option value="kilometers">Kilometers</option>
                      <option value="miles">Miles</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={bufferName}
                    onChange={(e) => setBufferName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runBuffer}
                  disabled={bufferRunning || !bufferDistance || parseFloat(bufferDistance) <= 0}
                >
                  {bufferRunning ? 'Running...' : 'Run Buffer'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Centroid Operation Dialog */}
        {showCentroidDialog && selectedArtifact && (() => {
          const { presentation, infoWarning } = getSingleInputDialogContract('centroid', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Centroid'),
            infoWarning ? {
              id: `${selectedArtifact.id}-centroid-info`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: infoWarning.severity,
              scope: 'active' as const,
              title: infoWarning.title,
              message: infoWarning.message,
            } : null,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Centroid Operation</h3>
                  <div className="muted small">Calculate the centroid of {selectedArtifact.name} on the current validated support path</div>
                </div>
                <button className="secondary" onClick={() => setShowCentroidDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label="Source artifact"
                  artifact={selectedArtifact}
                  description="Centroid runs against the selected source artifact only on the current path."
                />

                <div style={{ marginTop: 12 }}>
                  <TypedWarningPanel
                    warnings={warnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: getOperationWarningTone(warning),
                    }))}
                  />
                </div>

                <OperationContractDisplay
                  title={`${presentation?.title ?? 'Centroid'} contract`}
                  geometryStatement={presentation?.geometryStatement}
                  crsStatement={presentation?.crsStatement ?? 'Centroid does not require known stored CRS to run on the current path, but unknown or missing CRS still reduces trust in the result.'}
                />

                <OperationOutputSemantics
                  body={presentation?.outputSemantics ?? 'Centroid returns a derived point artifact. It stays on the current validated engine seam and does not imply broader support than the current product contract.'}
                  outputKind={presentation?.outputKind}
                  outputKindLabel={presentation?.outputKindLabel}
                  outputKindDescription={presentation?.outputKindDescription}
                />

                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={centroidName}
                    onChange={(e) => setCentroidName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runCentroid}
                  disabled={centroidRunning || !centroidName.trim()}
                >
                  {centroidRunning ? 'Running...' : 'Calculate Centroid'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Convex Hull Operation Dialog */}
        {showConvexHullDialog && selectedArtifact && (() => {
          const { presentation, geometrySupport, infoWarning } = getSingleInputDialogContract('convex-hull-v1', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Convex Hull'),
            infoWarning ? {
              id: `${selectedArtifact.id}-convex-hull-info`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: infoWarning.severity,
              scope: 'active' as const,
              title: infoWarning.title,
              message: infoWarning.message,
            } : null,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Convex Hull Operation</h3>
                  <div className="muted small">Create one derived hull around the full extent of {selectedArtifact.name} on the narrow convex hull v1 path</div>
                </div>
                <button className="secondary" onClick={() => setShowConvexHullDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label="Source artifact"
                  artifact={selectedArtifact}
                  description="Convex hull v1 uses only the selected source artifact. It does not accept a secondary layer."
                />

                <div style={{ marginTop: 12 }}>
                  <OperationContractDisplay
                    title={`${presentation?.title ?? 'Convex hull'} contract`}
                    geometryStatement={presentation?.geometryStatement}
                    crsStatement={presentation?.crsStatement ?? 'Convex hull requires known stored CRS on the current shipped path. It does not auto-transform or infer CRS.'}
                    geometrySupport={geometrySupport ? {
                      ...geometrySupport,
                      secondaryGeometry: undefined,
                      secondaryAllowed: true,
                    } : undefined}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <TypedWarningPanel
                    warnings={warnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: getOperationWarningTone(warning),
                    }))}
                  />
                </div>

                <OperationOutputSemantics
                  body={presentation?.outputSemantics ?? 'Convex hull v1 creates one derived polygon hull artifact in the same stored CRS as the source. It intentionally does not preserve per-feature source attributes and makes no broader claim about lines, points, mixed geometry, or transform-aware execution.'}
                  outputKind={presentation?.outputKind}
                  outputKindLabel={presentation?.outputKindLabel}
                  outputKindDescription={presentation?.outputKindDescription}
                />

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={convexHullName}
                    onChange={(e) => setConvexHullName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runConvexHull}
                  disabled={convexHullRunning || !convexHullName.trim()}
                >
                  {convexHullRunning ? 'Running...' : 'Run Convex Hull'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Envelope Operation Dialog */}
        {showEnvelopeDialog && selectedArtifact && (() => {
          const { presentation, geometrySupport, infoWarning } = getSingleInputDialogContract('envelope-v1', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Envelope'),
            infoWarning ? {
              id: `${selectedArtifact.id}-envelope-info`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: infoWarning.severity,
              scope: 'active' as const,
              title: infoWarning.title,
              message: infoWarning.message,
            } : null,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Envelope Operation</h3>
                  <div className="muted small">Create one derived bounding box around the full extent of {selectedArtifact.name} on the narrow envelope v1 path</div>
                </div>
                <button className="secondary" onClick={() => setShowEnvelopeDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label="Source artifact"
                  artifact={selectedArtifact}
                  description="Envelope v1 uses only the selected source artifact. It does not accept a secondary layer."
                />

                <div style={{ marginTop: 12 }}>
                  <OperationContractDisplay
                    title={`${presentation?.title ?? 'Envelope'} contract`}
                    geometryStatement={presentation?.geometryStatement}
                    crsStatement={presentation?.crsStatement ?? 'Envelope requires known stored CRS on the current shipped path. It does not auto-transform or infer CRS.'}
                    geometrySupport={geometrySupport ? {
                      ...geometrySupport,
                      secondaryGeometry: undefined,
                      secondaryAllowed: true,
                    } : undefined}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <TypedWarningPanel
                    warnings={warnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: getOperationWarningTone(warning),
                    }))}
                  />
                </div>

                <OperationOutputSemantics
                  body={presentation?.outputSemantics ?? 'Envelope v1 creates one derived polygon artifact representing the source artifact\'s axis-aligned bounding box in the same stored CRS as the source. It intentionally does not preserve per-feature source attributes and makes no broader claim about minimum rotated rectangles, transform-aware execution, or non-polygon inputs.'}
                  outputKind={presentation?.outputKind}
                  outputKindLabel={presentation?.outputKindLabel}
                  outputKindDescription={presentation?.outputKindDescription}
                />

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={envelopeName}
                    onChange={(e) => setEnvelopeName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runEnvelope}
                  disabled={envelopeRunning || !envelopeName.trim()}
                >
                  {envelopeRunning ? 'Running...' : 'Run Envelope'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Simplify Operation Dialog */}
        {showSimplifyDialog && selectedArtifact && (() => {
          const { presentation, geometrySupport, infoWarning } = getSingleInputDialogContract('simplify-v1', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Simplify'),
            infoWarning ? {
              id: `${selectedArtifact.id}-simplify-info`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: infoWarning.severity,
              scope: 'active' as const,
              title: infoWarning.title,
              message: infoWarning.message,
            } : null,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Simplify Operation</h3>
                  <div className="muted small">Simplify {selectedArtifact.name} with a tolerance interpreted in the source artifact\'s stored CRS units</div>
                </div>
                <button className="secondary" onClick={() => setShowSimplifyDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label="Source artifact"
                  artifact={selectedArtifact}
                  description="Simplify v1 uses only the selected source artifact. It does not accept a secondary layer."
                />

                <div style={{ marginTop: 12 }}>
                  <OperationContractDisplay
                    title={`${presentation?.title ?? 'Simplify'} contract`}
                    geometryStatement={presentation?.geometryStatement}
                    crsStatement={presentation?.crsStatement ?? 'Simplify requires known stored CRS on the current shipped path. It does not auto-transform or infer CRS.'}
                    geometrySupport={geometrySupport ? {
                      ...geometrySupport,
                      secondaryGeometry: undefined,
                      secondaryAllowed: true,
                    } : undefined}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <TypedWarningPanel
                    warnings={warnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: getOperationWarningTone(warning),
                    }))}
                  />
                </div>

                <OperationOutputSemantics
                  body={presentation?.outputSemantics ?? 'Simplify v1 creates a derived polygon or multipolygon artifact in the same stored CRS as the source and preserves source attributes on surviving features. The user-provided tolerance is interpreted in source CRS units. This path does not auto-transform and does not claim broader topology-preserving behavior.'}
                  outputKind={presentation?.outputKind}
                  outputKindLabel={presentation?.outputKindLabel}
                  outputKindDescription={presentation?.outputKindDescription}
                />

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Tolerance</strong>
                  </label>
                  <input
                    type="number"
                    value={simplifyTolerance}
                    onChange={(e) => setSimplifyTolerance(e.target.value)}
                    placeholder="Enter tolerance..."
                    min="0"
                    step="any"
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                  <div className="small muted" style={{ marginTop: 6 }}>
                    Tolerance is interpreted in source CRS units ({selectedArtifact.crs ?? 'unknown'}). This v1 path does not auto-transform to meters or make topology-preserving claims.
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={simplifyName}
                    onChange={(e) => setSimplifyName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runSimplify}
                  disabled={simplifyRunning || !simplifyName.trim() || simplifyTolerance === '' || Number.isNaN(Number(simplifyTolerance)) || Number(simplifyTolerance) < 0}
                >
                  {simplifyRunning ? 'Running...' : 'Run Simplify'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Dissolve Operation Dialog */}
        {showDissolveDialog && selectedArtifact && (() => {
          const { presentation, aggregationPresentation, geometrySupport, infoWarning } = getSingleInputDialogContract('dissolve-grouped-v1', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Grouped dissolve'),
            buildInfoWarningRef(selectedArtifact, 'dissolve', infoWarning),
            getDissolveGeometryWarning(selectedArtifact),
            dissolveGroupingField ? null : {
              id: `${selectedArtifact.id}-grouped-dissolve-grouping-required`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: 'blocking' as const,
              scope: 'active' as const,
              title: 'Grouping field required',
              message: 'Grouped dissolve v1 requires exactly one explicit grouping field from the selected source artifact.',
            },
          ].filter((warning): warning is WarningRef => Boolean(warning))
          const groupingOptions = getJoinableFieldNames(selectedArtifact)

          return (
            <OperationExecutionShell
              title="Grouped Dissolve Operation"
              subtitle={`Dissolve ${selectedArtifact.name} into one derived artifact with one dissolved feature per grouping value`}
              onCancel={() => setShowDissolveDialog(false)}
              sourceSummary={{
                label: 'Source artifact',
                artifact: selectedArtifact,
                description: 'Grouped dissolve v1 uses one selected artifact, one explicit grouping field, and returns one spatial artifact containing one dissolved feature per group.',
              }}
              contract={{
                title: `${presentation?.title ?? 'Grouped dissolve'} contract`,
                geometryStatement: presentation?.geometryStatement,
                scopeStatement: aggregationPresentation?.scopeStatement,
                groupingStatement: aggregationPresentation?.groupingStatement,
                outputCardinalityStatement: aggregationPresentation?.outputCardinalityStatement,
                crsStatement: presentation?.crsStatement ?? 'Grouped dissolve requires known stored CRS on the current shipped path. It does not auto-transform or infer CRS.',
                geometrySupport: geometrySupport ? {
                  ...geometrySupport,
                  secondaryGeometry: undefined,
                  secondaryAllowed: true,
                } : undefined,
              }}
              warnings={toPanelWarnings(warnings)}
              output={{
                body: presentation?.outputSemantics ?? 'Grouped dissolve v1 creates one derived spatial artifact that contains one polygon or multipolygon feature per distinct value of the selected grouping field. It preserves the selected grouping field only, preserves known stored CRS, and makes no broader dissolve or union claim.',
                outputKind: presentation?.outputKind,
                outputKindLabel: presentation?.outputKindLabel,
                outputKindDescription: presentation?.outputKindDescription,
              }}
              disclosure={
                <>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4 }}>
                      <strong>Grouping field</strong>
                    </label>
                    <select
                      value={dissolveGroupingField}
                      onChange={(e) => setDissolveGroupingField(e.target.value)}
                      style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                    >
                      <option value="">Select one grouping field...</option>
                      {groupingOptions.map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                  </div>
                  Output rows, provenance, export, and DuckDB materialization stay aligned: one dissolved feature row per distinct grouping value, with only <code>{dissolveGroupingField || 'the selected grouping field'}</code> preserved on the current path.
                </>
              }
              nameValue={dissolveName}
              onNameChange={setDissolveName}
              runLabel="Run Grouped Dissolve"
              runningLabel="Running..."
              running={dissolveRunning}
              runDisabled={dissolveRunning || !dissolveName.trim() || !dissolveGroupingField}
              onRun={runDissolve}
            />
          )
        })()}

        {/* Area Measurement Dialog */}
        {showAreaDialog && selectedArtifact && (() => {
          const { presentation, measurementPresentation, geometrySupport, infoWarning, measurementUnitDisclosure, measurementUnitWarning } = getSingleInputDialogContract('area-v1', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Area'),
            buildInfoWarningRef(selectedArtifact, 'area', infoWarning),
            measurementUnitWarning,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <OperationExecutionShell
              title="Area Measurement"
              subtitle={`Measure polygon area for ${selectedArtifact.name} on the narrow area v1 path`}
              onCancel={() => setShowAreaDialog(false)}
              sourceSummary={{
                label: 'Source artifact',
                artifact: selectedArtifact,
                description: 'Area v1 uses only the selected source artifact. It returns a measurement table rather than a geometry artifact.',
                extraText: `Stored CRS: ${selectedArtifact.crs ?? 'unknown'}`,
              }}
              contract={{
                title: `${presentation?.title ?? 'Area'} contract`,
                geometryStatement: presentation?.geometryStatement,
                crsStatement: measurementPresentation?.unitSemanticsStatement ?? presentation?.crsStatement ?? 'Area requires known stored CRS and refuses misleading unit semantics.',
                geometrySupport: geometrySupport ? {
                  ...geometrySupport,
                  secondaryGeometry: undefined,
                } : undefined,
              }}
              warnings={toPanelWarnings(warnings)}
              output={{
                body: presentation?.outputSemantics ?? 'Area v1 creates a measurement table with one row per input feature, a numeric area value, and an explicit area unit. It does not create or pretend to create a new geometry artifact.',
                outputKind: presentation?.outputKind,
                outputKindLabel: presentation?.outputKindLabel,
                outputKindDescription: presentation?.outputKindDescription,
              }}
              disclosure={<>Output fields include <code>{measurementUnitDisclosure?.valueField ?? 'area_value'}</code> and <code>{measurementUnitDisclosure?.unitField ?? 'area_unit'}</code>. {measurementUnitDisclosure?.note ?? 'The current shipped path only emits square_meters when stored CRS unit semantics are trustworthy.'}</>}
              nameValue={areaName}
              onNameChange={setAreaName}
              runLabel="Run Area"
              runningLabel="Running..."
              running={areaRunning}
              runDisabled={areaRunning || !areaName.trim()}
              onRun={runArea}
            />
          )
        })()}

        {/* Perimeter Measurement Dialog */}
        {showPerimeterDialog && selectedArtifact && (() => {
          const { presentation, measurementPresentation, geometrySupport, infoWarning, measurementUnitDisclosure, measurementUnitWarning } = getSingleInputDialogContract('perimeter-v1', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Perimeter'),
            buildInfoWarningRef(selectedArtifact, 'perimeter', infoWarning),
            measurementUnitWarning,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <OperationExecutionShell
              title="Perimeter Measurement"
              subtitle={`Measure polygon perimeter for ${selectedArtifact.name} on the narrow perimeter v1 path`}
              onCancel={() => setShowPerimeterDialog(false)}
              sourceSummary={{
                label: 'Source artifact',
                artifact: selectedArtifact,
                description: 'Perimeter v1 uses only the selected source artifact. It returns a measurement table rather than a geometry artifact.',
                extraText: `Stored CRS: ${selectedArtifact.crs ?? 'unknown'}`,
              }}
              contract={{
                title: `${presentation?.title ?? 'Perimeter'} contract`,
                geometryStatement: presentation?.geometryStatement,
                crsStatement: measurementPresentation?.unitSemanticsStatement ?? presentation?.crsStatement ?? 'Perimeter requires known stored CRS and refuses misleading unit semantics.',
                geometrySupport: geometrySupport ? {
                  ...geometrySupport,
                  secondaryGeometry: undefined,
                } : undefined,
              }}
              warnings={toPanelWarnings(warnings)}
              output={{
                body: presentation?.outputSemantics ?? 'Perimeter v1 creates a measurement table with one row per input feature, a numeric perimeter value, and an explicit perimeter unit. It does not create or pretend to create a new geometry artifact.',
                outputKind: presentation?.outputKind,
                outputKindLabel: presentation?.outputKindLabel,
                outputKindDescription: presentation?.outputKindDescription,
              }}
              disclosure={<>Output fields include <code>{measurementUnitDisclosure?.valueField ?? 'perimeter_value'}</code> and <code>{measurementUnitDisclosure?.unitField ?? 'perimeter_unit'}</code>. {measurementUnitDisclosure?.note ?? 'The current shipped path only emits meters when stored CRS unit semantics are trustworthy.'}</>}
              nameValue={perimeterName}
              onNameChange={setPerimeterName}
              runLabel="Run Perimeter"
              runningLabel="Running..."
              running={perimeterRunning}
              runDisabled={perimeterRunning || !perimeterName.trim()}
              onRun={runPerimeter}
            />
          )
        })()}

        {/* Compactness Measurement Dialog */}
        {showCompactnessDialog && selectedArtifact && (() => {
          const { presentation, measurementPresentation, geometrySupport, infoWarning, measurementUnitDisclosure, measurementUnitWarning } = getSingleInputDialogContract('compactness-v1', selectedArtifact)
          const warnings = [
            getArtifactCrsWarning(selectedArtifact, 'Compactness'),
            buildInfoWarningRef(selectedArtifact, 'compactness', infoWarning),
            measurementUnitWarning,
          ].filter((warning): warning is WarningRef => Boolean(warning))

          return (
            <OperationExecutionShell
              title="Compactness Measurement"
              subtitle={`Measure polygon compactness for ${selectedArtifact.name} on the narrow compactness v1 path`}
              onCancel={() => setShowCompactnessDialog(false)}
              sourceSummary={{
                label: 'Source artifact',
                artifact: selectedArtifact,
                description: 'Compactness v1 uses only the selected source artifact. It returns a measurement table rather than a geometry artifact.',
                extraText: `Stored CRS: ${selectedArtifact.crs ?? 'unknown'}`,
              }}
              contract={{
                title: `${presentation?.title ?? 'Compactness'} contract`,
                geometryStatement: presentation?.geometryStatement,
                crsStatement: measurementPresentation?.unitSemanticsStatement ?? presentation?.crsStatement ?? 'Compactness requires known stored CRS and refuses misleading unit semantics.',
                geometrySupport: geometrySupport ? {
                  ...geometrySupport,
                  secondaryGeometry: undefined,
                } : undefined,
              }}
              warnings={toPanelWarnings(warnings)}
              output={{
                body: presentation?.outputSemantics ?? 'Compactness v1 creates a measurement table with one row per input feature, a numeric compactness value, and an explicit unit marker. It does not create or pretend to create a new geometry artifact.',
                outputKind: presentation?.outputKind,
                outputKindLabel: presentation?.outputKindLabel,
                outputKindDescription: presentation?.outputKindDescription,
              }}
              disclosure={<>Output fields include <code>{measurementUnitDisclosure?.valueField ?? 'compactness_value'}</code> and <code>{measurementUnitDisclosure?.unitField ?? 'compactness_unit'}</code>. {measurementUnitDisclosure?.note ?? 'The current shipped path only emits unitless when stored CRS unit semantics are trustworthy for the underlying planar area and perimeter math.'}</>}
              nameValue={compactnessName}
              onNameChange={setCompactnessName}
              runLabel="Run Compactness"
              runningLabel="Running..."
              running={compactnessRunning}
              runDisabled={compactnessRunning || !compactnessName.trim()}
              onRun={runCompactness}
            />
          )
        })()}

        {/* Reproject Operation Dialog */}
        {showReprojectDialog && selectedArtifact && (() => {
          const { presentation } = getSingleInputDialogContract('reproject', selectedArtifact)
          const warnings: WarningRef[] = []
          if (!selectedArtifact.crs || selectedArtifact.crs === 'unknown') {
            warnings.push({
              id: `${selectedArtifact.id}-reproject-source-warning`,
              code: selectedArtifact.crs ? 'CRS_UNKNOWN' : 'CRS_MISSING',
              severity: 'caution',
              scope: 'active',
              title: 'Stored CRS is not verified',
              message: 'This artifact does not currently verify its stored CRS. Reprojection will use the source CRS you choose below; results will be wrong if that choice is false.',
            })
          }
          if (selectedArtifact.crs && selectedArtifact.crs !== 'unknown' && selectedArtifact.crs !== reprojectSourceCrs) {
            warnings.push({
              id: `${selectedArtifact.id}-reproject-override-warning`,
              code: 'CRS_MISMATCH',
              severity: 'caution',
              scope: 'active',
              title: 'Source CRS override differs from stored CRS',
              message: `Stored CRS is ${selectedArtifact.crs}, but this operation is being forced to start from ${reprojectSourceCrs}. Proceed only if the stored metadata is wrong and the coordinates are actually in ${reprojectSourceCrs}.`,
            })
          }

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Reproject / Transform</h3>
                  <div className="muted small">Transform coordinates of {selectedArtifact.name} from one CRS to another</div>
                </div>
                <button className="secondary" onClick={() => setShowReprojectDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label="Source artifact"
                  artifact={selectedArtifact}
                  description="Reproject performs an explicit coordinate transformation, not a metadata relabel."
                />

                <div style={{ marginTop: 12 }}>
                  <TypedWarningPanel
                    warnings={warnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: getOperationWarningTone(warning),
                    }))}
                  />
                </div>

                <OperationContractDisplay
                  title={`${presentation?.title ?? 'Reproject'} contract`}
                  geometryStatement={presentation?.geometryStatement}
                  crsStatement={presentation?.crsStatement ?? 'Reproject requires a real source CRS choice and writes the chosen target CRS onto the derived artifact. Display normalization to WGS84 remains display-only and does not mutate stored CRS.'}
                />

                <OperationOutputSemantics
                  body={presentation?.outputSemantics ?? 'This operation creates a new derived artifact with transformed coordinates in the chosen target CRS. Metadata-only CRS assignment remains a separate future feature.'}
                  outputKind={presentation?.outputKind}
                  outputKindLabel={presentation?.outputKindLabel}
                  outputKindDescription={presentation?.outputKindDescription}
                />

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Source CRS</strong> (current coordinate system)
                  </label>
                  <select
                    value={reprojectSourceCrs}
                    onChange={(e) => setReprojectSourceCrs(e.target.value)}
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  >
                    <option value="EPSG:4326">EPSG:4326 - WGS84 (World Geodetic System 1984)</option>
                    <option value="EPSG:3857">EPSG:3857 - Web Mercator (Google Maps / OSM)</option>
                    <option value="EPSG:32610">EPSG:32610 - UTM Zone 10N</option>
                    <option value="EPSG:32611">EPSG:32611 - UTM Zone 11N</option>
                    <option value="EPSG:32612">EPSG:32612 - UTM Zone 12N</option>
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Target CRS</strong> (desired coordinate system)
                  </label>
                  <select
                    value={reprojectTargetCrs}
                    onChange={(e) => setReprojectTargetCrs(e.target.value)}
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  >
                    <option value="EPSG:4326">EPSG:4326 - WGS84 (World Geodetic System 1984)</option>
                    <option value="EPSG:3857">EPSG:3857 - Web Mercator (Google Maps / OSM)</option>
                    <option value="EPSG:32610">EPSG:32610 - UTM Zone 10N</option>
                    <option value="EPSG:32611">EPSG:32611 - UTM Zone 11N</option>
                    <option value="EPSG:32612">EPSG:32612 - UTM Zone 12N</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={reprojectName}
                    onChange={(e) => setReprojectName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runReproject}
                  disabled={reprojectRunning || !reprojectName.trim() || !reprojectSourceCrs || !reprojectTargetCrs}
                >
                  {reprojectRunning ? 'Transforming...' : 'Reproject'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Clip Operation Dialog */}
        {showClipDialog && selectedArtifact && (() => {
          const clipRoleContext = getTopologyRoleContext('clip-v1')
          const clipOptions = selectableSecondaryArtifacts.map((artifact) => ({
            id: artifact.id,
            label: `${artifact.name} — ${artifactSummaryText(artifact)} — CRS: ${artifact.crs ?? 'unknown'}`,
          }))
          const sourceCrs = selectedArtifact.crs
          const maskCrs = clipMaskArtifact?.crs
          const crsMatch = Boolean(sourceCrs && maskCrs && sourceCrs !== 'unknown' && maskCrs !== 'unknown' && sourceCrs === maskCrs)
          const sourceGeom = selectedArtifact.geometryType
          const maskGeom = clipMaskArtifact?.geometryType
          const sourceAllowed = sourceGeom === 'Polygon' || sourceGeom === 'MultiPolygon'
          const secondaryAllowed = maskGeom === 'Polygon' || maskGeom === 'MultiPolygon'
          const refusalWarnings: WarningRef[] = []
          if (clipMaskArtifact) {
            const validation = validateForClip(selectedArtifact, clipMaskArtifact)
            refusalWarnings.push(...validation.errors.map((error, index) => ({
              id: `clip-refusal-${index}`,
              code: error.code,
              severity: 'blocking' as const,
              scope: 'active' as const,
              title: 'Clip refusal',
              message: error.message,
            })))
          }

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Clip Operation</h3>
                  <div className="muted small">Create a derived artifact by clipping {selectedArtifact.name} with a polygon mask</div>
                </div>
                <button className="secondary" onClick={() => setShowClipDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label={`Source artifact (${clipRoleContext.sourceLabel})`}
                  artifact={selectedArtifact}
                  description="This is the artifact being clipped."
                />

                <div style={{ marginTop: 12 }}>
                  <OperationSecondarySelector
                    label="Clip mask artifact"
                    value={clipMaskArtifactId}
                    placeholder="Select a clip mask artifact..."
                    options={clipOptions}
                    onChange={setClipMaskArtifactId}
                  />
                </div>

                {clipMaskArtifact && (
                  <OperationSourceSummary
                    label={`Secondary artifact (${clipRoleContext.secondaryLabel})`}
                    artifact={clipMaskArtifact}
                    description="The mask constrains what survives from the source artifact."
                  />
                )}

                <div style={{ marginTop: 12 }}>
                  <OperationContractDisplay
                    title="Clip v1 contract"
                    geometryStatement="Clip v1 supports only Polygon or MultiPolygon geometries for both source and mask."
                    crsStatement="Both artifacts must have known matching stored CRS. No auto-transform path is claimed here."
                    crsMatch={clipMaskArtifact ? {
                      label: 'Source stored CRS',
                      sourceCrs,
                      secondaryCrs: maskCrs,
                      matches: crsMatch,
                      mismatchMessage: 'Clip v1 requires matching known stored CRS',
                    } : undefined}
                    geometrySupport={clipMaskArtifact ? {
                      label: 'Source geometry',
                      sourceGeometry: sourceGeom,
                      secondaryGeometry: maskGeom,
                      sourceAllowed,
                      secondaryAllowed,
                      unsupportedMessage: 'Clip v1 refuses anything outside Polygon/MultiPolygon on both inputs',
                    } : undefined}
                  />
                </div>

                <OperationOutputSemantics
                  body="Clip creates a derived artifact in the same stored CRS as the validated inputs. No-overlap cases become honest empty results instead of failures."
                  outputKind="spatial-artifact"
                  outputKindLabel="Spatial artifact"
                  outputKindDescription="This topology output is a geometry-bearing derived artifact rather than a measurement or table-only result."
                />

                {refusalWarnings.length > 0 && (
                  <TypedWarningPanel
                    title="Refusal"
                    warnings={refusalWarnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: 'danger',
                    }))}
                  />
                )}

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={clipName}
                    onChange={(e) => setClipName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runClip}
                  disabled={clipRunning || !clipName.trim() || !clipMaskArtifactId}
                >
                  {clipRunning ? 'Running...' : 'Run Clip'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Attribute Join Operation Dialog */}
        {showAttributeJoinDialog && selectedArtifact && (() => {
          const presentation = getAttributeJoinPresentation()
          const joinOptions = artifacts
            .filter((artifact) => artifact.id !== selectedArtifact.id)
            .map((artifact) => ({
              id: artifact.id,
              label: `${artifact.name} — ${artifactSummaryText(artifact)} — output: ${getArtifactOutputKindLabel(getArtifactOutputKind(artifact))}`,
            }))
          const leftFields = getJoinableFieldNames(selectedArtifact)
          const rightFields = attributeJoinArtifact ? getJoinableFieldNames(attributeJoinArtifact) : []
          const selectedFieldOptions = rightFields
            .filter((field) => field !== attributeJoinSecondaryKey)
            .map((field) => ({
              value: field,
              label: field,
              description: leftFields.includes(field) ? `Will be written as join_${field} to avoid colliding with the left artifact.` : undefined,
            }))
          const warnings: WarningRef[] = []
          if (attributeJoinArtifact && attributeJoinSelectedFields.length === 0) {
            warnings.push({
              id: `${selectedArtifact.id}-attribute-join-fields-required`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: 'blocking',
              scope: 'active',
              title: 'Explicit field selection required',
              message: 'Attribute join v1 only carries right-side fields that you explicitly select below. It refuses to run until at least one non-key right-side field is selected.',
            })
          }
          if (attributeJoinArtifact && rightFields.length > 0 && !attributeJoinSecondaryKey) {
            warnings.push({
              id: `${selectedArtifact.id}-attribute-join-right-key-required`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: 'blocking',
              scope: 'active',
              title: 'Right-side join key required',
              message: 'Choose one explicit right-side join key. Attribute join v1 does not guess or infer a right-side key once the join artifact is selected.',
            })
          }
          if (attributeJoinArtifact && rightFields.length > 0 && rightFields.every((field) => field === attributeJoinSecondaryKey)) {
            warnings.push({
              id: `${selectedArtifact.id}-attribute-join-no-carry-fields`,
              code: 'LIMITED_SUPPORT_ENVELOPE',
              severity: 'blocking',
              scope: 'active',
              title: 'No carryable right-side fields remain',
              message: 'The current right artifact exposes no non-key right-side fields to carry into the output on the shipped path. Pick a different right-side key or a different join artifact.',
            })
          }

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Attribute Join</h3>
                  <div className="muted small">Enrich {selectedArtifact.name} with explicit right-side fields by exact-equality left join</div>
                </div>
                <button className="secondary" onClick={() => setShowAttributeJoinDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label="Left artifact"
                  artifact={selectedArtifact}
                  description="This artifact stays on the left side of the join. Its output kind and geometry semantics are preserved."
                />

                <div style={{ marginTop: 12 }}>
                  <OperationSecondarySelector
                    label="Join artifact"
                    value={attributeJoinArtifactId}
                    placeholder="Select a join artifact..."
                    options={joinOptions}
                    onChange={(value) => {
                      setAttributeJoinArtifactId(value)
                      const nextArtifact = artifacts.find((artifact) => artifact.id === value) ?? null
                      const defaults = selectedArtifact
                        ? getAttributeJoinDialogDefaults(selectedArtifact, nextArtifact)
                        : {
                            sourceKey: '',
                            secondaryKey: '',
                            selectedFields: [],
                            artifactId: value,
                            outputName: attributeJoinName,
                          }
                      setAttributeJoinSourceKey(defaults.sourceKey)
                      setAttributeJoinSecondaryKey(defaults.secondaryKey)
                      setAttributeJoinSelectedFields(defaults.selectedFields)
                    }}
                  />
                </div>

                {attributeJoinArtifact && (
                  <OperationSourceSummary
                    label="Right artifact"
                    artifact={attributeJoinArtifact}
                    description="This artifact supplies lookup attributes only on the current shipped path. Its geometry is not consulted for the join predicate."
                  />
                )}

                <div style={{ marginTop: 12 }}>
                  <OperationContractDisplay
                    title={`${presentation?.title ?? 'Attribute join'} contract`}
                    geometryStatement={presentation?.contractStatement}
                    crsStatement={presentation?.lineageStatement ?? 'History records both inputs, explicit key choices, and selected right-side fields.'}
                  />
                </div>

                <OperationOutputSemantics
                  body={presentation?.outputSemantics ?? 'The output preserves the left artifact while adding explicitly selected right-side fields only.'}
                  outputKind={selectedArtifactOutputKind ?? getArtifactOutputKind(selectedArtifact)}
                  outputKindLabel={getArtifactOutputKindLabel(selectedArtifactOutputKind ?? getArtifactOutputKind(selectedArtifact))}
                  outputKindDescription={presentation?.outputKindDescription}
                />

                <div className="small muted" style={{ marginBottom: 12 }}>
                  {presentation?.collisionStatement}
                </div>

                <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4 }}>
                      <strong>Left join key</strong>
                    </label>
                    <select value={attributeJoinSourceKey} onChange={(e) => setAttributeJoinSourceKey(e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '14px' }}>
                      <option value="">Select a left-side key...</option>
                      {leftFields.map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      Defaults prefer a shared field name between left and right when one exists; otherwise the dialog falls back to the most ID-like field it can find.
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 4 }}>
                      <strong>Right join key</strong>
                    </label>
                    <select value={attributeJoinSecondaryKey} onChange={(e) => {
                      const nextKey = e.target.value
                      setAttributeJoinSecondaryKey(nextKey)
                      setAttributeJoinSelectedFields((current) => current.filter((field) => field !== nextKey))
                    }} style={{ width: '100%', padding: '8px', fontSize: '14px' }}>
                      <option value="">Select a right-side key...</option>
                      {rightFields.map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      This is always explicit on the shipped path. Attribute join v1 does not use right-side geometry and does not infer alternate predicates.
                    </div>
                  </div>
                </div>

                <OperationFieldCheckboxList
                  label="Right-side fields to carry into the output"
                  options={selectedFieldOptions}
                  selectedValues={attributeJoinSelectedFields}
                  onToggle={(value) => setAttributeJoinSelectedFields((current) => current.includes(value) ? current.filter((field) => field !== value) : [...current, value])}
                  emptyMessage={attributeJoinArtifact ? 'No selectable right-side fields remain after excluding the explicit right-side join key. Pick a different key or a different join artifact.' : 'Select a join artifact first.'}
                />

                <div className="small muted" style={{ marginTop: 6 }}>
                  Required on the current shipped path: choose one right-side join key and at least one additional right-side field to carry forward. The join key itself is used only for matching and is not auto-carried into the output unless selected through a different output-safe field.
                </div>

                <TypedWarningPanel warnings={toPanelWarnings(warnings)} />

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={attributeJoinName}
                    onChange={(e) => setAttributeJoinName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runAttributeJoin}
                  disabled={attributeJoinRunning || !attributeJoinName.trim() || !attributeJoinArtifactId || !attributeJoinSourceKey || !attributeJoinSecondaryKey || attributeJoinSelectedFields.length === 0}
                >
                  {attributeJoinRunning ? 'Running...' : 'Run Attribute Join'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Intersect Operation Dialog */}
        {showIntersectDialog && selectedArtifact && (() => {
          const intersectRoleContext = getTopologyRoleContext('intersect-v1')
          const intersectOptions = selectableSecondaryArtifacts.map((artifact) => ({
            id: artifact.id,
            label: `${artifact.name} — ${artifactSummaryText(artifact)} — CRS: ${artifact.crs ?? 'unknown'}`,
          }))
          const sourceCrs = selectedArtifact.crs
          const overlayCrs = intersectOverlayArtifact?.crs
          const crsMatch = Boolean(sourceCrs && overlayCrs && sourceCrs !== 'unknown' && overlayCrs !== 'unknown' && sourceCrs === overlayCrs)
          const sourceGeom = selectedArtifact.geometryType
          const overlayGeom = intersectOverlayArtifact?.geometryType
          const sourceAllowed = sourceGeom === 'Polygon' || sourceGeom === 'MultiPolygon'
          const secondaryAllowed = overlayGeom === 'Polygon' || overlayGeom === 'MultiPolygon'
          const refusalWarnings: WarningRef[] = []
          if (intersectOverlayArtifact) {
            const validation = validateForIntersect(selectedArtifact, intersectOverlayArtifact)
            refusalWarnings.push(...validation.errors.map((error, index) => ({
              id: `intersect-refusal-${index}`,
              code: error.code,
              severity: 'blocking' as const,
              scope: 'active' as const,
              title: 'Intersect refusal',
              message: error.message,
            })))
          }

          return (
            <div className="import-overlay">
              <div className="row">
                <div>
                  <h3 style={{ margin: 0 }}>Intersect Operation</h3>
                  <div className="muted small">Compute overlap between {selectedArtifact.name} and an overlay polygon</div>
                </div>
                <button className="secondary" onClick={() => setShowIntersectDialog(false)}>Cancel</button>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <OperationSourceSummary
                  label={`Source artifact (${intersectRoleContext.sourceLabel})`}
                  artifact={selectedArtifact}
                  description="This is the primary layer being intersected."
                />

                <div style={{ marginTop: 12 }}>
                  <OperationSecondarySelector
                    label="Overlay artifact"
                    value={overlayArtifactId}
                    placeholder="Select an overlay artifact..."
                    options={intersectOptions}
                    onChange={setOverlayArtifactId}
                  />
                </div>

                {intersectOverlayArtifact && (
                  <OperationSourceSummary
                    label={`Secondary artifact (${intersectRoleContext.secondaryLabel})`}
                    artifact={intersectOverlayArtifact}
                    description="The overlay defines which overlapping area survives in the output."
                  />
                )}

                <div style={{ marginTop: 12 }}>
                  <OperationContractDisplay
                    title="Intersect v1 contract"
                    geometryStatement="Intersect v1 supports only Polygon or MultiPolygon source and overlay artifacts."
                    crsStatement="Both artifacts must have known matching CRS. Intersect does not auto-transform and does not broaden beyond the current narrow v1 path."
                    crsMatch={intersectOverlayArtifact ? {
                      label: 'Source CRS',
                      sourceCrs,
                      secondaryCrs: overlayCrs,
                      matches: crsMatch,
                      mismatchMessage: 'Intersect v1 requires matching known CRS',
                    } : undefined}
                    geometrySupport={intersectOverlayArtifact ? {
                      label: 'Source geometry',
                      sourceGeometry: sourceGeom,
                      secondaryGeometry: overlayGeom,
                      sourceAllowed,
                      secondaryAllowed,
                      unsupportedMessage: 'Intersect v1 supports only Polygon/MultiPolygon',
                    } : undefined}
                  />
                </div>

                <OperationOutputSemantics
                  body="Intersect v1 preserves source attributes only. Overlay attributes are not merged on the shipped path, and no-overlap cases become honest empty results rather than failures."
                  outputKind="spatial-artifact"
                  outputKindLabel="Spatial artifact"
                  outputKindDescription="This topology output is a geometry-bearing derived artifact rather than a measurement or table-only result."
                />

                {refusalWarnings.length > 0 && (
                  <TypedWarningPanel
                    title="Refusal"
                    warnings={refusalWarnings.map((warning) => ({
                      title: warning.title,
                      message: warning.message,
                      tone: 'danger',
                    }))}
                  />
                )}

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    <strong>Output artifact name</strong>
                  </label>
                  <input
                    type="text"
                    value={intersectName}
                    onChange={(e) => setIntersectName(e.target.value)}
                    placeholder="Enter artifact name..."
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={runIntersect}
                  disabled={intersectRunning || !intersectName.trim() || !overlayArtifactId}
                >
                  {intersectRunning ? 'Running...' : 'Run Intersect'}
                </button>
              </div>
            </div>
          )
        })()}
      </main>

      <aside className={`right-panel ${rightPanelOpen ? 'open' : ''}`}>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className={`right-panel-tab ${rightPanelTab === 'details' ? 'active' : ''}`}
            onClick={() => setRightPanelTab('details')}
          >
            Details
          </button>
          <button
            className={`right-panel-tab ${rightPanelTab === 'history' ? 'active' : ''}`}
            onClick={() => setRightPanelTab('history')}
          >
            History{history.length > 0 ? ` (${history.length})` : ''}
          </button>
          <button
            className="secondary"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={() => setRightPanelOpen(false)}
          >
            ×
          </button>
        </div>
        {rightPanelTab === 'details' && !selectedArtifact && (
          <AccordionSection title="Project Summary" defaultOpen={true} badge={formatCount(artifacts.length, 'layer')}>
            <div className="small muted" style={{ marginBottom: 8 }}>{statusMessage}</div>
            <div className="actions" style={{ marginTop: 0, gap: 8 }}>
              <label className="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Import data
                <input className="input-file" type="file" accept=".json,.geojson,.parquet,.geoparquet" onChange={handleFileImport} style={{ display: 'none' }} />
              </label>
              <button className="secondary" onClick={openSampleImport}>Load sample</button>
            </div>
          </AccordionSection>
        )}
        {rightPanelTab === 'details' && selectedArtifact && (
          <>
            {/* Focused Feature accordion — shown at top when a feature is selected */}
            {selectedRowIndex !== null && selectedArtifact.spatial && isFeatureCollection(selectedArtifact.data) && (
              <AccordionSection title="Focused Feature" defaultOpen={true} badge={`#${selectedRowIndex + 1}`}>
                <div className="card" style={{ background: '#0f172a', border: '1px solid #1e3a5f' }}>
                  {selectedFeatureGeometry && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Geometry: {selectedFeatureGeometry.type}
                    </div>
                  )}
                  {selectedFeatureProperties && (
                    <div style={{ marginTop: 8 }}>
                      <div className="small" style={{ color: '#94a3b8' }}>Properties</div>
                      <div style={{ marginTop: 4, fontSize: 12, fontFamily: 'monospace' }}>
                        {Object.entries(selectedFeatureProperties).map(([key, value]) => (
                          <div key={key} style={{ color: '#cbd5e1' }}>
                            {key}: {String(value)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selectedFeatureProperties && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      No properties on this feature.
                    </div>
                  )}
                </div>
              </AccordionSection>
            )}

            {/* Overview accordion */}
            <AccordionSection title="Overview" defaultOpen={selectedRowIndex === null}>
              <div className="card">
                <div className="row">
                  <strong>{selectedArtifact.name}</strong>
                  <span className={`badge ${selectedArtifact.kind}`}>{selectedArtifact.kind}</span>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>{selectedArtifact.format}</div>
    <div className="small muted" style={{ marginTop: 4 }}>
                  {selectedArtifact.rowCount ?? '?'} rows · {getArtifactGeometryLabel(selectedArtifact)}
                </div>
                <div className="small" style={{ marginTop: 6, color: '#cbd5e1' }}>
                  Output kind: <strong>{selectedArtifactOutputKind ? getArtifactOutputKindLabel(selectedArtifactOutputKind) : 'unknown output'}</strong>
                </div>
                {/* Compact CRS metadata block - keep stored CRS, confidence, provenance, and display CRS distinct */}
                <div className="small" style={{ marginTop: 8, padding: '8px 10px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#94a3b8' }}>Stored CRS:</span>
                    <strong>{selectedArtifact.crs ?? 'unknown'}</strong>
                    {selectedArtifact.crsProvenance && (
                      <span className={`badge ${selectedArtifact.crsProvenance.confidence}`}>
                        {getCrsConfidenceLabel(selectedArtifact.crsProvenance.confidence)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    <span style={{ color: '#94a3b8' }}>CRS provenance:</span>
                    <span style={{ color: '#cbd5e1' }}>{selectedArtifact.crsProvenance ? getCrsProvenanceLabel(selectedArtifact.crsProvenance.source) : 'unknown'}</span>
                  </div>
                  {/* Show display CRS info when display normalization is applied */}
                  {getDisplayCrsIfNeeded(selectedArtifact) && (() => {
                    const displayMeta = selectedArtifactDisplayStatus ? getDisplayStatusMeta(selectedArtifactDisplayStatus) : null
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: '#fbbf24', fontSize: '11px', flexWrap: 'wrap' }}>
                        <span>↻</span>
                        <span>
                          Display CRS: {getDisplayCrsIfNeeded(selectedArtifact)} (map only)
                        </span>
                        <span style={{ color: '#64748b' }}>·</span>
                        <span>
                          {displayMeta?.message ?? 'Display normalization changes map rendering only. Stored CRS metadata is unchanged.'}
                        </span>
                      </div>
                    )
                  })()}
                </div>
                {selectedArtifact.renderIssue && (
                  <div className="card danger" style={{ marginTop: 10 }}>
                    <strong>Render issue</strong>
                    <div className="small muted" style={{ marginTop: 6 }}>{selectedArtifact.renderIssue}</div>
                    <div className="small" style={{ marginTop: 6 }}>The artifact still exists and remains queryable/tabular. Only the current map adaptation failed.</div>
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* Issues accordion — combines Notes, Provenance notes, Display runtime, and Warnings */}
            {(() => {
              const hasBlockingWarnings = selectedArtifact.warnings.some(isWarning) && getActiveWarnings(selectedArtifact.warnings).length > 0
              const noteCount = getCurrentNotes(selectedArtifact.warnings).length
              const provNoteCount = getProvenanceNotes(selectedArtifact.warnings).length
              const warningCount = getActiveWarnings(selectedArtifact.warnings).length
              const displayWarning = selectedArtifactDisplayStatus && getDisplayStatusMeta(selectedArtifactDisplayStatus)?.warning
              const badgeParts: string[] = []
              if (warningCount > 0) badgeParts.push(formatCount(warningCount, 'warning'))
              if (noteCount > 0) badgeParts.push(formatCount(noteCount, 'note'))
              const hasAnyIssues = noteCount > 0 || provNoteCount > 0 || displayWarning || selectedArtifact.warnings.some(isWarning)
              return (
                <AccordionSection title="Issues" defaultOpen={hasBlockingWarnings} badge={badgeParts.join(', ') || undefined}>
                  {!hasAnyIssues && (
                    <div className="card muted">No issues detected.</div>
                  )}
                  {/* Current notes */}
                  {noteCount > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="small" style={{ color: '#93c5fd', marginBottom: 8 }}>Notes</div>
                      <div className="artifact-list">
                        {getCurrentNotes(selectedArtifact.warnings).map((warning) => (
                          <div key={warning.id} className="card" style={{ borderColor: '#1e3a5f', background: '#0a1525' }}>
                            <div className="row">
                              <strong>{warning.title}</strong>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span className="badge info">{getSeverityLabel(warning)}</span>
                                <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                              </div>
                            </div>
                            <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                            <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Provenance notes */}
                  {provNoteCount > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="small" style={{ color: '#cbd5e1', marginBottom: 8 }}>Provenance notes</div>
                      <div className="artifact-list">
                        {getProvenanceNotes(selectedArtifact.warnings).map((warning) => (
                          <div key={warning.id} className="card" style={{ borderColor: '#334155', background: '#111827' }}>
                            <div className="row">
                              <strong>{warning.title}</strong>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span className="badge info">{getSeverityLabel(warning)}</span>
                                <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                              </div>
                            </div>
                            <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                            <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Display runtime warning */}
                  {displayWarning && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="small" style={{ marginBottom: 8 }}>Display runtime</div>
                      <div className="artifact-list">
                        <div className="card">
                          <div className="row">
                            <strong>{displayWarning.title}</strong>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span className="badge caution">caution</span>
                              <span className="badge active">active</span>
                            </div>
                          </div>
                          <div className="small muted" style={{ marginTop: 6 }}>{displayWarning.message}</div>
                          <div className="small" style={{ marginTop: 6 }}>This reflects the current map-framing runtime, not a persisted change to the artifact itself.</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Active warnings (caution/serious/blocking) */}
                  {selectedArtifact.warnings.some(isWarning) && (
                    <div>
                      <div className="small" style={{ marginBottom: 8 }}>Warnings</div>
                      <div className="artifact-list">
                        {selectedArtifact.warnings.filter(isWarning).map((warning) => (
                          <div key={warning.id} className="card">
                            <div className="row">
                              <strong>{warning.title}</strong>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span className={`badge ${warning.severity}`}>{getSeverityLabel(warning)}</span>
                                <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                              </div>
                            </div>
                            <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                            <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionSection>
              )
            })()}

            {/* Lineage accordion — auto-expand for derived artifacts */}
            <AccordionSection title="Lineage" defaultOpen={selectedArtifact.kind === 'derived'}>
              <div className="card">
                <div className="row">
                  <strong>Lineage</strong>
                  <span className="badge">{selectedArtifact.kind}</span>
                </div>
                {selectedArtifact.kind === 'source' ? (
                  <>
                    <div className="small" style={{ marginTop: 8 }}>Imported into the workspace as a source artifact.</div>
                    {selectedArtifactOriginEvent && (
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Created by: import event on {formatTimestamp(selectedArtifactOriginEvent.timestamp)}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="small" style={{ marginTop: 8 }}>
                      Upstream artifact(s): {selectedArtifact.inputArtifactIds?.map((id) => artifacts.find((a) => a.id === id)?.name ?? id).join(', ') || 'unknown upstream artifact'}
                    </div>
                    {selectedArtifactOriginEvent && (
                      <>
                        <div className="small muted" style={{ marginTop: 6 }}>Created by: {selectedArtifactOriginEvent.type} event on {formatTimestamp(selectedArtifactOriginEvent.timestamp)}</div>
                        <div className="small" style={{ marginTop: 8, color: '#cbd5e1' }}>
                          This artifact's stored truth comes from the output of that event. Input assumptions and provenance notes remain inspectable in the event details below.
                        </div>
                        {getHistoryDetailGroups(selectedArtifactOriginEvent.details).length > 0 && (
                          <div className="card" style={{ marginTop: 10 }}>
                            <strong className="small">Event-derived lineage facts</strong>
    <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                              {getHistoryDetailGroups(selectedArtifactOriginEvent.details).map((group) => (
                                <div key={group.title}>
                                  <div className="small" style={{ color: '#93c5fd', marginBottom: 6 }}>{group.title}</div>
                                  <div style={{ display: 'grid', gap: 6 }}>
                                    {group.rows.map(({ key, label, renderedValue }) => (
                                      <div key={key} className="small" style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                                        <span style={{ color: '#94a3b8' }}>{label}</span>
                                        <span>{renderedValue}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {'sql' in selectedArtifactOriginEvent.details && typeof selectedArtifactOriginEvent.details.sql === 'string' && (
                          <pre className="card code-block">
{String(selectedArtifactOriginEvent.details.sql)}
                          </pre>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </AccordionSection>
          </>
        )}
        {rightPanelTab === 'history' && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {history.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>⏱</div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                  No operations yet. Run a geoprocessing operation to see history here.
                </div>
              </div>
            )}
            {history.length > 0 && (
              <div className="history-list">
                {history.map((event) => (
                  <button
                    key={event.id}
                    className={`card ${selectedHistoryEventId === event.id ? 'selected' : ''}`}
                    style={{ textAlign: 'left' }}
                    onClick={() => setSelectedHistoryEventId(event.id)}
                  >
                    <div className="row"><strong>{event.summary}</strong><span className="badge">{event.type}</span></div>
                    <div className="small muted" style={{ marginTop: 6 }}>{formatTimestamp(event.timestamp)}</div>
                    <div className="row" style={{ marginTop: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                      {getActiveWarnings(event.warnings).length > 0 && (
                        <span className="badge warning">{formatCount(getActiveWarnings(event.warnings).length, 'warning')}</span>
                      )}
                      {getCurrentNotes(event.warnings).length > 0 && (
                        <span className="badge info">{formatCount(getCurrentNotes(event.warnings).length, 'note')}</span>
                      )}
                      {getProvenanceNotes(event.warnings).length > 0 && (
                        <span className="badge historical">{formatCount(getProvenanceNotes(event.warnings).length, 'provenance note')}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedHistoryEvent && (
              <div style={{ marginTop: 16 }}>
                <div className="small" style={{ color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>Event detail</div>
                <div className="card">
                  <div className="row">
                    <strong>{selectedHistoryEvent.summary}</strong>
                    <span className="badge">{selectedHistoryEvent.type}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>{formatTimestamp(selectedHistoryEvent.timestamp)}</div>
                  <div className="small" style={{ marginTop: 10 }}>
                    Inputs: {selectedHistoryEvent.inputArtifactIds.length
                      ? selectedHistoryEvent.inputArtifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)?.name ?? id).join(', ')
                      : 'none'}
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    Outputs: {selectedHistoryEvent.outputArtifactIds.length
                      ? selectedHistoryEvent.outputArtifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)?.name ?? id).join(', ')
                      : 'none'}
                  </div>
                  {getHistoryDetailGroups(selectedHistoryEvent.details).length > 0 && (
                    <div className="card" style={{ marginTop: 12 }}>
                      <strong className="small">Structured event details</strong>
                      <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                        {getHistoryDetailGroups(selectedHistoryEvent.details).map((group) => (
                          <div key={group.title}>
                            <div className="small" style={{ color: '#93c5fd', marginBottom: 6 }}>{group.title}</div>
                            <div style={{ display: 'grid', gap: 6 }}>
                              {group.rows.map(({ key, label, renderedValue }) => (
                                <div key={key} className="small" style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8 }}>
                                  <span style={{ color: '#94a3b8' }}>{label}</span>
                                  <span>{renderedValue}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedHistoryEvent.warnings.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {getCurrentNotes(selectedHistoryEvent.warnings).length > 0 && (
                        <>
                          <strong style={{ color: '#93c5fd' }}>Event notes</strong>
                          <div className="artifact-list" style={{ marginTop: 8 }}>
                            {getCurrentNotes(selectedHistoryEvent.warnings).map((warning) => (
                              <div key={warning.id} className="card" style={{ borderColor: '#1e3a5f', background: '#0a1525' }}>
                                <div className="row">
                                  <strong>{warning.title}</strong>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span className="badge info">{getSeverityLabel(warning)}</span>
                                    <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                                  </div>
                                </div>
                                <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                                <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {getProvenanceNotes(selectedHistoryEvent.warnings).length > 0 && (
                        <>
                          <strong>Event provenance</strong>
                          <div className="artifact-list" style={{ marginTop: 8 }}>
                            {getProvenanceNotes(selectedHistoryEvent.warnings).map((warning) => (
                              <div key={warning.id} className="card">
                                <div className="row">
                                  <strong>{warning.title}</strong>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span className="badge info">{getSeverityLabel(warning)}</span>
                                    <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                                  </div>
                                </div>
                                <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                                <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {getActiveWarnings(selectedHistoryEvent.warnings).length > 0 && (
                        <>
                          <strong>Event warnings</strong>
                          <div className="artifact-list" style={{ marginTop: 8 }}>
                            {getActiveWarnings(selectedHistoryEvent.warnings).map((warning) => (
                              <div key={warning.id} className="card">
                                <div className="row">
                                  <strong>{warning.title}</strong>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span className={`badge ${warning.severity}`}>{getSeverityLabel(warning)}</span>
                                    <span className={`badge ${getWarningScope(warning)}`}>{getWarningScopeLabel(warning)}</span>
                                  </div>
                                </div>
                                <div className="small muted" style={{ marginTop: 6 }}>{warning.message}</div>
                                <div className="small" style={{ marginTop: 6 }}>{getWarningRecoveryHint(warning)}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {'sql' in selectedHistoryEvent.details && typeof selectedHistoryEvent.details.sql === 'string' && (
                    <pre className="card code-block">
{String(selectedHistoryEvent.details.sql)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {!rightPanelOpen && (
        <button
          className="right-panel-grip"
          title="Open details / history"
          onClick={() => setRightPanelOpen(true)}
        >
          ◀
        </button>
      )}

      {/* Command bar */}
      <div className="command-bar">
        <span style={{ color: '#8b949e', fontSize: 18 }}>⌘</span>
        <input
          type="text"
          className="command-bar-input"
          ref={commandInputRef}
          placeholder="Ask anything…   / SQL   @osm @ckan @stac"
          value={commandInput}
          onChange={(e) => handleCommandChange(e.target.value)}
          onFocus={() => setCommandFocused(true)}
          onBlur={() => setTimeout(() => setCommandFocused(false), 200)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (commandInput.startsWith('/')) {
                setActiveSidebar('query')
              } else if (commandInput.startsWith('@')) {
                setActiveSidebar('discover')
              } else if (commandInput.trim()) {
                setActiveSidebar('chain')
              }
            }
            if (e.key === 'Escape') {
              setCommandInput('')
              setActiveSidebar(null)
            }
          }}
        />
        {commandInput && (
          <button
            className="secondary"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={() => { setCommandInput(''); setActiveSidebar(null) }}
          >
            ×
          </button>
        )}
      </div>

      {(commandFocused || activeSidebar === 'chain') && !commandInput && (
        <div className="command-surface">
          <div className="panel-title" style={{ marginTop: 0 }}>Try an example</div>
          {commandExamples.map((example) => (
            <div
              key={example}
              className="command-example"
              onMouseDown={(e) => { e.preventDefault(); applyExampleQuery(example) }}
            >
              {example}
            </div>
          ))}
        </div>
      )}

      {/* NL plan bottom sheet — shown when chain visualization is active */}
      {activeSidebar === 'chain' && (
        <div className="bottom-sheet nl-plan-sheet bottom-sheet--expanded">
          <div className="bottom-sheet-handle" onClick={() => setActiveSidebar(null)} />
          <div className="bottom-sheet-content">
            <h2 className="panel-title" style={{ marginTop: 0 }}>Plan</h2>
            <NLQueryPanel
              artifacts={artifacts}
              addArtifact={(artifact) => { pushArtifactSnapshot(`NL Plan: ${artifact.name}`); setArtifacts(prev => [...prev, artifact]) }}
              onPlanExecuted={(result) => {
                if (result.success) {
                  setHistory(prev => [...prev, ...result.historyEvents])
                  addToast(`Executed plan: ${result.artifacts.length} artifact(s) created`, 'success')
                  if (result.artifacts[0]) setSelectedArtifactId(result.artifacts[0].id)
                } else {
                  addToast(`Plan failed: ${result.errors.join(', ')}`, 'error')
                }
              }}
              externalQuery={commandInput}
              onClose={() => setActiveSidebar(null)}
              sheetMode={true}
            />
          </div>
        </div>
      )}

      {/* Empty state bottom sheet — shown when no data exists */}
      {!selectedArtifact && artifacts.filter(a => a.spatial && isFeatureCollection(a.data)).length === 0 && !activeSidebar && (
        <div className="bottom-sheet empty-state-sheet bottom-sheet--expanded">
          <div className="bottom-sheet-handle" />
          <div className="bottom-sheet-content" style={{ textAlign: 'center' }}>
            <div className="muted small">Map pane</div>
            <div style={{ marginTop: 8 }}>Import or load a spatial dataset to see it on the map.</div>
            <div className="muted small" style={{ marginTop: 8 }}>Supports GeoJSON (Point, LineString, Polygon, MultiPolygon) with direct map rendering.</div>
            <div className="empty-state-actions" style={{ marginTop: 'var(--space-3)' }}>
              <button className="secondary empty-state-btn" onClick={() => importFileRef.current?.click()}>
                Import file
              </button>
              <button className="secondary empty-state-btn" onClick={openSampleImport}>
                Try sample data
              </button>
            </div>
          </div>
        </div>
      )}

      <section className={`bottom-dock ${bottomDockExpanded ? 'expanded' : ''}`}>
        {/* Handle (always visible) — collapsed = handle only, expanded = full bar + content */}
        <div className="bottom-dock-handle" onClick={() => setBottomDockExpanded(!bottomDockExpanded)} />

        {/* Tab bar (visible when expanded) */}
        {bottomDockExpanded && (
          <div className="bottom-dock-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)' }}>
                {bottomTab.charAt(0).toUpperCase() + bottomTab.slice(1)}
                {selectedArtifact && ` — ${selectedArtifact.name}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(['table', 'sql', 'results'] as const).map(tab => (
                <button
                  key={tab}
                  className={`tab ${bottomTab === tab ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setBottomTab(tab) }}
                  style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Expanded content */}
        {bottomDockExpanded && (
        <>
        {bottomTab === 'table' && (
          <div>
            {selectedArtifact && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="row">
                  <strong>Inspection focus</strong>
                  <span className="badge">{selectedArtifact.name}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  {selectedArtifactOutputKind === 'measurement-table'
                    ? 'This is a measurement table. Table and details stay coherent, but there is no map-focus contract because the output is intentionally non-spatial.'
                    : selectedArtifact.spatial && isFeatureCollection(selectedArtifact.data)
                      ? (selectedRowIndex !== null
                          ? `Feature ${selectedRowIndex + 1} is selected. Map, table, and details are now focused on the same artifact context.`
                          : 'No individual feature selected yet. Click a table row to focus one feature inside the selected artifact.')
                      : 'This artifact is not currently map-synchronized. Table inspection still works, but feature-level map focus is unavailable.'}
                </div>
                {selectedRowIndex !== null && (
                  <>
                    <div className="inspection-focus-banner" style={{ marginTop: 10 }}>
                      <span className="inspection-focus-dot" aria-hidden="true" />
                      <span>
                        Focused feature <strong>#{selectedRowIndex + 1}</strong> is active across map, table, and details.
                      </span>
                    </div>
                    {selectedFeatureProperties && (
                      <div className="small" style={{ marginTop: 8, color: '#cbd5e1' }}>
                        Focused feature properties: {Object.entries(selectedFeatureProperties).slice(0, 4).map(([key, value]) => `${key}=${String(value)}`).join(', ') || 'no properties'}
                      </div>
                    )}
                    <button 
                      className="secondary" 
                      style={{ marginTop: 10, fontSize: 12, padding: '4px 8px' }}
                      onClick={() => setSelectedRowIndex(null)}
                    >
                      Clear focus
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="table-wrap" ref={tableContainerRef}>
            <table>
              <thead>
                <tr>
                  {(rowsForSelected[0] ? Object.keys(rowsForSelected[0]) : ['message']).map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsForSelected.length === 0 ? (
                  <tr><td className="muted">Select or import a spatial artifact to inspect rows.</td></tr>
                ) : (
                  rowsForSelected.map((row, idx) => {
                    const isFocusedRow = selectedRowIndex === idx
                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedRowIndex(idx)}
                        aria-selected={isFocusedRow}
                        className={isFocusedRow ? 'focused-row' : undefined}
                      >
                        {Object.entries(row).map(([key, value]) => (
                          <td key={key}>{String(value)}</td>
                        ))}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {bottomTab === 'sql' && (
          <div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="row">
                <strong>{artifacts.filter((artifact) => artifact.tableName).length === 0 ? 'No data loaded' : `${artifacts.filter((artifact) => artifact.tableName).length} tables loaded`}</strong>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {artifacts.filter((artifact) => artifact.tableName).length === 0
                  ? 'Import a GeoJSON file or discover data to enable SQL queries.'
                  : artifacts
                      .filter((artifact) => artifact.tableName)
                      .map((artifact) => `${artifact.tableName} (${artifact.kind})`)
                      .join(', ')}
              </div>
              {artifacts.filter((artifact) => artifact.tableName).length === 0 && (
                <div className="small muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
                  <button
                    className="secondary"
                    style={{ padding: '2px 8px', fontSize: 'inherit' }}
                    onClick={() => setBottomTab('table')}
                  >
                    Import data
                  </button>
                  {' '}or{' '}
                  <button
                    className="empty-state-link"
                    style={{ padding: '2px 8px', fontSize: 'inherit' }}
                    onClick={() => setActiveSidebar('discover')}
                  >
                    discover data
                  </button>
                </div>
              )}
            </div>
            <div className="small muted" style={{ marginBottom: 4, fontStyle: 'italic' }}>
              Example query — import data to run this.
            </div>
            <textarea className="sql-editor" value={sql} onChange={(event) => setSql(event.target.value)} />
            {queryError && (
              <div className="card danger" style={{ marginTop: 12 }}>
                <strong>Query failed</strong>
                <div className="small muted" style={{ marginTop: 6 }}>{queryError}</div>
                <div className="small" style={{ marginTop: 6 }}>Recovery: verify table names, SQL syntax, and that the referenced artifact tables are registered in the workspace.</div>
              </div>
            )}
            <div className="actions">
              <button className="primary" onClick={runQuery} disabled={queryRunning || artifacts.filter((artifact) => artifact.tableName).length === 0}>{queryRunning ? 'Running…' : 'Run query'}</button>
              <button className="secondary" onClick={() => setShowSaveQueryDialog(true)} disabled={!queryHasRunSuccessfully}>Save Query</button>
              <button className="secondary" onClick={() => setSql(SAMPLE_SQL)}>Reset to example</button>
            </div>
          </div>
        )}

        {bottomTab === 'results' && (
          <div>
            {!queryPreview && <div className="card muted">No query result preview yet.</div>}
            {queryPreview && (
              <>
                <div className="card">
                  <div className="row">
                    <strong>Result preview</strong>
                    <span className="badge">{formatCount(queryPreview.rows.length, 'row')}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    Referenced tables: {queryPreview.referencedTables?.length ? queryPreview.referencedTables.join(', ') : (queryPreview.sourceTableName || 'none detected')}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Source artifacts matched: {queryPreview.sourceArtifactIds?.length ? queryPreview.sourceArtifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)?.name ?? id).join(', ') : 'none matched directly'}
                  </div>
                  {queryPreviewMaterializedOutputKind && (
                    <div className="small" style={{ marginTop: 6, color: '#cbd5e1' }}>
                      If materialized now, output kind would be <strong>{queryPreview.materialization?.outputKindLabel ?? getArtifactOutputKindLabel(queryPreviewMaterializedOutputKind)}</strong>. {queryPreview.materialization?.outputKindDescription}
                    </div>
                  )}
                  {queryPreviewProvenancePresentation && (
                    <div className="small" style={{ marginTop: 6, color: '#cbd5e1' }}>
                      Provenance strength: <strong>{queryPreviewProvenancePresentation.label}</strong>. {queryPreviewProvenancePresentation.message}
                    </div>
                  )}
                  <div className="small muted" style={{ marginTop: 4 }}>
                    This preview uses the same provenance-strength, output-kind, and persisted-artifact vocabulary that will be recorded if you materialize it.
                  </div>
                  
                  {/* Materialization naming dialog */}
                  {materializeStage === 'naming' && (
                    <div className="card" style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #0ea5e9' }}>
                      <div className="row">
                        <strong>Name your derived artifact</strong>
                      </div>
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Give this query result a name to save it as a derived artifact in your workspace.
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <input
                          type="text"
                          value={derivedArtifactName}
                          onChange={(e) => setDerivedArtifactName(e.target.value)}
                          placeholder="Enter artifact name..."
                          style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                          disabled={materializing}
                        />
                      </div>
                      <div className="actions" style={{ marginTop: 12 }}>
                        <button 
                          className="primary" 
                          onClick={confirmMaterialize}
                          disabled={materializing || !derivedArtifactName.trim()}
                        >
                          {materializing ? 'Creating...' : 'Confirm & Create'}
                        </button>
                        <button 
                          className="secondary" 
                          onClick={() => { setMaterializeStage('idle'); setDerivedArtifactName('') }}
                          disabled={materializing}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Materialize button (shown when not in naming mode and not yet materialized) */}
                  {materializeStage === 'idle' && !queryPreview.materializedArtifactId && (
                    <>
                      <div className="small muted" style={{ marginTop: 6 }}>
                        This is still a preview. Materialize it to create a derived artifact.
                      </div>
                      <div className="actions">
                        <button className="primary" onClick={initiateMaterialization}>Materialize result</button>
                      </div>
                    </>
                  )}
                  
                  {/* Already materialized indicator */}
                  {queryPreview.materializedArtifactId && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      ✓ Materialized as artifact. <button className="link" onClick={() => {
                        const artifact = artifacts.find(a => a.id === queryPreview.materializedArtifactId)
                        if (artifact) setSelectedArtifactId(artifact.id)
                      }}>View artifact</button> or re-run query to create a new one.
                    </div>
                  )}
                  
                  {/* Materializing indicator */}
                  {materializeStage === 'materializing' && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Creating derived artifact...
                    </div>
                  )}
                </div>
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>{queryPreview.columns.map((column) => <th key={column}>{column}</th>)}</tr>
                    </thead>
                    <tbody>
                      {queryPreview.rows.map((row, idx) => (
                        <tr key={idx}>
                          {queryPreview.columns.map((column) => <td key={column}>{String(row[column])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        </>
        )}
      </section>
      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              <span className="toast-message">{toast.message}</span>
              {toast.dismissible && (
                <button className="toast-dismiss" onClick={() => dismissToast(toast.id)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
