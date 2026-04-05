# Support Envelope — Web-native geoprocessing suite

## Purpose

This file is the canonical support contract for geometry operations, CRS handling, and display transformation.

It exists to prevent the product, tests, and docs from drifting into flat "supported / unsupported" language when the real runtime truth is tiered.

## Support tiers

- **universal** — must hold across environments; this is product-truth contract behavior
- **validated_local** — verified in the hardened local runtime used for current development
- **environment_sensitive** — behavior depends on runtime/browser/hosting conditions and must not be presented as universal
- **partial** — implemented with narrow scope or explicit caveats
- **not_supported** — not available and should refuse clearly

## Operation matrix

| Operation | Tier | Honest claim ceiling | Refusal / warning conditions |
| --- | --- | --- | --- |
| Buffer | validated_local | Implemented on the current engine seam. Results are usable on the validated path, but current distance behavior remains approximation-sensitive. | Warn on missing/unknown CRS, approximation caveat, unsupported geometry families, malformed geometry. |
| Centroid | validated_local | Implemented and validated on the current engine seam for the current support path. | Warn on missing/unknown CRS and unsupported input conditions. |
| Convex Hull | partial | Implemented for narrow v1 contract: single-input polygon/multipolygon source only. Requires known stored CRS. Produces one derived polygon hull in the same stored CRS and does not preserve source attributes. | Refuse on missing/unknown CRS, unsupported geometry families, or non-spatial input shape. |
| Envelope | partial | Implemented for narrow v1 contract: single-input polygon/multipolygon source only. Requires known stored CRS. Produces one derived polygon bounding box in the same stored CRS and does not preserve source attributes. | Refuse on missing/unknown CRS, unsupported geometry families, or non-spatial input shape. |
| Simplify | partial | Implemented for narrow v1 contract: single-input polygon/multipolygon source only. Requires known stored CRS. Uses a user-provided tolerance interpreted in source CRS units. Preserves stored CRS and source attributes on the current path. Makes no auto-transform or topology-preserving claim. | Refuse on missing/unknown CRS, unsupported geometry families, invalid tolerance, or non-spatial input shape. |
| Area | partial | Implemented for narrow v1 contract: single-input polygon/multipolygon source only. Requires known stored CRS. Produces a non-spatial measurement table with one output row per input feature, `area_value` and `area_unit` fields, and square-meter output only when the stored CRS is on the current trusted planar-meter allowlist. | Refuse on missing/unknown CRS, unsupported geometry families, misleading unit semantics (for example EPSG:4326), or non-spatial input shape. |
| Perimeter | partial | Implemented for narrow v1 contract: single-input polygon/multipolygon source only. Requires known stored CRS. Produces a non-spatial measurement table with one output row per input feature, `perimeter_value` and `perimeter_unit` fields, and meter output only when the stored CRS is on the current trusted planar-meter allowlist. | Refuse on missing/unknown CRS, unsupported geometry families, misleading unit semantics (for example EPSG:4326), or non-spatial input shape. |
| Compactness | partial | Implemented for narrow v1 contract: single-input polygon/multipolygon source only. Requires known stored CRS. Produces a non-spatial measurement table with one output row per input feature, `compactness_value` and `compactness_unit` fields, and unitless compactness output only when the stored CRS is on the current trusted planar-meter allowlist because the underlying planar area/perimeter math must remain honest. | Refuse on missing/unknown CRS, unsupported geometry families, misleading unit semantics (for example EPSG:4326), or non-spatial input shape. |
| Global dissolve | partial | Implemented as **global dissolve only**. | Warn on missing/unknown CRS and non-polygon geometry families. |
| Grouped dissolve | partial | Implemented for narrow v1 contract: one polygon/multipolygon source artifact grouped by exactly one explicit attribute field. Requires known stored CRS. Produces one derived spatial artifact containing one polygon or multipolygon feature per distinct grouping-field value, preserves the grouping field only, preserves stored CRS, and makes no broader union semantics claim. | Refuse on missing/unknown CRS, unsupported geometry families, missing grouping field, or unsupported input shape. |
| Reproject | verified=`validated_local`, runtimeSensitive=true | Real coordinate transformation exists and is validated in the hardened local runtime. Outside that runtime, behavior may fail due to PROJ-WASM/runtime constraints. | Refuse or warn on missing/unknown CRS, CRS mismatch, unavailable transform runtime, failed transform path. |
| Display transformation | environment_sensitive | Projected artifacts may be transformed to WGS84 **for display framing only**. Stored artifact CRS metadata remains unchanged. | Warn when display transform falls back because CRS runtime is unavailable or transform fails. |
| CRS assign | universal | Assigning CRS updates metadata only and does not move coordinates. | Warn when assigning over conflicting metadata. |
| Clip | partial | Implemented for narrow v1 contract: polygon/multipolygon source clipped by polygon/multipolygon mask. Requires known matching CRS. Source attributes are preserved for surviving features on the current path. | Refuse on missing/unknown CRS, CRS mismatch, unsupported geometry families, missing mask artifact, or unsupported input shape. Surface no-overlap cases as honest empty results, not failures. |
| Intersect | partial | Implemented for narrow v1 contract: polygon/multipolygon source intersected with polygon/multipolygon overlay. Requires known matching CRS. Source attributes only are preserved on the current path; overlay attributes are not merged. | Refuse on missing/unknown CRS, CRS mismatch, unsupported geometry families, missing overlay artifact, or unsupported input shape. Surface no-overlap cases as honest empty results, not failures. |
| Attribute join | partial | Implemented for narrow v1 contract: exact-equality only, left-join only, one key per side, and explicit right-field selection only. Duplicate right-side keys resolve by first match only on the current shipped path. Unmatched left rows are preserved with nulls for selected right-side fields. Right-field collisions are written with a `join_` prefix, and the left artifact's output kind / geometry semantics are preserved. | Refuse when no join artifact is selected, when either selected key is missing, when no right-side field is selected, when a selected right-side field is missing, or when output names collide. No spatial predicates, fuzzy matching, multi-key joins, or broader merge semantics are supported. |

