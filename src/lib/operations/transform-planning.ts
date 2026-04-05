import type { Artifact } from '../../types';
import type { OperationDefinition, TransformPlanningContract } from './types';

export interface OperationTransformPlan {
  operationId: string;
  executionRequirement: TransformPlanningContract['executionRequirement'];
  futureEligibility: TransformPlanningContract['futureEligibility'];
  outputCrsMode: TransformPlanningContract['outputCrsMode'];
  sourceStoredCrs?: string;
  secondaryStoredCrs?: string;
  explicitSourceCrs?: string;
  targetCrs?: string;
  summary: string;
}

export interface BuildOperationTransformPlanParams {
  definition: OperationDefinition;
  sourceArtifact: Artifact;
  secondaryArtifact?: Artifact;
  explicitSourceCrs?: string;
  targetCrs?: string;
}

export function buildOperationTransformPlan(
  params: BuildOperationTransformPlanParams,
): OperationTransformPlan {
  const { definition, sourceArtifact, secondaryArtifact, explicitSourceCrs, targetCrs } = params;
  const contract = definition.crsContract.transformPlanning;

  let summary = 'No transform planning is declared for this operation.';
  if (contract.executionRequirement === 'same-crs-only') {
    summary = contract.futureEligibility === 'candidate-via-explicit-plan'
      ? 'Current execution requires known matching stored CRS. Future explicit pre-execution transform planning is architecturally allowed, but not implemented in the shipped product.'
      : 'Current execution requires known matching stored CRS with no transform-planning path.';
  } else if (contract.executionRequirement === 'explicit-transform') {
    summary = 'Execution is an explicit coordinate transformation. Output CRS is produced from the requested target CRS.';
  }

  return {
    operationId: definition.id,
    executionRequirement: contract.executionRequirement,
    futureEligibility: contract.futureEligibility,
    outputCrsMode: contract.outputCrsMode,
    sourceStoredCrs: sourceArtifact.crs,
    secondaryStoredCrs: secondaryArtifact?.crs,
    explicitSourceCrs,
    targetCrs,
    summary,
  };
}

export function validateOperationDefinitionTransformPlanningContract(definition: OperationDefinition): string[] {
  const errors: string[] = [];
  const { crsContract, geometryContract, id } = definition;
  const transformPlanning = crsContract.transformPlanning;

  if (!transformPlanning) {
    errors.push(`${id}: crsContract must declare transformPlanning`);
    return errors;
  }

  if (
    transformPlanning.executionRequirement === 'same-crs-only' &&
    geometryContract.inputArity !== 2
  ) {
    errors.push(`${id}: same-crs-only transform planning requires inputArity=2`);
  }

  if (
    transformPlanning.executionRequirement === 'same-crs-only' &&
    crsContract.exactMatchRequirement !== 'source-secondary-known-match'
  ) {
    errors.push(`${id}: same-crs-only transform planning requires source-secondary-known-match exactMatchRequirement`);
  }

  if (
    transformPlanning.executionRequirement === 'explicit-transform' &&
    crsContract.sourceRequirement !== 'require-known-or-explicit'
  ) {
    errors.push(`${id}: explicit-transform planning requires sourceRequirement=require-known-or-explicit`);
  }

  if (
    transformPlanning.executionRequirement === 'explicit-transform' &&
    transformPlanning.outputCrsMode !== 'explicit-target'
  ) {
    errors.push(`${id}: explicit-transform planning requires outputCrsMode=explicit-target`);
  }

  if (
    transformPlanning.executionRequirement !== 'explicit-transform' &&
    transformPlanning.outputCrsMode === 'explicit-target'
  ) {
    errors.push(`${id}: explicit-target outputCrsMode requires explicit-transform executionRequirement`);
  }

  if (
    transformPlanning.futureEligibility === 'candidate-via-explicit-plan' &&
    transformPlanning.executionRequirement !== 'same-crs-only'
  ) {
    errors.push(`${id}: candidate-via-explicit-plan currently only applies to same-crs-only operations`);
  }

  return errors;
}
