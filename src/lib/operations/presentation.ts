import type { Artifact, ArtifactOutputKind, WarningRef } from '../../types';
import type { AttributeJoinFieldSelection, OperationDefinition } from './types';
import { getOperationDefinition } from './registry';
import { getArtifactGeometryLabel } from '../../lib/utils';

export interface SingleInputOperationPresentation {
  operationId: string;
  title: string;
  summary: string;
  geometryStatement?: string;
  crsStatement: string;
  outputSemantics: string;
  outputKind: ArtifactOutputKind;
  outputKindLabel: string;
  outputKindDescription: string;
  attributeSemantics?: string;
  refusalTitle: string;
  refusalPrefix: string;
  warningTitle?: string;
}

export interface MeasurementOperationPresentation extends SingleInputOperationPresentation {
  unitSemanticsStatement: string;
}


export interface OperationInfoWarningPresentation {
  title: string;
  message: string;
  severity: 'info' | 'caution' | 'serious' | 'blocking';
}

export interface MeasurementUnitDisclosure {
  valueField: string;
  unitField: string;
  unitValue: 'square_meters' | 'meters' | 'unitless';
  note: string;
}

export interface AggregationOperationPresentation extends SingleInputOperationPresentation {
  scopeStatement: string;
  groupingStatement: string;
  outputCardinalityStatement: string;
}

export interface AttributeJoinPresentation {
  operationId: 'attribute-join-v1';
  title: string;
  summary: string;
  contractStatement: string;
  outputSemantics: string;
  outputKind: ArtifactOutputKind;
  outputKindLabel: string;
  outputKindDescription: string;
  lineageStatement: string;
  collisionStatement: string;
  refusalTitle: string;
  refusalPrefix: string;
}

function describeAllowedGeometry(allowed?: string[]): string | undefined {
  if (!allowed?.length) return undefined;
  if (allowed.length === 1) return allowed[0];
  if (allowed.length === 2) return `${allowed[0]} or ${allowed[1]}`;
  return `${allowed.slice(0, -1).join(', ')}, or ${allowed[allowed.length - 1]}`;
}

function getCrsStatement(definition: OperationDefinition): string {
  const contract = definition.crsContract;
  if (definition.id === 'reproject') {
    return 'Reproject requires a real source CRS choice and writes the chosen target CRS onto the derived artifact. Display normalization to WGS84 remains display-only and does not mutate stored CRS.';
  }

  if (contract.sourceRequirement === 'require-known') {
    return `${definition.label} requires known stored CRS on the current shipped path. It does not auto-transform or infer CRS.`;
  }

  if (contract.sourceRequirement === 'require-known-or-explicit') {
    return `${definition.label} requires known stored CRS or an explicit source CRS before execution.`;
  }

  return `${definition.label} does not require known stored CRS to run on the current path, but unknown or missing CRS still reduces trust in the result.`;
}

function getOutputKind(definition: OperationDefinition): ArtifactOutputKind {
  if (definition.outputContract.outputKind === 'measurement-table') {
    return 'measurement-table';
  }

  return definition.outputContract.outputKind ?? 'spatial-artifact';
}

function getOutputKindPresentation(outputKind: ArtifactOutputKind): { label: string; description: string } {
  switch (outputKind) {
    case 'measurement-table':
      return {
        label: 'Measurement table',
        description: 'This output is intentionally tabular and non-spatial. It records measurements, not derived geometry.',
      };
    case 'tabular-artifact':
      return {
        label: 'Tabular artifact',
        description: 'This output is a non-spatial table artifact rather than a map-renderable geometry layer.',
      };
    case 'spatial-artifact':
    default:
      return {
        label: 'Spatial artifact',
        description: 'This output is a geometry-bearing derived artifact that can participate in map rendering when data is renderable.',
      };
  }
}

