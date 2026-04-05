# Clip / Intersect Decision — Web-native geoprocessing suite

## Decision

Do **not** ship clip or intersect yet.

Keep both as **not supported** on the current product surface until a narrower, explicit contract is implemented end-to-end.

## Why

The current engine/product seam is honest for:
- buffer
- centroid
- global dissolve
- reproject / display transform with runtime caveats

Clip/intersect are different.
They are not just "one more geometry op". They require a tighter contract across:
- two-input artifact selection
- geometry-family compatibility
- CRS agreement / refusal behavior
- output semantics
- warning/refusal taxonomy
- history/provenance details
- browser/runtime validation

Shipping either before those seams are explicit would inflate the support envelope.

## Current code truth

What exists right now:
- `GeometryEngine` exposes a `clip(...)` interface
- `worker-bus.ts` currently **refuses** `clip` with `TOPOLOGY_OP_NOT_SUPPORTED`
- there is **no intersect implementation path** in the current product surface

So the honest current state is:
- **clip:** stubbed refusal only
- **intersect:** not implemented

## Honest support recommendation

### Clip

Keep as `not_supported` for now.

Do **not** ship a bbox-only clip under the generic label "clip".
That would violate user expectation. In GIS/product language, "clip" usually implies clipping one geometry layer by another geometry mask, not just bounding-box trimming.

If clip is later introduced, the first honest shippable contract should be:
- **polygon-mask clip only**
- source artifact + clip artifact must both be spatial
- both artifacts must have `known` CRS, or user must explicitly assign/confirm CRS first
- mismatched CRS must refuse unless a validated transform path is applied deliberately
- supported input/output geometry families must be spelled out narrowly
- non-supported geometry families must refuse clearly, not degrade silently

Suggested first narrow claim ceiling:
- **Clip:** `partial`
- honest claim: "polygon-mask clip for the validated local path, with explicit CRS and geometry-family guards"

### Intersect

Keep as `not_supported` for now.

Intersect is even easier to overclaim because users reasonably expect:
- two-layer overlay semantics
- stable topology behavior
- understandable output geometry semantics
- attribute merge expectations

If intersect is later introduced, the first honest shippable contract should be narrower than generic GIS expectation:
- polygon/polygon intersect first
- same-CRS required or explicitly transformed on validated path
- output semantics documented clearly
- attribute inheritance/merge behavior declared in advance

Suggested first narrow claim ceiling:
- **Intersect:** `partial`
- honest claim: "polygon/polygon intersect on the validated local path only, with explicit CRS and output-semantics guards"

## Required preconditions before implementation

Before either op lands on the product surface:

1. **Two-input UX contract**
   - how the user selects source artifact vs mask/overlay artifact
   - what happens when nothing compatible is selected

2. **CRS refusal contract**
   - known/unknown/missing states
   - when to refuse vs warn
   - whether auto-transform is allowed at all for milestone scope

3. **Geometry-family matrix**
   - polygon / multipolygon
   - line / multiline
   - point / multipoint
   - mixed-geometry collections

4. **Output contract**
   - output geometry type expectations
   - row/feature attribution behavior
   - provenance/history wording

5. **Typed warning/error taxonomy**
   - not just generic failure messages
   - explicit unsupported-family, CRS-mismatch, second-input-required, topology-failed codes if needed

6. **Validation tiers**
   - universal refusal behavior tests
   - validated-local topology success tests
   - environment-sensitive/runtime notes kept separate

## Recommended next implementation order

If one of the two earns the right to be built first:

1. **Clip before intersect**, but only as a narrow polygon-mask contract
2. **Intersect second**, after clip proves the two-input/CRS/topology seam

Why clip first:
- simpler user story
- easier refusal rules
- smaller attribute/output ambiguity surface
- lower risk of accidental overclaim

## Immediate next step

Do a design/contract pass before code:
- define the first acceptable clip contract
- define refusal rules
- define geometry-family matrix
- only then decide whether Milestone 1 should expose clip at all

## Bottom line

The disciplined move is still the right one:
- **do not ship generic clip/intersect language yet**
- **do not implement both at once**
- **tighten the seam first, then add one narrow slice**
