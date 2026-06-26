import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import {
  getSpatialEngine,
  executeRegisteredAggregationOperation,
  getJoinableFieldNames,
  getOperationSuccessStatusMessage,
} from '../../lib/spatial'
import { OperationExecutionShell } from '../operation-ui'
import {
  getSingleInputDialogContract,
  getArtifactCrsWarning,
  toPanelWarnings,
  buildInfoWarningRef,
} from './shared-utils'
import { getDissolveGeometryWarning } from './shared-utils'

interface DissolveDialogProps {
  context: OperationDialogContext
}

export function DissolveDialog({ context }: DissolveDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, applyOperationResult, debugParams } = context
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_grouped_dissolve` : ''
  )
  const [groupingField, setGroupingField] = useState<string>(
    selectedArtifact ? getJoinableFieldNames(selectedArtifact)[0] ?? '' : ''
  )
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

  const { presentation, aggregationPresentation, geometrySupport, infoWarning } = getSingleInputDialogContract('dissolve-grouped-v1', selectedArtifact)
  const warnings = [
    getArtifactCrsWarning(selectedArtifact, 'Grouped dissolve'),
    buildInfoWarningRef(selectedArtifact, 'dissolve', infoWarning),
    getDissolveGeometryWarning(selectedArtifact),
    groupingField ? null : {
      id: `${selectedArtifact.id}-grouped-dissolve-grouping-required`,
      code: 'LIMITED_SUPPORT_ENVELOPE',
      severity: 'blocking' as const,
      scope: 'active' as const,
      title: 'Grouping field required',
      message: 'Grouped dissolve v1 requires exactly one explicit grouping field from the selected source layer.',
    },
  ].filter((w): w is WarningRef => Boolean(w))
  const groupingOptions = getJoinableFieldNames(selectedArtifact)

  const runDissolve = async () => {
    if (debugParams.logMapSync) {
      console.log('[App][grouped-dissolve] run start', {
        selectedArtifactId: selectedArtifact.id,
        selectedArtifactName: selectedArtifact.name,
        dissolveGroupingField: groupingField,
        dissolveName: name,
      })
    }

    setRunning(true)
    onClose()

    try {
      const engine = getSpatialEngine()
      const result = await executeRegisteredAggregationOperation({
        operationId: 'dissolve-grouped-v1',
        sourceArtifact: selectedArtifact,
        executeOperation: (input) => engine.dissolve(input),
        outputName: name.trim() || `${selectedArtifact.name}_grouped_dissolve`,
        groupingField,
      })

      if (result.error) {
        if (debugParams.logMapSync) {
          console.log('[App][grouped-dissolve] result error', { error: result.error })
        }
        setStatusMessage(`Grouped dissolve failed: ${result.error}`)
        addToast(`Grouped dissolve failed: ${result.error}`, 'error')
        return
      }

      if (result.artifact) {
        result.artifact.name = name.trim() || `${selectedArtifact.name}_grouped_dissolve`
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
      setRunning(false)
    }
  }

  return (
    <OperationExecutionShell
      title="Grouped Dissolve Operation"
      subtitle={`Dissolve ${selectedArtifact.name} into one derived layer with one dissolved feature per grouping value`}
      onCancel={onClose}
      sourceSummary={{
        label: 'Source layer',
        artifact: selectedArtifact,
        description: 'Grouped dissolve v1 uses one selected layer, one explicit grouping field, and returns one spatial layer containing one dissolved feature per group.',
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
        body: presentation?.outputSemantics ?? 'Grouped dissolve v1 creates one derived spatial layer that contains one polygon or multipolygon feature per distinct value of the selected grouping field. It preserves the selected grouping field only, preserves known stored CRS, and makes no broader dissolve or union claim.',
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
              value={groupingField}
              onChange={(e) => setGroupingField(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: '14px' }}
            >
              <option value="">Select one grouping field...</option>
              {groupingOptions.map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
          </div>
          Output rows, provenance, export, and DuckDB materialization stay aligned: one dissolved feature row per distinct grouping value, with only <code>{groupingField || 'the selected grouping field'}</code> preserved on the current path.
        </>
      }
      nameValue={name}
      onNameChange={setName}
      runLabel="Run Grouped Dissolve"
      runningLabel="Running..."
      running={running}
      runDisabled={running || !name.trim() || !groupingField}
      onRun={runDissolve}
    />
  )
}
