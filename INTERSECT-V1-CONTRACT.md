# Intersect v1 Contract — Web-native geoprocessing suite

## Purpose

Define the **first acceptable intersect contract** tightly enough that implementation cannot drift into generic GIS-overclaim.

This is not permission to ship intersection just because GEOS can compute one.
This is the narrowest honest contract that could eventually earn the right to ship.

## Status

- **Current product status:** `partial`
- **Current shipped scope:** narrow intersect v1 is implemented for polygon/multipolygon source ∩ polygon/multipolygon overlay only, requiring known matching CRS, preserving source attributes only, and surfacing honest empty-result success when nothing overlaps
- **Claim ceiling:** validated on the documented local support path only, with explicit CRS, geometry-family, and output-semantics guards

Outside the accepted v1 contract below, the product must continue to refuse intersect clearly.

## User-facing meaning of “intersect” in v1

`intersect` means:
- take one **source artifact**
- take one **overlay artifact**
- compute the geometric overlap between them
- return the overlapping geometry as a new derived artifact

It does **not** mean:
- clip by mask semantics
- bbox trim
- dissolve-by-overlap workflow
- generalized overlay analysis with broad field-merge promises
- full desktop-GIS intersection semantics across every geometry family

If the product cannot meet that meaning narrowly and honestly, it must not use the label `intersect`.

## Scope of v1

### Supported input shape

Intersect v1 should support only:
- **source artifact:** `Polygon` or `MultiPolygon`
- **overlay artifact:** `Polygon` or `MultiPolygon`

### Explicitly out of scope for v1

- Point / MultiPoint intersection
- LineString / MultiLineString intersection
- mixed geometry collections
- GeometryCollection
- source/overlay auto-reprojection
- silent CRS coercion
- generalized attribute merge/join promises beyond the declared v1 output contract
- multi-layer overlay semantics
- grouped or iterative intersection workflows

## Two-input UX contract

Intersect requires two explicit artifacts:

1. **Source artifact** — the primary layer being intersected
2. **Overlay artifact** — the second polygon layer defining overlap

### UI requirements

Minimum acceptable UX:
- user opens intersect action from a selected spatial artifact
- selected artifact becomes the default **source artifact**
- user must explicitly choose a second artifact as the **overlay artifact**
- UI must show both names before execution
- UI must show stored CRS for both artifacts before execution
- UI must state the current support scope: polygon/multipolygon only
- UI must state the current output semantics clearly

### Refusal conditions at the UI layer

The operation must not start if:
- no source artifact is selected
- no overlay artifact is selected
- source and overlay are the same artifact, unless same-layer self-intersection is explicitly supported later
- either artifact is non-spatial
- either artifact lacks renderable/operable feature geometry

## CRS contract

### Required CRS state for v1

The strictest honest v1 is:
- both source and overlay artifacts must have **known CRS**
- both CRS values must match exactly

### v1 refusal rules

Refuse intersect if:
- source CRS is `missing`
- source CRS is `unknown`
- overlay CRS is `missing`
- overlay CRS is `unknown`
- source CRS and overlay CRS do not match exactly

### What v1 must not do

- must not assume WGS84 from GeoJSON ambiguity
- must not auto-transform by default
- must not quietly intersect despite CRS mismatch
- must not downgrade CRS mismatch to a soft warning while still executing

### Possible later expansion

A later tranche could allow:
- explicit transform-then-intersect on the validated local runtime

That is **not** part of intersect v1.

## Geometry-family contract

### Supported

| Role | Supported geometry families |
| --- | --- |
| Source artifact | Polygon, MultiPolygon |
| Overlay artifact | Polygon, MultiPolygon |

### Refused

| Role | Refused geometry families |
| --- | --- |
| Source artifact | Point, MultiPoint, LineString, MultiLineString, GeometryCollection, mixed collections |
| Overlay artifact | Point, MultiPoint, LineString, MultiLineString, GeometryCollection, mixed collections |

### Mixed-feature collections

If an artifact contains mixed geometry families, intersect v1 must refuse.
It must not silently skip unsupported features and pretend the result is complete.

## Output contract

This is the most dangerous part of intersect, because users will assume broader semantics than the engine/product actually guarantees.

Intersect v1 output must:
- create a new **derived artifact**
- use the **source CRS** as output CRS
- create a proper **operation** history event
- register the result into DuckDB as a queryable derived artifact
- surface empty-result behavior honestly

### Attribute semantics

Intersect v1 must **not** imply full desktop-style field merge semantics unless that is actually implemented and documented.

The safest first contract is:
- preserve **source artifact attributes only** for surviving overlap features
- do **not** promise overlay-attribute merge in v1

If overlay attributes are not carried, the UI/docs must say so plainly.

### Output geometry expectations

The output may contain:
- Polygon
- MultiPolygon

The product must not claim stronger normalization than is actually guaranteed.

### Empty result behavior