function getOutputSemantics(definition: OperationDefinition): string {
  const outputGeometry = describeAllowedGeometry(definition.outputContract.outputGeometryFamilies);
  const attributePolicy = definition.outputContract.attributePolicy;

  if (definition.id === 'buffer') {
    return 'Buffer creates a derived artifact around the source geometry. On the current shipped path it does not broaden claims beyond the validated local runtime, and distance behavior remains approximation-sensitive.';
  }

  if (definition.id === 'centroid') {
    return 'Centroid returns a derived point artifact. It stays on the current validated engine seam and does not imply broader support than the current product contract.';
  }

  if (definition.id === 'convex-hull-v1') {
    return 'Convex hull v1 creates one derived polygon hull artifact in the same stored CRS as the source. It intentionally does not preserve per-feature source attributes and makes no broader claim about lines, points, mixed geometry, or transform-aware execution.';
  }

  if (definition.id === 'envelope-v1') {
    return 'Envelope v1 creates one derived polygon artifact representing the source artifact\'s axis-aligned bounding box in the same stored CRS as the source. It intentionally does not preserve per-feature source attributes and makes no broader claim about minimum rotated rectangles, transform-aware execution, or non-polygon inputs.';
  }

  if (definition.id === 'simplify-v1') {
    return 'Simplify v1 creates a derived polygon or multipolygon artifact in the same stored CRS as the source and preserves source attributes on surviving features. The user-provided tolerance is interpreted in source CRS units. This path does not auto-transform and does not claim broader topology-preserving behavior.';
  }

  if (definition.id === 'dissolve-grouped-v1') {
    return 'Grouped dissolve v1 creates one derived spatial artifact that contains one polygon or multipolygon feature per distinct value of the selected grouping field. It preserves the selected grouping field only, preserves the known stored CRS from the source artifact, does not auto-transform, and does not imply any broader dissolve or union semantics beyond grouped dissolve on the current path.';
  }

  if (definition.id === 'reproject') {
    return 'This operation creates a new derived artifact with transformed coordinates in the chosen target CRS. Metadata-only CRS assignment remains a separate future feature.';
  }

  if (definition.id === 'area-v1') {
    return 'Area v1 creates a derived measurement table rather than a new geometry artifact. It preserves source rows, writes one area value per input feature, and emits area values only in square meters on the current shipped path.';
  }

  if (definition.id === 'perimeter-v1') {
    return 'Perimeter v1 creates a derived measurement table rather than a new geometry artifact. It preserves source rows, writes one perimeter value per input feature, and emits perimeter values only in meters on the current shipped path.';
  }

  if (definition.id === 'compactness-v1') {
    return 'Compactness v1 creates a derived measurement table rather than a new geometry artifact. It preserves source rows, writes one compactness value per input feature, and emits only a unitless compactness ratio on the current shipped path.';
  }

  return `${definition.label} creates a derived artifact${outputGeometry ? ` with ${outputGeometry} output geometry` : ''}${attributePolicy === 'none' ? ' and does not preserve source attributes in the output.' : attributePolicy === 'source-only' ? ' and preserves source attributes only.' : attributePolicy === 'grouping-field-only' ? ' and preserves only the selected grouping field in the output.' : '.'}`;
}

function getGeometryStatement(definition: OperationDefinition): string | undefined {
  const allowed = describeAllowedGeometry(definition.geometryContract.allowedSourceGeometry);
  if (!allowed) return undefined;

  if (definition.id === 'convex-hull-v1') {
    return `Convex hull v1 supports only ${allowed} source artifacts.`;
  }

  if (definition.id === 'envelope-v1') {
    return `Envelope v1 supports only ${allowed} source artifacts.`;
  }

  if (definition.id === 'simplify-v1') {
    return `Simplify v1 supports only ${allowed} source artifacts.`;
  }

  if (definition.id === 'area-v1') {
    return `Area v1 supports only ${allowed} source artifacts.`;
  }

  if (definition.id === 'perimeter-v1') {
    return `Perimeter v1 supports only ${allowed} source artifacts.`;
  }

  if (definition.id === 'compactness-v1') {
    return `Compactness v1 supports only ${allowed} source artifacts.`;
  }

  if (definition.id === 'dissolve-grouped-v1') {
    return `Grouped dissolve v1 is honestly supported only for ${allowed} source artifacts on the current path.`;
  }

  return `${definition.label} is declared for ${allowed} source geometries on the current shipped path.`;
}

function getAggregationScopeStatement(definition: OperationDefinition): string | undefined {
  if (definition.family !== 'aggregation') return undefined;

  if (definition.id === 'dissolve-grouped-v1') {
    return 'This aggregation runs in grouped-by-attribute scope inside one derived output artifact.';
  }

  if (definition.aggregationContract?.scope === 'global-only') {
    return 'This aggregation runs in global-only scope.';
  }

  if (definition.aggregationContract?.scope === 'grouped-by-attribute') {
    return 'This aggregation is declared for grouped-by-attribute scope.';
  }

  return 'Aggregation scope is not declared.';
}

