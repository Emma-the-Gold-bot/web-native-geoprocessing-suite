import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import {
  executeAttributeJoinOperation,
  getJoinableFieldNames,
  getAttributeJoinPresentation,
  getAttributeJoinOutputFieldSelection,
} from '../../lib/spatial'
import { OperationDialog } from './OperationDialog'
import { getAttributeJoinDialogDefaults } from './shared-utils'
import {
  OperationSourceSummary,
  OperationContractDisplay,
  OperationOutputSemantics,
  OperationSecondarySelector,
  OperationFieldCheckboxList,
  TypedWarningPanel,
  artifactSummaryText,
  getArtifactOutputKind,
  getArtifactOutputKindLabel,
} from '../operation-ui'

interface JoinDialogProps {
  context: OperationDialogContext
}

export function JoinDialog({ context }: JoinDialogProps) {
  const { artifacts, selectedArtifact, onClose, setStatusMessage, addToast, applyOperationResult } = context

  // Compute defaults
  const defaultOtherArtifact = selectedArtifact ? artifacts.find(a => a.id !== selectedArtifact.id) ?? null : null
  const defaults = selectedArtifact ? getAttributeJoinDialogDefaults(selectedArtifact, defaultOtherArtifact) : null

  const [artifactId, setArtifactId] = useState<string>(defaults?.artifactId ?? '')
  const [sourceKey, setSourceKey] = useState<string>(defaults?.sourceKey ?? '')
  const [secondaryKey, setSecondaryKey] = useState<string>(defaults?.secondaryKey ?? '')
  const [selectedFields, setSelectedFields] = useState<string[]>(defaults?.selectedFields ?? [])
  const [name, setName] = useState<string>(defaults?.outputName ?? '')
  const [running, setRunning] = useState(false)

  const joinArtifact = artifactId ? artifacts.find(a => a.id === artifactId) ?? null : null

  if (!selectedArtifact) return null

  const presentation = getAttributeJoinPresentation()
  const joinOptions = artifacts
    .filter((artifact) => artifact.id !== selectedArtifact.id)
    .map((artifact) => ({
      id: artifact.id,
      label: `${artifact.name} — ${artifactSummaryText(artifact)} — output: ${getArtifactOutputKindLabel(getArtifactOutputKind(artifact))}`,
    }))
  const leftFields = getJoinableFieldNames(selectedArtifact)
  const rightFields = joinArtifact ? getJoinableFieldNames(joinArtifact) : []
  const selectedFieldOptions = rightFields
    .filter((field) => field !== secondaryKey)
    .map((field) => ({
      value: field,
      label: field,
      description: leftFields.includes(field) ? `Will be written as join_${field} to avoid colliding with the left layer.` : undefined,
    }))
  const warnings: WarningRef[] = []
  if (joinArtifact && selectedFields.length === 0) {
    warnings.push({
      id: `${selectedArtifact.id}-attribute-join-fields-required`,
      code: 'LIMITED_SUPPORT_ENVELOPE',
      severity: 'blocking',
      scope: 'active',
      title: 'Explicit field selection required',
      message: 'Attribute join v1 only carries right-side fields that you explicitly select below. It refuses to run until at least one non-key right-side field is selected.',
    })
  }
  if (joinArtifact && rightFields.length > 0 && !secondaryKey) {
    warnings.push({
      id: `${selectedArtifact.id}-attribute-join-right-key-required`,
      code: 'LIMITED_SUPPORT_ENVELOPE',
      severity: 'blocking',
      scope: 'active',
      title: 'Right-side join key required',
      message: 'Choose one explicit right-side join key. Attribute join v1 does not guess or infer a right-side key once the join layer is selected.',
    })
  }
  if (joinArtifact && rightFields.length > 0 && rightFields.every((field) => field === secondaryKey)) {
    warnings.push({
      id: `${selectedArtifact.id}-attribute-join-no-carry-fields`,
      code: 'LIMITED_SUPPORT_ENVELOPE',
      severity: 'blocking',
      scope: 'active',
      title: 'No carryable right-side fields remain',
      message: 'The current right layer exposes no non-key right-side fields to carry into the output on the shipped path. Pick a different right-side key or a different join layer.',
    })
  }

  const runAttributeJoin = async () => {
    if (!joinArtifact) {
      setStatusMessage('Please select a join layer.')
      addToast('Please select a join layer.', 'warning')
      return
    }

    if (!sourceKey) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one left-side join key.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one left-side join key.`, 'error')
      return
    }

    if (!secondaryKey) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one right-side join key.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: choose one right-side join key.`, 'error')
      return
    }

    const lFields = getJoinableFieldNames(selectedArtifact)
    const rFields = getJoinableFieldNames(joinArtifact)
    if (!lFields.includes(sourceKey)) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: left-side join key "${sourceKey}" does not exist.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: left-side join key "${sourceKey}" does not exist.`, 'error')
      return
    }
    if (!rFields.includes(secondaryKey)) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: right-side join key "${secondaryKey}" does not exist.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: right-side join key "${secondaryKey}" does not exist.`, 'error')
      return
    }
    if (selectedFields.length === 0) {
      setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: select at least one explicit right-side field.`)
      addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: select at least one explicit right-side field.`, 'error')
      return
    }

    setRunning(true)
    onClose()

    try {
      const selectedFieldsResolved = getAttributeJoinOutputFieldSelection({
        sourceFieldNames: lFields,
        rightFieldNames: rFields,
        selectedRightFields: selectedFields,
      })
      const result = await executeAttributeJoinOperation({
        sourceArtifact: selectedArtifact,
        secondaryArtifact: joinArtifact,
        sourceKey,
        secondaryKey,
        selectedFields: selectedFieldsResolved,
        outputName: name.trim() || `${selectedArtifact.name}_attribute_join`,
      })

      if (result.error) {
        setStatusMessage(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: ${result.error}`)
        addToast(`${presentation?.refusalPrefix ?? 'Attribute join refused'}: ${result.error}`, 'error')
        return
      }

      applyOperationResult(result, {
        statusMessage: result.artifact
          ? `Attribute join created: ${result.artifact.name}. Left output kind and geometry semantics were preserved; selected right-side fields were added with nulls for unmatched left rows and join_ prefixes on collisions.`
          : undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`Attribute join failed: ${message}`)
      addToast(`Attribute join failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  const selectedArtifactOutputKind = getArtifactOutputKind(selectedArtifact)

  return (
    <OperationDialog title="Attribute Join" subtitle={`Enrich ${selectedArtifact.name} with explicit right-side fields by exact-equality left join`} onClose={onClose}>
      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label="Left layer"
          artifact={selectedArtifact}
          description="This layer stays on the left side of the join. Its output kind and geometry semantics are preserved."
        />

        <div style={{ marginTop: 12 }}>
          <OperationSecondarySelector
            label="Join layer"
            value={artifactId}
            placeholder="Select a join layer..."
            options={joinOptions}
            onChange={(value) => {
              setArtifactId(value)
              const nextArtifact = artifacts.find((a) => a.id === value) ?? null
              const nextDefaults = getAttributeJoinDialogDefaults(selectedArtifact, nextArtifact)
              setSourceKey(nextDefaults.sourceKey)
              setSecondaryKey(nextDefaults.secondaryKey)
              setSelectedFields(nextDefaults.selectedFields)
            }}
          />
        </div>

        {joinArtifact && (
          <OperationSourceSummary
            label="Right layer"
            artifact={joinArtifact}
            description="This layer supplies lookup attributes only on the current shipped path. Its geometry is not consulted for the join predicate."
          />
        )}

        <div style={{ marginTop: 12 }}>
          <OperationContractDisplay
            title={`${presentation?.title ?? 'Attribute join'} contract`}
            geometryStatement={presentation?.contractStatement}
            crsStatement={presentation?.lineageStatement ?? 'History records both inputs, explicit key choices, and selected right-side fields.'}
          />
        </div>

        <OperationOutputSemantics
          body={presentation?.outputSemantics ?? 'The output preserves the left layer while adding explicitly selected right-side fields only.'}
          outputKind={selectedArtifactOutputKind}
          outputKindLabel={getArtifactOutputKindLabel(selectedArtifactOutputKind)}
          outputKindDescription={presentation?.outputKindDescription}
        />

        <div className="small muted" style={{ marginBottom: 12 }}>
          {presentation?.collisionStatement}
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              <strong>Left join key</strong>
            </label>
            <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '14px' }}>
              <option value="">Select a left-side key...</option>
              {leftFields.map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
            <div className="small muted" style={{ marginTop: 4 }}>
              Defaults prefer a shared field name between left and right when one exists; otherwise the dialog falls back to the most ID-like field it can find.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              <strong>Right join key</strong>
            </label>
            <select value={secondaryKey} onChange={(e) => {
              const nextKey = e.target.value
              setSecondaryKey(nextKey)
              setSelectedFields((current) => current.filter((field) => field !== nextKey))
            }} style={{ width: '100%', padding: '8px', fontSize: '14px' }}>
              <option value="">Select a right-side key...</option>
              {rightFields.map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
            <div className="small muted" style={{ marginTop: 4 }}>
              This is always explicit on the shipped path. Attribute join v1 does not use right-side geometry and does not infer alternate predicates.
            </div>
          </div>
        </div>

        <OperationFieldCheckboxList
          label="Right-side fields to carry into the output"
          options={selectedFieldOptions}
          selectedValues={selectedFields}
          onToggle={(value) => setSelectedFields((current) => current.includes(value) ? current.filter((field) => field !== value) : [...current, value])}
          emptyMessage={joinArtifact ? 'No selectable right-side fields remain after excluding the explicit right-side join key. Pick a different key or a different join layer.' : 'Select a join layer first.'}
        />

        <div className="small muted" style={{ marginTop: 6 }}>
          Required on the current shipped path: choose one right-side join key and at least one additional right-side field to carry forward. The join key itself is used only for matching and is not auto-carried into the output unless selected through a different output-safe field.
        </div>

        <TypedWarningPanel warnings={warnings.map((w) => ({ title: w.title, message: w.message, tone: 'danger' }))} />

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
          onClick={runAttributeJoin}
          disabled={running || !name.trim() || !artifactId || !sourceKey || !secondaryKey || selectedFields.length === 0}
        >
          {running ? 'Running...' : 'Run Attribute Join'}
        </button>
      </div>
    </OperationDialog>
  )
}
