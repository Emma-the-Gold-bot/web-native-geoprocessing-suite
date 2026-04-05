import type { OperationDefinition } from './types';

const SINGLE_GEOMETRY = { inputArity: 1 as const };
const POLYGON_ONLY = ['Polygon', 'MultiPolygon'];

export const OPERATION_REGISTRY: Record<string, OperationDefinition> = {
  buffer: {
    id: 'buffer',
    label: 'Buffer',
    family: 'single-geometry',
    supportTier: 'validated_local',
    geometryContract: {
      ...SINGLE_GEOMETRY,
    },
    crsContract: {
      sourceRequirement: 'allow-any',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'none',
    },
    warningCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'APPROXIMATE_OP', 'LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['UNSUPPORTED_GEOMETRY'],
    uiHints: {
      summary: 'Validated on the current engine seam with approximation caveats.',
    },
  },
  centroid: {
    id: 'centroid',
    label: 'Centroid',
    family: 'single-geometry',
    supportTier: 'validated_local',
    geometryContract: {
      ...SINGLE_GEOMETRY,
    },
    crsContract: {
      sourceRequirement: 'allow-any',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'none',
      outputGeometryFamilies: ['Point'],
    },
    warningCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['UNSUPPORTED_GEOMETRY'],
    uiHints: {
      summary: 'Implemented and validated on the current engine seam for the current support path.',
    },
  },
  'convex-hull-v1': {
    id: 'convex-hull-v1',
    label: 'Convex Hull',
    family: 'single-geometry',
    supportTier: 'partial',
    geometryContract: {
      ...SINGLE_GEOMETRY,
      allowedSourceGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'none',
      outputGeometryFamilies: POLYGON_ONLY,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'UNSUPPORTED_GEOMETRY'],
    uiHints: {
      summary: 'Narrow convex hull v1 for single polygon or multipolygon artifacts with known stored CRS only.',
    },
  },
  'envelope-v1': {
    id: 'envelope-v1',
    label: 'Envelope',
    family: 'single-geometry',
    supportTier: 'partial',
    geometryContract: {
      ...SINGLE_GEOMETRY,
      allowedSourceGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'none',
      outputGeometryFamilies: ['Polygon'],
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'UNSUPPORTED_GEOMETRY'],
    uiHints: {
      summary: 'Narrow envelope v1 for single polygon or multipolygon artifacts with known stored CRS only.',
    },
  },
  'simplify-v1': {
    id: 'simplify-v1',
    label: 'Simplify',
    family: 'single-geometry',
    supportTier: 'partial',
    geometryContract: {
      ...SINGLE_GEOMETRY,
      allowedSourceGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'source-only',
      outputGeometryFamilies: POLYGON_ONLY,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'UNSUPPORTED_GEOMETRY'],
    uiHints: {
      summary: 'Narrow simplify v1 for single polygon or multipolygon artifacts with known stored CRS only and user-provided tolerance in source CRS units.',
    },
  },
  'dissolve-grouped-v1': {
    id: 'dissolve-grouped-v1',
    label: 'Grouped dissolve',
    family: 'aggregation',
    supportTier: 'partial',
    geometryContract: {
      ...SINGLE_GEOMETRY,
      allowedSourceGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'grouping-field-only',
      outputGeometryFamilies: POLYGON_ONLY,
    },
    aggregationContract: {
      scope: 'grouped-by-attribute',
      groupingFieldMode: 'required-attribute',
      outputCardinality: 'single-output-artifact',
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'UNSUPPORTED_GEOMETRY'],
    uiHints: {
      summary: 'Narrow grouped dissolve v1: one selected polygon or multipolygon artifact, exactly one explicit grouping attribute, known stored CRS only, same-CRS output, grouping field preserved, and no broader union semantics implied.',
    },
  },
  reproject: {
    id: 'reproject',
    label: 'Reproject',
    family: 'crs',
    supportTier: 'validated_local',
    runtimeSensitive: true,
    geometryContract: {
      ...SINGLE_GEOMETRY,
    },
    crsContract: {
      sourceRequirement: 'require-known-or-explicit',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'explicit-transform',
        futureEligibility: 'implemented-explicit-transform',
        outputCrsMode: 'explicit-target',
      },
    },
    outputContract: {
      attributePolicy: 'none',
    },
    warningCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'TRANSFORM_RUNTIME_UNAVAILABLE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING'],
    uiHints: {
      summary: 'Real coordinate transformation exists and is validated in the hardened local runtime.',
    },
  },
  'clip-v1': {
    id: 'clip-v1',
    label: 'Clip',
    family: 'topology-two-input',
    supportTier: 'partial',
    geometryContract: {
      inputArity: 2,
      allowedSourceGeometry: POLYGON_ONLY,
      allowedSecondaryGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      secondaryRequirement: 'require-known',
      exactMatchRequirement: 'source-secondary-known-match',
      transformPlanning: {
        executionRequirement: 'same-crs-only',
        futureEligibility: 'candidate-via-explicit-plan',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'source-only',
      emptyResultMode: 'honest-empty-success',
      outputGeometryFamilies: POLYGON_ONLY,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE', 'CRS_MISMATCH', 'EMPTY_TOPOLOGY_RESULT'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'CRS_MISMATCH', 'UNSUPPORTED_GEOMETRY', 'CLIP_MASK_REQUIRED'],
    uiHints: {
      secondaryRoleLabel: 'mask',
      summary: 'Narrow polygon-mask clip v1 requiring known matching CRS.',
    },
  },
  'intersect-v1': {
    id: 'intersect-v1',
    label: 'Intersect',
    family: 'topology-two-input',
    supportTier: 'partial',
    geometryContract: {
      inputArity: 2,
      allowedSourceGeometry: POLYGON_ONLY,
      allowedSecondaryGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      secondaryRequirement: 'require-known',
      exactMatchRequirement: 'source-secondary-known-match',
      transformPlanning: {
        executionRequirement: 'same-crs-only',
        futureEligibility: 'candidate-via-explicit-plan',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'source-only',
      emptyResultMode: 'honest-empty-success',
      outputGeometryFamilies: POLYGON_ONLY,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE', 'CRS_MISMATCH', 'EMPTY_TOPOLOGY_RESULT'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'CRS_MISMATCH', 'UNSUPPORTED_GEOMETRY', 'OVERLAY_ARTIFACT_REQUIRED'],
    uiHints: {
      secondaryRoleLabel: 'overlay',
      summary: 'Narrow polygon/multipolygon intersect v1 requiring known matching CRS and preserving source attributes only.',
    },
  },
  'area-v1': {
    id: 'area-v1',
    label: 'Area',
    family: 'measurement',
    supportTier: 'partial',
    geometryContract: {
      ...SINGLE_GEOMETRY,
      allowedSourceGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'source-only',
      outputKind: 'measurement-table',
    },
    measurementContract: {
      measurementKind: 'area',
      valueField: 'area_value',
      unitField: 'area_unit',
      areaUnit: 'square-meters',
      preservesSourceRows: true,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'UNSUPPORTED_GEOMETRY', 'MISLEADING_UNIT_SEMANTICS'],
    uiHints: {
      summary: 'Narrow area v1 for polygon/multipolygon artifacts with known stored CRS and honest square-meter output only when unit semantics are trustworthy.',
    },
  },
  'perimeter-v1': {
    id: 'perimeter-v1',
    label: 'Perimeter',
    family: 'measurement',
    supportTier: 'partial',
    geometryContract: {
      ...SINGLE_GEOMETRY,
      allowedSourceGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'source-only',
      outputKind: 'measurement-table',
    },
    measurementContract: {
      measurementKind: 'perimeter',
      valueField: 'perimeter_value',
      unitField: 'perimeter_unit',
      perimeterUnit: 'meters',
      preservesSourceRows: true,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'UNSUPPORTED_GEOMETRY', 'MISLEADING_UNIT_SEMANTICS'],
    uiHints: {
      summary: 'Narrow perimeter v1 for polygon/multipolygon artifacts with known stored CRS and honest meter output only when unit semantics are trustworthy.',
    },
  },
  'compactness-v1': {
    id: 'compactness-v1',
    label: 'Compactness',
    family: 'measurement',
    supportTier: 'partial',
    geometryContract: {
      ...SINGLE_GEOMETRY,
      allowedSourceGeometry: POLYGON_ONLY,
    },
    crsContract: {
      sourceRequirement: 'require-known',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'source-only',
      outputKind: 'measurement-table',
    },
    measurementContract: {
      measurementKind: 'compactness',
      valueField: 'compactness_value',
      unitField: 'compactness_unit',
      compactnessUnit: 'unitless',
      preservesSourceRows: true,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['CRS_UNKNOWN', 'CRS_MISSING', 'UNSUPPORTED_GEOMETRY', 'MISLEADING_UNIT_SEMANTICS'],
    uiHints: {
      summary: 'Narrow compactness v1 for polygon/multipolygon artifacts with known stored CRS and honest unitless output only when planar meter-based area/perimeter semantics are trustworthy.',
    },
  },
  'attribute-join-v1': {
    id: 'attribute-join-v1',
    label: 'Attribute join',
    family: 'topology-two-input',
    supportTier: 'partial',
    geometryContract: {
      inputArity: 2,
    },
    crsContract: {
      sourceRequirement: 'allow-any',
      secondaryRequirement: 'allow-any',
      exactMatchRequirement: 'none',
      transformPlanning: {
        executionRequirement: 'none',
        futureEligibility: 'none',
        outputCrsMode: 'inherit-source',
      },
    },
    outputContract: {
      attributePolicy: 'explicit-right-fields-left-join-equality',
      outputKind: 'spatial-artifact',
    },
    joinContract: {
      joinMode: 'left',
      predicate: 'exact-equality',
      sourceKeyCount: 1,
      secondaryKeyCount: 1,
      selectedFieldMode: 'explicit-right-field-selection',
      collisionPolicy: 'right-fields-prefixed',
      outputGeometryMode: 'preserve-source-geometry',
      unmatchedSourceRows: 'preserve-with-null-right-fields',
      matchedSecondaryRows: 'first-match-only',
      supportsSpatialPredicates: false,
      supportsFuzzyMatching: false,
      supportsMultiKey: false,
    },
    warningCodes: ['LIMITED_SUPPORT_ENVELOPE'],
    refusalCodes: ['OVERLAY_ARTIFACT_REQUIRED'],
    uiHints: {
      secondaryRoleLabel: 'join table',
      summary: 'Narrow attribute join v1: exact-equality left join only, one key per side, explicit right-field selection, right-field prefixing on collision, and left geometry/output kind preserved.',
    },
  },
};

export function getOperationDefinition(id: string): OperationDefinition | undefined {
  return OPERATION_REGISTRY[id];
}
