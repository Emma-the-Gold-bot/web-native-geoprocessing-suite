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

interface ConvexHullDialogProps {
  context: OperationDialogContext
}

export function ConvexHullDialog({ context }: ConvexHullDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, commitArtifact } = context
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_convex_hull` : ''
  )
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

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
  ].filter((w): w is WarningRef => Boolean(w))

  const runConvexHull = async () => {
    setRunning(true)
    onClose()

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
        result.artifact.name = name.trim() || `${selectedArtifact.name}_convex_hull`
        result.historyEvent.summary = `Convex hull on ${selectedArtifact.name} → ${result.artifact.name}`

        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Convex hull: ${result.artifact.name}`,
          statusMessage: `Convex hull created: ${result.artifact.name}. Stored CRS remains ${result.artifact.crs ?? 'unknown'}. Output is a single derived hull with no source attributes carried forward.`,
          toastMessage: `Convex hull created: ${result.artifact.name}. Stored CRS remains ${result.artifact.crs ?? 'unknown'}. Output is a single derived hull with no source attributes carried forward.`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Convex hull failed: ${message}`)
      addToast(`Convex hull failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationDialog title="Convex Hull Operation" subtitle={`Create one derived hull around the full extent of ${selectedArtifact.name} on the narrow convex hull v1 path`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label="Source layer"
          artifact={selectedArtifact}
          description="Convex hull v1 uses only the selected source layer. It does not accept a secondary layer."
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
            warnings={warnings.map((w) => ({
              title: w.title,
              message: w.message,
              tone: getOperationWarningTone(w),
            }))}
          />
        </div>

        <OperationOutputSemantics
          body={presentation?.outputSemantics ?? 'Convex hull v1 creates one derived polygon hull layer in the same stored CRS as the source. It intentionally does not preserve per-feature source attributes and makes no broader claim about lines, points, mixed geometry, or transform-aware execution.'}
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
          onClick={runConvexHull}
          disabled={running || !name.trim()}
        >
          {running ? 'Running...' : 'Run Convex Hull'}
        </button>
      </div>
    </OperationDialog>
  )
}
