import type { Artifact } from '../../types';
import { createWarningFromCode, type WarningCode } from '../spatial/warning-codes';
import { validateOperationCrsPolicy } from './crs-policy';
import { getOperationDefinition } from './registry';

export interface TwoInputTopologyOperationDefinition {
  operationId: 'clip-v1' | 'intersect-v1' | 'attribute-join-v1';
  secondarySelectionCode: WarningCode;
  summaryVerb: string;
}

export interface TopologyRoleContext {
  sourceLabel: string;
  secondaryLabel: string;
  secondarySelectionPrompt: string;
}

export interface TopologyValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: ReturnType<typeof createWarningFromCode>[];
}

const TOPOLOGY_OPERATIONS: Record<TwoInputTopologyOperationDefinition['operationId'], TwoInputTopologyOperationDefinition> = {
  'clip-v1': {
    operationId: 'clip-v1',
    secondarySelectionCode: 'CLIP_MASK_REQUIRED',
    summaryVerb: 'by',
  },
  'intersect-v1': {
    operationId: 'intersect-v1',
    secondarySelectionCode: 'OVERLAY_ARTIFACT_REQUIRED',
    summaryVerb: 'with',
  },
  'attribute-join-v1': {
    operationId: 'attribute-join-v1',
    secondarySelectionCode: 'OVERLAY_ARTIFACT_REQUIRED',
    summaryVerb: 'with',
  },
};

export function getTopologyFamilyDefinition(operationId: TwoInputTopologyOperationDefinition['operationId']) {
  return TOPOLOGY_OPERATIONS[operationId];
}

function getTopologyDefinition(operationId: TwoInputTopologyOperationDefinition['operationId']) {
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.family !== 'topology-two-input') {
    throw new Error(`Missing topology operation definition for ${operationId}`);
  }
  return definition;
}

export function getTopologyRoleContext(
  operationId: TwoInputTopologyOperationDefinition['operationId'],
): TopologyRoleContext {
  const definition = getTopologyDefinition(operationId);
  const secondaryRoleLabel = definition.uiHints?.secondaryRoleLabel ?? 'secondary';
  return {
    sourceLabel: 'source',
    secondaryLabel: secondaryRoleLabel,
    secondarySelectionPrompt:
      secondaryRoleLabel === 'mask'
        ? 'Please select a clip mask artifact'
        : secondaryRoleLabel === 'overlay'
          ? 'Please select an overlay artifact'
          : `Please select a ${secondaryRoleLabel} artifact`,
  };
}

function getUnsupportedGeometryMessage(operationLabel: string, roleLabel: string, geometryType: string): string {
  return `${roleLabel} geometry type "${geometryType}" is not supported for ${operationLabel.toLowerCase()}. ${operationLabel} v1 supports only Polygon and MultiPolygon.`;
}

export function validateTopologyOperation(
  operationId: TwoInputTopologyOperationDefinition['operationId'],
  sourceArtifact: Artifact,
  secondaryArtifact: Artifact,
): TopologyValidationResult {
  const definition = getTopologyDefinition(operationId);
  const roleContext = getTopologyRoleContext(operationId);
  const errors: Array<{ code: string; message: string }> = [];
  const warnings: ReturnType<typeof createWarningFromCode>[] = [];

  if (!sourceArtifact.spatial) {
    errors.push({
      code: 'UNSUPPORTED_GEOMETRY',
      message: `Source artifact "${sourceArtifact.name}" is not spatial. ${definition.label} requires spatial source geometry.`,
    });
  }

  if (!secondaryArtifact.spatial) {
    errors.push({
      code: 'UNSUPPORTED_GEOMETRY',
      message: `${definition.label} ${roleContext.secondaryLabel} artifact "${secondaryArtifact.name}" is not spatial. ${definition.label} requires a spatial ${roleContext.secondaryLabel} geometry.`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const crsValidation = validateOperationCrsPolicy({
    definition,
    sourceArtifact,
    secondaryArtifact,
    secondaryLabel: roleContext.secondaryLabel,
  });
  errors.push(...crsValidation.errors);
  warnings.push(...crsValidation.warnings);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const allowedSourceGeometry = new Set(definition.geometryContract.allowedSourceGeometry ?? []);
  const allowedSecondaryGeometry = new Set(definition.geometryContract.allowedSecondaryGeometry ?? []);

  if (sourceArtifact.geometryType && allowedSourceGeometry.size > 0 && !allowedSourceGeometry.has(sourceArtifact.geometryType)) {
    errors.push({
      code: 'UNSUPPORTED_GEOMETRY',
      message: getUnsupportedGeometryMessage(definition.label, 'Source', sourceArtifact.geometryType),
    });
  }

  if (secondaryArtifact.geometryType && allowedSecondaryGeometry.size > 0 && !allowedSecondaryGeometry.has(secondaryArtifact.geometryType)) {
    errors.push({
      code: 'UNSUPPORTED_GEOMETRY',
      message: getUnsupportedGeometryMessage(definition.label, `${definition.label} ${roleContext.secondaryLabel}`, secondaryArtifact.geometryType),
    });
  }

  warnings.push(createWarningFromCode('LIMITED_SUPPORT_ENVELOPE', undefined, { operation: definition.label.toLowerCase() }));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function createTopologyRefusal(validationResult: TopologyValidationResult) {
  return {
    success: false,
    output: undefined,
    warnings: validationResult.warnings,
    errors: validationResult.errors.map((error) => ({
      code: error.code,
      message: error.message,
    })),
  };
}
