# Tomorrow — Web-native geoprocessing suite

## Starting point

The current support surface is in a good state:
- CRS confidence / provenance seam repaired and browser-validated
- attribute-join v1 narrow exact-equality left-join path landed
- convex hull v1 narrow single-input path landed
- envelope v1 narrow single-input bounding-box path landed
- simplify v1 narrow single-input path landed
- area v1 narrow measurement-table path landed
- grouped-dissolve v1 narrow grouped-by-attribute aggregation path landed
- clip v1 narrow path landed and browser-validated
- intersect now ships as a narrow v1 topology path
- lineage / provenance presentation tightened
- map ↔ table synchronization landed in a narrow first form
- browser QA suite is green on the current validated path

## First task next session

The contradiction-hunting integration pass is complete and came back clean on the current narrow seam:
- reproject artifact truth vs event / lineage truth
- clip success + intentional-empty semantics
- query materialization provenance strength / grouped lineage detail
- map row click ↔ map feature click coherence

The bounded polish slice on top of that seam is also now landed:
- scroll selected row into view when chosen from the map
- explicit clear-focus action for row/feature focus
- richer focused-feature detail in the right panel
- cleaner focused-row styling plus an explicit inspection-focus banner
- non-renderable / tabular-only fallback states kept honest
- deterministic local browser proof of map→table focus via click-grid probing in `scripts/review-focus-behavior.mjs`

The next narrow seam that was tightened after that:
- query preview ↔ materialize ↔ derived-artifact lineage now uses one explicit provenance-strength vocabulary
- preview and event-derived lineage facts now align on:
  - `Direct artifact match`
  - `Partial artifact match`
  - `Table reference only`
- browser proof for that seam now exists in `scripts/test-lineage-preview-coherence.mjs`

## What next session should start with

The substrate runway is clear and intersect v1 is now shipped on the narrow honest contract.

Start the next session by choosing a forward-moving slice rather than another rescue-only architecture pass.

Near-term priority order now:
1. checkpoint the new grouped aggregation bridge and composability truth
2. tighten any remaining validation/product-surface seams exposed by grouped dissolve
3. only then choose the next earned capability slice on the stronger aggregation-aware substrate

Keep the current support-envelope discipline:
- do not broaden intersect beyond narrow v1 without explicitly earning it
- do not add transform-aware topology semantics until that path is genuinely implemented and validated
- do not let the stronger substrate tempt broader claims than the runtime/support story can justify

Validation/doc naming cleanup is still allowed only if current naming is actively confusing work.

## If contradictions appear

Fix only the contradictions.
Do **not** expand the feature surface just because the current build is stable.

## Still not next

- do not broaden clip beyond the narrow polygon-mask contract
- do not broaden intersect beyond its shipped v1 contract unless a concrete workflow earns it
- do not add multiple new geometry ops at once
- do not spend time on validation naming churn unless it is actively confusing work

## Reminder

The current job is not expansion.
It is consolidation, contradiction-hunting, and careful polish on the seams that already exist.
