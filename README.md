# Web-native geoprocessing suite

## Summary

A browser-first, local-first, hybrid-capable geospatial workbench with a natural language interface. Three-layer architecture: **Core (engine) → Operations → Chains**. The AI translates natural language into operations and chains to run on the engine. Operations and chains have standard schemas consumed by three clients: the engine (validation), the UI (dialogs), and the AI (intent mapping).

## Status

- State: active
- Priority: high
- Owner: Emma + Pilgrim
- Started: 2026-03-17
- Last updated: 2026-06-13
- Milestone 0: verified
- Milestone 1 tranche 1: complete for scoped deliverables
- Plugin schema: integrated (intent metadata, chain registry, NL loop)
- Support envelope: tiered; see `SUPPORT-ENVELOPE.md` and `PROGRESS.md` for current truth surface

## Architecture

```
NL → [AI translates] → Operations / Chains → Engine executes
```

The plugin schema is the interface. One definition, three consumers:

| Consumer | Reads | Purpose |
|----------|-------|---------|
| **Engine** | `geometryContract`, `crsContract`, `outputContract` | Validate inputs, enforce contracts, refuse bad calls |
| **UI** | `uiHints`, `intent.parameters` | Render dialogs, parameter forms, confirmation surfaces |
| **AI** | `intent.triggers`, `intent.examples`, `intent.disambiguation` | Map natural language to operations, fill parameters |

See `PLUGIN-SCHEMA.md` for the full architecture.

## Current support-envelope read

Do not read the current implementation as flat "supported / unsupported" geometry coverage.

- **Buffer** — validated on the current local support path, with approximation caveats
- **Centroid** — validated on the current local support path
- **Global dissolve** — implemented as a narrow global-only aggregation path
- **Grouped dissolve** — implemented as a narrow v1 grouped-by-attribute aggregation path for polygon/multipolygon artifacts with known stored CRS, grouping by exactly one explicit attribute field, preserving the grouping field only, preserving stored CRS, and making no broader union semantics claim
- **Convex hull** — implemented as a narrow v1 single-input path for polygon/multipolygon artifacts with known stored CRS, producing one derived hull and preserving no source attributes
- **Envelope / bounding box** — implemented as a narrow v1 single-input path for polygon/multipolygon artifacts with known stored CRS, producing one derived polygon bounding box in the same stored CRS and preserving no source attributes
- **Simplify** — implemented as a narrow v1 single-input path for polygon/multipolygon artifacts with known stored CRS; user-provided tolerance is interpreted in source CRS units, stored CRS is preserved, source attributes are preserved, and there is no auto-transform or topology-preserving claim
- **Area** — implemented as a narrow v1 single-input measurement path for polygon/multipolygon artifacts with known stored CRS only; it returns a non-spatial measurement table with one output row per input feature, `area_value` and `area_unit` fields, and square-meter output only on the current trusted planar-meter CRS allowlist, refusing misleading unit semantics instead of bluffing
- **Perimeter** — implemented as a narrow v1 single-input measurement path for polygon/multipolygon artifacts with known stored CRS only; it returns a non-spatial measurement table with one output row per input feature, `perimeter_value` and `perimeter_unit` fields, and meter output only on the current trusted planar-meter CRS allowlist, refusing misleading unit semantics instead of bluffing
- **Compactness** — implemented as a narrow v1 single-input measurement path for polygon/multipolygon artifacts with known stored CRS only; it returns a non-spatial measurement table with one output row per input feature, `compactness_value` and `compactness_unit` fields, and unitless compactness output only when the stored CRS is on the current trusted planar-meter CRS allowlist because the underlying planar area/perimeter math must remain honest
- **Attribute join** — implemented as a narrow v1 exact-equality attribute join path: left join only, one key per side, explicit right-field selection, first-match-only when duplicate right-side keys exist, null fill for unmatched left rows, `join_` prefixing on right-field collisions, no spatial predicates, no fuzzy matching, no multi-key joins, and preservation of the left artifact's output kind and geometry semantics
- **Reproject / transform** — real coordinate transformation exists, but runtime support is environment-sensitive outside the hardened local setup
- **Display transformation** — display-only normalization for map framing; stored CRS metadata remains unchanged
- **Clip** — implemented as a narrow v1 polygon-mask path requiring known matching CRS, with explicit refusal outside that contract and honest no-overlap / empty-result behavior
- **Intersect** — implemented as a narrow v1 polygon/multipolygon source ∩ polygon/multipolygon overlay path requiring known matching CRS, preserving source attributes only, with explicit refusal outside that contract and honest no-overlap / empty-result behavior

## Validation read

Current validation is intentionally tiered.

- **Preview-safe browser-runtime checks** are the highest-value product checks because they exercise the built app in a shipped-like runtime.
- **Universal contract checks** cover behavior that must remain true across environments.
- **Validated-local runtime checks** may depend on the hardened local PROJ/worker runtime and must not be described as universal.
- **Environment-sensitive notes** are diagnostics, not claim expansion.

See `SUPPORT-ENVELOPE.md` and `PROGRESS.md` for the canonical validation tier story.

## Goals

- Define the product identity and wedge for a web-native geoprocessing platform.
- Produce a credible MVP specification that is technically sane and strategically focused.
- Map the architecture, module boundaries, data formats, and execution model.
- Identify major risks: data ingestion, CRS correctness, reproducibility, browser ceilings, offline state, and sync.
- Create a roadmap from MVP to broader platform capabilities.

## Deliverables

- Project README
- MVP specification
- UX framing doc
- UX canonical flow outlines
- UX import/validation spec
- UX provenance/history interaction spec
- Milestone 0 technical spike plan
- Milestone 0 UI-state checklist
- Milestone 0 completion / verification checklist
- Reference architecture / data flow doc
- Progress tracker
- Architecture notes and reference materials
- Strategic memo / roadmap as needed

