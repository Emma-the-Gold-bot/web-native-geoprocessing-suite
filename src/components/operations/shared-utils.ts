import type { Artifact, WarningRef } from '../../types'
import type { GeometryOperationInput, GeometryOperationResult } from '../../lib/spatial'
import {
  getSingleInputOperationPresentation,
  getAggregationOperationPresentation,
  getMeasurementOperationPresentation,
  getSingleInputGeometrySupport,
  getSingleInputOperationInfoWarning,
  getMeasurementUnitDisclosure,
  getMeasurementUnitRefusalWarning,
  executeRegisteredSingleInputOperation,
  getJoinableFieldNames,
} from '../../lib/spatial'
import { getOperationWarningTone } from '../operation-ui'
import type { OperationExecutionResult } from './types'

/**
 * Shared helper functions used by multiple operation dialog components.
 * These are the same functions previously defined inline in App.tsx.
 */

export function getArtifactCrsWarning(artifact: Artifact, operationNoun: string): WarningRef | null {
  if (!artifact.crs || artifact.crs === 'unknown') {
    return {
      id: `${artifact.id}-${operationNoun}-crs-warning`,
      code: artifact.crs ? 'CRS_UNKNOWN' : 'CRS_MISSING',
      severity: 'caution',
      scope: 'active',
      title: 'Stored CRS is not verified',
      message: `${artifact.name} does not currently verify its stored CRS. ${operationNoun} results should be treated cautiously unless the coordinates are known and the contract allows this path.`,
    }
  }
  return null
}

export function getDissolveGeometryWarning(artifact: Artifact): WarningRef | null {
  const geometrySupport = getSingleInputGeometrySupport('dissolve-grouped-v1', artifact)
  if (!geometrySupport || geometrySupport.sourceAllowed || !artifact.geometryType) return null

  return {
    id: `${artifact.id}-dissolve-geometry-warning`,
    code: 'UNSUPPORTED_GEOMETRY',
    severity: 'caution',
    scope: 'active',
    title: 'Non-standard geometry type',
    message: geometrySupport.unsupportedMessage,
  }
}

export function toPanelWarnings(warnings: WarningRef[]) {
  return warnings.map((warning) => ({
    title: warning.title,
    message: warning.message,
    tone: getOperationWarningTone(warning),
  }))
}

export function buildInfoWarningRef(
  artifact: Artifact,
  suffix: string,
  infoWarning: ReturnType<typeof getSingleInputOperationInfoWarning>,
): WarningRef | null {
  if (!infoWarning) return null
  return {
    id: `${artifact.id}-${suffix}-info`,
    code: 'LIMITED_SUPPORT_ENVELOPE',
    severity: infoWarning.severity,
    scope: 'active',
    title: infoWarning.title,
    message: infoWarning.message,
  }
}

export type DialogContractOperationId =
  | 'buffer'
  | 'centroid'
  | 'convex-hull-v1'
  | 'envelope-v1'
  | 'simplify-v1'
  | 'dissolve-grouped-v1'
  | 'reproject'
  | 'area-v1'
  | 'perimeter-v1'
  | 'compactness-v1'

export function getSingleInputDialogContract(operationId: DialogContractOperationId, artifact: Artifact) {
  const presentation = getSingleInputOperationPresentation(operationId)
  const aggregationPresentation = operationId === 'dissolve-grouped-v1'
    ? getAggregationOperationPresentation(operationId)
    : null
  const measurementPresentation =
    operationId === 'area-v1' || operationId === 'perimeter-v1' || operationId === 'compactness-v1'
      ? getMeasurementOperationPresentation(operationId)
      : null
  const geometrySupport = getSingleInputGeometrySupport(operationId, artifact)
  const infoWarning = getSingleInputOperationInfoWarning(operationId)
  const measurementUnitDisclosure =
    operationId === 'area-v1' || operationId === 'perimeter-v1' || operationId === 'compactness-v1'
      ? getMeasurementUnitDisclosure(operationId)
      : null
  const measurementUnitWarning =
    operationId === 'area-v1' || operationId === 'perimeter-v1' || operationId === 'compactness-v1'
      ? getMeasurementUnitRefusalWarning(operationId, artifact)
      : null
  return { presentation, aggregationPresentation, measurementPresentation, geometrySupport, infoWarning, measurementUnitDisclosure, measurementUnitWarning }
}

