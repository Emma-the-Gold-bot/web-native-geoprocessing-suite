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

interface SimplifyDialogProps {
  context: OperationDialogContext
}

export function SimplifyDialog({ context }: SimplifyDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, commitArtifact } = context
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_simplified` : ''
  )
  const [tolerance, setTolerance] = useState<string>('0.001')
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

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
  ].filter((w): w is WarningRef => Boolean(w))

  const runSimplify = async () => {
    const parsedTolerance = parseFloat(tolerance)
    if (!Number.isFinite(parsedTolerance) || parsedTolerance < 0) {
      setStatusMessage('Simplify tolerance must be a non-negative number')
      addToast('Simplify tolerance must be a non-negative number', 'warning')
      return
    }

    setRunning(true)
    onClose()

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'simplify-v1',
        'Simplify operation',
        (input) => engine.simplify(input, parsedTolerance),
        () => ({ contract: 'single-input polygon/multipolygon only', tolerance: parsedTolerance, toleranceUnits: selectedArtifact.crs, attributePolicy: 'source-only', topologyPreserving: false })
      )

      if (result.error) {
        const refusal = getSingleInputOperationPresentation('simplify-v1')
        setStatusMessage(`${refusal?.refusalPrefix ?? 'Simplify refused'}: ${result.error}`)
        addToast(`${refusal?.refusalPrefix ?? 'Simplify refused'}: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        result.artifact.name = name.trim() || `${selectedArtifact.name}_simplified`
        result.historyEvent.summary = `Simplify on ${selectedArtifact.name} → ${result.artifact.name}`

        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Simplify: ${result.artifact.name}`,
          statusMessage: `Simplify created: ${result.artifact.name}. Stored CRS remains ${result.artifact.crs ?? 'unknown'}. Tolerance ${parsedTolerance} was interpreted in source CRS units, source attributes were preserved, and no topology-preservation claim is made on this v1 path.`,
          toastMessage: `Simplify created: ${result.artifact.name}. Stored CRS remains ${result.artifact.crs ?? 'unknown'}. Tolerance ${parsedTolerance} was interpreted in source CRS units, source attributes were preserved, and no topology-preservation claim is made on this v1 path.`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Simplify failed: ${message}`)
      addToast(`Simplify failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  const runDisabled = running || !name.trim() || tolerance === '' || Number.isNaN(Number(tolerance)) || Number(tolerance) < 0

  return (
    <OperationDialog title="Simplify Operation" subtitle={`Simplify ${selectedArtifact.name} with a tolerance interpreted in the source layer's stored CRS units`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label="Source layer"
          artifact={selectedArtifact}
          description="Simplify v1 uses only the selected source layer. It does not accept a secondary layer."
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
            warnings={warnings.map((w) => ({
              title: w.title,
              message: w.message,
              tone: getOperationWarningTone(w),
            }))}
          />
        </div>

        <OperationOutputSemantics
          body={presentation?.outputSemantics ?? 'Simplify v1 creates a derived polygon or multipolygon layer in the same stored CRS as the source and preserves source attributes on surviving features. The user-provided tolerance is interpreted in source CRS units. This path does not auto-transform and does not claim broader topology-preserving behavior.'}
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
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
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
          onClick={runSimplify}
          disabled={runDisabled}
        >
          {running ? 'Running...' : 'Run Simplify'}
        </button>
      </div>
    </OperationDialog>
  )
}
