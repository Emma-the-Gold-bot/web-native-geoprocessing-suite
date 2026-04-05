/**
 * Spatial Operation Warning Codes
 * 
 * Typed codes for warnings already in play. These provide internal type safety
 * while preserving current user-facing copy.
 * 
 * Warning codes:
 * - CRS_UNKNOWN: CRS explicitly set to "unknown" 
 * - CRS_MISSING: CRS not specified at all
 * - APPROXIMATE_OP: Operation uses approximation (e.g., degree-based buffer)
 * - UNSUPPORTED_GEOMETRY: Geometry type not well-supported for operation
 * - RENDER_UNAVAILABLE: Cannot render geometry on map
 * - GEOMETRY_DECODE_FAILED: Could not decode geometry from source
 */

// ============================================================================
// Warning Code Type
// ============================================================================

export type WarningCode =
  | 'CRS_UNKNOWN'
  | 'CRS_MISSING'
  | 'APPROXIMATE_OP'
  | 'UNSUPPORTED_GEOMETRY'
  | 'RENDER_UNAVAILABLE'
  | 'GEOMETRY_DECODE_FAILED'
  | 'TRANSFORM_RUNTIME_UNAVAILABLE'
  | 'DISPLAY_TRANSFORM_FALLBACK'
  | 'LIMITED_SUPPORT_ENVELOPE'
  | 'TOPOLOGY_OP_NOT_SUPPORTED'
  | 'CLIP_MASK_REQUIRED'
  | 'CRS_MISMATCH'
  | 'TOPOLOGY_OPERATION_FAILED'
  | 'EMPTY_TOPOLOGY_RESULT'
  | 'OVERLAY_ARTIFACT_REQUIRED'
  | 'MISLEADING_UNIT_SEMANTICS';

// ============================================================================
// Warning Code Configuration
// ============================================================================

export interface WarningCodeConfig {
  code: WarningCode;
  defaultSeverity: 'info' | 'caution' | 'serious' | 'blocking';
  defaultTitle: string;
  // Function to generate the message with context
  message: (context?: Record<string, unknown>) => string;
}

