import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import {
  getSpatialEngine,
  validateForReproject,
} from '../../lib/spatial'
import { OperationDialog } from './OperationDialog'
import {
  getSingleInputDialogContract,
  executeGeometryOperation,
} from './shared-utils'
import {
  OperationSourceSummary,
  OperationContractDisplay,
  OperationOutputSemantics,
  TypedWarningPanel,
  getOperationWarningTone,
} from '../operation-ui'

interface ReprojectDialogProps {
  context: OperationDialogContext
}

export function ReprojectDialog({ context }: ReprojectDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, commitArtifact } = context
  const [sourceCrs, setSourceCrs] = useState<string>(
    selectedArtifact && selectedArtifact.crs && selectedArtifact.crs !== 'unknown'
      ? selectedArtifact.crs
      : 'EPSG:4326'
  )
  const [targetCrs, setTargetCrs] = useState<string>('EPSG:4326')
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_reprojected` : ''
  )
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

  const { presentation } = getSingleInputDialogContract('reproject', selectedArtifact)
  const warnings: WarningRef[] = []
  if (!selectedArtifact.crs || selectedArtifact.crs === 'unknown') {
    warnings.push({
      id: `${selectedArtifact.id}-reproject-source-warning`,
      code: selectedArtifact.crs ? 'CRS_UNKNOWN' : 'CRS_MISSING',
      severity: 'caution',
      scope: 'active',
      title: 'Stored CRS is not verified',
      message: 'This layer does not currently verify its stored CRS. Reprojection will use the source CRS you choose below; results will be wrong if that choice is false.',
    })
  }
  if (selectedArtifact.crs && selectedArtifact.crs !== 'unknown' && selectedArtifact.crs !== sourceCrs) {
    warnings.push({
      id: `${selectedArtifact.id}-reproject-override-warning`,
      code: 'CRS_MISMATCH',
      severity: 'caution',
      scope: 'active',
      title: 'Source CRS override differs from stored CRS',
      message: `Stored CRS is ${selectedArtifact.crs}, but this operation is being forced to start from ${sourceCrs}. Proceed only if the stored metadata is wrong and the coordinates are actually in ${sourceCrs}.`,
    })
  }

  const runReproject = async () => {
    if (!sourceCrs || !targetCrs) {
      setStatusMessage('Please select both source and target CRS')
      addToast('Please select both source and target CRS', 'warning')
      return
    }

    if (sourceCrs === targetCrs) {
      setStatusMessage('Source and target CRS are the same. No coordinate transformation is needed; use Assign CRS when metadata-only assignment lands.')
      addToast('Source and target CRS are the same. No coordinate transformation is needed; use Assign CRS when metadata-only assignment lands.', 'warning')
      return
    }

    const validation = validateForReproject(selectedArtifact, sourceCrs)
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join('; ')
      setStatusMessage(`Reproject refused: ${errorMessages}`)
      addToast(`Reproject refused: ${errorMessages}`, 'error')
      return
    }

    setRunning(true)
    onClose()

    try {
      const engine = getSpatialEngine()
      const result = await executeGeometryOperation(
        selectedArtifact,
        'reproject',
        'CRS reprojection',
        (input) => engine.transform(input, sourceCrs, targetCrs),
        () => ({ sourceCrs, targetCrs })
      )

      if (result.error) {
        setStatusMessage(`Reproject failed: ${result.error}`)
        addToast(`Reproject failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact && result.historyEvent) {
        result.artifact.name = name.trim() || `${selectedArtifact.name}_reprojected`
        result.artifact.crs = targetCrs
        result.artifact.crsProvenance = {
          confidence: 'known',
          declaredCrs: targetCrs,
          source: 'operation-derived',
          warnings: [],
        }
        result.historyEvent.summary = `Reproject ${selectedArtifact.name} from ${sourceCrs} to ${targetCrs} → ${result.artifact.name}`

        commitArtifact({
          artifact: result.artifact,
          historyEvent: result.historyEvent,
          snapshotLabel: `Reproject: ${result.artifact.name}`,
          statusMessage: `Reprojected: ${result.artifact.name} (${sourceCrs} → ${targetCrs})`,
          toastMessage: `Reprojected: ${result.artifact.name} (${sourceCrs} → ${targetCrs})`,
          toastType: 'success',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Reproject failed: ${message}`)
      addToast(`Reproject failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationDialog title="Reproject / Transform" subtitle={`Transform coordinates of ${selectedArtifact.name} from one CRS to another`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label="Source layer"
          artifact={selectedArtifact}
          description="Reproject performs an explicit coordinate transformation, not a metadata relabel."
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
          title={`${presentation?.title ?? 'Reproject'} contract`}
          geometryStatement={presentation?.geometryStatement}
          crsStatement={presentation?.crsStatement ?? 'Reproject requires a real source CRS choice and writes the chosen target CRS onto the derived layer. Display normalization to WGS84 remains display-only and does not mutate stored CRS.'}
        />

        <OperationOutputSemantics
          body={presentation?.outputSemantics ?? 'This operation creates a new derived layer with transformed coordinates in the chosen target CRS. Metadata-only CRS assignment remains a separate future feature.'}
          outputKind={presentation?.outputKind}
          outputKindLabel={presentation?.outputKindLabel}
          outputKindDescription={presentation?.outputKindDescription}
        />

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <strong>Source CRS</strong> (current coordinate system)
          </label>
          <select
            value={sourceCrs}
            onChange={(e) => setSourceCrs(e.target.value)}
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
            value={targetCrs}
            onChange={(e) => setTargetCrs(e.target.value)}
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
          onClick={runReproject}
          disabled={running || !name.trim() || !sourceCrs || !targetCrs}
        >
          {running ? 'Transforming...' : 'Reproject'}
        </button>
      </div>
    </OperationDialog>
  )
}
