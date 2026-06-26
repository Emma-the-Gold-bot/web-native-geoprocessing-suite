import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import {
  getSpatialEngine,
  executeClipOperation,
  getTopologyRoleContext,
  validateForClip,
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

interface ClipDialogProps {
  context: OperationDialogContext
}

export function ClipDialog({ context }: ClipDialogProps) {
  const { artifacts, selectedArtifact, selectedArtifactId, onClose, setStatusMessage, addToast, commitArtifact } = context
  const selectableSecondaryArtifacts = artifacts.filter((a) => a.id !== selectedArtifactId && a.spatial)
  const [maskArtifactId, setMaskArtifactId] = useState<string>(
    selectableSecondaryArtifacts[0]?.id ?? ''
  )
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_clipped` : ''
  )
  const [running, setRunning] = useState(false)

  const maskArtifact = maskArtifactId ? artifacts.find(a => a.id === maskArtifactId) ?? null : null

  if (!selectedArtifact) return null

  const clipRoleContext = getTopologyRoleContext('clip-v1')
  const clipOptions = selectableSecondaryArtifacts.map((artifact) => ({
    id: artifact.id,
    label: `${artifact.name} — ${artifactSummaryText(artifact)} — CRS: ${artifact.crs ?? 'unknown'}`,
  }))
  const sourceCrs = selectedArtifact.crs
  const maskCrs = maskArtifact?.crs
  const crsMatch = Boolean(sourceCrs && maskCrs && sourceCrs !== 'unknown' && maskCrs !== 'unknown' && sourceCrs === maskCrs)
  const sourceGeom = selectedArtifact.geometryType
  const maskGeom = maskArtifact?.geometryType
  const sourceAllowed = sourceGeom === 'Polygon' || sourceGeom === 'MultiPolygon'
  const secondaryAllowed = maskGeom === 'Polygon' || maskGeom === 'MultiPolygon'
  const refusalWarnings: WarningRef[] = []
  if (maskArtifact) {
    const validation = validateForClip(selectedArtifact, maskArtifact)
    refusalWarnings.push(...validation.errors.map((error, index) => ({
      id: `clip-refusal-${index}`,
      code: error.code,
      severity: 'blocking' as const,
      scope: 'active' as const,
      title: 'Clip refusal',
      message: error.message,
    })))
  }

  const runClip = async () => {
    if (!maskArtifact) {
      setStatusMessage(clipRoleContext.secondarySelectionPrompt)
      addToast(clipRoleContext.secondarySelectionPrompt, 'warning')
      return
    }

    const validation = validateForClip(selectedArtifact, maskArtifact)
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join('; ')
      setStatusMessage(`Clip refused: ${errorMessages}`)
      addToast(`Clip refused: ${errorMessages}`, 'error')
      return
    }

    setRunning(true)
    onClose()

    try {
      const engine = getSpatialEngine()
      const result = await executeClipOperation({
        sourceArtifact: selectedArtifact,
        maskArtifact,
        outputName: name.trim() || `${selectedArtifact.name}_clipped`,
        executeClip: (sourceInput, maskInput) => engine.clip(sourceInput, maskInput),
      })

      if (result.error) {
        setStatusMessage(`Clip failed: ${result.error}`)
        addToast(`Clip failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        const emptyMsg = `Stored CRS remains ${result.artifact.crs ?? 'unknown'}. No overlap was found, so the result layer is intentionally empty.`
        const successMsg = `Stored CRS remains ${result.artifact.crs ?? 'unknown'}.`
        const isEmpty = result.artifact.rowCount === 0

        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Clip: ${result.artifact.name}`,
          statusMessage: isEmpty ? `Clip created: ${result.artifact.name}. ${emptyMsg}` : `Clip created: ${result.artifact.name}. ${successMsg}`,
          toastMessage: isEmpty ? `Clip created: ${result.artifact.name}. ${emptyMsg}` : `Clip created: ${result.artifact.name}. ${successMsg}`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Clip failed: ${message}`)
      addToast(`Clip failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationDialog title="Clip Operation" subtitle={`Create a derived layer by clipping ${selectedArtifact.name} with a polygon mask`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label={`Source layer (${clipRoleContext.sourceLabel})`}
          artifact={selectedArtifact}
          description="This is the layer being clipped."
        />

        <div style={{ marginTop: 12 }}>
          <OperationSecondarySelector
            label="Clip mask layer"
            value={maskArtifactId}
            placeholder="Select a clip mask layer..."
            options={clipOptions}
            onChange={setMaskArtifactId}
          />
        </div>

        {maskArtifact && (
          <OperationSourceSummary
            label={`Secondary layer (${clipRoleContext.secondaryLabel})`}
            artifact={maskArtifact}
            description="The mask constrains what survives from the source layer."
          />
        )}

        <div style={{ marginTop: 12 }}>
          <OperationContractDisplay
            title="Clip v1 contract"
            geometryStatement="Clip v1 supports only Polygon or MultiPolygon geometries for both source and mask."
            crsStatement="Both layers must have known matching stored CRS. No auto-transform path is claimed here."
            crsMatch={maskArtifact ? {
              label: 'Source stored CRS',
              sourceCrs,
              secondaryCrs: maskCrs,
              matches: crsMatch,
              mismatchMessage: 'Clip v1 requires matching known stored CRS',
            } : undefined}
            geometrySupport={maskArtifact ? {
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
          body="Clip creates a derived layer in the same stored CRS as the validated inputs. No-overlap cases become honest empty results instead of failures."
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
          onClick={runClip}
          disabled={running || !name.trim() || !maskArtifactId}
        >
          {running ? 'Running...' : 'Run Clip'}
        </button>
      </div>
    </OperationDialog>
  )
}