function getAggregationGroupingStatement(definition: OperationDefinition): string | undefined {
  if (definition.family !== 'aggregation') return undefined;

  if (definition.id === 'dissolve-grouped-v1') {
    return 'This aggregation requires exactly one explicit grouping attribute field from the selected source artifact.';
  }

  if (definition.aggregationContract?.groupingFieldMode === 'none') {
    return 'This aggregation accepts no grouping field on the current path. Grouped dissolve or attribute-driven grouping is not supported or implied.';
  }

  if (definition.aggregationContract?.groupingFieldMode === 'required-attribute') {
    return 'This aggregation requires an explicit grouping attribute.';
  }

  return 'Grouping-field behavior is not declared.';
}

function getAggregationOutputCardinalityStatement(definition: OperationDefinition): string | undefined {
  if (definition.family !== 'aggregation') return undefined;

  if (definition.id === 'dissolve-grouped-v1') {
    return 'This aggregation produces one derived output artifact containing one dissolved feature per group value.';
  }

  if (definition.aggregationContract?.outputCardinality === 'single-output-artifact') {
    return 'This aggregation produces one derived output artifact for the full run.';
  }

  if (definition.aggregationContract?.outputCardinality === 'one-output-per-group') {
    return 'This aggregation produces one derived output artifact per group.';
  }

  return 'Aggregation output cardinality is not declared.';
}

function getRefusalCopy(definition: OperationDefinition): { refusalTitle: string; refusalPrefix: string } {
  if (definition.id === 'convex-hull-v1') {
    return {
      refusalTitle: 'Convex hull refusal',
      refusalPrefix: 'Convex hull refused',
    };
  }

  if (definition.id === 'envelope-v1') {
    return {
      refusalTitle: 'Envelope refusal',
      refusalPrefix: 'Envelope refused',
    };
  }

  if (definition.id === 'simplify-v1') {
    return {
      refusalTitle: 'Simplify refusal',
      refusalPrefix: 'Simplify refused',
    };
  }

  return {
    refusalTitle: `${definition.label} refusal`,
    refusalPrefix: `${definition.label} refused`,
  };
}

export function getSingleInputOperationPresentation(operationId: string): SingleInputOperationPresentation | null {
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.geometryContract.inputArity !== 1) return null;

  const refusal = getRefusalCopy(definition);

  const outputKind = getOutputKind(definition);
  const outputKindPresentation = getOutputKindPresentation(outputKind);

  return {
    operationId: definition.id,
    title: definition.label,
    summary: definition.uiHints?.summary ?? `${definition.label} on the current support path.`,
    geometryStatement: getGeometryStatement(definition),
    crsStatement: getCrsStatement(definition),
    outputSemantics: getOutputSemantics(definition),
    outputKind,
    outputKindLabel: outputKindPresentation.label,
    outputKindDescription: outputKindPresentation.description,
    attributeSemantics: definition.outputContract.attributePolicy,
    refusalTitle: refusal.refusalTitle,
    refusalPrefix: refusal.refusalPrefix,
    warningTitle: 'Warnings',
  };
}

export function getAggregationOperationPresentation(operationId: string): AggregationOperationPresentation | null {
  const base = getSingleInputOperationPresentation(operationId);
  const definition = getOperationDefinition(operationId);
  if (!base || !definition || definition.family !== 'aggregation') return null;

  return {
    ...base,
    scopeStatement: getAggregationScopeStatement(definition) ?? 'Aggregation scope is not declared.',
    groupingStatement: getAggregationGroupingStatement(definition) ?? 'Grouping-field behavior is not declared.',
    outputCardinalityStatement: getAggregationOutputCardinalityStatement(definition) ?? 'Aggregation output cardinality is not declared.',
  };
}

export function getMeasurementOperationPresentation(operationId: string): MeasurementOperationPresentation | null {
  const base = getSingleInputOperationPresentation(operationId);
  const definition = getOperationDefinition(operationId);
  if (!base || !definition || definition.family !== 'measurement') return null;

  const unitSemanticsStatement = definition.id === 'area-v1'
    ? 'Area v1 reports square meters only when the stored CRS has trustworthy meter-based planar units on the shipped path. It refuses cases where unit semantics would be misleading rather than bluffing.'
    : definition.id === 'perimeter-v1'
      ? 'Perimeter v1 reports meters only when the stored CRS has trustworthy meter-based planar units on the shipped path. It refuses cases where unit semantics would be misleading rather than bluffing.'
      : definition.id === 'compactness-v1'
        ? 'Compactness v1 reports a unitless Polsby–Popper-style compactness ratio only when the stored CRS has trustworthy meter-based planar units on the shipped path. It refuses cases where area/perimeter semantics would be misleading rather than bluffing.'
        : 'Measurement unit semantics are defined by the operation contract.';

  return {
    ...base,
    unitSemanticsStatement,
  };
}

