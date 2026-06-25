import type { Artifact } from '../../types';
import type { ResolutionCandidate } from './query-resolver';
import type { OperationDefinition } from '../operations/types';
import type { ChainDefinition, ChainStep } from '../operations/chain-registry';
import { OPERATION_REGISTRY } from '../operations/registry';
import { CHAIN_REGISTRY } from '../operations/chain-registry';
import { getOperationDefinition } from '../operations/registry';
import { createWarningFromCode } from '../spatial/warning-codes';
import { makeId } from '../utils';

export interface PlannedStep {
  operationId: string;
  params: Record<string, any>;
  inputArtifacts: string[];  // artifact ids
  outputName: string;
  outputKind: 'spatial-artifact' | 'measurement-table' | 'tabular-artifact';
  warnings: string[];        // contract warnings
  refusal?: string;          // if step can't execute
}

export interface ExecutionPlan {
  id: string;
  description: string;       // human-readable: "Clip parcels to Butte County, then calculate area"
  source: 'chain' | 'operation';
  sourceId: string;          // chain id or operation id
  steps: PlannedStep[];
  canExecute: boolean;       // false if any step has a refusal
  confidence: number;        // from query resolver
}

export function buildPlan(
  candidate: ResolutionCandidate,
  artifacts: Artifact[],
): ExecutionPlan {
  const { type, id, confidence } = candidate;
  const planId = makeId('plan');
  const steps: PlannedStep[] = [];
  let canExecute = true;
  let description = '';

  if (type === 'operation') {
    // Single operation plan
    const operation = getOperationDefinition(id);
    if (!operation) {
      return {
        id: planId,
        description: `Operation "${id}" not found`,
        source: 'operation',
        sourceId: id,
        steps: [],
        canExecute: false,
        confidence,
      };
    }

    const step = buildOperationStep(operation, candidate.parameters, artifacts);
    steps.push(step);
    canExecute = canExecute && !step.refusal;
    description = `${operation.label} ${step.inputArtifacts.map(aid => artifacts.find(a => a.id === aid)?.name).join(', ')}`;
  } else {
    // Chain plan
    const chain = CHAIN_REGISTRY[id];
    if (!chain) {
      return {
        id: planId,
        description: `Chain "${id}" not found`,
        source: 'chain',
        sourceId: id,
        steps: [],
        canExecute: false,
        confidence,
      };
    }

    const resolvedSteps = buildChainSteps(chain, candidate.parameters, artifacts);
    steps.push(...resolvedSteps.steps);
    canExecute = resolvedSteps.canExecute;
    description = chain.description;
  }

  return {
    id: planId,
    description,
    source: type,
    sourceId: id,
    steps,
    canExecute,
    confidence,
  };
}

function buildOperationStep(
  operation: OperationDefinition,
  parameters: Record<string, any>,
  artifacts: Artifact[],
): PlannedStep {
  const warnings: string[] = [];
  let refusal: string | undefined;

  // Resolve artifact parameters
  const inputArtifacts: string[] = [];
  const resolvedParams: Record<string, any> = { ...parameters };

  // Determine which parameters are artifacts based on operation family
  if (operation.family === 'single-geometry' || operation.family === 'measurement' || operation.family === 'aggregation' || operation.family === 'crs') {
    // Single input operation: source artifact
    const sourceParam = findArtifactParameter(operation.intent?.parameters, 'source');
    if (sourceParam) {
      const artifact = resolveArtifactParameter(parameters[sourceParam.name] || '$source', artifacts, sourceParam.role || 'source');
      if (artifact) {
        inputArtifacts.push(artifact.id);
        resolvedParams[sourceParam.name] = artifact.id;
      } else {
        refusal = `Missing source artifact`;
      }
    }
  } else if (operation.family === 'topology-two-input') {
    // Two input operation: source and secondary
    const sourceParam = findArtifactParameter(operation.intent?.parameters, 'source');
    const secondaryParam = findArtifactParameter(operation.intent?.parameters, 'mask') ||
                           findArtifactParameter(operation.intent?.parameters, 'overlay') ||
                           findArtifactParameter(operation.intent?.parameters, 'join_table');
    
    if (sourceParam) {
      const artifact = resolveArtifactParameter(parameters[sourceParam.name] || '$source', artifacts, sourceParam.role || 'source');
      if (artifact) {
        inputArtifacts.push(artifact.id);
        resolvedParams[sourceParam.name] = artifact.id;
      } else {
        refusal = `Missing source artifact`;
      }
    }
    
    if (secondaryParam) {
      const role = secondaryParam.role || 'secondary';
      const artifact = resolveArtifactParameter(parameters[secondaryParam.name] || '$' + role, artifacts, role);
      if (artifact) {
        inputArtifacts.push(artifact.id);
        resolvedParams[secondaryParam.name] = artifact.id;
      } else {
        refusal = refusal ? `${refusal}; Missing ${role} artifact` : `Missing ${role} artifact`;
      }
    }
  }

  // Validate geometry contract
  if (operation.geometryContract.allowedSourceGeometry) {
    const sourceArtifact = artifacts.find(a => a.id === inputArtifacts[0]);
    if (sourceArtifact && sourceArtifact.geometryType) {
      if (!operation.geometryContract.allowedSourceGeometry.includes(sourceArtifact.geometryType)) {
        warnings.push(`Geometry type "${sourceArtifact.geometryType}" may not be supported. Supported: ${operation.geometryContract.allowedSourceGeometry.join(', ')}`);
      }
    }
  }

  // Validate CRS contract
  if (operation.crsContract.sourceRequirement === 'require-known' || operation.crsContract.sourceRequirement === 'require-known-or-explicit') {
    const sourceArtifact = artifacts.find(a => a.id === inputArtifacts[0]);
    if (sourceArtifact && (!sourceArtifact.crs || sourceArtifact.crs === 'unknown')) {
      warnings.push(`CRS unknown or missing. ${operation.label} requires known stored CRS.`);
    }
  }

  // Generate output name
  const sourceArtifact = artifacts.find(a => a.id === inputArtifacts[0]);
  const outputName = `${sourceArtifact?.name || 'output'}_${operation.label.toLowerCase()}`;

  // Determine output kind
  let outputKind: PlannedStep['outputKind'] = 'spatial-artifact';
  if (operation.outputContract.outputKind === 'measurement-table') {
    outputKind = 'measurement-table';
  } else if (operation.family === 'topology-two-input' && operation.id === 'attribute-join-v1') {
    outputKind = 'spatial-artifact'; // join preserves geometry
  }

  return {
    operationId: operation.id,
    params: resolvedParams,
    inputArtifacts,
    outputName,
    outputKind,
    warnings,
    refusal,
  };
}