## Open Questions

- Is the primary identity a spatial SQL workbench, GIS notebook, collaborative geodata workspace, or broader platform?
- Which legacy formats should be first-class vs one-time import funnels?
- What is the right reproducibility model: notebook cells, operation history, workflow graph, or a hybrid?
- How early should remote sync and collaboration shape the data model?
- Where should raster enter the roadmap relative to vector maturity?

## Decisions

- 2026-03-17 — Frame the effort as a browser-native spatial workbench, not a QGIS replacement.
- 2026-03-17 — Proceed with an MVP spec as the next concrete step.
- 2026-06-12 — **Plugin schema architecture: Core → Operations → Chains.** The operation registry is the single interface for all consumers (engine, UI, AI). No separate AI API layer.
- 2026-06-12 — **Intent metadata added to all 15 operations.** Triggers, parameters, examples, disambiguation — the AI-readable surface.
- 2026-06-12 — **Chain registry created with 7 composed workflows.** Multi-step operations declared as chains over existing ops.
- 2026-06-12 — **NL → Plan → Confirm → Execute loop built.** Trigger-matching resolver, plan builder with contract validation, plan executor using existing operation executors, NL Query Panel in the bottom dock.

## Related Notes

- [web-native-geoprocessing-suite](../notes/web-native-geoprocessing-suite.md)
- [_index](../notes/_index.md)

## Related Memory

- [2026-03-17](../memory/2026-03-17.md)

## Related Files

- [PLUGIN-SCHEMA](./PLUGIN-SCHEMA.md) — architecture overview, type definitions
- [OPERATION-INTENT-MAP](./OPERATION-INTENT-MAP.ts) — intent metadata for all 15 operations
- [CHAIN-REGISTRY](./CHAIN-REGISTRY.ts) — 7 pre-built composed workflows
- [NL-LOOP-IMPLEMENTATION-BRIEF](./NL-LOOP-IMPLEMENTATION-BRIEF.md) — NL loop implementation spec
- [PLUGIN-SCHEMA-IMPLEMENTATION-BRIEF](./PLUGIN-SCHEMA-IMPLEMENTATION-BRIEF.md) — plugin schema integration spec
- [MVP-SPEC](./MVP-SPEC.md)
- [UX-FRAMING](./UX-FRAMING.md)
- [UX-CANONICAL-FLOWS](./UX-CANONICAL-FLOWS.md)
- [UX-IMPORT-VALIDATION](./UX-IMPORT-VALIDATION.md)
- [UX-PROVENANCE-HISTORY](./UX-PROVENANCE-HISTORY.md)
- [MILESTONE-0-TECHNICAL-SPIKE](./MILESTONE-0-TECHNICAL-SPIKE.md)
- [MILESTONE-0-UI-STATE-CHECKLIST](./MILESTONE-0-UI-STATE-CHECKLIST.md)
- [MILESTONE-0-COMPLETION-CHECKLIST](./MILESTONE-0-COMPLETION-CHECKLIST.md)
- [MILESTONE-1-PRIORITIES](./MILESTONE-1-PRIORITIES.md)
- [MILESTONE-1-CODER-BRIEF](./MILESTONE-1-CODER-BRIEF.md)
- [REFERENCE-ARCHITECTURE](./REFERENCE-ARCHITECTURE.md)
- [PROGRESS](./PROGRESS.md)
- [archive/GEOS-WASM-FEASIBILITY-MEMO](./archive/GEOS-WASM-FEASIBILITY-MEMO.md)
- [archive/HANDOFF](./archive/HANDOFF.md)

## Links

- Depends on: prior research on browser GIS, WASM geospatial runtimes, cloud-native geospatial formats
- Related to: [get-paid-stay-free](../projects/get-paid-stay-free/README.md)
- Supersedes:
- Blocked by:

## Log

- 2026-03-17 — created
- 2026-03-17 — began MVP specification
- 2026-03-17 — started Milestone 0 implementation with a Vite/React/MapLibre shell, in-memory artifact/history model, GeoJSON import review flow, map/table shell, SQL preview flow, and derived-artifact materialization scaffold
- 2026-03-18 — reframed Milestone 0 into an explicit verification workflow, replaced the outdated gap-audit role with a completion/verification checklist, and reconciled milestone docs around the real-file GeoParquet smoke-test requirement
- 2026-03-18 — added a workspace-local Playwright skill, created a reusable GeoParquet smoke script, found and fixed a BigInt serialization bug in the GeoParquet import/runtime path, and verified Milestone 0 end-to-end against `test-data/example.parquet`
- 2026-03-18 — completed the first Milestone 1 tranche for its honest scope: saved queries are real, GeoJSON export is real, project persistence restores usable project state on reopen, and the misleading pseudo-GeoParquet export was replaced with an honest JSON fallback
- 2026-06-12 — **Plugin schema pivot.** Architecture decision: Core → Operations → Chains. The operation registry becomes the single interface for engine, UI, and AI.
- 2026-06-12 — Formalized `dissolve-global` and `crs-assign` in the operation registry (15 operations total).
- 2026-06-12 — Added `intent` metadata to all 15 operations: triggers, parameters, examples, disambiguation.
- 2026-06-12 — Created chain registry with 7 composed workflows: area-within-boundary, area-by-owner, conflict-detection, prepare-for-analysis, shape-analysis, features-near-features.
- 2026-06-12 — Built NL → Plan → Confirm → Execute loop: query resolver (trigger matching), plan builder (contract validation), plan executor (existing operation executors), NL Query Panel (bottom dock tab).
