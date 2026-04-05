export const sampleGeoJson: GeoJSON.FeatureCollection & { crs?: { type: string; properties: { name: string } } } = {
  type: 'FeatureCollection',
  crs: {
    type: 'name',
    properties: { name: 'EPSG:4326' },
  },
  features: [
    {
      type: 'Feature',
      properties: { id: 1, name: 'North Parcel', category: 'residential', area_acres: 4.2 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-122.42, 37.78], [-122.418, 37.78], [-122.418, 37.782], [-122.42, 37.782], [-122.42, 37.78]]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 2, name: 'South Parcel', category: 'commercial', area_acres: 6.1 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-122.421, 37.776], [-122.4185, 37.776], [-122.4185, 37.778], [-122.421, 37.778], [-122.421, 37.776]]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 3, name: 'East Parcel', category: 'industrial', area_acres: 8.8 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-122.4165, 37.7785], [-122.414, 37.7785], [-122.414, 37.781], [-122.4165, 37.781], [-122.4165, 37.7785]]],
      },
    },
  ],
}