If the two artifacts do not overlap:
- operation may succeed with an intentionally empty result artifact
- product copy must state that no overlapping area was found
- this is not an implementation failure

## Warning and error contract

Intersect v1 should prefer **clear refusal** over warning-heavy execution.

### Refusal/error cases that need typed coverage

Minimum needed coverage:
- `TOPOLOGY_OP_NOT_SUPPORTED` — until v1 exists, and for explicitly unsupported variants
- `CRS_MISSING`
- `CRS_UNKNOWN`
- `CRS_MISMATCH`
- `UNSUPPORTED_GEOMETRY`
- `TOPOLOGY_OPERATION_FAILED`
- `EMPTY_TOPOLOGY_RESULT` — informational/result-state code for no overlap
- `OVERLAY_ARTIFACT_REQUIRED` — second input not chosen

Note: `OVERLAY_ARTIFACT_REQUIRED` would likely need to be added when intersect implementation actually begins.

### Severity guidance

- missing/unknown CRS: **blocking**
- CRS mismatch: **blocking**
- unsupported geometry family: **blocking**
- no overlay artifact selected: **blocking**
- no overlap: **info** or result-state note, not failure-by-default
- engine topology failure: **serious** or operation error

## Execution contract

The canonical intersect execution flow must include:
1. validate source artifact exists and is spatial
2. validate overlay artifact exists and is spatial
3. validate both geometry families are inside contract
4. validate both CRS states are `known`
5. validate CRS match exactly
6. build engine inputs
7. execute topology intersection
8. create derived artifact with honest warnings/errors
9. register queryable output in DuckDB
10. write operation history event with both input artifact ids

## Provenance/history contract

History must record:
- source artifact id
- overlay artifact id
- operation name = `intersect`
- source CRS
- overlay CRS
- whether result was empty
- any refusal or engine warnings/errors
- the declared v1 output semantics (source attributes preserved; overlay attributes not promised) when that matters for future audit

The history summary should read like:
- `Intersect <source> with <overlay> → <output>`

Not:
- vague "processed geometry"
- generic "derived artifact created"

## Support-tier contract if implemented

If intersect v1 lands, the honest tier should be:
- **`partial`** at the product contract level

Why:
- the semantic scope is intentionally narrow
- the attribute/output contract is narrower than generic user expectation
- the CRS/runtime/geometry-family envelope is constrained

Suggested wording:
- `Intersect: partial — polygon/multipolygon intersection only, requiring known matching CRS and preserving source attributes only on the current narrow path.`

## Validation buckets

### Universal contract tests

Must pass everywhere:
- intersect refuses when no overlay artifact is selected
- intersect refuses when either artifact is non-spatial
- intersect refuses when either artifact CRS is missing
- intersect refuses when either artifact CRS is unknown
- intersect refuses when CRS values differ
- intersect refuses for unsupported geometry families
- intersect does not imply overlay-attribute merge unless actually implemented

### Validated local runtime tests

Must pass on the documented local runtime:
- polygon intersect polygon yields expected non-empty result
- multipolygon intersect polygon yields expected result
- non-overlapping polygon intersect yields honest empty result
- result artifact is queryable after creation
- history/provenance records both inputs correctly
- source-attribute preservation behaves as documented

### Environment-sensitive notes

Separate from contract truth:
- browser/runtime-specific topology quirks
- performance ceilings on larger feature sets
- host/runtime instability unrelated to semantic contract

## Non-goals for v1

Intersect v1 is not trying to solve:
- generalized overlay analysis
- full field merge semantics
- line/polygon or point/polygon workflows
- automatic CRS repair
- production-wide topology guarantees across all hosting contexts
- multi-layer or iterative intersection workflows

## Acceptance checklist before ship

Intersect should not broaden beyond v1 unless all of these remain true:

- [x] two-input UX exists
- [x] source vs overlay distinction is explicit in UI copy
- [x] supported geometry-family matrix is enforced
- [x] missing/unknown CRS refusal is enforced
- [x] CRS mismatch refusal is enforced
- [x] output attribute semantics are documented and implemented exactly as claimed
- [x] engine output creates a proper derived artifact
- [x] result is registered/queryable in DuckDB
- [x] history records both input artifacts
- [x] refusal/error taxonomy is typed and user-visible
- [x] universal refusal tests exist
- [x] validated-local success tests exist
- [x] docs/support envelope updated to the exact shipped scope

## Recommendation

Do **not** implement intersect immediately just because clip landed.

Clip was the safer first topology slice because it has simpler user expectations and a smaller semantic surface.
Intersect should only proceed after the team is satisfied that:
- the two-input topology seam is stable,
- the CRS contract is stable,
- the output attribute semantics are explicit,
- and the product copy can describe the limitation without bluffing.

## Bottom line

The first honest intersect is **not** "intersect, generally."
It is:

> polygon/multipolygon source intersected with polygon/multipolygon overlay, requiring known matching CRS, preserving only the declared output attributes, and refusing clearly outside that narrow support envelope.

Anything looser than that is marketing fog.