function buildChainSteps(
  chain: ChainDefinition,
  parameters: Record<string, any>,
  artifacts: Artifact[],
): { steps: PlannedStep[], canExecute: boolean } {
  const steps: PlannedStep[] = [];
  let canExecute = true;
  const stepOutputs: Record<string, string> = {}; // step index -> artifact id

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    const operation = getOperationDefinition(step.op);
    if (!operation) {
      steps.push({
        operationId: step.op,
        params: {},
        inputArtifacts: [],
        outputName: `unknown_${i}`,
        outputKind: 'spatial-artifact',
        warnings: [`Operation "${step.op}" not found`],
        refusal: `Operation not found`,
      });
      canExecute = false;
      continue;
    }

    // Resolve input references
    const stepParams: Record<string, any> = {};
    const inputArtifacts: string[] = [];

    for (const [paramName, ref] of Object.entries(step.inputs)) {
      if (ref.startsWith('$step')) {
        // Reference to previous step output
        const stepIndex = parseInt(ref.match(/\$step(\d+)\.output/)?.[1] || '0');
        const artifactId = stepOutputs[stepIndex];
        if (artifactId) {
          stepParams[paramName] = artifactId;
          inputArtifacts.push(artifactId);
        } else {
          // Can't resolve - depends on previous step
          canExecute = false;
        }
      } else if (ref.startsWith('$')) {
        // User parameter
        const paramName = ref.substring(1);
        const value = parameters[paramName];
        if (value) {
          stepParams[paramName] = value;
          // If it's an artifact parameter, resolve it
          const paramDef = chain.parameters.find(p => p.name === paramName);
          if (paramDef?.type === 'artifact') {
            const artifact = resolveArtifactParameter(value, artifacts, paramName);
            if (artifact) {
              inputArtifacts.push(artifact.id);
              stepParams[paramName] = artifact.id;
            } else {
              canExecute = false;
            }
          }
        } else {
          // Missing required parameter
          const paramDef = chain.parameters.find(p => p.name === paramName);
          if (paramDef?.required) {
            canExecute = false;
          }
        }
      } else {
        // Literal value
        stepParams[paramName] = ref;
      }
    }

    // Build step
    const stepResult = buildOperationStep(operation, stepParams, artifacts);
    steps.push(stepResult);
    if (stepResult.refusal) {
      canExecute = false;
    }

    // Store output reference for future steps
    const sourceArtifact = artifacts.find(a => a.id === stepResult.inputArtifacts[0]);
    stepOutputs[i] = `${sourceArtifact?.name || 'output'}_${operation.label.toLowerCase()}_${i}`;
  }

  return { steps, canExecute };
}

function findArtifactParameter(
  parameters: Array<{ name: string; type: string; role?: string }> = [],
  role: string,
): { name: string; type: string; role?: string } | undefined {
  return parameters.find(p => p.role === role);
}

function resolveArtifactParameter(
  value: any,
  artifacts: Artifact[],
  role: string,
): Artifact | undefined {
  if (!value) return undefined;
  
  if (typeof value === 'string') {
    // Could be artifact id, name, or reference
    // First try by id
    let artifact = artifacts.find(a => a.id === value);
    if (artifact) return artifact;
    
    // Try by name
    artifact = artifacts.find(a => a.name.toLowerCase().includes(value.toLowerCase()));
    if (artifact) return artifact;
    
    // Try by role hint
    artifact = artifacts.find(a => a.name.toLowerCase().includes(role.toLowerCase()));
    return artifact;
  }
  
  return undefined;
}