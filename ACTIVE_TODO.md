# Active TODO — Web-native geoprocessing suite

## Current state

The current narrow product surface is materially tighter than it was at the start of this phase.

What is now landed and verified on the current support path:
- preview-safe browser validation harness
- attribute-join v1 narrow exact-equality left-join path
- convex hull v1 narrow single-input path
- envelope v1 narrow single-input bounding-box path
- simplify v1 narrow single-input path
- area v1 narrow measurement-table path
- grouped-dissolve v1 narrow grouped-by-attribute aggregation path
- clip v1 narrow topology path
- intersect v1 narrow topology path
- CRS confidence / provenance repair after reproject + clip
- lineage hardening for operations and query materialization
- right-panel grouped provenance presentation
- first narrow map ↔ table synchronization seam
- contradiction pass across reproject / clip / query lineage / map↔table came back clean
- bounded inspection polish landed on the sync seam
- query preview ↔ materialization ↔ derived-lineage provenance wording now uses one explicit vocabulary
- operation substrate core is real
- topology-family substrate is real
- declarative CRS / transform-planning seam is real
- standalone cheap validation harness now exists and can prove DuckDB registration truth for intersect in Node
- browser QA alignment between runtime truth and test truth

Latest validation status:
- `check-crs-confidence-browser.mjs` — PASS
- `clip-refusal-browser-check.mjs` — PASS
- `clip-success-browser-check.mjs` — PASS
- `intersect-success-browser-check.mjs` — PASS
- `run-operation-validations-browser.mjs` — PASS (including area measurement metadata/runtime truth on the current path)
- `run-operation-validations.mjs` — PASS
- `review-focus-behavior.mjs` — PASS (table focus, clear-focus, tabular reset, and deterministic local proof of map→table focus via click-grid probing)
- attribute-join cheap runtime proof — PASS for spatial-left and tabular-left outputs, including first-match-only duplicate-right behavior, null fill for unmatched left rows, preserved left output kind / geometry semantics, and DuckDB registration/queryability truth
- `test-lineage-preview-coherence.mjs` — PASS (explicit provenance-strength classification stays coherent from preview to materialized lineage)

## Next session priorities

1. **Spend the checkpoint result on the highest-leverage workflow seam, not another menu item**
   - the current product already has a real composition graph across spatial artifacts, measurement tables, query/materialized tables, and attribute-join-v1
   - the strongest existing loop is now: spatial → measurement/query table → attribute join back to spatial
   - the weakest shipped family is still aggregation

2. **Primary next target: aggregation as a real workflow bridge**
   - keep paying down the operation orchestration/UI split so aggregation consumes the same registry/contract truth as the other families
   - use `dissolve-global` as the proof point for this cleanup because it is currently the most obviously special-case operation
   - aim for a cleaner path from enriched/query-derived spatial artifacts into aggregation rather than leaving dissolve as an isolated reduction

3. **Now that grouped dissolve has landed, checkpoint the new aggregation bridge honestly**
   - verify how well the grouped aggregation path composes with query/materialization, measurement-table outputs, attribute-join-v1, export/persistence/queryability, and the current browser-visible UI surface
   - tighten any remaining aggregation-specific validation or product-surface seams before broadening further
   - in particular, add grouped-dissolve-specific cheap/runtime/browser proof before treating this bridge as equally mature with clip/intersect/attribute-join

4. **Keep support-envelope discipline**
   - do not broaden intersect beyond its narrow v1 contract without explicitly earning it
   - do not add transform-aware topology semantics until that path is genuinely implemented and validated
   - do not hide aggregation/UI unevenness by stacking another isolated operation on top of it

## Not next

- Do **not** add multiple new geometry ops at once
- Do **not** broaden clip beyond its narrow polygon-mask contract without rewriting the support envelope first
- Do **not** chase headless WebGL noise as if it were core product work
- Do **not** prioritize cosmetic polish over spatial truth and support-envelope clarity

## Guiding principle

Tighten the seam, then add the next slice.
