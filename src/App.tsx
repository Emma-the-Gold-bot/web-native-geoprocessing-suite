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
import { useArtifacts } from './hooks/useArtifacts'
import { useUndoRedo } from './hooks/useUndoRedo'
import { useMapSync } from './hooks/useMapSync'
import { useImportExport, fetchFullGeometryFromTable } from './hooks/useImportExport'
import type { ImportReviewState } from './hooks/useImportExport'
import {
  reconcileLayerSettings,
  toggleLayerVisibility as toggleLayerVisibilityPure,
  changeLayerOpacity as changeLayerOpacityPure,
  reorderLayer as reorderLayerPure,
} from './lib/layer-controls'
import { getActiveWarnings, getCurrentNotes, getDeletedQueryStatusMessage, getExportFailureStatusMessage, getExportSuccessStatusMessage, getHistoryDetailGroups, getLoadedQueryStatusMessage, getProvenanceNotes, getQueryRenderIssue, getQueryRunStatusMessage, getSeverityLabel, getSuggestedQueryArtifactName, getWarningRecoveryHint, getWarningScope, getWarningScopeLabel, isWarning, buildQueryHistoryEvent } from './lib/product-surface'
import { getSpatialEngine, executeRegisteredSingleInputOperation, executeRegisteredAggregationOperation, executeClipOperation, executeIntersectOperation, executeRegisteredMeasurementOperation, executeAttributeJoinOperation, getJoinableFieldNames, getDisplayBounds, getDisplayFeatureCollection, getSingleInputOperationPresentation, getAggregationOperationPresentation, getMeasurementOperationPresentation, getSingleInputGeometrySupport, getSingleInputOperationInfoWarning, getMeasurementUnitDisclosure, getMeasurementUnitRefusalWarning, getAttributeJoinPresentation, getAttributeJoinOutputFieldSelection, getOperationSuccessStatusMessage, getTopologyRoleContext, isProjectedCrs, needsDisplayTransformation, validateForClip, validateForIntersect, validateForReproject } from './lib/spatial'
import { OperationContractDisplay, OperationExecutionShell, OperationOutputSemantics, OperationSecondarySelector, OperationSourceSummary, OperationFieldCheckboxList, TypedWarningPanel, artifactSummaryText, getArtifactOutputKind, getArtifactOutputKindLabel, getOperationWarningTone } from './components/operation-ui'
import { BufferDialog, CentroidDialog, ConvexHullDialog, EnvelopeDialog, SimplifyDialog, DissolveDialog, ReprojectDialog, ClipDialog, IntersectDialog, JoinDialog, MeasureDialog } from './components/operations'
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
 * Get human-readable label for CRS provenance source
 */
