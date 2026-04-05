# Intersect v1 Implementation Brief — Web-native geoprocessing suite

## Purpose

Define the first implementation slice for `intersect` now that the operation substrate, topology-family seam, CRS policy seam, and validation buckets are real enough to carry it honestly.

This brief is intentionally narrow.
It is not permission to ship generalized overlay analysis.
It is the implementation plan for the smallest intersect that can be truthful.

---

## Current status

- current shipped product status: `not_supported`
- current product seam: refusal-only
- current support-envelope status: honest refusal path with browser verification
- candidate next shipped state: `partial`

This brief should only move intersect from refusal-only to narrow v1 execution **if** the exact contract below is implemented and validated.

---

## Shipped contract for intersect v1

Intersect v1 means:
- take one **source artifact**
- take one **overlay artifact**
- compute the geometric overlap
- create a new derived artifact from that overlap

### Supported input contract
- source geometry family: `Polygon` or `MultiPolygon`
- overlay geometry family: `Polygon` or `MultiPolygon`
- both artifacts must be spatial
- both artifacts must have **known stored CRS**
- both stored CRS values must match exactly

### Explicitly not in v1
- point/line intersection
- mixed geometry collections
- geometry collections
- auto-reprojection
- silent CRS coercion
- overlay attribute merge
- generalized desktop-GIS intersect semantics

### Output contract
- create a **derived artifact**
- preserve **source attributes only**
- output stored CRS = source/overlay stored CRS
- output remains queryable in DuckDB
- empty overlap is an **honest empty result**, not an implementation failure
- history/provenance must record both input artifacts and the intersect operation clearly

---

## Architectural constraints

Implement intersect v1 on the existing substrate, not around it.

### Required substrate touchpoints
- operation registry
- topology-family contract/validation seam
- topology-family execution seam
- CRS policy / transform-planning contract layer
- shared runtime/provenance helpers
- validation buckets

### Forbidden shortcuts
- do not bypass topology-family helpers
- do not add one-off intersect-only CRS logic in UI code
- do not merge overlay attributes “for now”
- do not loosen support-envelope wording before validations are green

---

## Required code-level outcomes

## 1. Registry / contract surface
Update the operation registry so intersect is represented as a real narrow operation rather than refusal-only, while keeping its support tier honest.

Desired state:
- operation id remains narrow and explicit
- family = `topology-two-input`
- support tier = `partial`
- CRS contract = known + exact match
- transform planning = `same-crs-only`
- future eligibility may remain `candidate-via-explicit-plan`
- output contract = `source-only` attributes, honest empty success

## 2. Topology validation
Intersect must continue to refuse when:
- no overlay selected
- either artifact non-spatial
- either CRS missing/unknown
- CRS mismatch
- unsupported geometry family

These should continue flowing through shared topology validation/refusal helpers.

## 3. Topology execution
Add narrow intersect execution on the topology execution seam.

Execution responsibilities:
- build engine inputs
- call topology intersection
- preserve source attributes for surviving overlap features
- create derived artifact
- register output in DuckDB
- create history event
- surface honest empty-result behavior

## 4. Provenance / history
History event must clearly record:
- operation = `intersect`
- source artifact id/name
- overlay artifact id/name
- source/overlay stored CRS
- output artifact id/name
- whether result was empty
- output attribute semantics remain source-only
- warning lineage

Summary should read like:
- `Intersect <source> with <overlay> → <output>`

## 5. Validation
The slice is not complete without validation in both buckets.

### Universal contract checks
Must pass everywhere:
- no overlay → refuse
- non-spatial → refuse
- unknown/missing CRS → refuse
- CRS mismatch → refuse
- unsupported geometry → refuse
- no false overlay-attribute-merge implication

### Validated-local runtime checks
Must pass on hardened local runtime:
- polygon ∩ polygon non-empty success
- multipolygon ∩ polygon success if fixture exists
- non-overlap → honest empty result
- output queryable in DuckDB
- history records both inputs correctly
- source attributes preserved as documented

### Browser/product checks
Need at least one browser workflow covering:
- valid known matching CRS inputs
- successful derived artifact creation
- honest empty-result path
- no overlay attribute overclaim
- history / details panel coherence

---

## Recommended implementation order

1. update intersect registry/contract entry
2. add intersect execution on the shared topology execution seam
3. keep refusal behavior intact for out-of-contract inputs
4. add validated-local runtime tests
5. add browser check for success + empty-result
6. verify support envelope wording still honest
7. only then update docs from `not_supported` to narrow `partial`

---

## Acceptance checklist

Intersect v1 is ready only when all are true:

- [ ] operation registry reflects narrow intersect v1 honestly
- [ ] topology-family execution supports polygon/multipolygon success path
- [ ] source attributes only are preserved and documented
- [ ] no-overlap yields honest empty result
- [ ] output artifact is registered/queryable in DuckDB
- [ ] history records both inputs correctly
- [ ] universal refusal tests pass
- [ ] validated-local success tests pass
- [ ] browser intersect success/empty-result checks pass
- [ ] support envelope/docs updated to exact shipped scope

---

## Bottom line

The next intersect is not “intersect generally.”
It is:

> polygon/multipolygon source intersected with polygon/multipolygon overlay, requiring known matching CRS, preserving source attributes only, and producing honest empty results on the current validated local runtime path.

Anything broader is fraud by enthusiasm.
