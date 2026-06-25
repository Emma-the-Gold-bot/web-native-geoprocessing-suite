import type { Artifact, HistoryEvent } from '../../types';
import type { ExecutionPlan, PlannedStep } from './plan-builder';
import { executeRegisteredSingleInputOperation } from '../operations/executor';
import { executeTopologyOperation } from '../operations/topology-execution';
import { executeRegisteredMeasurementOperation } from '../operations/measurement-execution';
import { executeRegisteredAggregationOperation } from '../operations/aggregation-execution';
import { executeAttributeJoinOperation } from '../operations/attribute-join';
import { getSpatialEngine } from '../spatial';
import { OPERATION_REGISTRY } from '../operations/registry';

export interface ExecutionResult {
  success: boolean;
  artifacts: Artifact[];     // produced artifacts
  historyEvents: HistoryEvent[];
  errors: string[];
}

export async function executePlan(
  plan: ExecutionPlan,
  context: {
    artifacts: Artifact[];
    addArtifact: (artifact: Artifact) => void;
    engine: any; // existing engine reference
  }
): Promise<ExecutionResult> {
  const { artifacts, addArtifact, engine } = context;
  const producedArtifacts: Artifact[] = [];
  const historyEvents: HistoryEvent[] = [];
  const errors: string[] = [];

  // Track step outputs: step index -> artifact id
  const stepOutputs: Record<number, string> = {};

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    
    // Resolve input artifacts
    const inputArtifacts = step.inputArtifacts.map(id => artifacts.find(a => a.id === id)).filter(Boolean) as Artifact[];
    if (inputArtifacts.length < step.inputArtifacts.length) {
      errors.push(`Step ${i + 1}: Could not find all input artifacts`);
      break;
    }

    const sourceArtifact = inputArtifacts[0];
    const secondaryArtifact = inputArtifacts[1];

    try {
      const result = await executeStep(step, sourceArtifact, secondaryArtifact);
      
      if (result.error) {
        errors.push(`Step ${i + 1}: ${result.error}`);
        break;
      }

      if (result.artifact) {
        producedArtifacts.push(result.artifact);
        addArtifact(result.artifact);
        stepOutputs[i] = result.artifact.id;
      }

      if (result.historyEvent) {
        historyEvents.push(result.historyEvent);
      }
    } catch (error) {
      errors.push(`Step ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }

  return {
    success: errors.length === 0,
    artifacts: producedArtifacts,
    historyEvents,
    errors,
  };
}

async function executeStep(
  step: PlannedStep,
  sourceArtifact: Artifact,
  secondaryArtifact?: Artifact,
): Promise<{ artifact?: Artifact; historyEvent?: HistoryEvent; error?: string }> {
  const operation = OPERATION_REGISTRY[step.operationId];
  if (!operation) {
    return { error: `Unknown operation: ${step.operationId}` };
  }

  const engine = getSpatialEngine();

  switch (operation.family) {
    case 'single-geometry':
    case 'crs':
      return executeRegisteredSingleInputOperation({
        operationId: step.operationId,
        sourceArtifact,
        executeOperation: async (input) => {
          if (step.operationId === 'buffer') {
            const distance = step.params.distance || 100;
            return engine.buffer(input, distance);
          } else if (step.operationId === 'centroid') {
            return engine.centroid(input);
          } else if (step.operationId === 'convex-hull-v1') {
            return engine.convexHull(input);
          } else if (step.operationId === 'envelope-v1') {
            return engine.envelope(input);
          } else if (step.operationId === 'simplify-v1') {
            const tolerance = step.params.tolerance || 1;
            return engine.simplify(input, tolerance);
          } else if (step.operationId === 'reproject') {
            const targetCrs = step.params.target_crs;
            const sourceCrs = sourceArtifact.crs || 'EPSG:4326';
            if (!targetCrs) {
              return {
                success: false,
                output: undefined,
                outputCrs: undefined,
                warnings: [],
                errors: [{ code: 'MISSING_PARAMETER', message: 'Missing target CRS' }],
              };
            }
            return engine.transform(input, sourceCrs, targetCrs);
          } else if (step.operationId === 'crs-assign') {
            const crs = step.params.crs;
            if (!crs) {
              return {
                success: false,
                output: undefined,
                outputCrs: undefined,
                warnings: [],
                errors: [{ code: 'MISSING_PARAMETER', message: 'Missing CRS' }],
              };
            }
            return engine.assignCRS(input, crs);
          }
          return {
              success: false,
              output: undefined,
              outputCrs: undefined,
              warnings: [],
              errors: [{ code: 'UNSUPPORTED_OPERATION', message: `Unsupported operation: ${step.operationId}` }],
            };
        },
        outputName: step.outputName,
      });

    case 'topology-two-input':
      if (!secondaryArtifact) {
        return { error: `Missing secondary artifact for ${step.operationId}` };
      }
      
      return executeTopologyOperation({
        operationId: step.operationId as 'clip-v1' | 'intersect-v1',
        sourceArtifact,
        secondaryArtifact,
        outputName: step.outputName,
        executeTopology: async (sourceInput, secondaryInput) => {
          if (step.operationId === 'clip-v1') {
            const result = await engine.clip(sourceInput, secondaryInput);
            // Ensure the result has the required warnings property
            return {
              success: result.success,
              output: result.output,
              outputCrs: result.outputCrs,
              warnings: result.warnings || [],
              errors: result.errors || [],
            };
          } else if (step.operationId === 'intersect-v1') {
            const result = await engine.intersect(sourceInput, secondaryInput);
            return {
              success: result.success,
              output: result.output,
              outputCrs: result.outputCrs,
              warnings: result.warnings || [],
              errors: result.errors || [],
            };
          } else if (step.operationId === 'attribute-join-v1') {
            // Attribute join is handled separately
            return {
              success: false,
              output: undefined,
              outputCrs: undefined,
              warnings: [],
              errors: [{ code: 'UNSUPPORTED_OPERATION', message: 'Attribute join not implemented in this execution path' }],
            };
          }
          return {
            success: false,
            output: undefined,
            outputCrs: undefined,
            warnings: [],
            errors: [{ code: 'UNSUPPORTED_OPERATION', message: `Unsupported topology operation: ${step.operationId}` }],
          };
        },
      });

    case 'measurement':
      return executeRegisteredMeasurementOperation({
        operationId: step.operationId as 'area-v1' | 'perimeter-v1' | 'compactness-v1',
        sourceArtifact,
        outputName: step.outputName,
      });

    case 'aggregation':
      if (step.operationId === 'dissolve-grouped-v1') {
        const groupingField = step.params.grouping_field;
        if (!groupingField) {
          return { error: 'Missing grouping field for dissolve-grouped-v1' };
        }
        return executeRegisteredAggregationOperation({
          operationId: 'dissolve-grouped-v1',
          sourceArtifact,
          groupingField,
          outputName: step.outputName,
          executeOperation: async (input) => {
            const result = await engine.dissolve(input, groupingField);
            return {
              success: result.success,
              output: result.output,
              outputCrs: result.outputCrs,
              warnings: result.warnings || [],
              errors: result.errors || [],
            };
          },
        });
      } else if (step.operationId === 'dissolve-global') {
        return executeRegisteredSingleInputOperation({
          operationId: 'dissolve-global',
          sourceArtifact,
          executeOperation: async (input) => {
            const result = await engine.dissolve(input);
            return {
              success: result.success,
              output: result.output,
              outputCrs: result.outputCrs,
              warnings: result.warnings || [],
              errors: result.errors || [],
            };
          },
          outputName: step.outputName,
        });
      }
      return { error: `Unsupported aggregation operation: ${step.operationId}` };

    default:
      return { error: `Unsupported operation family: ${operation.family}` };
  }
}

// Special handling for attribute join (since it's topology-two-input but with different execution)
export async function executeAttributeJoinStep(
  step: PlannedStep,
  sourceArtifact: Artifact,
  secondaryArtifact: Artifact,
): Promise<{ artifact?: Artifact; historyEvent?: HistoryEvent; error?: string }> {
  if (step.operationId !== 'attribute-join-v1') {
    return { error: 'Not an attribute join step' };
  }

  const sourceKey = step.params.source_key;
  const secondaryKey = step.params.join_key;
  const selectedFields = step.params.selected_fields;

  if (!sourceKey || !secondaryKey) {
    return { error: 'Missing source_key or join_key for attribute join' };
  }

  return executeAttributeJoinOperation({
    sourceArtifact,
    secondaryArtifact,
    sourceKey,
    secondaryKey,
    selectedFields,
    outputName: step.outputName,
  });
}