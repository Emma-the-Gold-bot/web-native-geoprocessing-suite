import type { Artifact, ArtifactOutputKind, WarningRef } from '../types'

export interface OperationPanelWarning {
  title: string
  message: string
  tone?: 'info' | 'success' | 'caution' | 'danger'
}

export interface OperationSourceSummaryProps {
  label: string
  artifact: Artifact
  description?: string
}

export interface OperationSecondaryOption {
  id: string
  label: string
}

export interface OperationSecondarySelectorProps {
  label: string
  value: string
  placeholder: string
  options: OperationSecondaryOption[]
  onChange: (value: string) => void
}

export interface OperationFieldCheckboxOption {
  value: string
  label: string
  description?: string
}

export interface OperationFieldCheckboxListProps {
  label: string
  options: OperationFieldCheckboxOption[]
  selectedValues: string[]
  onToggle: (value: string) => void
  emptyMessage?: string
}

export interface OperationContractDisplayProps {
  title?: string
  geometryStatement?: string
  scopeStatement?: string
  groupingStatement?: string
  outputCardinalityStatement?: string
  crsStatement: string
  crsMatch?: {
    label: string
    sourceCrs?: string | null
    secondaryCrs?: string | null
    matches: boolean
    mismatchMessage: string
  }
  geometrySupport?: {
    label: string
    sourceGeometry?: string | null
    secondaryGeometry?: string | null
    sourceAllowed: boolean
    secondaryAllowed: boolean
    unsupportedMessage: string
  }
}

export interface OperationOutputSemanticsProps {
  title?: string
  body: string
  outputKind?: ArtifactOutputKind
  outputKindLabel?: string
  outputKindDescription?: string
}

export interface TypedWarningPanelProps {
  title?: string
  warnings: OperationPanelWarning[]
}

export interface OperationExecutionShellProps {
  title: string
  subtitle: string
  onCancel: () => void
  sourceSummary: {
    label: string
    artifact: Artifact
    description?: string
    extraText?: string
  }
  contract: {
    title?: string
    geometryStatement?: string
    scopeStatement?: string
    groupingStatement?: string
    outputCardinalityStatement?: string
    crsStatement: string
    crsMatch?: OperationContractDisplayProps['crsMatch']
    geometrySupport?: OperationContractDisplayProps['geometrySupport']
  }
  warnings: OperationPanelWarning[]
  output: {
    title?: string
    body: string
    outputKind?: ArtifactOutputKind
    outputKindLabel?: string
    outputKindDescription?: string
  }
  disclosure?: React.ReactNode
  nameValue: string
  onNameChange: (value: string) => void
  runLabel: string
  runningLabel: string
  running?: boolean
  runDisabled?: boolean
  onRun: () => void
}

function getToneStyles(tone: OperationPanelWarning['tone']) {
  switch (tone) {
    case 'success':
      return { background: '#f0fdf4', border: '1px solid #22c55e' }
    case 'caution':
      return { background: '#fef3c7', border: '1px solid #f59e0b' }
    case 'danger':
      return { background: '#3a1212', border: '1px solid #ef4444' }
    case 'info':
    default:
      return { background: '#f0f9ff', border: '1px solid #0ea5e9' }
  }
}

function getBadgeLabel(tone: OperationPanelWarning['tone']) {
  switch (tone) {
    case 'success':
      return 'success'
    case 'caution':
      return 'caution'
    case 'danger':
      return 'blocking'
    case 'info':
    default:
      return 'info'
  }
}

export function getArtifactOutputKind(artifact: Artifact): ArtifactOutputKind {
  if (artifact.outputKind) return artifact.outputKind
  if (artifact.spatial) return 'spatial-artifact'
  if (artifact.format === 'Measurement table') return 'measurement-table'
  return 'tabular-artifact'
}

export function getArtifactOutputKindLabel(outputKind: ArtifactOutputKind): string {
  switch (outputKind) {
    case 'measurement-table':
      return 'measurement table'
    case 'tabular-artifact':
      return 'tabular artifact'
    case 'spatial-artifact':
    default:
      return 'spatial artifact'
  }
}

