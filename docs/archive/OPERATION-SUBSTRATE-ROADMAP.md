# Operation Substrate Roadmap — Web-native geoprocessing suite

## Purpose

Define the architectural path from the current narrow, honest operation set to a broader geoprocessing suite that remains:
- fast to extend
- reliable to validate
- explicit about support limits
- resistant to UI / docs / test drift

This roadmap is not a feature wish-list.
It is the foundation plan required so future operations become cheap, coherent, and truthful rather than bespoke and fragile.

---

## Strategic goal

Build an **operation substrate** such that new geoprocessing operations can be added by:
1. declaring their contract
2. wiring an engine adapter
3. attaching validations
4. reusing shared UI and provenance machinery

The target state is:
- new operations are mostly declarative additions, not full-stack rewrites
- product truth is defined by contract + support envelope, not by whatever the engine happens to allow
- browser QA verifies a small number of high-value seams while cheaper contract/integration tests carry most truth burden

---

## Principles

### 1. Product truth is not engine capability
GEOS/PROJ/DuckDB capability must not be treated as product support by default.
Support exists only when:
- the operation contract is defined
- refusal semantics are defined
- provenance semantics are defined
- tests exist
- docs/support envelope are updated

### 2. Narrow truth beats broad implication
Operations should ship on the narrowest honest contract first.
Refuse clearly outside that contract.

### 3. Every operation is the same shape
Each operation should pass through the same core lifecycle:
- validate
- normalize
- execute
- classify warnings/errors
- materialize derived artifact
- register queryable output
- write provenance/history
- expose support-envelope truth

### 4. Shared substrate before broad operation growth
The next acceleration step is not “more ops.”
It is “better operation infrastructure.”

---

## Current state

What already exists in real form now:
- operation-derived artifact creation
- history/provenance events
- typed warnings
- CRS provenance state
- narrow clip topology path
- narrow intersect v1 topology path
- narrow area v1 measurement-table path
- map ↔ table inspection coherence
- query materialization provenance strength
- product-level operation registry/types for current shipped operations
- extracted single-input artifact/provenance builders
- topology-family substrate split between contract/validation and execution/materialization/history
- declarative CRS / transform-planning contract layer
- universal-contract vs validated-local-runtime validation buckets
- standalone cheap validation harness
- Node-friendly DuckDB environment seam for standalone intersect registration truth

What is still too bespoke:
- deeper shared execution pipeline beyond thin facades/wrappers
- reusable operation UI primitives
- broader registry-driven UI/support presentation consumption
- transform-aware topology execution itself

---

## Desired target architecture

## Layer 1 — Operation contract registry

A canonical definition model for each operation.

Each operation definition should declare:
- `id`
- `label`
- `family`
- `supportTier`
- `runtimeSensitivity`
- `inputArity`
- `geometryContract`
- `crsContract`
- `outputContract`
- `warningCodes`
- `refusalCodes`
- `validationPack`
- `uiHints`

### Example shape

```ts
interface OperationDefinition {
  id: string
  label: string
  family: 'single-geometry' | 'topology-two-input' | 'crs' | 'measurement' | 'aggregation'
  supportTier: 'universal' | 'validated_local' | 'environment_sensitive' | 'partial' | 'not_supported'
  runtimeSensitive?: boolean
  inputArity: 1 | 2
  geometryContract: GeometryContract
  crsContract: CrsContract
  outputContract: OutputContract
  warningCodes: string[]
  refusalCodes: string[]
  uiHints: OperationUiHints
}
```

This registry becomes the single truth source for:
- product UI
- refusal behavior
- docs/support envelope
- tests

---

## Layer 2 — Shared execution pipeline

A reusable orchestration layer for all operations.

### Canonical pipeline

1. resolve selected inputs
2. validate contract
3. normalize operation input(s)
4. optionally plan transform requirements
5. execute engine adapter
6. classify result/warnings/errors
7. build derived artifact
8. register queryable output in DuckDB
9. write history/provenance event
10. return structured operation result to UI

### Required output shape

```ts
interface OperationExecutionOutcome {
  ok: boolean
  artifact?: Artifact
  historyEvent?: HistoryEvent
  warnings: WarningRef[]
  refusal?: WarningRef
  runtimeNotes?: WarningRef[]
}
```

This should replace bespoke per-operation state drift over time.

---

## Layer 3 — CRS / transform planning subsystem

CRS must become a reusable operation dependency, not scattered conditionals.

### Needed capabilities
- canonical CRS state model:
  - `known`
  - `unknown`
  - `missing`
- stored CRS vs display CRS distinction
- transform eligibility planner
- metadata assignment vs coordinate transformation separation
- reusable refusal/warning generation
- operation-specific CRS policy declarations