function getCrsProvenanceLabel(source: CrsProvenance['source']): string {
  switch (source) {
    case 'import-metadata':
      return 'imported metadata'
    case 'operation-inherited':
      return 'inherited from source layer'
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
  const { artifacts, setArtifacts, selectedArtifact, selectedArtifactId, setSelectedArtifactId, layerSettings, setLayerSettings } = useArtifacts()
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
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

  const { pushSnapshot: pushArtifactSnapshot, undo: handleUndo, redo: handleRedo, canUndo, canRedo, undoLabel, redoLabel } = useUndoRedo(artifacts, setArtifacts, layerSettings, setLayerSettings, addToast)

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
  
  // Operation dialog state - single active dialog tracks which dialog is open
  const [activeDialog, setActiveDialog] = useState<string | null>(null)
  
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
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const artifactsRef = useRef<Artifact[]>([])
  const selectedArtifactIdRef = useRef<string | null>(null)
  const pendingPostCommitSelectedArtifactIdRef = useRef<string | null>(null)

  selectedArtifactRef.current = selectedArtifact

  // derived values for operation dialogs are now in the dialog components

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

  useMapSync(mapRef.current, artifacts, layerSettings, selectedArtifactId, selectedRowIndex, setSelectedRowIndex, setBottomTab)

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

  // Import/Export via hook
  const {
    saveProject: handleSaveProject,
    openProject: handleOpenProject,
    newProject: handleNewProject,
    exportGeoJson: handleExportGeoJson,
    exportJSON: handleExportJson,
    loadSample: openSampleImport,
    importFile: handleFileImport,
    confirmImport,
  } = useImportExport({
    projectName,
    setProjectName,
    artifacts,
    setArtifacts,
    history,
    setHistory,
    savedQueries,
    setSavedQueries,
    selectedArtifactId,
    setSelectedArtifactId,
    bottomTab,
    setBottomTab,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    showSaveDialog,
    setShowSaveDialog,
    showExportMenu,
    setShowExportMenu,
    queryHasRunSuccessfully,
    setQueryHasRunSuccessfully,
    setStatusMessage,
    addToast,
    importReview,
    setImportReview,
    importStage,
    setImportStage,
    importing,
    setImporting,
    selectedArtifact,
    pushArtifactSnapshot,
  })
  handleOpenProjectRef.current = handleOpenProject
  handleNewProjectRef.current = handleNewProject

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
      setQueryError('Import a GeoJSON or GeoParquet dataset first. Queries can only run against registered layer tables.')
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
    setStatusMessage(`Created derived layer ${artifact.name}`)
    addToast(`Created derived layer ${artifact.name}`, 'success')
    
    // Mark the preview as materialized so we don't show the "materialize" message anymore
    if (queryPreview) {
      setQueryPreview({ ...queryPreview, materializedArtifactId: artifactId })
    }
    
    // Reset materialization state
    setMaterializeStage('idle')
    setMaterializing(false)
    setDerivedArtifactName('')
  }

  // commitArtifact - simplified result application for single-input topology operations
  function commitArtifact(params: {
    artifact: Artifact
    historyEvent: HistoryEvent
    snapshotLabel: string
    statusMessage?: string
    toastMessage?: string
    toastType?: 'success' | 'error' | 'warning'
  }) {
    pushArtifactSnapshot(params.snapshotLabel)
    setArtifacts(current => [...current, params.artifact])
    setHistory(current => [params.historyEvent, ...current])
    setSelectedArtifactId(params.artifact.id)
    if (params.statusMessage) setStatusMessage(params.statusMessage)
    if (params.toastMessage) addToast(params.toastMessage, params.toastType ?? 'success')
  }

  // Open dialog helpers - just set activeDialog
  const openBufferDialog = () => { if (selectedArtifact) setActiveDialog('buffer') }
  const openCentroidDialog = () => { if (selectedArtifact) setActiveDialog('centroid') }
  const openConvexHullDialog = () => { if (selectedArtifact) setActiveDialog('convex-hull') }
  const openEnvelopeDialog = () => { if (selectedArtifact) setActiveDialog('envelope') }
  const openSimplifyDialog = () => { if (selectedArtifact) setActiveDialog('simplify') }
  const openDissolveDialog = () => { if (selectedArtifact) setActiveDialog('dissolve') }
  const openAreaDialog = () => { if (selectedArtifact) setActiveDialog('area') }
  const openPerimeterDialog = () => { if (selectedArtifact) setActiveDialog('perimeter') }
  const openCompactnessDialog = () => { if (selectedArtifact) setActiveDialog('compactness') }
  const openReprojectDialog = () => { if (selectedArtifact) setActiveDialog('reproject') }
  const openClipDialog = () => { if (selectedArtifact) setActiveDialog('clip') }
  const openIntersectDialog = () => { if (selectedArtifact) setActiveDialog('intersect') }
  const openAttributeJoinDialog = () => { if (selectedArtifact) setActiveDialog('join') }

  // applyOperationResult - full-featured result application with debug logging and deferred selection
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

  // Assign CRS - metadata only, no transformation
  const assignCrs = async (targetCrs: string) => {
    if (!selectedArtifact) return
    setStatusMessage(`Assign CRS is not yet implemented. Use Reproject to transform coordinates to a new CRS.`)
    addToast(`Assign CRS is not yet implemented. Use Reproject to transform coordinates to a new CRS.`, 'warning')
  }

  // Dialog context - shared state and actions consumed by all operation dialog components
  const dialogContext = useMemo(() => ({
    artifacts,
    selectedArtifact,
    selectedArtifactId,
    onClose: () => setActiveDialog(null),
    setStatusMessage,
    addToast,
    commitArtifact,
    applyOperationResult,
    debugParams,
  }), [artifacts, selectedArtifact, selectedArtifactId, debugParams])

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
                title={selectedArtifactExportOptions.length === 0 ? 'No export formats available' : 'Export selected layer'}
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
          <span className="bottom-tab-label">Find</span>
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
                  <div className="small" style={{ marginTop: 6 }}>Recovery: verify table names, SQL syntax, and that the referenced layer tables are registered in the workspace.</div>
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

        {/* Operation Dialogs */}
        {activeDialog === 'buffer' && selectedArtifact && (
          <BufferDialog context={dialogContext} />
        )}
        {activeDialog === 'centroid' && selectedArtifact && (
          <CentroidDialog context={dialogContext} />
        )}
        {activeDialog === 'convex-hull' && selectedArtifact && (
          <ConvexHullDialog context={dialogContext} />
        )}
        {activeDialog === 'envelope' && selectedArtifact && (
          <EnvelopeDialog context={dialogContext} />
        )}
        {activeDialog === 'simplify' && selectedArtifact && (
          <SimplifyDialog context={dialogContext} />
        )}
        {activeDialog === 'dissolve' && selectedArtifact && (
          <DissolveDialog context={dialogContext} />
        )}
        {activeDialog === 'area' && selectedArtifact && (
          <MeasureDialog operationId="area-v1" title="Area Measurement" subtitle={`Measure polygon area for ${selectedArtifact.name} on the narrow area v1 path`} context={dialogContext} />
        )}
        {activeDialog === 'perimeter' && selectedArtifact && (
          <MeasureDialog operationId="perimeter-v1" title="Perimeter Measurement" subtitle={`Measure polygon perimeter for ${selectedArtifact.name} on the narrow perimeter v1 path`} context={dialogContext} />
        )}
        {activeDialog === 'compactness' && selectedArtifact && (
          <MeasureDialog operationId="compactness-v1" title="Compactness Measurement" subtitle={`Measure polygon compactness for ${selectedArtifact.name} on the narrow compactness v1 path`} context={dialogContext} />
        )}
        {activeDialog === 'reproject' && selectedArtifact && (
          <ReprojectDialog context={dialogContext} />
        )}
        {activeDialog === 'clip' && selectedArtifact && (
          <ClipDialog context={dialogContext} />
        )}
        {activeDialog === 'intersect' && selectedArtifact && (
          <IntersectDialog context={dialogContext} />
        )}
        {activeDialog === 'join' && selectedArtifact && (
          <JoinDialog context={dialogContext} />
        )}
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
                    <div className="small" style={{ marginTop: 6 }}>The layer still exists and remains queryable/tabular. Only the current map adaptation failed.</div>
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
                          <div className="small" style={{ marginTop: 6 }}>This reflects the current map-framing runtime, not a persisted change to the layer itself.</div>
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
                    <div className="small" style={{ marginTop: 8 }}>Imported into the workspace as a source layer.</div>
                    {selectedArtifactOriginEvent && (
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Created by: import event on {formatTimestamp(selectedArtifactOriginEvent.timestamp)}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="small" style={{ marginTop: 8 }}>
                      Upstream layer(s): {selectedArtifact.inputArtifactIds?.map((id) => artifacts.find((a) => a.id === id)?.name ?? id).join(', ') || 'unknown upstream layer'}
                    </div>
                    {selectedArtifactOriginEvent && (
                      <>
                        <div className="small muted" style={{ marginTop: 6 }}>Created by: {selectedArtifactOriginEvent.type} event on {formatTimestamp(selectedArtifactOriginEvent.timestamp)}</div>
                        <div className="small" style={{ marginTop: 8, color: '#cbd5e1' }}>
                          This layer's stored truth comes from the output of that event. Input assumptions and provenance notes remain inspectable in the event details below.
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
                  addToast(`Executed plan: ${result.artifacts.length} layer(s) created`, 'success')
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
                          ? `Feature ${selectedRowIndex + 1} is selected. Map, table, and details are now focused on the same layer context.`
                          : 'No individual feature selected yet. Click a table row to focus one feature inside the selected layer.')
                      : 'This layer is not currently map-synchronized. Table inspection still works, but feature-level map focus is unavailable.'}
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
                  <tr><td className="muted">Select or import a spatial layer to inspect rows.</td></tr>
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
                <div className="small" style={{ marginTop: 6 }}>Recovery: verify table names, SQL syntax, and that the referenced layer tables are registered in the workspace.</div>
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
                    Source layers matched: {queryPreview.sourceArtifactIds?.length ? queryPreview.sourceArtifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)?.name ?? id).join(', ') : 'none matched directly'}
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
                    This preview uses the same provenance-strength, output-kind, and persisted-layer vocabulary that will be recorded if you materialize it.
                  </div>
                  
                  {/* Materialization naming dialog */}
                  {materializeStage === 'naming' && (
                    <div className="card" style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #0ea5e9' }}>
                      <div className="row">
                        <strong>Name your derived layer</strong>
                      </div>
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Give this query result a name to save it as a derived layer in your workspace.
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <input
                          type="text"
                          value={derivedArtifactName}
                          onChange={(e) => setDerivedArtifactName(e.target.value)}
                          placeholder="Enter layer name..."
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
                        This is still a preview. Materialize it to create a derived layer.
                      </div>
                      <div className="actions">
                        <button className="primary" onClick={initiateMaterialization}>Materialize result</button>
                      </div>
                    </>
                  )}
                  
                  {/* Already materialized indicator */}
                  {queryPreview.materializedArtifactId && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      ✓ Materialized as layer. <button className="link" onClick={() => {
                        const artifact = artifacts.find(a => a.id === queryPreview.materializedArtifactId)
                        if (artifact) setSelectedArtifactId(artifact.id)
                      }}>View layer</button> or re-run query to create a new one.
                    </div>
                  )}
                  
                  {/* Materializing indicator */}
                  {materializeStage === 'materializing' && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Creating derived layer...
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
