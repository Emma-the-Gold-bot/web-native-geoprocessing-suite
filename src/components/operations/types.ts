import type { Artifact, HistoryEvent, WarningRef } from '../../types'

export type BottomTab = 'table' | 'sql' | 'results'

export interface OperationExecutionResult {
  artifact?: Artifact
  historyEvent?: HistoryEvent
  error?: string
}

export interface DebugParams {
  logMapSync: boolean
  deferOperationSelection: boolean
  disableOperationSelection: boolean
}

/**
 * Shared context passed to all operation dialog components.
 * Contains everything needed for the dialog to execute operations
 * and commit results back to the app.
 */
export interface OperationDialogContext {
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  selectedArtifactId: string | null
  onClose: () => void
  setStatusMessage: (msg: string) => void
  addToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info', dismissible?: boolean) => void
  commitArtifact: (params: {
    artifact: Artifact
    historyEvent: HistoryEvent
    snapshotLabel: string
    statusMessage?: string
    toastMessage?: string
    toastType?: 'success' | 'error' | 'warning'
  }) => void
  applyOperationResult: (
    result: OperationExecutionResult,
    options?: { bottomTab?: BottomTab; statusMessage?: string },
  ) => void
  debugParams: DebugParams
}