### Example CRS policy types

```ts
interface CrsContract {
  requiresKnown: boolean
  requiresExactMatch?: boolean
  allowsTransformPlan?: boolean
  allowsMetadataOnlyAssign?: boolean
  blocksOnUnknown?: boolean
  blocksOnMissing?: boolean
}
```

### Why this matters
Future operations will differ sharply:
- clip/intersect want matching CRS
- buffer/area may want projected CRS guidance
- transform-aware topology later may need explicit pre-op reprojection

Without this subsystem, every new op becomes another CRS fork bomb.

---

## Layer 4 — Topology operation framework

Generalize the clip/intersect seam into a reusable topology family substrate.

### Scope
Applies to:
- clip
- intersect
- union
- erase
- symmetric difference
- identity (later if earned)

### Shared responsibilities
- source/secondary-input distinction
- geometry-family matrix validation
- mixed-collection refusal
- CRS precondition enforcement
- topology engine adapter call
- empty-result semantics
- attribute-preservation policy
- history/provenance semantics
- typed topology failure mapping

### Suggested abstraction

```ts
interface TopologyOperationDefinition extends OperationDefinition {
  family: 'topology-two-input'
  secondaryRoleLabel: 'mask' | 'overlay' | 'erase' | 'union'
  attributePolicy: 'source-only' | 'none' | 'merged-later'
  emptyResultMode: 'honest-empty-success' | 'error'
}
```

### Immediate architectural use
- refactor clip to sit on this substrate
- then implement intersect v1 as the second proof point

---

## Layer 5 — Derived artifact + provenance builder

Every operation must produce derived artifacts and history with the same semantics.

### Derived artifact builder must standardize
- artifact kind
- stored CRS
- CRS provenance
- warning inheritance / historical warnings
- row count
- geometry type
- render issue semantics
- query registration status

### Provenance builder must standardize
- operation name
- input artifact ids
- output artifact ids
- CRS facts
- support-envelope semantics
- output contract facts
- warning lineage
- empty-result facts
- provenance strength / confidence fields where applicable

### Why this matters
This is how we avoid lineage becoming unreadable once workflows chain multiple operations.

---

## Layer 6 — Warning / refusal taxonomy

A shared typed-code taxonomy for operations.

### Core families
- input selection errors
- CRS errors
- geometry-family errors
- topology execution failures
- transform/runtime failures
- empty-result informational states
- degraded/partial-support states

### Immediate intersect-related additions
- `OVERLAY_ARTIFACT_REQUIRED`
- `TOPOLOGY_OPERATION_FAILED`
- `EMPTY_TOPOLOGY_RESULT`

### Rule
New operations should not invent one-off prose errors when a typed code belongs in the shared taxonomy.

---

## Layer 7 — Reusable operation UI primitives

Minimize bespoke dialog growth.

### Reusable UI building blocks
- source artifact summary card
- second-input selector
- CRS contract summary
- geometry-family contract summary
- typed refusal panel
- output semantics disclosure
- operation confirmation form
- result-state summary

### Long-term goal
Each new operation should compose shared UI primitives rather than ship a custom dialog from scratch.

---

## Layer 8 — Validation architecture

The operation suite needs a test pyramid.

### A. Contract tests
Cheap, fast, semantics-only.

Examples:
- unsupported geometry refused
- unknown CRS refused
- CRS mismatch refused
- output semantics encoded correctly
- support envelope does not overclaim

### B. Engine integration tests
Medium cost.

Examples:
- polygon ∩ polygon gives expected result
- non-overlap yields honest empty result
- derived artifact is queryable after materialization

### C. Browser/product workflow tests
Highest cost, fewer in number.

Examples:
- two-input UX is coherent
- materialized artifact appears
- lineage panel reflects operation truth
- map/table/detail seams stay coherent

### Fixture library requirements
Need canonical fixtures for:
- overlap
- no overlap
- touching edges
- holes
- multipolygons
- invalid geometry
- CRS mismatch pairs
- projected/WGS84 counterparts
- mixed-geometry refusal cases

---

## Phased implementation roadmap

## Phase 1 — Operation substrate core

### Goal
Create the shared operation-definition + execution scaffolding.

### Deliverables
- operation definition types
- operation registry module
- shared execution pipeline skeleton
- shared derived-artifact builder extraction
- shared provenance builder extraction

### Acceptance criteria
- at least one existing single-input operation is refactored onto the new substrate
- no support-envelope truth regresses
- build and current browser validations remain green

---

## Phase 2 — CRS subsystem hardening

### Goal
Make CRS policy reusable and operation-declarative.

### Deliverables
- CRS contract model
- CRS validation helpers
- transform planning primitives
- standardized CRS refusal/warning generation

