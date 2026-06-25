import type { LayerSettings } from '../types'

export type SettingsMap = Record<string, LayerSettings>

/** Default settings for a newly added spatial artifact. */
export const DEFAULT_LAYER_SETTINGS: Omit<LayerSettings, 'zIndex'> = {
  visible: true,
  opacity: 1.0,
}

/**
 * Add entries for new spatial artifacts, remove entries for deleted ones.
 * Returns { next, changed } — caller decides whether to call setState.
 */
export function reconcileLayerSettings(
  prev: SettingsMap,
  artifacts: Array<{ id: string; spatial: boolean }>,
): { next: SettingsMap; changed: boolean } {
  const next = { ...prev }
  let changed = false
  // Assign default settings to new spatial artifacts
  artifacts.forEach((artifact) => {
    if (!artifact.spatial) return
    if (!next[artifact.id]) {
      changed = true
      // zIndex starts above existing max to place new artifacts on top
      const existingMaxZ = Math.max(-1, ...Object.values(next).map((s) => s.zIndex))
      next[artifact.id] = { ...DEFAULT_LAYER_SETTINGS, zIndex: existingMaxZ + 1 }
    }
  })
  // Clean up settings for removed or non-spatial artifacts
  for (const id of Object.keys(prev)) {
    const artifact = artifacts.find((a) => a.id === id)
    if (!artifact || !artifact.spatial) {
      changed = true
      delete next[id]
    }
  }
  return { next, changed }
}

/** Flip the `visible` field for the given artifact. */
export function toggleLayerVisibility(prev: SettingsMap, artifactId: string): SettingsMap {
  const existing = prev[artifactId]
  if (existing) {
    return {
      ...prev,
      [artifactId]: { ...existing, visible: !existing.visible },
    }
  }
  return {
    ...prev,
    [artifactId]: { ...DEFAULT_LAYER_SETTINGS, zIndex: 0, visible: true },
  }
}

/** Clamp opacity to [0, 1] and update the given artifact's settings. */
export function changeLayerOpacity(
  prev: SettingsMap,
  artifactId: string,
  opacity: number,
): SettingsMap {
  return {
    ...prev,
    [artifactId]: { ...prev[artifactId], opacity: Math.max(0, Math.min(1, opacity)) },
  }
}

/** Swap zIndex with adjacent spatial artifact. No-op at boundaries. */
export function reorderLayer(
  prev: SettingsMap,
  artifactId: string,
  direction: 'up' | 'down',
): SettingsMap {
  const current = prev[artifactId]
  if (!current) return prev
  // Get all spatial artifact ids sorted by zIndex
  const spatialIds = Object.keys(prev).sort((a, b) => prev[a].zIndex - prev[b].zIndex)
  const idx = spatialIds.indexOf(artifactId)
  if (idx === -1) return prev
  if (direction === 'up' && idx >= spatialIds.length - 1) return prev // already on top
  if (direction === 'down' && idx <= 0) return prev // already on bottom
  const swapIdx = direction === 'up' ? idx + 1 : idx - 1
  const swapId = spatialIds[swapIdx]
  const newSettings = { ...prev }
  // Swap the zIndex values
  newSettings[artifactId] = { ...newSettings[artifactId], zIndex: prev[swapId].zIndex }
  newSettings[swapId] = { ...newSettings[swapId], zIndex: prev[artifactId].zIndex }
  return newSettings
}
