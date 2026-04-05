type Geometry = GeoJSON.Geometry

class WkbReader {
  private view: DataView
  private offset = 0

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  readGeometry(): Geometry {
    const littleEndian = this.readUint8() === 1
    const rawType = this.readUint32(littleEndian)
    const hasZ = (rawType & 0x80000000) !== 0
    const geometryType = rawType & 0x0fffffff

    switch (geometryType) {
      case 1:
        return { type: 'Point', coordinates: this.readPointCoords(littleEndian, hasZ) }
      case 2:
        return { type: 'LineString', coordinates: this.readPointArray(littleEndian, hasZ) }
      case 3:
        return { type: 'Polygon', coordinates: this.readPolygonCoords(littleEndian, hasZ) }
      case 4:
        return { type: 'MultiPoint', coordinates: this.readChildPoints(littleEndian) }
      case 5:
        return { type: 'MultiLineString', coordinates: this.readChildLineStrings(littleEndian) }
      case 6:
        return { type: 'MultiPolygon', coordinates: this.readChildPolygons(littleEndian) }
      case 7:
        return { type: 'GeometryCollection', geometries: this.readGeometryCollection(littleEndian) }
      default:
        throw new Error(`Unsupported WKB geometry type: ${geometryType}`)
    }
  }

  private readGeometryCollection(littleEndian: boolean): Geometry[] {
    const count = this.readUint32(littleEndian)
    const geometries: Geometry[] = []
    for (let i = 0; i < count; i += 1) {
      geometries.push(this.readGeometry())
    }
    return geometries
  }

  private readChildPoints(littleEndian: boolean): GeoJSON.Position[] {
    const count = this.readUint32(littleEndian)
    const coords: GeoJSON.Position[] = []
    for (let i = 0; i < count; i += 1) {
      const geometry = this.readGeometry()
      if (geometry.type === 'Point') coords.push(geometry.coordinates)
    }
    return coords
  }

  private readChildLineStrings(littleEndian: boolean): GeoJSON.Position[][] {
    const count = this.readUint32(littleEndian)
    const coords: GeoJSON.Position[][] = []
    for (let i = 0; i < count; i += 1) {
      const geometry = this.readGeometry()
      if (geometry.type === 'LineString') coords.push(geometry.coordinates)
    }
    return coords
  }

  private readChildPolygons(littleEndian: boolean): GeoJSON.Position[][][] {
    const count = this.readUint32(littleEndian)
    const coords: GeoJSON.Position[][][] = []
    for (let i = 0; i < count; i += 1) {
      const geometry = this.readGeometry()
      if (geometry.type === 'Polygon') coords.push(geometry.coordinates)
    }
    return coords
  }

  private readPolygonCoords(littleEndian: boolean, hasZ: boolean): GeoJSON.Position[][] {
    const rings = this.readUint32(littleEndian)
    const coords: GeoJSON.Position[][] = []
    for (let i = 0; i < rings; i += 1) {
      coords.push(this.readPointArray(littleEndian, hasZ))
    }
    return coords
  }

  private readPointArray(littleEndian: boolean, hasZ: boolean): GeoJSON.Position[] {
    const count = this.readUint32(littleEndian)
    const coords: GeoJSON.Position[] = []
    for (let i = 0; i < count; i += 1) {
      coords.push(this.readPointCoords(littleEndian, hasZ))
    }
    return coords
  }

  private readPointCoords(littleEndian: boolean, hasZ: boolean): GeoJSON.Position {
    const x = this.readFloat64(littleEndian)
    const y = this.readFloat64(littleEndian)
    if (hasZ) {
      const z = this.readFloat64(littleEndian)
      return [x, y, z]
    }
    return [x, y]
  }

  private readUint8(): number {
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  private readUint32(littleEndian: boolean): number {
    const value = this.view.getUint32(this.offset, littleEndian)
    this.offset += 4
    return value
  }

  private readFloat64(littleEndian: boolean): number {
    const value = this.view.getFloat64(this.offset, littleEndian)
    this.offset += 8
    return value
  }
}

const hexToUint8Array = (hex: string): Uint8Array => {
  const normalized = hex.startsWith('\\x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16)
  }
  return bytes
}

const normalizeWkbInput = (value: unknown): Uint8Array | null => {
  if (!value) return null
  if (value instanceof Uint8Array) return value
  if (Array.isArray(value) && value.every((v) => typeof v === 'number')) return new Uint8Array(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^(\\x)?[0-9a-fA-F]+$/.test(trimmed)) return hexToUint8Array(trimmed)
  }
  if (typeof value === 'object' && 'data' in (value as Record<string, unknown>)) {
    return normalizeWkbInput((value as Record<string, unknown>).data)
  }
  return null
}

// Recursively convert BigInt values to numbers or strings for JSON serialization
const sanitizeBigInt = (value: unknown): unknown => {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') {
    // Convert BigInt to number if safe, otherwise to string
    const num = Number(value)
    if (Number.isSafeInteger(num)) return num
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeBigInt)
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeBigInt(val)
    }
    return result
  }
  return value
}

export const decodeWkbGeometry = (value: unknown): Geometry | null => {
  // First try WKB format
  const bytes = normalizeWkbInput(value)
  if (bytes) {
    try {
      return new WkbReader(bytes).readGeometry()
    } catch {
      // WKB decode failed, try JSON
    }
  }
  
  // Try JSON string format (e.g., from GeoJSON-derived tables)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        return parsed as Geometry
      }
    } catch {
      // Not valid JSON
    }
  }
  
  // Try parsing directly if it's an object
  if (value && typeof value === 'object') {
    try {
      const asObj = value as Record<string, unknown>
      if ('type' in asObj && 'coordinates' in asObj) {
        return value as Geometry
      }
    } catch {
      // Not valid geometry object
    }
  }
  
  return null
}

export const rowsToFeatureCollection = (
  rows: Record<string, unknown>[],
  geometryColumn: string,
): GeoJSON.FeatureCollection | null => {
  const features: GeoJSON.Feature[] = rows
    .map((row) => {
      const geometry = decodeWkbGeometry(row[geometryColumn])
      if (!geometry) return null
      // Sanitize BigInt values before spreading into properties
      const sanitizedRow = sanitizeBigInt(row) as Record<string, unknown>
      const properties = { ...sanitizedRow }
      delete properties[geometryColumn]
      return {
        type: 'Feature',
        properties,
        geometry,
      } as GeoJSON.Feature
    })
    .filter((feature): feature is GeoJSON.Feature => feature !== null)

  if (features.length === 0) return null
  return { type: 'FeatureCollection', features }
}
