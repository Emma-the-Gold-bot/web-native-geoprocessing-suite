import { useState, useMemo, useEffect } from 'react'
import type { Artifact, LayerSettings } from '../types'
import { reconcileLayerSettings } from '../lib/layer-controls'

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>({})

  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
    [artifacts, selectedArtifactId],
  )

  // Initialize layer settings for new artifacts (ephemeral, not persisted)
  useEffect(() => {
    setLayerSettings((prev) => {
      const { next, changed } = reconcileLayerSettings(
        prev,
        artifacts.map((a) => ({ id: a.id, spatial: a.spatial ?? false })),
      )
      return changed ? next : prev
    })
  }, [artifacts])

  return {
    artifacts,
    setArtifacts,
    selectedArtifact,
    selectedArtifactId,
    setSelectedArtifactId,
    layerSettings,
    setLayerSettings,
  }
}