## Universal contract behavior

These statements should remain true across environments:

- `known`, `unknown`, and `missing` CRS states are distinct.
- Unknown or missing CRS must not imply false certainty.
- Assign CRS is distinct from reproject / transform.
- Contract-level transform planning may describe future eligibility, but it must not imply that automatic pre-op transforms already exist.
- Global dissolve must be labeled as global-only.
- Grouped dissolve must not be described more broadly than its narrow v1 contract: exactly one explicit grouping field, polygon/multipolygon only, known stored CRS required, grouping-field-only attribute preservation, stored CRS preserved, no auto-transform, and no broader union semantics implied.
- Convex hull must not be described more broadly than its narrow single-input polygon/multipolygon v1 contract.
- Envelope must not be described more broadly than its narrow single-input polygon/multipolygon v1 contract.
- Simplify must not be described more broadly than its narrow single-input polygon/multipolygon v1 contract, with user-provided tolerance interpreted in source CRS units, stored CRS preserved, source attributes preserved, no auto-transform, and no topology-preserving claim.
- Area must not be described more broadly than its narrow single-input polygon/multipolygon measurement v1 contract: known stored CRS required, no auto-transform, no geodesic claim, one measurement-table row per input feature, `area_value` + `area_unit` fields, and square-meter output only on the current trusted planar-meter CRS allowlist.
- Perimeter must not be described more broadly than its narrow single-input polygon/multipolygon measurement v1 contract: known stored CRS required, no auto-transform, no geodesic claim, one measurement-table row per input feature, `perimeter_value` + `perimeter_unit` fields, and meter output only on the current trusted planar-meter CRS allowlist.
- Compactness must not be described more broadly than its narrow single-input polygon/multipolygon measurement v1 contract: known stored CRS required, no auto-transform, no geodesic claim, one measurement-table row per input feature, `compactness_value` + `compactness_unit` fields, and unitless output only on the current trusted planar-meter CRS allowlist because the underlying planar area/perimeter math must remain honest.
- Intersect must not be described more broadly than its narrow polygon/polygonal-overlay v1 contract.
- Attribute join must not be described more broadly than its narrow v1 contract: exact-equality only, left-join only, one key per side, explicit right-field selection, first-match-only duplicate-right behavior, null fill for unmatched left rows, `join_` collision prefixing, no spatial predicates, no fuzzy matching, no multi-key joins, and preservation of the left artifact's output kind / geometry semantics.
- Clip must not be described more broadly than its narrow polygon-mask v1 contract.
- Malformed geometry must fail gracefully rather than silently succeeding.