export function artifactSummaryText(artifact: Artifact): string {
  return `${artifact.format} · ${artifact.rowCount ?? '?'} rows · ${artifact.geometryType ?? getArtifactOutputKindLabel(getArtifactOutputKind(artifact))}`
}

export function getOperationWarningTone(warning: WarningRef): OperationPanelWarning['tone'] {
  if (warning.severity === 'blocking') return 'danger'
  if (warning.severity === 'serious' || warning.severity === 'caution') return 'caution'
  return 'info'
}

export function OperationSourceSummary({ label, artifact, description }: OperationSourceSummaryProps) {
  return (
    <div className="operation-artifact-summary">
      <div className="small operation-artifact-label">{label}</div>
      <div className="row" style={{ marginTop: 4 }}>
        <strong>{artifact.name}</strong>
        <span className="badge">CRS: {artifact.crs ?? 'unknown'}</span>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        {artifactSummaryText(artifact)}
      </div>
      {description && (
        <div className="small muted" style={{ marginTop: 4 }}>
          {description}
        </div>
      )}
    </div>
  )
}

export function OperationSecondarySelector({ label, value, placeholder, options, onChange }: OperationSecondarySelectorProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 4 }}>
        <strong>{label}</strong>
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: '100%', padding: '8px', fontSize: '14px' }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function OperationFieldCheckboxList({
  label,
  options,
  selectedValues,
  onToggle,
  emptyMessage = 'No fields available.',
}: OperationFieldCheckboxListProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 6 }}>
        <strong>{label}</strong>
      </label>
      {options.length === 0 ? (
        <div className="small muted">{emptyMessage}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {options.map((option) => (
            <label key={option.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => onToggle(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                {option.description && (
                  <span className="small muted" style={{ display: 'block', marginTop: 2 }}>{option.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function TypedWarningPanel({ title = 'Notice', warnings }: TypedWarningPanelProps) {
  if (warnings.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {warnings.map((warning, index) => {
        const styles = getToneStyles(warning.tone)
        return (
          <div key={`${title}-${index}-${warning.title}`} className="card" style={{ ...styles, marginBottom: 0 }}>
            <div className="row">
              <strong>{warning.title}</strong>
              <span className={`badge ${getBadgeLabel(warning.tone)}`}>{getBadgeLabel(warning.tone)}</span>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {warning.message}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function OperationContractDisplay({
  title = 'Contract',
  geometryStatement,
  scopeStatement,
  groupingStatement,
  outputCardinalityStatement,
  crsStatement,
  crsMatch,
  geometrySupport,
}: OperationContractDisplayProps) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row">
        <strong>{title}</strong>
      </div>
      {geometryStatement && (
        <div className="small muted" style={{ marginTop: 4 }}>{geometryStatement}</div>
      )}
      {scopeStatement && (
        <div className="small muted" style={{ marginTop: geometryStatement ? 6 : 4 }}>{scopeStatement}</div>
      )}
      {groupingStatement && (
        <div className="small muted" style={{ marginTop: geometryStatement || scopeStatement ? 6 : 4 }}>{groupingStatement}</div>
      )}
      {outputCardinalityStatement && (
        <div className="small muted" style={{ marginTop: geometryStatement || scopeStatement || groupingStatement ? 6 : 4 }}>{outputCardinalityStatement}</div>
      )}
      <div className="small muted" style={{ marginTop: geometryStatement || scopeStatement || groupingStatement || outputCardinalityStatement ? 6 : 4 }}>{crsStatement}</div>

      {crsMatch && (
        <div className="card operation-contract-check" style={{ marginTop: 12, background: crsMatch.matches ? '#f0fdf4' : '#fef3c7', border: `1px solid ${crsMatch.matches ? '#22c55e' : '#f59e0b'}` }}>
          <div className="row">
            <strong>{crsMatch.matches ? '✅ CRS matches' : '⚠️ CRS mismatch'}</strong>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {crsMatch.label}: {crsMatch.sourceCrs ?? 'unknown'} | Secondary CRS: {crsMatch.secondaryCrs ?? 'unknown'}
            {!crsMatch.matches && ` — ${crsMatch.mismatchMessage}`}
          </div>
        </div>
      )}

      {geometrySupport && (
        <div className="card operation-contract-check" style={{ marginTop: 12, background: geometrySupport.sourceAllowed && geometrySupport.secondaryAllowed ? '#f0fdf4' : '#fef3c7', border: `1px solid ${geometrySupport.sourceAllowed && geometrySupport.secondaryAllowed ? '#22c55e' : '#f59e0b'}` }}>
          <div className="row">
            <strong>{geometrySupport.sourceAllowed && geometrySupport.secondaryAllowed ? '✅ Geometry types supported' : '⚠️ Unsupported geometry type'}</strong>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {geometrySupport.label}: {geometrySupport.sourceGeometry ?? 'unknown'} | Secondary geometry: {geometrySupport.secondaryGeometry ?? 'unknown'}
            {!(geometrySupport.sourceAllowed && geometrySupport.secondaryAllowed) && ` — ${geometrySupport.unsupportedMessage}`}
          </div>
        </div>
      )}
    </div>
  )
}

export function OperationOutputSemantics({
  title = 'Output semantics',
  body,
  outputKind,
  outputKindLabel,
  outputKindDescription,
}: OperationOutputSemanticsProps) {
  return (
    <div className="card operation-output-semantics" style={{ marginBottom: 12 }}>
      <div className="row">
        <strong>{title}</strong>
      </div>
      {outputKind && (
        <div className="small" style={{ marginTop: 6, color: '#cbd5e1' }}>
          Output kind: <strong>{outputKindLabel ?? getArtifactOutputKindLabel(outputKind)}</strong>
        </div>
      )}
      {outputKindDescription && (
        <div className="small muted" style={{ marginTop: 4 }}>{outputKindDescription}</div>
      )}
      <div className="small muted" style={{ marginTop: 4 }}>{body}</div>
    </div>
  )
}

export function OperationExecutionShell({
  title,
  subtitle,
  onCancel,
  sourceSummary,
  contract,
  warnings,
  output,
  disclosure,
  nameValue,
  onNameChange,
  runLabel,
  runningLabel,
  running = false,
  runDisabled = false,
  onRun,
}: OperationExecutionShellProps) {
  return (
    <div className="import-overlay">
      <div className="row">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div className="muted small">{subtitle}</div>
        </div>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <OperationSourceSummary
          label={sourceSummary.label}
          artifact={sourceSummary.artifact}
          description={sourceSummary.description}
        />
        {sourceSummary.extraText && (
          <div className="small muted" style={{ marginTop: 8 }}>
            {sourceSummary.extraText}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <OperationContractDisplay
            title={contract.title}
            geometryStatement={contract.geometryStatement}
            scopeStatement={contract.scopeStatement}
            groupingStatement={contract.groupingStatement}
            outputCardinalityStatement={contract.outputCardinalityStatement}
            crsStatement={contract.crsStatement}
            crsMatch={contract.crsMatch}
            geometrySupport={contract.geometrySupport}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <TypedWarningPanel warnings={warnings} />
        </div>

        <OperationOutputSemantics
          title={output.title}
          body={output.body}
          outputKind={output.outputKind}
          outputKindLabel={output.outputKindLabel}
          outputKindDescription={output.outputKindDescription}
        />

        {disclosure && (
          <div className="small muted" style={{ marginTop: 8, marginBottom: 12 }}>
            {disclosure}
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <strong>Output artifact name</strong>
          </label>
          <input
            type="text"
            value={nameValue}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Enter artifact name..."
            style={{ width: '100%', padding: '8px', fontSize: '14px' }}
          />
        </div>
      </div>

      <div className="actions">
        <button
          className="primary"
          onClick={onRun}
          disabled={runDisabled}
        >
          {running ? runningLabel : runLabel}
        </button>
      </div>
    </div>
  )
}