/**
 * Attribute join helper functions - moved from App.tsx module-level definitions.
 */

function getAttributeJoinKeyPriority(field: string): number {
  const normalized = field.trim().toLowerCase()
  if (!normalized) return 0
  if (normalized === 'id') return 100
  if (normalized === 'join_id') return 95
  if (normalized.endsWith('_id')) return 90
  if (normalized.includes('id')) return 70
  if (normalized === 'name') return 50
  if (normalized.endsWith('_name')) return 45
  if (normalized.includes('name')) return 35
  if (normalized === 'category' || normalized.endsWith('_code') || normalized.endsWith('_key')) return 30
  if (normalized === '_featureindex') return -100
  return 10
}

function getPreferredAttributeJoinKeys(leftFields: string[], rightFields: string[]): { sourceKey: string; secondaryKey: string } {
  const rightFieldSet = new Set(rightFields)
  const sharedFields = leftFields.filter((field) => rightFieldSet.has(field))
  const rankedSharedFields = [...sharedFields].sort((a, b) => {
    const scoreDiff = getAttributeJoinKeyPriority(b) - getAttributeJoinKeyPriority(a)
    return scoreDiff !== 0 ? scoreDiff : a.localeCompare(b)
  })
  const preferredSharedField = rankedSharedFields[0]
  if (preferredSharedField) {
    return {
      sourceKey: preferredSharedField,
      secondaryKey: preferredSharedField,
    }
  }

  const rankedLeftFields = [...leftFields].sort((a, b) => {
    const scoreDiff = getAttributeJoinKeyPriority(b) - getAttributeJoinKeyPriority(a)
    return scoreDiff !== 0 ? scoreDiff : a.localeCompare(b)
  })
  const rankedRightFields = [...rightFields].sort((a, b) => {
    const scoreDiff = getAttributeJoinKeyPriority(b) - getAttributeJoinKeyPriority(a)
    return scoreDiff !== 0 ? scoreDiff : a.localeCompare(b)
  })

  return {
    sourceKey: rankedLeftFields[0] ?? '',
    secondaryKey: rankedRightFields[0] ?? '',
  }
}

function getDefaultAttributeJoinSelectedFields(leftFields: string[], rightFields: string[], secondaryKey: string): string[] {
  const selectableFields = rightFields.filter((field) => field !== secondaryKey)
  const collisionFree = selectableFields.filter((field) => !leftFields.includes(field))
  if (collisionFree[0]) return [collisionFree[0]]
  if (selectableFields[0]) return [selectableFields[0]]
  return []
}

export function getAttributeJoinDialogDefaults(
  selectedArtifact: Artifact,
  candidateArtifact: Artifact | null,
): {
  artifactId: string
  sourceKey: string
  secondaryKey: string
  selectedFields: string[]
  outputName: string
} {
  const leftFields = getJoinableFieldNames(selectedArtifact)
  const rightFields = candidateArtifact ? getJoinableFieldNames(candidateArtifact) : []
  const preferredKeys = getPreferredAttributeJoinKeys(leftFields, rightFields)
  return {
    artifactId: candidateArtifact?.id ?? '',
    sourceKey: preferredKeys.sourceKey,
    secondaryKey: preferredKeys.secondaryKey,
    selectedFields: getDefaultAttributeJoinSelectedFields(leftFields, rightFields, preferredKeys.secondaryKey),
    outputName: `${selectedArtifact.name}_attribute_join`,
  }
}

/**
 * Wrapper that delegates to executeRegisteredSingleInputOperation.
 * Preserves the interface used by buffer, centroid, convex hull, envelope, simplify, reproject dialogs.
 */
export async function executeGeometryOperation(
  sourceArtifact: Artifact,
  operationName: string,
  _operationFormat: string,
  executeOperation: (input: GeometryOperationInput) => Promise<GeometryOperationResult>,
  getDetails: (sourceArtifact: Artifact) => Record<string, unknown>,
): Promise<OperationExecutionResult> {
  return executeRegisteredSingleInputOperation({
    operationId: operationName === 'dissolve' ? 'dissolve-global' : operationName,
    sourceArtifact,
    executeOperation,
    getDetails,
  })
}
