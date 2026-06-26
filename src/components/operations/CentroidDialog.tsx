import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import { getSpatialEngine } from '../../lib/spatial'
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

interface CentroidDialogProps {
  context: OperationDialogContext
}

export function CentroidDialog({ context }: CentroidDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, commitArtifact } = context
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_centroid` : ''
  )
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

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
  ].filter((w): w is WarningRef => Boolean(w))

  const runCentroid = async () => {
    setRunning(true)
    onClose()

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
        result.artifact.name = name.trim() || `${selectedArtifact.name}_centroid`
        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Centroid: ${result.artifact.name}`,
          statusMessage: `Centroid created: ${result.artifact.name}`,
          toastMessage: `Centroid created: ${result.artifact.name}`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Centroid failed: ${message}`)
      addToast(`Centroid failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationDialog title="Centroid Operation" subtitle={`Calculate the centroid of ${selectedArtifact.name} on the current validated support path`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label="Source layer"
          artifact={selectedArtifact}
          description="Centroid runs against the selected source layer only on the current path."
        />

        <div style={{ marginTop: 12 }}>
          <TypedWarningPanel
            warnings={warnings.map((w) => ({
              title: w.title,
              message: w.message,
              tone: getOperationWarningTone(w),
            }))}
          />
        </div>

        <OperationContractDisplay
          title={`${presentation?.title ?? 'Centroid'} contract`}
          geometryStatement={presentation?.geometryStatement}
          crsStatement={presentation?.crsStatement ?? 'Centroid does not require known stored CRS to run on the current path, but unknown or missing CRS still reduces trust in the result.'}
        />

        <OperationOutputSemantics
          body={presentation?.outputSemantics ?? 'Centroid returns a derived point layer. It stays on the current validated engine seam and does not imply broader support than the current product contract.'}
          outputKind={presentation?.outputKind}
          outputKindLabel={presentation?.outputKindLabel}
          outputKindDescription={presentation?.outputKindDescription}
        />

        <div>
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
          onClick={runCentroid}
          disabled={running || !name.trim()}
        >
          {running ? 'Running...' : 'Calculate Centroid'}
        </button>
      </div>
    </OperationDialog>
  )
}
