import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import {
  getSpatialEngine,
  executeIntersectOperation,
  getTopologyRoleContext,
  validateForIntersect,
} from '../../lib/spatial'
import { OperationDialog } from './OperationDialog'
import {
  OperationSourceSummary,
  OperationContractDisplay,
  OperationOutputSemantics,
  OperationSecondarySelector,
  TypedWarningPanel,
  artifactSummaryText,
} from '../operation-ui'

interface IntersectDialogProps {
  context: OperationDialogContext
}

export function IntersectDialog({ context }: IntersectDialogProps) {
  const { artifacts, selectedArtifact, selectedArtifactId, onClose, setStatusMessage, addToast, commitArtifact } = context
  const selectableSecondaryArtifacts = artifacts.filter((a) => a.id !== selectedArtifactId && a.spatial)
  const [overlayId, setOverlayId] = useState<string>(
    selectableSecondaryArtifacts[0]?.id ?? ''
  )
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_intersected` : ''
  )
  const [running, setRunning] = useState(false)

  const overlayArtifact = overlayId ? artifacts.find(a => a.id === overlayId) ?? null : null

  if (!selectedArtifact) return null

  const intersectRoleContext = getTopologyRoleContext('intersect-v1')
  const intersectOptions = selectableSecondaryArtifacts.map((artifact) => ({
    id: artifact.id,
    label: `${artifact.name} — ${artifactSummaryText(artifact)} — CRS: ${artifact.crs ?? 'unknown'}`,
  }))
  const sourceCrs = selectedArtifact.crs
  const overlayCrs = overlayArtifact?.crs
  const crsMatch = Boolean(sourceCrs && overlayCrs && sourceCrs !== 'unknown' && overlayCrs !== 'unknown' && sourceCrs === overlayCrs)
  const sourceGeom = selectedArtifact.geometryType
  const overlayGeom = overlayArtifact?.geometryType
  const sourceAllowed = sourceGeom === 'Polygon' || sourceGeom === 'MultiPolygon'
  const secondaryAllowed = overlayGeom === 'Polygon' || overlayGeom === 'MultiPolygon'
  const refusalWarnings: WarningRef[] = []
  if (overlayArtifact) {
    const validation = validateForIntersect(selectedArtifact, overlayArtifact)
    refusalWarnings.push(...validation.errors.map((error, index) => ({
      id: `intersect-refusal-${index}`,
      code: error.code,
      severity: 'blocking' as const,
      scope: 'active' as const,
      title: 'Intersect refusal',
      message: error.message,
    })))
  }

  const runIntersect = async () => {
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
      return
    }

    setRunning(true)
    onClose()

    try {
      const engine = getSpatialEngine()
      const result = await executeIntersectOperation({
        sourceArtifact: selectedArtifact,
        overlayArtifact,
        outputName: name.trim() || `${selectedArtifact.name}_intersected`,
        executeIntersect: (sourceInput, overlayInput) => engine.intersect(sourceInput, overlayInput),
      })

      if (result.error) {
        setStatusMessage(`Intersect failed: ${result.error}`)
        addToast(`Intersect failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        const isEmpty = result.artifact.rowCount === 0
        const emptyMsg = `Stored CRS remains ${result.artifact.crs ?? 'unknown'}. No overlapping area was found, so the result layer is intentionally empty.`
        const successMsg = `Stored CRS remains ${result.artifact.crs ?? 'unknown'}. Source attributes were preserved; overlay attributes are not merged in v1.`

        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Intersect: ${result.artifact.name}`,
          statusMessage: isEmpty ? `Intersect created: ${result.artifact.name}. ${emptyMsg}` : `Intersect created: ${result.artifact.name}. ${successMsg}`,
          toastMessage: isEmpty ? `Intersect created: ${result.artifact.name}. ${emptyMsg}` : `Intersect created: ${result.artifact.name}. ${successMsg}`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Intersect failed: ${message}`)
      addToast(`Intersect failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationDialog title="Intersect Operation" subtitle={`Compute overlap between ${selectedArtifact.name} and an overlay polygon`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label={`Source layer (${intersectRoleContext.sourceLabel})`}
          artifact={selectedArtifact}
          description="This is the primary layer being intersected."
        />

        <div style={{ marginTop: 12 }}>
          <OperationSecondarySelector
            label="Overlay layer"
            value={overlayId}
            placeholder="Select an overlay layer..."
            options={intersectOptions}
            onChange={setOverlayId}
          />
        </div>

        {overlayArtifact && (
          <OperationSourceSummary
            label={`Secondary layer (${intersectRoleContext.secondaryLabel})`}
            artifact={overlayArtifact}
            description="The overlay defines which overlapping area survives in the output."
          />
        )}

        <div style={{ marginTop: 12 }}>
          <OperationContractDisplay
            title="Intersect v1 contract"
            geometryStatement="Intersect v1 supports only Polygon or MultiPolygon source and overlay layers."
            crsStatement="Both layers must have known matching CRS. Intersect does not auto-transform and does not broaden beyond the current narrow v1 path."
            crsMatch={overlayArtifact ? {
              label: 'Source CRS',
              sourceCrs,
              secondaryCrs: overlayCrs,
              matches: crsMatch,
              mismatchMessage: 'Intersect v1 requires matching known CRS',
            } : undefined}
            geometrySupport={overlayArtifact ? {
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
          outputKindLabel="Spatial layer"
          outputKindDescription="This topology output is a geometry-bearing derived layer rather than a measurement or table-only result."
        />

        {refusalWarnings.length > 0 && (
          <TypedWarningPanel
            title="Refusal"
            warnings={refusalWarnings.map((w) => ({
              title: w.title,
              message: w.message,
              tone: 'danger',
            }))}
          />
        )}

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <strong>Output layer name</strong>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter layer name..."
            style={{ width: '100%', padding: '8px', fontSize: '14px' }}
          />
        </div>
      </div>

      <div className="actions">
        <button
          className="primary"
          onClick={runIntersect}
          disabled={running || !name.trim() || !overlayId}
        >
          {running ? 'Running...' : 'Run Intersect'}
        </button>
      </div>
    </OperationDialog>
  )
}
