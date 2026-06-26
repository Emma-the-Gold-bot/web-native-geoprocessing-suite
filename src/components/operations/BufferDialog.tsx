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

interface BufferDialogProps {
  context: OperationDialogContext
}

export function BufferDialog({ context }: BufferDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, commitArtifact } = context
  const [distance, setDistance] = useState<string>('1')
  const [distanceUnit, setDistanceUnit] = useState<'kilometers' | 'miles'>('kilometers')
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_buffer` : ''
  )
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

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
  ].filter((w): w is WarningRef => Boolean(w))

  const runBuffer = async () => {
    const parsedDistance = parseFloat(distance)
    if (isNaN(parsedDistance) || parsedDistance <= 0) {
      setStatusMessage('Buffer distance must be a positive number')
      addToast('Buffer distance must be a positive number', 'warning')
      return
    }

    setRunning(true)
    onClose()

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'buffer',
        'Buffer operation',
        (input) => engine.buffer(input, parsedDistance, distanceUnit),
        () => ({ distance: parsedDistance, unit: distanceUnit })
      )

      if (result.error) {
        setStatusMessage(`Buffer failed: ${result.error}`)
        addToast(`Buffer failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        result.artifact.name = name.trim() || `${selectedArtifact.name}_buffer`
        result.historyEvent.summary = `Buffer ${parsedDistance} ${distanceUnit} on ${selectedArtifact.name} → ${result.artifact.name}`
        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Buffer: ${result.artifact.name}`,
          statusMessage: `Buffer created: ${result.artifact.name}`,
          toastMessage: `Buffer created: ${result.artifact.name}`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Buffer failed: ${message}`)
      addToast(`Buffer failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationDialog title="Buffer Operation" subtitle={`Create a buffer around ${selectedArtifact.name} on the current validated support path`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label="Source layer"
          artifact={selectedArtifact}
          description="This layer is the only input on the current buffer path."
        />

        <div style={{ marginTop: 12 }}>
          <TypedWarningPanel
            title="Warnings"
            warnings={warnings.map((w) => ({
              title: w.title,
              message: w.message,
              tone: getOperationWarningTone(w),
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
          body={presentation?.outputSemantics ?? 'Buffer creates a derived layer around the source geometry. On the current shipped path it does not broaden claims beyond the validated local runtime, and distance behavior remains approximation-sensitive.'}
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
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="Enter distance..."
              min="0"
              step="0.1"
              style={{ flex: 1, padding: '8px', fontSize: '14px' }}
            />
            <select
              value={distanceUnit}
              onChange={(e) => setDistanceUnit(e.target.value as 'kilometers' | 'miles')}
              style={{ padding: '8px', fontSize: '14px' }}
            >
              <option value="kilometers">Kilometers</option>
              <option value="miles">Miles</option>
            </select>
          </div>
        </div>

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
          onClick={runBuffer}
          disabled={running || !distance || parseFloat(distance) <= 0}
        >
          {running ? 'Running...' : 'Run Buffer'}
        </button>
      </div>
    </OperationDialog>
  )
}
