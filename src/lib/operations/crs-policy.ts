import type { Artifact } from '../../types';
import { createWarningFromCode } from '../spatial/warning-codes';
import type { OperationDefinition, CrsContract } from './types';
import { buildOperationTransformPlan } from './transform-planning';

export type ArtifactCrsState = 'known' | 'unknown' | 'missing';

export interface CrsPolicyValidationError {
  code: 'CRS_UNKNOWN' | 'CRS_MISSING' | 'CRS_MISMATCH';
  message: string;
}

export interface CrsPolicyValidationResult {
  valid: boolean;
  errors: CrsPolicyValidationError[];
  warnings: ReturnType<typeof createWarningFromCode>[];
  transformPlanSummary?: string;
}

export interface ValidateOperationCrsPolicyParams {
  definition: OperationDefinition;
  sourceArtifact: Artifact;
  secondaryArtifact?: Artifact;
  secondaryLabel?: string;
  explicitSourceCrs?: string;
}

function getCrsRequirementLabel(requirement: CrsContract['sourceRequirement']): string {
  switch (requirement) {
    case 'require-known':
      return 'known stored CRS';
    case 'require-known-or-explicit':
      return 'known stored CRS or an explicit source CRS';
    case 'allow-any':
    default:
      return 'any CRS state';
  }
}

export function getArtifactCrsState(artifact: Artifact): ArtifactCrsState {
  if (!artifact.crs) return 'missing';
  if (artifact.crs === 'unknown') return 'unknown';
  return 'known';
}

function buildMissingOrUnknownError(params: {
  roleLabel: string;
  artifact: Artifact;
  state: ArtifactCrsState;
  definition: OperationDefinition;
  requirement: CrsContract['sourceRequirement'];
}): CrsPolicyValidationError | null {
  const { roleLabel, artifact, state, definition, requirement } = params;
  if (state === 'known' || requirement === 'allow-any') {
    return null;
  }

  if (requirement === 'require-known') {
    return {
      code: state === 'unknown' ? 'CRS_UNKNOWN' : 'CRS_MISSING',
      message: `${roleLabel} artifact "${artifact.name}" has ${state} stored CRS. ${definition.label} requires ${getCrsRequirementLabel(requirement)}${definition.geometryContract.inputArity === 2 ? ' for both artifacts' : ''}.`,
    };
  }

  return {
    code: state === 'unknown' ? 'CRS_UNKNOWN' : 'CRS_MISSING',
    message: `${roleLabel} artifact "${artifact.name}" has ${state} stored CRS. ${definition.label} requires ${getCrsRequirementLabel(requirement)} before execution.`,
  };
}

function validateRequirement(params: {
  roleLabel: string;
  artifact: Artifact;
  requirement: CrsContract['sourceRequirement'];
  definition: OperationDefinition;
  explicitOverrideCrs?: string;
}): CrsPolicyValidationError | null {
  const { roleLabel, artifact, requirement, definition, explicitOverrideCrs } = params;
  const state = getArtifactCrsState(artifact);

  if (requirement === 'allow-any' || state === 'known') {
    return null;
  }

  if (requirement === 'require-known-or-explicit' && explicitOverrideCrs) {
    return null;
  }

  return buildMissingOrUnknownError({ roleLabel, artifact, state, definition, requirement });
}

export function validateOperationCrsPolicy(
  params: ValidateOperationCrsPolicyParams,
): CrsPolicyValidationResult {
  const { definition, sourceArtifact, secondaryArtifact, secondaryLabel = 'secondary', explicitSourceCrs } = params;
  const errors: CrsPolicyValidationError[] = [];
  const warnings: ReturnType<typeof createWarningFromCode>[] = [];
  const transformPlan = buildOperationTransformPlan({
    definition,
    sourceArtifact,
    secondaryArtifact,
    explicitSourceCrs,
  });

  const sourceError = validateRequirement({
    roleLabel: 'Source',
    artifact: sourceArtifact,
    requirement: definition.crsContract.sourceRequirement,
    definition,
    explicitOverrideCrs: explicitSourceCrs,
  });
  if (sourceError) errors.push(sourceError);

  if (secondaryArtifact && definition.crsContract.secondaryRequirement) {
    const secondaryError = validateRequirement({
      roleLabel: `${definition.label} ${secondaryLabel}`,
      artifact: secondaryArtifact,
      requirement: definition.crsContract.secondaryRequirement,
      definition,
    });
    if (secondaryError) errors.push(secondaryError);
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, transformPlanSummary: transformPlan.summary };
  }

  if (
    secondaryArtifact &&
    definition.crsContract.exactMatchRequirement === 'source-secondary-known-match' &&
    sourceArtifact.crs !== secondaryArtifact.crs
  ) {
    errors.push({
      code: 'CRS_MISMATCH',
      message: `Source stored CRS (${sourceArtifact.crs}) does not match ${secondaryLabel} stored CRS (${secondaryArtifact.crs}). ${definition.label} requires matching known stored CRS.`,
    });
    warnings.push(
      createWarningFromCode('CRS_MISMATCH', undefined, {
        operation: definition.label.toLowerCase(),
        sourceCrs: sourceArtifact.crs,
        secondaryCrs: secondaryArtifact.crs,
        secondaryRoleLabel: secondaryLabel,
      }),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    transformPlanSummary: transformPlan.summary,
  };
}

export function validateOperationDefinitionCrsContract(definition: OperationDefinition): string[] {
  const errors: string[] = [];
  const { crsContract, geometryContract, id } = definition;

  if (geometryContract.inputArity === 2 && !crsContract.secondaryRequirement) {
    errors.push(`${id}: two-input operations must declare secondaryRequirement in crsContract`);
  }

  if (
    crsContract.exactMatchRequirement === 'source-secondary-known-match' &&
    geometryContract.inputArity !== 2
  ) {
    errors.push(`${id}: source-secondary-known-match requires inputArity=2`);
  }

  if (
    crsContract.exactMatchRequirement === 'source-secondary-known-match' &&
    (crsContract.sourceRequirement !== 'require-known' || crsContract.secondaryRequirement !== 'require-known')
  ) {
    errors.push(`${id}: source-secondary-known-match requires both sourceRequirement and secondaryRequirement to be require-known`);
  }

  if (!crsContract.transformPlanning) {
    errors.push(`${id}: crsContract must declare transformPlanning`);
  }

  return errors;
}