### Acceptance criteria
- clip/intersect refusal paths can declare CRS policy rather than hand-roll it
- reproject path still preserves current truth and warnings
- support envelope wording remains aligned with runtime truth

---

## Phase 3 — Topology family framework

### Goal
Abstract the two-input topology seam.

### Deliverables
- topology operation base flow
- secondary-input role modeling
- attribute-policy declaration
- empty-result handling standardization
- topology failure mapping

### Acceptance criteria
- clip is migrated onto topology family substrate
- intersect refusal seam uses the same substrate
- current clip validations remain green

---

## Phase 4 — Validation / fixtures expansion

### Goal
Make new operations cheap to prove.

### Deliverables
- fixture library
- contract test helpers
- topology integration test helpers
- browser smoke for topology-family coherence

### Acceptance criteria
- at least one topology success-path test exists outside browser-only proof
- refusal and success semantics are both covered

---

## Phase 5 — Intersect v1 as substrate proof

### Goal
Implement the narrowest honest intersect.

### Intersect v1 contract
- polygon/multipolygon only
- known matching CRS only
- source attributes only
- honest empty-result semantics
- derived artifact registration
- full provenance/history coverage

### Acceptance criteria
- `INTERSECT-V1-CONTRACT.md` acceptance checklist is satisfied
- support envelope updated from `not_supported` to `partial`
- refusal tests pass universally
- validated-local success tests pass
- browser product checks pass

---

## Phase 6 — Broader operation growth

After substrate proof, expand by family rather than randomly.

### Recommended order
1. single-input geometry family additions
2. topology family additions
3. transform-aware topology
4. measurement/analysis ops (area v1 is now the first shipped proof on that family seam)
5. richer overlay semantics later only if earned

---

## Current architecture read (2026-03-22)

The first two substrate cuts are now real:

### Landed substrate pieces
1. **Operation substrate core**
   - product-level operation types under `src/lib/operations/types.ts`
   - truthful current operation registry under `src/lib/operations/registry.ts`
   - basic support/capability helpers
   - extracted single-input artifact/provenance builders
   - first registry-driven single-input executor seam
   - single-input execution pipeline now lives in `src/lib/operations/executor.ts` instead of being re-implemented inside the spatial helper facade
   - centroid migrated first as the proof point
   - shared runtime/provenance helpers now unify derived CRS truth, warning carry-forward, and query-table registration across single-input and topology-family execution

2. **Topology family substrate**
   - topology contract/validation separated from topology execution/materialization/history
   - clip migrated onto the shared topology seam
   - intersect refusal path moved onto the same family seam without adding success semantics
   - `operation-helper.ts` narrowed so topology-family implementation no longer lives there directly

3. **CRS policy extraction (partial)**
   - operation contracts now declare CRS requirements with a more explicit vocabulary (`allow-any`, `require-known`, `require-known-or-explicit`, exact-match policy)
   - shared CRS policy validation/refusal helpers now drive topology CRS checks and reproject preflight more directly
   - cheap registry-level CRS contract truth validation exists so contract drift is less likely
   - a new contract-level transform-planning layer now declares whether an operation is same-CRS-only, explicit-transform, or non-transforming, plus whether future explicit pre-op planning is architecturally eligible without changing shipped behavior
   - operation validation is now explicitly bucketed so universal contract truth can stay cheap and stable even when validated-local PROJ/browser runtime checks are environment-sensitive

### What this means
The project has crossed from architecture intent into early architecture reality.
The next slices should deepen reuse and reduce wrapper duplication, not restart design from scratch.

## Recommended next concrete move

The substrate has now matured far enough that the next move does not need to be pure rescue architecture by default.

Recommended next step:
1. spend the substrate on **reusable operation UI primitives** so future operations stop paying bespoke dialog/copy costs
2. keep strengthening cheap contract/integration validation only where it clearly reduces future work
3. hold transform-aware topology and broader intersect semantics until explicitly earned

This keeps the project moving forward while preserving the support-envelope discipline that made the current substrate trustworthy.

---

## Non-goals of this roadmap

This roadmap does not yet commit to:
- full desktop-GIS parity
- universal runtime support across all hosts
- overlay attribute merge semantics
- automatic transform-then-topology
- full spatial join semantics
- grouped topology/analysis workflows

Those can be earned later if the substrate holds.

---

## Bottom line

If the project wants a comprehensive geoprocessing suite that is both **fast to extend** and **hard to lie with**, the next era should be about this:

> build the operation substrate first, then let new operations become cheap, narrow, and truthful extensions of it.

Clip and intersect are not just features.
They are the forcing function for the architecture the rest of the suite will depend on.
