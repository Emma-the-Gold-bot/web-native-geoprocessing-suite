export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

export const formatTimestamp = (iso: string) => new Date(iso).toLocaleString()

export const pluralize = (count: number, singular: string, plural: string): string => {
  return count === 1 ? singular : plural
}

export const formatCount = (count: number, noun: string): string => {
  return `${count} ${pluralize(count, noun, noun + 's')}`
}

export const isFeatureCollection = (value: unknown): value is GeoJSON.FeatureCollection => {
  return !!value && typeof value === 'object' && (value as { type?: string }).type === 'FeatureCollection'
}

export const inferGeometryType = (fc: GeoJSON.FeatureCollection): string | undefined => {
  const first = fc.features.find((feature) => feature.geometry?.type)
  return first?.geometry?.type
}

/**
 * Analyzes all geometries in a FeatureCollection and returns a clear summary.
 * Returns a product-facing string that explains the geometry type composition.
 * 
 * Examples:
 * - Single Polygon type: "Polygon"
 * - Single MultiPolygon type: "MultiPolygon"  
 * - Mixed Polygon + MultiPolygon: "Mixed (Polygon, MultiPolygon)"
 * - Point + Polygon: "Mixed (Point, Polygon)"
 */
export const getGeometryTypeSummary = (fc: GeoJSON.FeatureCollection | null): string | undefined => {
  if (!fc || fc.features.length === 0) {
    return undefined
  }

  // Collect all unique geometry types
  const typeCounts = new Map<string, number>()
  let hasValidGeometry = false

  for (const feature of fc.features) {
    if (feature.geometry?.type) {
      hasValidGeometry = true
      const type = feature.geometry.type
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
    }
  }

  if (!hasValidGeometry) {
    return undefined
  }

  // Sort types by count (most common first)
  const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])
  const uniqueTypes = sortedTypes.map(([type]) => type)

  // If only one type, return it directly
  if (uniqueTypes.length === 1) {
    return uniqueTypes[0]
  }

  // If multiple types, return a clear mixed summary
  // Format as "Mixed (Type1, Type2, ...)"
  return `Mixed (${uniqueTypes.join(', ')})`
}

/**
 * Gets a display-friendly geometry type label for an artifact.
 * Uses the actual feature data to compute a summary if available,
 * otherwise falls back to the stored geometryType field.
 */
export const getArtifactGeometryLabel = (artifact: { data?: unknown; geometryType?: string }): string => {
  if (artifact.data && isFeatureCollection(artifact.data)) {
    const summary = getGeometryTypeSummary(artifact.data)
    if (summary) {
      return summary
    }
  }
  return artifact.geometryType ?? 'non-spatial'
}
