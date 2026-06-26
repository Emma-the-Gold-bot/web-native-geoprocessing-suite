import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import { getSpatialEngine, getSingleInputOperationPresentation } from '../../lib/spatial'
import { OperationDialog } from './OperationDialog'
import {
  getSingleInputDialogContract,
  getArtifactCrsWarning,
  executeGeometryOperation,
} from './shared-utils'
import {
  OperationSourceSummary,
  OperationContractDisplay,
  OperationOutputSemantics,
  TypedWarningPanel,
  getOperationWarningTone,
} from '../operation-ui'

interface EnvelopeDialogProps {
  context: OperationDialogContext
}

export function EnvelopeDialog({ context }: EnvelopeDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, commitArtifact } = context
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_envelope` : ''
  )
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

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
  ].filter((w): w is WarningRef => Boolean(w))

  const runEnvelope = async () => {
    setRunning(true)
    onClose()

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
        result.artifact.name = name.trim() || `${selectedArtifact.name}_envelope`
        result.historyEvent.summary = `Envelope on ${selectedArtifact.name} → ${result.artifact.name}`

        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Envelope: ${result.artifact.name}`,
          statusMessage: `Envelope created: ${result.artifact.name}. Stored CRS remains ${result.artifact.crs ?? 'unknown'}. Output is one axis-aligned bounding box polygon with no source attributes carried forward.`,
          toastMessage: `Envelope created: ${result.artifact.name}. Stored CRS remains ${result.artifact.crs ?? 'unknown'}. Output is one axis-aligned bounding box polygon with no source attributes carried forward.`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Envelope failed: ${message}`)
      addToast(`Envelope failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationDialog title="Envelope Operation" subtitle={`Create one derived bounding box around the full extent of ${selectedArtifact.name} on the narrow envelope v1 path`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label="Source layer"
          artifact={selectedArtifact}
          description="Envelope v1 uses only the selected source layer. It does not accept a secondary layer."
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
            warnings={warnings.map((w) => ({
              title: w.title,
              message: w.message,
              tone: getOperationWarningTone(w),
            }))}
          />
        </div>

        <OperationOutputSemantics
          body={presentation?.outputSemantics ?? 'Envelope v1 creates one derived polygon layer representing the source layer\'s axis-aligned bounding box in the same stored CRS as the source. It intentionally does not preserve per-feature source attributes and makes no broader claim about minimum rotated rectangles, transform-aware execution, or non-polygon inputs.'}
          outputKind={presentation?.outputKind}
          outputKindLabel={presentation?.outputKindLabel}
          outputKindDescription={presentation?.outputKindDescription}
        />

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
          onClick={runEnvelope}
          disabled={running || !name.trim()}
        >
          {running ? 'Running...' : 'Run Envelope'}
        </button>
      </div>
    </OperationDialog>
  )
}