const WARNING_CODE_CONFIGS: Record<WarningCode, WarningCodeConfig> = {
  CRS_UNKNOWN: {
    code: 'CRS_UNKNOWN',
    defaultSeverity: 'serious',
    defaultTitle: 'CRS is unknown',
    message: (ctx) =>
      ctx?.operation
        ? `Geometry operation (${ctx.operation}) performed with unknown CRS. Results may be incorrect. Use Reproject to explicitly set a known CRS (e.g., EPSG:4326) before geometry operations.`
        : 'Geometry operation performed with unknown CRS. Results may be incorrect. Use Reproject to explicitly set a known CRS (e.g., EPSG:4326) before geometry operations.',
  },

  CRS_MISSING: {
    code: 'CRS_MISSING',
    defaultSeverity: 'serious',
    defaultTitle: 'CRS not specified',
    message: (ctx) =>
      ctx?.operation
        ? `Geometry operation (${ctx.operation}) performed without explicit CRS. Results may be incorrect if coordinates are not in WGS84 (EPSG:4326). Use Reproject to explicitly set a CRS.`
        : 'Geometry operation performed without explicit CRS. Results may be incorrect if coordinates are not in WGS84 (EPSG:4326). Use Reproject to explicitly set a CRS.',
  },

  APPROXIMATE_OP: {
    code: 'APPROXIMATE_OP',
    defaultSeverity: 'caution',
    defaultTitle: 'Approximate operation',
    message: (ctx) => {
      const op = ctx?.operation as string | undefined;
      if (op === 'buffer') {
        return 'Buffer is computed using degree-based approximation. For accurate geodesic buffers, reproject coordinates to a projected CRS first.';
      }
      return 'This operation uses approximation. Results may differ from precise geodesic calculations.';
    },
  },

  UNSUPPORTED_GEOMETRY: {
    code: 'UNSUPPORTED_GEOMETRY',
    defaultSeverity: 'caution',
    defaultTitle: 'Unsupported geometry type',
    message: (ctx) => {
      const geomTypes = ctx?.geometryTypes as string | undefined;
      const operation = ctx?.operation as string | undefined;
      if (geomTypes && operation) {
        return `Input contains ${geomTypes} geometries. ${operation} is reliably supported only for Polygon and MultiPolygon. Results for other geometry types may be empty, null, or semantically incorrect.`;
      }
      return 'Input geometry type is not well-supported for this operation. Results may be unexpected.';
    },
  },

  RENDER_UNAVAILABLE: {
    code: 'RENDER_UNAVAILABLE',
    defaultSeverity: 'caution',
    defaultTitle: 'Map rendering unavailable',
    message: (ctx) => {
      const reason = ctx?.reason as string | undefined;
      return reason
        ? `This artifact cannot currently be rendered in the map pane: ${reason}`
        : 'This artifact cannot currently be rendered in the map pane.';
    },
  },

  GEOMETRY_DECODE_FAILED: {
    code: 'GEOMETRY_DECODE_FAILED',
    defaultSeverity: 'caution',
    defaultTitle: 'Geometry decode failed',
    message: (ctx) => {
      const format = ctx?.format as string | undefined;
      return format
        ? `Could not decode geometry from ${format} format. The artifact remains queryable but cannot be rendered on the map.`
        : 'Could not decode geometry from the source format. The artifact remains queryable but cannot be rendered on the map.';
    },
  },

  TRANSFORM_RUNTIME_UNAVAILABLE: {
    code: 'TRANSFORM_RUNTIME_UNAVAILABLE',
    defaultSeverity: 'serious',
    defaultTitle: 'Transform runtime unavailable',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      return operation
        ? `${operation} is unavailable in the current runtime environment. Coordinate transformation support is validated only in the hardened local runtime right now.`
        : 'Coordinate transformation is unavailable in the current runtime environment. This path is validated only in the hardened local runtime right now.';
    },
  },

  DISPLAY_TRANSFORM_FALLBACK: {
    code: 'DISPLAY_TRANSFORM_FALLBACK',
    defaultSeverity: 'caution',
    defaultTitle: 'Display transform fallback',
    message: (ctx) => {
      const reason = ctx?.reason as string | undefined;
      return reason
        ? `Display normalization fell back to original coordinates: ${reason}`
        : 'Display normalization fell back to original coordinates. Stored artifact CRS remains unchanged, but map framing may be unreliable.';
    },
  },

  LIMITED_SUPPORT_ENVELOPE: {
    code: 'LIMITED_SUPPORT_ENVELOPE',
    defaultSeverity: 'info',
    defaultTitle: 'Limited support envelope',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      return operation
        ? `${operation} is currently validated only on the documented support path. Broader geometry, CRS, or runtime coverage is not yet claimed.`
        : 'This path is currently validated only on the documented support path. Broader coverage is not yet claimed.';
    },
  },

  TOPOLOGY_OP_NOT_SUPPORTED: {
    code: 'TOPOLOGY_OP_NOT_SUPPORTED',
    defaultSeverity: 'blocking',
    defaultTitle: 'Operation not yet supported',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      return operation
        ? `${operation} is not yet available in the current product support envelope.`
        : 'This topology operation is not yet available in the current product support envelope.';
    },
  },

  CLIP_MASK_REQUIRED: {
    code: 'CLIP_MASK_REQUIRED',
    defaultSeverity: 'blocking',
    defaultTitle: 'Clip mask required',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      return operation
        ? `${operation} requires a clip mask artifact to be selected. Please select a second artifact as the clip mask.`
        : 'Clip operation requires a clip mask artifact to be selected. Please select a second artifact as the clip mask.';
    },
  },

  CRS_MISMATCH: {
    code: 'CRS_MISMATCH',
    defaultSeverity: 'blocking',
    defaultTitle: 'CRS mismatch',
    message: (ctx) => {
      const sourceCrs = ctx?.sourceCrs as string | undefined;
      const secondaryCrs = (ctx?.secondaryCrs as string | undefined) ?? (ctx?.maskCrs as string | undefined) ?? (ctx?.overlayCrs as string | undefined);
      const secondaryRoleLabel = (ctx?.secondaryRoleLabel as string | undefined) ?? (ctx?.overlayCrs ? 'overlay' : 'clip mask');
      const operationLabel = (ctx?.operation as string | undefined) ?? 'This operation';
      return `Source artifact CRS (${sourceCrs ?? 'unknown'}) does not match ${secondaryRoleLabel} CRS (${secondaryCrs ?? 'unknown'}). ${operationLabel.charAt(0).toUpperCase() + operationLabel.slice(1)} v1 requires both artifacts to have the same known CRS.`;
    },
  },

  TOPOLOGY_OPERATION_FAILED: {
    code: 'TOPOLOGY_OPERATION_FAILED',
    defaultSeverity: 'serious',
    defaultTitle: 'Topology operation failed',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      const reason = ctx?.reason as string | undefined;
      return operation
        ? `${operation} failed${reason ? `: ${reason}` : '.'}. Check that input geometries are valid.`
        : `Topology operation failed${reason ? `: ${reason}` : '.'}. Check that input geometries are valid.`;
    },
  },

  EMPTY_TOPOLOGY_RESULT: {
    code: 'EMPTY_TOPOLOGY_RESULT',
    defaultSeverity: 'info',
    defaultTitle: 'Clip result is intentionally empty',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      return operation
        ? `${operation} completed, but the source and mask did not overlap. The stored CRS remains unchanged and the result artifact is intentionally empty.`
        : 'The topology operation completed, but the input geometries did not overlap. The stored CRS remains unchanged and the result artifact is intentionally empty.';
    },
  },

  OVERLAY_ARTIFACT_REQUIRED: {
    code: 'OVERLAY_ARTIFACT_REQUIRED',
    defaultSeverity: 'blocking',
    defaultTitle: 'Overlay artifact required',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      return operation
        ? `${operation} requires a second artifact to be selected as the overlay. Please select an overlay artifact.`
        : 'This operation requires a second artifact to be selected as the overlay. Please select an overlay artifact.';
    },
  },

  MISLEADING_UNIT_SEMANTICS: {
    code: 'MISLEADING_UNIT_SEMANTICS',
    defaultSeverity: 'blocking',
    defaultTitle: 'Unit semantics would be misleading',
    message: (ctx) => {
      const operation = ctx?.operation as string | undefined;
      const crs = ctx?.crs as string | undefined;
      const normalizedOperation = operation?.toLowerCase();
      const isPerimeter = normalizedOperation?.includes('perimeter') ?? false;
      const isCompactness = normalizedOperation?.includes('compactness') ?? false;
      const measurementLabel = isCompactness ? 'compactness' : isPerimeter ? 'perimeter' : 'area';
      const article = isCompactness ? 'a' : isPerimeter ? 'a' : 'an';
      const valueLabel = isCompactness ? 'compactness value' : isPerimeter ? 'perimeter value' : 'area value';
      return operation
        ? `${operation} refuses to return ${article} ${valueLabel} for stored CRS ${crs ?? 'unknown'} because unit semantics would be misleading on the current shipped path. Reproject to a CRS with known linear units before measuring ${measurementLabel}.`
        : `This operation refuses to return ${article} ${valueLabel} for stored CRS ${crs ?? 'unknown'} because unit semantics would be misleading on the current shipped path. Reproject to a CRS with known linear units before measuring ${measurementLabel}.`;
    },
  },
};

// ============================================================================
// Warning Factory
// ============================================================================

/**
 * Generate a WarningRef from a warning code with optional context
 */
export function createWarningFromCode(
  code: WarningCode,
  overrides?: {
    severity?: 'info' | 'caution' | 'serious' | 'blocking';
    title?: string;
    message?: string;
    scope?: 'active' | 'inherited' | 'historical';
  },
  context?: Record<string, unknown>
): import('../../types').WarningRef {
  const config = WARNING_CODE_CONFIGS[code];
  const id = `warning_${code.toLowerCase()}_${Date.now()}`;

  return {
    id,
    code, // Promoted from factory convention to canonical warning field
    severity: overrides?.severity ?? config.defaultSeverity,
    title: overrides?.title ?? config.defaultTitle,
    message: overrides?.message ?? config.message(context),
    scope: overrides?.scope ?? 'active',
  };
}

/**
 * Get all available warning codes (for documentation/validation)
 */
export function getWarningCodes(): WarningCode[] {
  return Object.keys(WARNING_CODE_CONFIGS) as WarningCode[];
}

/**
 * Get config for a specific warning code
 */
export function getWarningCodeConfig(code: WarningCode): WarningCodeConfig {
  return WARNING_CODE_CONFIGS[code];
}
