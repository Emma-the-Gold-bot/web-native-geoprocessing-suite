import type { Artifact } from '../types'
import { getOutputKindDescription } from './query-semantics'
import { isFeatureCollection } from './utils'

export type ArtifactExportKind = 'geojson' | 'json'

export interface ArtifactExportOption {
  kind: ArtifactExportKind
  label: string
  description: string
}

function getArtifactJsonRows(artifact: Artifact): Record<string, unknown>[] | null {
  if (artifact.tableRows?.length) {
    return artifact.tableRows
  }

  if (Array.isArray(artifact.data)) {
    return artifact.data as Record<string, unknown>[]
  }

  if (artifact.spatial && isFeatureCollection(artifact.data)) {
    const featureCollection = artifact.data as GeoJSON.FeatureCollection
    return featureCollection.features.map((feature, featureIndex) => ({
      feature_index: featureIndex,
      ...feature.properties,
      geometry: JSON.stringify(feature.geometry),
    }))
  }

  return null
}

export function canExportArtifactAsGeoJson(artifact: Artifact): boolean {
  return Boolean(artifact.spatial && isFeatureCollection(artifact.data))
}

export function canExportArtifactAsJson(artifact: Artifact): boolean {
  return Boolean(getArtifactJsonRows(artifact))
}

export function getArtifactExportOptions(artifact: Artifact): ArtifactExportOption[] {
  const options: ArtifactExportOption[] = []

  if (canExportArtifactAsGeoJson(artifact)) {
    options.push({
      kind: 'geojson',
      label: 'Export to GeoJSON',
      description: 'Geometry-bearing artifacts can be exported as GeoJSON.',
    })
  }

  if (canExportArtifactAsJson(artifact)) {
    options.push({
      kind: 'json',
      label: 'Export to JSON',
      description: `${getOutputKindDescription(artifact.outputKind ?? (artifact.spatial ? 'spatial-artifact' : artifact.format === 'Measurement table' ? 'measurement-table' : 'tabular-artifact'))} Export uses honest row-based JSON on the current shipped path.`,
    })
  }

  return options
}

// Export artifact to GeoJSON format
export const exportToGeoJson = (artifact: Artifact): { blob: Blob; filename: string } | null => {
  if (!canExportArtifactAsGeoJson(artifact)) {
    console.warn('Cannot export artifact to GeoJSON')
    return null
  }

  const geoJson = artifact.data as GeoJSON.FeatureCollection
  const jsonString = JSON.stringify(geoJson, null, 2)
  const blob = new Blob([jsonString], { type: 'application/geo+json' })
  const filename = `${artifact.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.geojson`

  return { blob, filename }
}

// Export artifact to JSON format (row-based, not true GeoParquet)
// This is an honest export - true Parquet encoding requires additional WASM dependencies
// that are beyond the current tranche scope
export const exportToJson = (
  artifact: Artifact,
): Promise<{ blob: Blob; filename: string } | null> => {
  const rows = getArtifactJsonRows(artifact)
  if (!rows) {
    console.warn('Cannot export artifact to JSON')
    return Promise.resolve(null)
  }

  // Export as JSON - honest format, not disguised Parquet
  const jsonString = JSON.stringify(rows, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const filename = `${artifact.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`

  return Promise.resolve({ blob, filename })
}

// Trigger a browser download
export const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
