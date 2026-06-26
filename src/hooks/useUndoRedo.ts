import { useRef } from 'react'
import type { Artifact, LayerSettings } from '../types'

export interface UndoEntry {
  artifacts: Artifact[]
  label: string
  timestamp: number
}

export function useUndoRedo(
  artifacts: Artifact[],
  setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>,
  _layerSettings: Record<string, LayerSettings>,
  setLayerSettings: React.Dispatch<React.SetStateAction<Record<string, LayerSettings>>>,
  addToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void,
) {
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])

  function pushSnapshot(label: string) {
    undoStack.current.push({ artifacts: [...artifacts], label, timestamp: Date.now() })
    redoStack.current = []
  }

  function undo() {
    const entry = undoStack.current.pop()
    if (!entry) { addToast('Nothing to undo', 'info'); return }
    redoStack.current.push({ artifacts: [...artifacts], label: entry.label, timestamp: Date.now() })
    setArtifacts(entry.artifacts)
    const remainingIds = new Set(entry.artifacts.map(a => a.id))
    setLayerSettings(prev => {
      const cleaned: Record<string, LayerSettings> = {}
      for (const [id, settings] of Object.entries(prev)) {
        if (remainingIds.has(id)) cleaned[id] = settings
      }
      return cleaned
    })
    addToast(`Undid: ${entry.label}`, 'info')
  }

  function redo() {
    const entry = redoStack.current.pop()
    if (!entry) { addToast('Nothing to redo', 'info'); return }
    undoStack.current.push({ artifacts: [...artifacts], label: entry.label, timestamp: Date.now() })
    setArtifacts(entry.artifacts)
    const remainingIds = new Set(entry.artifacts.map(a => a.id))
    setLayerSettings(prev => {
      const cleaned: Record<string, LayerSettings> = {}
      for (const [id, settings] of Object.entries(prev)) {
        if (remainingIds.has(id)) cleaned[id] = settings
      }
      return cleaned
    })
    addToast(`Redid: ${entry.label}`, 'info')
  }

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0
  const undoLabel = canUndo ? undoStack.current[undoStack.current.length - 1].label : null
  const redoLabel = canRedo ? redoStack.current[redoStack.current.length - 1].label : null

  return { pushSnapshot, undo, redo, canUndo, canRedo, undoLabel, redoLabel }
}
