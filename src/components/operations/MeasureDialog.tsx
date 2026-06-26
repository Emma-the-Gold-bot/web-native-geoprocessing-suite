import { useState } from 'react'
import type { OperationDialogContext } from './types'
import type { WarningRef } from '../../types'
import {
  executeRegisteredMeasurementOperation,
  getMeasurementOperationPresentation,
  getOperationSuccessStatusMessage,
} from '../../lib/spatial'
import { OperationExecutionShell } from '../operation-ui'
import {
  getSingleInputDialogContract,
  getArtifactCrsWarning,
  toPanelWarnings,
  buildInfoWarningRef,
} from './shared-utils'

type MeasureOperationId = 'area-v1' | 'perimeter-v1' | 'compactness-v1'

interface MeasureDialogProps {
  operationId: MeasureOperationId
  title: string
  subtitle: string
  context: OperationDialogContext
}

export function MeasureDialog({ operationId, title, subtitle, context }: MeasureDialogProps) {
  const { selectedArtifact, onClose, setStatusMessage, addToast, applyOperationResult } = context
  const [name, setName] = useState<string>(
    selectedArtifact ? `${selectedArtifact.name}_${operationId.replace('-v1', '')}` : ''
  )
  const [running, setRunning] = useState(false)

  if (!selectedArtifact) return null

  const { presentation, measurementPresentation, geometrySupport, infoWarning, measurementUnitDisclosure, measurementUnitWarning } =
    getSingleInputDialogContract(operationId, selectedArtifact)

  const operationNoun = operationId === 'area-v1' ? 'Area' : operationId === 'perimeter-v1' ? 'Perimeter' : 'Compactness'

  const warnings = [
    getArtifactCrsWarning(selectedArtifact, operationNoun),
    buildInfoWarningRef(selectedArtifact, operationId.replace('-v1', ''), infoWarning),
    measurementUnitWarning,
  ].filter((w): w is WarningRef => Boolean(w))

  const runMeasurement = async () => {
    setRunning(true)
    onClose()

    try {
      const result = await executeRegisteredMeasurementOperation({
        operationId,
        sourceArtifact: selectedArtifact,
        outputName: name.trim() || `${selectedArtifact.name}_${operationId.replace('-v1', '')}`,
      })

      if (result.error) {
        const measPresentation = getMeasurementOperationPresentation(operationId)
        setStatusMessage(`${measPresentation?.refusalPrefix ?? 'Measurement refused'}: ${result.error}`)
        addToast(`${measPresentation?.refusalPrefix ?? 'Measurement refused'}: ${result.error}`, 'error')
        return
      }

      applyOperationResult(result, {
        bottomTab: 'table',
        statusMessage: result.artifact
          ? getOperationSuccessStatusMessage(operationId, result.artifact, selectedArtifact) ?? `${presentation?.title ?? 'Measurement'} created: ${result.artifact.name}.`
          : undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`${title} failed: ${message}`)
      addToast(`${title} failed: ${message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <OperationExecutionShell
      title={title}
      subtitle={subtitle}
      onCancel={onClose}
      sourceSummary={{
        label: 'Source layer',
        artifact: selectedArtifact,
        description: operationId === 'area-v1'
          ? 'Area v1 uses only the selected source layer. It returns a measurement table rather than a geometry layer.'
          : operationId === 'perimeter-v1'
            ? 'Perimeter v1 uses only the selected source layer. It returns a measurement table rather than a geometry layer.'
            : 'Compactness v1 uses only the selected source layer. It returns a measurement table rather than a geometry layer.',
        extraText: `Stored CRS: ${selectedArtifact.crs ?? 'unknown'}`,
      }}
      contract={{
        title: `${presentation?.title ?? operationNoun} contract`,
        geometryStatement: presentation?.geometryStatement,
        crsStatement: measurementPresentation?.unitSemanticsStatement ?? presentation?.crsStatement
          ?? `${operationNoun} requires known stored CRS and refuses misleading unit semantics.`,
        geometrySupport: geometrySupport ? {
          ...geometrySupport,
          secondaryGeometry: undefined,
        } : undefined,
      }}
      warnings={toPanelWarnings(warnings)}
      output={{
        body: presentation?.outputSemantics
          ?? (operationId === 'area-v1'
            ? 'Area v1 creates a measurement table with one row per input feature, a numeric area value, and an explicit area unit. It does not create or pretend to create a new geometry layer.'
            : operationId === 'perimeter-v1'
              ? 'Perimeter v1 creates a measurement table with one row per input feature, a numeric perimeter value, and an explicit perimeter unit. It does not create or pretend to create a new geometry layer.'
              : 'Compactness v1 creates a measurement table with one row per input feature, a numeric compactness value, and an explicit unit marker. It does not create or pretend to create a new geometry layer.'),
        outputKind: presentation?.outputKind,
        outputKindLabel: presentation?.outputKindLabel,
        outputKindDescription: presentation?.outputKindDescription,
      }}
      disclosure={
        <>
          Output fields include <code>{measurementUnitDisclosure?.valueField ?? (operationId === 'area-v1' ? 'area_value' : operationId === 'perimeter-v1' ? 'perimeter_value' : 'compactness_value')}</code> and <code>{measurementUnitDisclosure?.unitField ?? (operationId === 'area-v1' ? 'area_unit' : operationId === 'perimeter-v1' ? 'perimeter_unit' : 'compactness_unit')}</code>.{' '}
          {measurementUnitDisclosure?.note
            ?? (operationId === 'area-v1'
              ? 'The current shipped path only emits square_meters when stored CRS unit semantics are trustworthy.'
              : operationId === 'perimeter-v1'
                ? 'The current shipped path only emits meters when stored CRS unit semantics are trustworthy.'
                : 'The current shipped path only emits unitless when stored CRS unit semantics are trustworthy for the underlying planar area and perimeter math.')}
        </>
      }
      nameValue={name}
      onNameChange={setName}
      runLabel={operationId === 'area-v1' ? 'Run Area' : operationId === 'perimeter-v1' ? 'Run Perimeter' : 'Run Compactness'}
      runningLabel="Running..."
      running={running}
      runDisabled={running || !name.trim()}
      onRun={runMeasurement}
    />
  )
}