export function getSingleInputGeometrySupport(operationId: string, artifact: Artifact): {
  label: string;
  sourceGeometry?: string | null;
  sourceAllowed: boolean;
  secondaryAllowed: boolean;
  unsupportedMessage: string;
} | null {
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.geometryContract.inputArity !== 1) return null;

  const sourceGeometry = artifact.geometryType;
  const allowed = definition.geometryContract.allowedSourceGeometry;
  if (!allowed?.length) return null;

  return {
    label: 'Source geometry',
    sourceGeometry,
    sourceAllowed: Boolean(sourceGeometry && allowed.includes(sourceGeometry)),
    secondaryAllowed: true,
    unsupportedMessage: `${definition.label} currently supports only ${describeAllowedGeometry(allowed)} inputs; ${getArtifactGeometryLabel(artifact)} stays outside that contract.`,
  };
}


export function getSingleInputOperationInfoWarning(operationId: string): OperationInfoWarningPresentation | null {
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.geometryContract.inputArity !== 1) return null;

  if (definition.id === 'buffer') {
    return {
      title: 'Approximate buffer',
      severity: 'info',
      message: 'The current buffer implementation uses degree-based approximation and is validated only on the current local support path. Accurate geodesic buffers remain future work.',
    };
  }

  if (definition.id === 'centroid') {
    return {
      title: 'Centroid calculation',
      severity: 'info',
      message: 'Centroid is calculated on the current validated support path. Multi-feature collections use the current engine behavior rather than a broader GIS contract claim.',
    };
  }

  if (definition.id === 'dissolve-grouped-v1') {
    return {
      title: 'Narrow grouped dissolve v1',
      severity: 'info',
      message: 'Grouped dissolve v1 is intentionally narrow: polygon or multipolygon source only, exactly one explicit grouping field, known stored CRS required, stored CRS preserved, no auto-transform, one derived artifact containing one dissolved feature per group, and no broader union semantics implied.',
    };
  }

  if (definition.family === 'measurement') {
    const presentation = getMeasurementOperationPresentation(operationId);
    return {
      title: `Narrow ${definition.label.toLowerCase()} v1`,
      severity: 'info',
      message: `${definition.label} v1 is intentionally narrow: ${presentation?.geometryStatement?.replace(/\.$/, '') ?? 'single-input only'}, known stored CRS only, and ${presentation?.outputKindLabel?.toLowerCase() ?? 'measurement table'} output only when unit semantics stay trustworthy. It returns a measurement table, not a geometry artifact, and refuses misleading unit semantics instead of bluffing.`,
    };
  }

  if (definition.geometryContract.allowedSourceGeometry?.length || definition.supportTier === 'partial') {
    return {
      title: `Narrow ${definition.label.toLowerCase()} v1`,
      severity: 'info',
      message: definition.uiHints?.summary ?? `${definition.label} stays on the current narrow shipped path.`,
    };
  }

  return null;
}

export function getMeasurementUnitDisclosure(operationId: string): MeasurementUnitDisclosure | null {
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.family !== 'measurement' || !definition.measurementContract) return null;

  if (definition.measurementContract.measurementKind === 'area') {
    return {
      valueField: definition.measurementContract.valueField,
      unitField: definition.measurementContract.unitField,
      unitValue: 'square_meters',
      note: 'The current shipped path only emits square_meters when stored CRS unit semantics are trustworthy.',
    };
  }

  if (definition.measurementContract.measurementKind === 'perimeter') {
    return {
      valueField: definition.measurementContract.valueField,
      unitField: definition.measurementContract.unitField,
      unitValue: 'meters',
      note: 'The current shipped path only emits meters when stored CRS unit semantics are trustworthy.',
    };
  }

  return {
    valueField: definition.measurementContract.valueField,
    unitField: definition.measurementContract.unitField,
    unitValue: 'unitless',
    note: 'The current shipped path only emits unitless when stored CRS unit semantics are trustworthy for the underlying planar area and perimeter math.',
  };
}

