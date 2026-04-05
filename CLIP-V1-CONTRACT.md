# Clip v1 Contract — Web-native geoprocessing suite

## Purpose

Define the **first acceptable clip contract** tightly enough that implementation cannot outrun truth.

This is not a wishlist. It is the narrowest honest contract that could earn the right to ship.

## Status

- **Current product status:** `not_supported`
- **Candidate first implementation tier:** `partial`
- **Claim ceiling if implemented:** validated on the documented local support path only, with explicit CRS and geometry-family guards

Until the acceptance conditions below are met, the product must continue to refuse clip clearly.

## User-facing meaning of “clip” in v1

`clip` means:
- take one **source artifact**
- take one **clip mask artifact**
- cut the source geometry by the clip mask geometry
- return only the portion of the source that falls inside the mask

It does **not** mean:
- bounding-box trim
- display-only viewport crop
- intersect-with-attribute-merge overlay analysis
- grouped/multi-step topology workflow

If the product cannot meet that meaning, it must not use the label `clip`.

## Scope of v1

### Supported input shape

Clip v1 should support only:
- **source artifact:** `Polygon` or `MultiPolygon`
- **clip mask artifact:** `Polygon` or `MultiPolygon`

### Explicitly out of scope for v1

- Point / MultiPoint source clipping
- LineString / MultiLineString source clipping
- mixed geometry collections
- geometry collections
- bbox-only clip masquerading as generic clip
- multi-mask semantics beyond standard polygon/multipolygon union behavior
- attribute overlay semantics beyond preserved source attributes
- automatic CRS inference
- silent auto-transform across uncertain CRS states

## Two-input UX contract

Clip requires two explicit artifacts:

1. **Source artifact** — the layer being cut
2. **Clip mask artifact** — the polygon mask used to cut it

### UI requirements

The product surface must make this distinction explicit.

Minimum acceptable UX:
- user opens clip action from a selected spatial artifact
- selected artifact becomes the default **source artifact**
- user must explicitly choose a second artifact as **clip mask artifact**
- UI must show both names before execution
- UI must show stored CRS for both artifacts before execution
- UI must explain the current support scope: polygon/multipolygon only

### Refusal conditions at the UI layer

The operation must not start if:
- no source artifact is selected
- no clip mask artifact is selected
- source and mask are the same artifact, unless same-layer self-clip is explicitly supported later
- either artifact is non-spatial
- either artifact lacks renderable/operable feature geometry

## CRS contract

### Required CRS state for v1

The strictest honest v1 is:
- both source and mask artifacts must have **known CRS**
- both must match exactly

### v1 refusal rules

Refuse clip if:
- source CRS is `missing`
- source CRS is `unknown`
- mask CRS is `missing`
- mask CRS is `unknown`
- source CRS and mask CRS do not match exactly

### Why this is the right first contract

Clip is topology, not casual display math.
If CRS is ambiguous or mismatched, the operation should refuse rather than bluff.

### What v1 must not do

- must not assume WGS84 from GeoJSON ambiguity
- must not auto-transform by default
- must not quietly clip despite CRS mismatch
- must not downgrade CRS mismatch to a soft warning while still executing

### Possible later expansion

A later tranche could allow:
- explicit transform-then-clip on the validated local runtime

But that is **not** part of clip v1.

## Geometry-family contract

### Supported

| Role | Supported geometry families |
| --- | --- |
| Source artifact | Polygon, MultiPolygon |
| Clip mask artifact | Polygon, MultiPolygon |

### Refused

| Role | Refused geometry families |
| --- | --- |
| Source artifact | Point, MultiPoint, LineString, MultiLineString, GeometryCollection, mixed collections |
| Clip mask artifact | Point, MultiPoint, LineString, MultiLineString, GeometryCollection, mixed collections |

### Mixed-feature collections

If an artifact contains mixed geometry families, clip v1 must refuse.
It must not silently skip unsupported features and pretend the result is complete.

## Output contract

Clip v1 output must:
- preserve **source artifact attributes** for surviving features
- use the **source CRS** as output CRS
- create a new **derived artifact**
- create a proper **operation** history event
- register the result back into DuckDB as a queryable derived artifact

### Output geometry expectations

The output may contain:
- Polygon
- MultiPolygon

The output should not claim stronger normalization than is actually guaranteed.
If topology returns empty output, that must be surfaced honestly.

### Empty result behavior

