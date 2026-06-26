import { useEffect, useRef } from 'react'
import type { Artifact, LayerSettings } from '../types'
import maplibregl from 'maplibre-gl'
import { isFeatureCollection } from '../lib/utils'
import { getDisplayFeatureCollection } from '../lib/spatial'

type SetBottomTab = (tab: 'table' | 'sql' | 'results') => void

export function useMapSync(
  map: maplibregl.Map | null,
  artifacts: Artifact[],
  layerSettings: Record<string, LayerSettings>,
  selectedArtifactId: string | null,
  selectedRowIndex: number | null,
  setSelectedRowIndex: (index: number | null) => void,
  setBottomTab: SetBottomTab,
) {
  const mapSyncGenerationRef = useRef(0)

  useEffect(() => {
    if (!map) return

    const spatialArtifacts = artifacts.filter(
      (artifact) => artifact.spatial && isFeatureCollection(artifact.data),
    )
    spatialArtifacts.sort((a, b) => {
      const za = layerSettings[a.id]?.zIndex ?? 0
      const zb = layerSettings[b.id]?.zIndex ?? 0
      return za - zb
    })

    let cancelled = false
    const syncGeneration = ++mapSyncGenerationRef.current

    const mapSyncDebug = (() => {
      if (typeof window === 'undefined') {
        return {
          disableBaseSourceSync: false,
          disableSelectedSourceSync: false,
          disableDisplayTransformForBase: false,
          disableDisplayTransformForSelected: false,
          disableLayerSync: false,
          disablePolygonFill: false,
          polygonLineOnly: false,
          disableAutoFit: false,
          logMapSync: false,
        }
      }
      const params = new URLSearchParams(window.location.search)
      const has = (key: string) => params.get(key) === '1'
      return {
        disableBaseSourceSync: has('debugDisableBaseSourceSync'),
        disableSelectedSourceSync: has('debugDisableSelectedSourceSync'),
        disableDisplayTransformForBase: has('debugDisableDisplayTransformForBase'),
        disableDisplayTransformForSelected: has('debugDisableDisplayTransformForSelected'),
        disableLayerSync: has('debugDisableLayerSync'),
        disablePolygonFill: has('debugDisablePolygonFill'),
        polygonLineOnly: has('debugPolygonLineOnly'),
        disableAutoFit: has('debugDisableAutoFit'),
        logMapSync: has('debugLogMapSync'),
      }
    })()

    const syncLayers = async () => {
      if (mapSyncDebug.logMapSync) {
        console.log('[App][map-sync] start', {
          syncGeneration,
          selectedArtifactId,
          artifactIds: spatialArtifacts.map((artifact) => artifact.id),
        })
      }
      const existingSourceIds = new Set(Object.keys(map.getStyle().sources))
      for (const [index, artifact] of spatialArtifacts.entries()) {
        if (cancelled) return
        const sourceId = `artifact-source-${artifact.id}`
        const fillId = `artifact-fill-${artifact.id}`
        const lineId = `artifact-line-${artifact.id}`
        const pointId = `artifact-point-${artifact.id}`
        const selectedSourceId = `artifact-selected-source-${artifact.id}`
        const selectedFillId = `artifact-selected-fill-${artifact.id}`
        const selectedLineId = `artifact-selected-line-${artifact.id}`
        const selectedPointId = `artifact-selected-point-${artifact.id}`
        const isSelected = artifact.id === selectedArtifactId
        if (mapSyncDebug.logMapSync) {
          console.log('[App][map-sync] artifact', {
            syncGeneration,
            artifactId: artifact.id,
            artifactName: artifact.name,
            isSelected,
            geometryType: artifact.geometryType,
            featureCount: isFeatureCollection(artifact.data) ? artifact.data.features.length : null,
          })
        }

        const settings = layerSettings[artifact.id] ?? { visible: true, opacity: 1.0, zIndex: 0 }
        const baseOpacity = settings.opacity
        const fillOpacity = isSelected ? Math.min(baseOpacity + 0.2, 1.0) : baseOpacity
        const lineWidth = isSelected ? 3 : 2
        const fillColor = isSelected ? '#3b82f6' : '#14b8a6'
        const lineColor = isSelected ? '#93c5fd' : '#5eead4'

        const needsDisplayTransform = !mapSyncDebug.disableDisplayTransformForBase
          || !mapSyncDebug.disableDisplayTransformForSelected
        const displayFeatureCollectionResult = needsDisplayTransform
          ? await getDisplayFeatureCollection(artifact)
          : null
        if (cancelled || mapSyncGenerationRef.current !== syncGeneration) return
        const displayFeatureCollection = displayFeatureCollectionResult?.featureCollection ?? (artifact.data as GeoJSON.FeatureCollection)
        const rawFeatureCollection = artifact.data as GeoJSON.FeatureCollection

        const withFeatureIndex = (featureCollection: GeoJSON.FeatureCollection) => ({
          type: 'FeatureCollection' as const,
          features: featureCollection.features.map((feature, featureIndex) => ({
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              __featureIndex: featureIndex,
            },
          })),
        })

        const baseFeatureCollection = withFeatureIndex(
          mapSyncDebug.disableDisplayTransformForBase ? rawFeatureCollection : displayFeatureCollection,
        )
        const selectedBaseFeatureCollection = withFeatureIndex(
          mapSyncDebug.disableDisplayTransformForSelected ? rawFeatureCollection : displayFeatureCollection,
        )

        if (!mapSyncDebug.disableBaseSourceSync) {
          if (mapSyncDebug.logMapSync) {
            console.log('[App][map-sync] base-source', {
              artifactId: artifact.id,
              sourceId,
              action: map.getSource(sourceId) ? 'setData' : 'addSource',
              featureCount: baseFeatureCollection.features.length,
            })
          }
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: 'geojson',
              data: baseFeatureCollection,
            })
          } else {
            ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(baseFeatureCollection)
          }
        }

        const selectedFeatureCollection =
          artifact.id === selectedArtifactId &&
          selectedRowIndex !== null &&
          isFeatureCollection(selectedBaseFeatureCollection) &&
          selectedBaseFeatureCollection.features[selectedRowIndex]
            ? {
                type: 'FeatureCollection' as const,
                features: [selectedBaseFeatureCollection.features[selectedRowIndex]],
              }
            : { type: 'FeatureCollection' as const, features: [] }

        if (!mapSyncDebug.disableSelectedSourceSync) {
          if (mapSyncDebug.logMapSync) {
            console.log('[App][map-sync] selected-source', {
              artifactId: artifact.id,
              selectedSourceId,
              action: map.getSource(selectedSourceId) ? 'setData' : 'addSource',
              featureCount: selectedFeatureCollection.features.length,
              isSelected,
            })
          }
          if (!map.getSource(selectedSourceId)) {
            map.addSource(selectedSourceId, {
              type: 'geojson',
              data: selectedFeatureCollection,
            })
          } else {
            ;(map.getSource(selectedSourceId) as maplibregl.GeoJSONSource).setData(selectedFeatureCollection)
          }
        }

        if (mapSyncDebug.disableLayerSync) {
          existingSourceIds.delete(sourceId)
          existingSourceIds.delete(selectedSourceId)
          continue
        }

        if (!settings.visible) {
          if (map.getLayer(fillId)) map.removeLayer(fillId)
          if (map.getLayer(lineId)) map.removeLayer(lineId)
          if (map.getLayer(pointId)) map.removeLayer(pointId)
          if (map.getLayer(selectedFillId)) map.removeLayer(selectedFillId)
          if (map.getLayer(selectedLineId)) map.removeLayer(selectedLineId)
          if (map.getLayer(selectedPointId)) map.removeLayer(selectedPointId)
          existingSourceIds.delete(sourceId)
          existingSourceIds.delete(selectedSourceId)
          continue
        }

        const beforeId = undefined
        const geometryType = artifact.geometryType ?? ''
        const baseSource = map.getSource(sourceId)
        const selectedSource = map.getSource(selectedSourceId)

        if (geometryType.includes('Polygon')) {
          const shouldRenderPolygonFill = !mapSyncDebug.disablePolygonFill && !mapSyncDebug.polygonLineOnly

          if (shouldRenderPolygonFill && baseSource) {
            if (!map.getLayer(fillId)) {
              map.addLayer(
                {
                  id: fillId,
                  type: 'fill',
                  source: sourceId,
                  paint: {
                    'fill-color': fillColor,
                    'fill-opacity': fillOpacity,
                  },
                },
                beforeId,
              )
              map.on('click', fillId, (event) => {
                if (artifact.id !== selectedArtifactId) return
                const featureIndex = event.features?.[0]?.properties?.__featureIndex
                if (featureIndex !== undefined) {
                  setSelectedRowIndex(Number(featureIndex))
                  setBottomTab('table')
                }
              })
            } else {
              map.setPaintProperty(fillId, 'fill-color', fillColor)
              map.setPaintProperty(fillId, 'fill-opacity', fillOpacity)
            }
          } else if (map.getLayer(fillId)) {
            map.removeLayer(fillId)
          }

          if (baseSource && !map.getLayer(lineId)) {
            map.addLayer({
              id: lineId,
              type: 'line',
              source: sourceId,
              paint: { 'line-color': lineColor, 'line-width': lineWidth },
            })
            map.on('click', lineId, (event) => {
              if (artifact.id !== selectedArtifactId) return
              const featureIndex = event.features?.[0]?.properties?.__featureIndex
              if (featureIndex !== undefined) {
                setSelectedRowIndex(Number(featureIndex))
                setBottomTab('table')
              }
            })
          } else {
            map.setPaintProperty(lineId, 'line-color', lineColor)
            map.setPaintProperty(lineId, 'line-width', lineWidth)
          }

          if (shouldRenderPolygonFill && selectedSource) {
            if (!map.getLayer(selectedFillId)) {
              map.addLayer({
                id: selectedFillId,
                type: 'fill',
                source: selectedSourceId,
                paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.25 },
              })
            }
          } else if (map.getLayer(selectedFillId)) {
            map.removeLayer(selectedFillId)
          }
          if (selectedSource && !map.getLayer(selectedLineId)) {
            map.addLayer({
              id: selectedLineId,
              type: 'line',
              source: selectedSourceId,
              paint: { 'line-color': '#fbbf24', 'line-width': 4 },
            })
          }
        }

        if (geometryType.includes('LineString')) {
          if (baseSource && !map.getLayer(lineId)) {
            map.addLayer({
              id: lineId,
              type: 'line',
              source: sourceId,
              paint: { 'line-color': fillColor, 'line-width': lineWidth + 1 },
            })
          } else {
            map.setPaintProperty(lineId, 'line-color', fillColor)
            map.setPaintProperty(lineId, 'line-width', lineWidth + 1)
          }

          if (selectedSource && !map.getLayer(selectedLineId)) {
            map.addLayer({
              id: selectedLineId,
              type: 'line',
              source: selectedSourceId,
              paint: { 'line-color': '#fbbf24', 'line-width': 5 },
            })
          }
        }

        if (geometryType.includes('Point')) {
          if (baseSource && !map.getLayer(pointId)) {
            map.addLayer({
              id: pointId,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-radius': isSelected ? 8 : 6,
                'circle-color': fillColor,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
              },
            })
            map.on('click', pointId, (event) => {
              if (artifact.id !== selectedArtifactId) return
              const featureIndex = event.features?.[0]?.properties?.__featureIndex
              if (featureIndex !== undefined) {
                setSelectedRowIndex(Number(featureIndex))
                setBottomTab('table')
              }
            })
          } else {
            map.setPaintProperty(pointId, 'circle-radius', isSelected ? 8 : 6)
            map.setPaintProperty(pointId, 'circle-color', fillColor)
            map.setPaintProperty(pointId, 'circle-stroke-color', '#ffffff')
            map.setPaintProperty(pointId, 'circle-stroke-width', 2)
          }

          if (selectedSource && !map.getLayer(selectedPointId)) {
            map.addLayer({
              id: selectedPointId,
              type: 'circle',
              source: selectedSourceId,
              paint: {
                'circle-radius': 10,
                'circle-color': '#f59e0b',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 3,
              },
            })
          }
        }

        existingSourceIds.delete(sourceId)
        existingSourceIds.delete(selectedSourceId)
        void index
      }

      // Z-order reconciliation
      const sortedVisibleArtifacts = spatialArtifacts
        .filter((a) => layerSettings[a.id]?.visible !== false)
        .sort((a, b) => {
          const za = layerSettings[a.id]?.zIndex ?? 0
          const zb = layerSettings[b.id]?.zIndex ?? 0
          return za - zb
        })

      for (let i = 0; i < sortedVisibleArtifacts.length; i++) {
        const a = sortedVisibleArtifacts[i]
        const nextA = sortedVisibleArtifacts[i + 1]

        const aFillId = `artifact-fill-${a.id}`
        const aLineId = `artifact-line-${a.id}`
        const aPointId = `artifact-point-${a.id}`

        let beforeFillId: string | undefined
        if (nextA) {
          beforeFillId = `artifact-fill-${nextA.id}`
        }

        if (map.getLayer(aFillId) && beforeFillId && map.getLayer(beforeFillId)) {
          map.moveLayer(aFillId, beforeFillId)
        } else if (map.getLayer(aFillId)) {
          map.moveLayer(aFillId)
        }
        if (map.getLayer(aLineId) && beforeFillId && map.getLayer(beforeFillId)) {
          map.moveLayer(aLineId, beforeFillId)
        } else if (map.getLayer(aLineId)) {
          map.moveLayer(aLineId)
        }
        if (map.getLayer(aPointId) && beforeFillId && map.getLayer(beforeFillId)) {
          map.moveLayer(aPointId, beforeFillId)
        } else if (map.getLayer(aPointId)) {
          map.moveLayer(aPointId)
        }
      }

      for (const sourceId of existingSourceIds) {
        if (!sourceId.startsWith('artifact-')) continue
        if (sourceId.startsWith('__')) continue
        const aFillId = sourceId.replace('-source-', '-fill-')
        const aLineId = sourceId.replace('-source-', '-line-')
        const aPointId = sourceId.replace('-source-', '-point-')
        const aSelectedFillId = sourceId.replace('-source-', '-selected-fill-')
        const aSelectedLineId = sourceId.replace('-source-', '-selected-line-')
        const aSelectedPointId = sourceId.replace('-source-', '-selected-point-')
        if (mapSyncDebug.logMapSync) {
          console.log('[App][map-sync] cleanup-source', {
            sourceId,
            hasFill: Boolean(map.getLayer(aFillId)),
            hasLine: Boolean(map.getLayer(aLineId)),
            hasPoint: Boolean(map.getLayer(aPointId)),
            hasSelectedFill: Boolean(map.getLayer(aSelectedFillId)),
            hasSelectedLine: Boolean(map.getLayer(aSelectedLineId)),
            hasSelectedPoint: Boolean(map.getLayer(aSelectedPointId)),
            hasSource: Boolean(map.getSource(sourceId)),
          })
        }
        if (map.getLayer(aSelectedFillId)) map.removeLayer(aSelectedFillId)
        if (map.getLayer(aSelectedLineId)) map.removeLayer(aSelectedLineId)
        if (map.getLayer(aSelectedPointId)) map.removeLayer(aSelectedPointId)
        if (map.getLayer(aFillId)) map.removeLayer(aFillId)
        if (map.getLayer(aLineId)) map.removeLayer(aLineId)
        if (map.getLayer(aPointId)) map.removeLayer(aPointId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }
    }

    const trySync = () => {
      if (cancelled) return
      if (!map.loaded()) {
        setTimeout(trySync, 50)
        return
      }
      syncLayers().catch((e) => {
        console.warn('[App] Error syncing layers:', e)
        setTimeout(trySync, 100)
      })
    }

    trySync()

    return () => {
      cancelled = true
    }
  }, [map, artifacts, selectedArtifactId, layerSettings, selectedRowIndex, setSelectedRowIndex, setBottomTab])
}