export function getMeasurementUnitRefusalWarning(operationId: string, artifact: Artifact): WarningRef | null {
  const definition = getOperationDefinition(operationId);
  if (!definition || definition.family !== 'measurement') return null;
  if (artifact.crs && artifact.crs !== 'unknown' && artifact.crs !== 'EPSG:4326') return null;

  const presentation = getMeasurementOperationPresentation(operationId);
  return {
    id: `${artifact.id}-${operationId}-unit-warning`,
    code: 'MISLEADING_UNIT_SEMANTICS',
    severity: 'blocking',
    scope: 'active',
    title: 'Unit semantics would be misleading',
    message: presentation?.unitSemanticsStatement?.replace('reports', 'refuses').replace('It refuses cases where unit semantics would be misleading rather than bluffing.', `Stored CRS ${artifact.crs ?? 'unknown'} stays outside the trustworthy-unit contract. Reproject to a CRS with trustworthy planar meter units before measuring ${definition.label.toLowerCase()}.`)
      ?? `${definition.label} refuses stored CRS ${artifact.crs ?? 'unknown'} on the current shipped path because unit semantics would be misleading here. Reproject to a CRS with trustworthy planar meter units before measuring ${definition.label.toLowerCase()}.`,
  };
}

export function getAttributeJoinOutputFieldSelection(params: {
  sourceFieldNames: string[];
  rightFieldNames: string[];
  selectedRightFields: string[];
}): AttributeJoinFieldSelection[] {
  const sourceFieldSet = new Set(params.sourceFieldNames);
  return params.selectedRightFields.map((sourceField) => ({
    sourceField,
    outputField: sourceFieldSet.has(sourceField) ? `join_${sourceField}` : sourceField,
  }));
}

export function getAttributeJoinPresentation(): AttributeJoinPresentation | null {
  const definition = getOperationDefinition('attribute-join-v1');
  if (!definition || !definition.joinContract) return null;

  const outputKind = definition.outputContract.outputKind ?? 'spatial-artifact';
  const outputKindPresentation = getOutputKindPresentation(outputKind);

  return {
    operationId: 'attribute-join-v1',
    title: definition.label,
    summary: definition.uiHints?.summary ?? 'Narrow attribute join v1.',
    contractStatement: 'Attribute join v1 is exact-equality only, left-join only, one join key per side, and explicit right-field selection only. It does not support spatial predicates, fuzzy matching, or multi-key joins.',
    outputSemantics: 'The output preserves the left artifact\'s output kind and geometry semantics while enriching rows with explicitly selected right-side fields only. Unmatched left rows remain in the output with null right-side values.',
    outputKind,
    outputKindLabel: outputKindPresentation.label,
    outputKindDescription: 'Attribute join preserves the selected left artifact\'s output kind. Spatial left artifacts stay spatial; non-spatial left artifacts stay non-spatial.',
    lineageStatement: 'History records both inputs, the chosen key fields, the explicit right-field selections, and the first-match-only duplicate-right-key behavior used on the current shipped path.',
    collisionStatement: 'If a selected right-side field name collides with an existing left-side field, the output field is prefixed with join_.',
    refusalTitle: 'Attribute join refusal',
    refusalPrefix: 'Attribute join refused',
  };
}

export function getOperationSuccessStatusMessage(operationId: string, artifact: Artifact, sourceArtifact?: Artifact): string | null {
  const definition = getOperationDefinition(operationId);
  if (!definition) return null;

  if (definition.id === 'dissolve-grouped-v1') {
    return `Grouped dissolve created: ${artifact.name}. Output kind is ${getOutputKindPresentation(getOutputKind(definition)).label.toLowerCase()}; one dissolved feature was written per group value, and only the selected grouping field is preserved in v1.`;
  }

  if (definition.family === 'measurement') {
    const unitDisclosure = getMeasurementUnitDisclosure(operationId);
    return `${definition.label} created: ${artifact.name}. Output is a measurement table with ${unitDisclosure?.unitValue.replace('_', '-') ?? 'declared'} values, not a geometry artifact.`;
  }

  if (sourceArtifact) {
    return `${definition.label} created: ${artifact.name}.`;
  }

  return `${definition.label} created: ${artifact.name}.`;
}