## Validation buckets

The validation story is now intentionally tiered. Keep script naming and docs aligned with these buckets.

### A. Preview-safe browser-runtime checks

These are the highest-value product checks right now because they exercise the built app as shipped-like runtime, not `/src/*` fantasy paths.

Current preview-safe browser checks:
- `scripts/final-e2e-qa.mjs`
- `scripts/test-envelope.mjs`
- `scripts/run-operation-validations-browser.mjs`
- `scripts/clip-refusal-browser-check.mjs`
- `scripts/clip-success-browser-check.mjs`
- `scripts/check-crs-confidence-browser.mjs`
- `scripts/intersect-refusal-browser-check.mjs`
- `scripts/intersect-success-browser-check.mjs`
- `scripts/run-operation-validations-browser.mjs` (includes area measurement metadata + runtime truth on the current validation path)

`run-operation-validations-browser.mjs` should now be read as a **bucketed** proof: cheap universal contract truth (registry / topology-family / transform-planning metadata) plus validated-local runtime truth (engine-backed ops, reprojection, clip confidence propagation).

These should verify the product surface honestly:
- import / persistence / query / export flow
- support-envelope runtime checks exposed via `window.geoValidation`
- convex hull narrow single-input success path
- envelope narrow single-input success path
- simplify narrow single-input success path
- area narrow single-input measurement path
- perimeter narrow single-input measurement path
- compactness narrow single-input measurement path
- clip refusal seam
- clip non-empty success path
- clip empty-result behavior
- intersect non-empty success path
- intersect empty-result behavior
- CRS confidence/provenance presentation

### B. Universal contract checks

These must hold across environments even when runtime-sensitive browser behavior varies:
- missing CRS is not treated as projected
- unknown CRS is not treated as projected
- assign-vs-transform semantics remain distinct
- malformed geometry is handled gracefully
- warnings use typed codes
- unsupported operations refuse clearly
- convex hull refuses outside its narrow contract
- envelope refuses outside its narrow contract
- simplify refuses outside its narrow contract
- area refuses outside its narrow contract
- perimeter refuses outside its narrow contract
- clip refuses outside its narrow contract
- intersect refuses outside its narrow contract
- attribute join refuses outside its narrow contract

### C. Validated-local runtime checks

These are allowed to depend on the hardened local runtime and should not be described as universal:
- WGS84 → EPSG:3857 reprojection succeeds
- projected CRS → WGS84 display transformation succeeds
- round-trip transform validations succeed in the hardened local runtime
- convex hull succeeds on the narrow local single-input polygon path
- envelope succeeds on the narrow local single-input polygon path
- simplify succeeds on the narrow local single-input polygon path with source-CRS-unit tolerance
- area succeeds on the narrow local polygon measurement path only when unit semantics are trustworthy, producing a measurement table rather than a geometry artifact
- perimeter succeeds on the narrow local polygon measurement path only when unit semantics are trustworthy, producing a measurement table rather than a geometry artifact
- compactness succeeds on the narrow local polygon measurement path only when unit semantics are trustworthy, producing a measurement table rather than a geometry artifact
- clip topology succeeds on the narrow local polygon-mask path
- intersect topology succeeds on the narrow local polygon-overlay path
- attribute join succeeds on the narrow local exact-equality left-join path for both spatial-left and tabular-left outputs, with preserved left output kind/geometry semantics, first-match-only duplicate-right behavior, null fill for unmatched left rows, and DuckDB registration/queryability truth

### D. Informational / environment-sensitive notes

These are useful diagnostics, not universal product-truth claims:
- headless or hosted runtime behavior around PROJ database loading
- worker/runtime startup quirks
- browser-host-specific transform availability issues
- benign map/display warnings for empty-result artifacts where there is nothing to fit

## Language rules

Prefer:

- validated in hardened local runtime
- environment-sensitive outside validated local runtime
- global dissolve only
- display-only transformation
- not yet supported

Avoid:

- supported
- works everywhere
- production-ready
- dissolve (without global qualifier)
- reprojection landed (without runtime qualifier)