If the mask and source do not overlap:
- operation may succeed with **0 features** or an explicit empty geometry result, depending on engine behavior
- product copy must state that no overlapping area was found
- this is not an implementation failure

## Warning and error contract

Clip v1 should prefer **clear refusal** over warning-heavy execution.

### Refusal/error cases that need typed coverage

Minimum needed coverage:
- `TOPOLOGY_OP_NOT_SUPPORTED` — until v1 exists, and for explicitly unsupported variants
- `CRS_MISSING`
- `CRS_UNKNOWN`
- `CLIP_MASK_REQUIRED` — second input not chosen
- `CRS_MISMATCH` — source/mask CRS differ
- `UNSUPPORTED_GEOMETRY` — source or mask geometry family outside contract
- `TOPOLOGY_OPERATION_FAILED` — engine-level topology failure
- `EMPTY_TOPOLOGY_RESULT` — optional informational/result-state code if operation yields no overlap

Note: some of these codes do not exist yet and would need to be added before implementation.

### Severity guidance

- missing/unknown CRS: **blocking** for clip v1
- CRS mismatch: **blocking**
- unsupported geometry family: **blocking**
- no mask artifact selected: **blocking**
- no overlap: **info** or result-state note, not failure-by-default
- engine topology failure: **serious** or operation error

## Execution contract

The canonical clip execution flow must include:
1. validate source artifact exists and is spatial
2. validate mask artifact exists and is spatial
3. validate both geometry families are inside contract
4. validate both CRS states are `known`
5. validate CRS match exactly
6. build engine inputs
7. execute topology clip
8. create derived artifact with honest warnings/errors
9. register queryable output in DuckDB
10. write operation history event with both input artifact ids

## Provenance/history contract

History must record:
- source artifact id
- clip mask artifact id
- operation name = `clip`
- source CRS
- mask CRS
- whether result was empty
- any refusal or engine warnings/errors

The history summary should read like:
- `Clip <source> by <mask> → <output>`

Not:
- vague "processed geometry"
- generic "derived artifact created"

## Support-tier contract if implemented

If clip v1 lands, the honest tier should be:
- **`partial`** at the product contract level

Why not `validated_local`?
Because even if the runtime path succeeds locally, the **semantic scope** is still intentionally narrow.
The operation would be partially supported, not broadly supported.

Suggested wording:
- `Clip: partial — polygon/multipolygon mask clip only, with known matching CRS required and explicit refusal outside the narrow contract.`

## Validation buckets

### Universal contract tests

Must pass everywhere:
- clip refuses when no mask artifact is selected
- clip refuses when either artifact is non-spatial
- clip refuses when either artifact CRS is missing
- clip refuses when either artifact CRS is unknown
- clip refuses when CRS values differ
- clip refuses for unsupported geometry families
- clip does not claim bbox-only behavior as generic clip

### Validated local runtime tests

Must pass on the documented local runtime:
- polygon clipped by polygon yields expected non-empty result
- multipolygon clipped by polygon yields expected result
- non-overlapping polygon clip yields honest empty result
- result artifact is queryable after creation
- history/provenance records both inputs correctly

### Environment-sensitive notes

Separate from contract truth:
- browser/runtime-specific topology quirks
- performance ceilings on large feature sets
- host/runtime instability unrelated to semantic contract

## Non-goals for v1

Clip v1 is not trying to solve:
- generalized overlay analysis
- attribute join/merge semantics
- line clipping workflows
- point-in-polygon extraction flows
- automatic CRS repair
- production-wide topology guarantees across all hosting contexts

## Acceptance checklist before ship

Clip must remain `not_supported` until all are true:

- [ ] two-input UX exists
- [ ] source vs mask distinction is explicit in UI copy
- [ ] supported geometry-family matrix is enforced
- [ ] missing/unknown CRS refusal is enforced
- [ ] CRS mismatch refusal is enforced
- [ ] engine output creates a proper derived artifact
- [ ] result is registered/queryable in DuckDB
- [ ] history records both input artifacts
- [ ] refusal/error taxonomy is typed and user-visible
- [ ] universal refusal tests exist
- [ ] validated-local success tests exist
- [ ] docs/support envelope updated to the exact shipped scope

## Bottom line

The first honest clip is **not** "clip, generally."
It is:

> polygon/multipolygon source clipped by polygon/multipolygon mask, requiring known matching CRS, refusing clearly outside that narrow support envelope.

Anything looser than that is storytime.