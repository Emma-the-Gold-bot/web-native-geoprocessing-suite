import { useState, useEffect, useCallback } from 'react';
import type { Artifact, HistoryEvent } from '../types';
import { resolveQuery, type ResolutionCandidate } from '../lib/nl/query-resolver';
import { OPERATION_INTENT_MAP } from '../lib/operations/intent-data';
import { OPERATION_REGISTRY } from '../lib/operations/registry';
import { CHAIN_REGISTRY } from '../lib/operations/chain-registry';
import { buildPlan, type ExecutionPlan, type PlannedStep } from '../lib/nl/plan-builder';
import { executePlan } from '../lib/nl/plan-executor';

/** Get human-readable label for an operation id */
function getOperationLabel(id: string): string {
  return OPERATION_REGISTRY[id]?.label ?? id;
}

interface NLQueryPanelProps {
  artifacts: Artifact[];
  addArtifact: (artifact: Artifact) => void;
  /** Optional — plan executor uses getSpatialEngine() internally if not provided */
  engine?: any;
  onPlanExecuted?: (result: { success: boolean; artifacts: Artifact[]; historyEvents: HistoryEvent[]; errors: string[] }) => void;
  /** External query string — when set, triggers resolution automatically */
  externalQuery?: string;
  /** Called when the plan overlay should be dismissed */
  onClose?: () => void;
  /** Called when execution completes successfully */
  onExecutionComplete?: () => void;
}

export function NLQueryPanel({ artifacts, addArtifact, engine, onPlanExecuted, externalQuery, onClose, onExecutionComplete }: NLQueryPanelProps) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ResolutionCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ResolutionCandidate | null>(null);
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [editedPlan, setEditedPlan] = useState<ExecutionPlan | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; errors: string[] } | null>(null);

  // Resolve external query when it changes
  useEffect(() => {
    if (externalQuery && externalQuery.trim()) {
      setQuery(externalQuery);
      resolveAndBuildPlan(externalQuery);
    }
  }, [externalQuery]);

  const resolveAndBuildPlan = useCallback((queryText: string) => {
    if (!queryText.trim()) {
      setCandidates([]);
      setSelectedCandidate(null);
      setPlan(null);
      setEditedPlan(null);
      return;
    }

    setIsResolving(true);
    try {
      const resolved = resolveQuery(queryText, OPERATION_INTENT_MAP, CHAIN_REGISTRY);
      setCandidates(resolved);
      if (resolved.length > 0) {
        setSelectedCandidate(resolved[0]);
        const builtPlan = buildPlan(resolved[0], artifacts);
        setPlan(builtPlan);
        setEditedPlan(builtPlan);
      } else {
        setSelectedCandidate(null);
        setPlan(null);
        setEditedPlan(null);
      }
    } catch (error) {
      console.error('Query resolution error:', error);
      setCandidates([]);
      setSelectedCandidate(null);
      setPlan(null);
      setEditedPlan(null);
    } finally {
      setIsResolving(false);
    }
  }, [artifacts]);

  // Re-build plan when artifacts change
  useEffect(() => {
    if (selectedCandidate) {
      const builtPlan = buildPlan(selectedCandidate, artifacts);
      setPlan(builtPlan);
      setEditedPlan(builtPlan);
    }
  }, [selectedCandidate, artifacts]);

  const handleCandidateSelect = (candidate: ResolutionCandidate) => {
    setSelectedCandidate(candidate);
    const builtPlan = buildPlan(candidate, artifacts);
    setPlan(builtPlan);
    setEditedPlan(builtPlan);
  };

  /** Update a param on a specific step */
  const handleStepParamChange = (stepIndex: number, paramKey: string, value: string) => {
    if (!editedPlan) return;
    const newSteps = [...editedPlan.steps];
    const step = { ...newSteps[stepIndex] };
    step.params = { ...step.params, [paramKey]: value };
    newSteps[stepIndex] = step;
    setEditedPlan({ ...editedPlan, steps: newSteps });
  };

  /** Update the output name on a specific step */
  const handleStepOutputNameChange = (stepIndex: number, value: string) => {
    if (!editedPlan) return;
    const newSteps = [...editedPlan.steps];
    newSteps[stepIndex] = { ...newSteps[stepIndex], outputName: value };
    setEditedPlan({ ...editedPlan, steps: newSteps });
  };

  const handleExecute = async () => {
    if (!editedPlan) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const result = await executePlan(editedPlan, {
        artifacts,
        addArtifact,
        engine,
      });

      setExecutionResult({
        success: result.success,
        errors: result.errors,
      });

      if (onPlanExecuted) {
        onPlanExecuted(result);
      }

      if (result.success && onExecutionComplete) {
        onExecutionComplete();
      }
    } catch (error) {
      setExecutionResult({
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence > 0.8) return 'High';
    if (confidence > 0.5) return 'Medium';
    return 'Low';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence > 0.8) return '#10b981';
    if (confidence > 0.5) return '#f59e0b';
    return '#ef4444';
  };

  const renderPlan = () => {
    if (!editedPlan) return null;
    const isChain = editedPlan.steps.length > 1;

    return (
      <div>
        {/* Plan description */}
        <div className="small muted" style={{ marginBottom: 8 }}>
          {editedPlan.description}
        </div>

        {/* Chain visualization */}
        {isChain ? (
          <div className="chain-sequence">
            {editedPlan.steps.map((step, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'flex-start' }}>
                {index > 0 && <div className="chain-step-arrow">→</div>}
                {renderStepCard(step, index)}
              </div>
            ))}
          </div>
        ) : (
          editedPlan.steps.length === 1 && renderStepCard(editedPlan.steps[0], 0)
        )}

        {/* Plan metadata */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div className="small muted">
            Confidence: <span style={{ color: getConfidenceColor(editedPlan.confidence) }}>{getConfidenceLabel(editedPlan.confidence)}</span>
          </div>
          <span className="badge" style={{
            background: editedPlan.canExecute ? '#10b981' : '#ef4444',
            color: 'white',
          }}>
            {editedPlan.canExecute ? 'Ready' : 'Needs review'}
          </span>
        </div>

        {/* Warnings and refusals summary */}
        {editedPlan.steps.some(s => s.warnings.length > 0 || s.refusal) && (
          <div style={{ marginTop: 8 }}>
            {editedPlan.steps.map((step, i) => (
              step.refusal ? (
                <div key={i} className="small" style={{ color: '#ef4444', marginTop: 4 }}>
                  ❌ Step {i + 1} ({getOperationLabel(step.operationId)}): {step.refusal}
                </div>
              ) : step.warnings.length > 0 ? (
                <div key={i} className="small" style={{ color: '#f59e0b', marginTop: 4 }}>
                  ⚠ Step {i + 1} ({getOperationLabel(step.operationId)}): {step.warnings.join('; ')}
                </div>
              ) : null
            ))}
          </div>
        )}

        {/* Execute button */}
        <div className="actions" style={{ marginTop: 12 }}>
          <button
            className="primary"
            onClick={handleExecute}
            disabled={!editedPlan.canExecute || isExecuting}
          >
            {isExecuting ? 'Executing...' : isChain ? 'Execute Chain' : 'Execute'}
          </button>
          {onClose && (
            <button className="secondary" onClick={onClose}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderStepCard = (step: PlannedStep, index: number) => {
    const paramEntries = Object.entries(step.params).filter(([key]) => key !== 'contract' && key !== 'attributePolicy');
    const hasRefusal = Boolean(step.refusal);
    const hasWarning = step.warnings.length > 0;

    return (
      <div className={`chain-step${hasRefusal ? ' has-refusal' : ''}${hasWarning ? ' has-warning' : ''}`}>
        <div className="row" style={{ marginBottom: 4 }}>
          <strong style={{ fontSize: 'var(--text-sm)' }}>
            {editedPlan && editedPlan.steps.length > 1 ? `${index + 1}. ` : ''}{getOperationLabel(step.operationId)}
          </strong>
          <span className="badge">{step.outputKind}</span>
        </div>

        {/* Input artifacts */}
        <div className="small muted" style={{ marginBottom: 8 }}>
          Input: {step.inputArtifacts.map(id => {
            const artifact = artifacts.find(a => a.id === id);
            return artifact ? artifact.name : id;
          }).join(', ')}
        </div>

        {/* Editable parameters */}
        {paramEntries.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {paramEntries.map(([key, value]) => (
              <div className="chain-step-param" key={key}>
                <label>{key}</label>
                <input
                  type="text"
                  value={String(value ?? '')}
                  onChange={(e) => handleStepParamChange(index, key, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Editable output name */}
        <div className="chain-step-param">
          <label>output</label>
          <input
            type="text"
            value={step.outputName}
            onChange={(e) => handleStepOutputNameChange(index, e.target.value)}
          />
        </div>

        {/* Refusal */}
        {step.refusal && (
          <div className="small" style={{ color: '#ef4444', marginTop: 8 }}>
            ❌ {step.refusal}
          </div>
        )}

        {/* Warnings */}
        {step.warnings.length > 0 && !step.refusal && (
          <div className="small" style={{ color: '#f59e0b', marginTop: 8 }}>
            ⚠ {step.warnings.join('; ')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="nl-query-panel">
      {/* Resolving indicator */}
      {isResolving && (
        <div className="small muted" style={{ marginBottom: 8 }}>
          Resolving query...
        </div>
      )}

      {/* No match */}
      {!isResolving && query.trim() && candidates.length === 0 && (
        <div className="card muted" style={{ marginBottom: 12 }}>
          No matching operations found. Try rephrasing or use SQL directly (prefix with <code>/</code>).
        </div>
      )}

      {/* Candidate selection (when multiple matches) */}
      {candidates.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>Multiple matches found:</div>
          {candidates.map((candidate) => (
            <div
              key={`${candidate.type}-${candidate.id}`}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${selectedCandidate?.id === candidate.id ? '#60a5fa' : '#334155'}`,
                background: selectedCandidate?.id === candidate.id ? '#1e293b' : 'transparent',
                cursor: 'pointer',
                marginBottom: 4,
                fontSize: 'var(--text-sm)',
              }}
              onClick={() => handleCandidateSelect(candidate)}
            >
              <strong>{candidate.label}</strong>
              <span className="badge" style={{ marginLeft: 8, background: getConfidenceColor(candidate.confidence), color: 'white' }}>
                {getConfidenceLabel(candidate.confidence)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Plan visualization */}
      {renderPlan()}

      {/* Execution result */}
      {executionResult && (
        <div className={`card ${executionResult.success ? '' : 'danger'}`} style={{ marginTop: 12, borderColor: executionResult.success ? '#3fb950' : undefined }}>
          <strong>{executionResult.success ? '✓ Execution successful' : '❌ Execution failed'}</strong>
          {executionResult.errors.length > 0 && (
            <div className="small muted" style={{ marginTop: 6 }}>
              {executionResult.errors.join('; ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
