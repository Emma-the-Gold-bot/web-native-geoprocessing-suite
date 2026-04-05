# Phase 1 Implementation Brief — Operation Substrate Core

## Purpose

Turn `OPERATION-SUBSTRATE-ROADMAP.md` into the first concrete build slice.

Phase 1 is **not** about adding new end-user operations.
It is about extracting the minimum architectural substrate required so future operations become faster, more reliable, and less bespoke.

The target is a first substrate cut that can carry at least one existing operation honestly without regressing current product truth.

---

## Phase 1 goal

Create the first shared operation-substrate core:
- operation definition types
- operation/capability registry scaffold
- shared execution pipeline skeleton
- shared derived-artifact builder extraction plan
- shared provenance builder extraction plan

This phase should stop short of a broad refactor.
The goal is to create the seam, not rewrite the whole app in one pass.

---

## What exists now

The current code already contains partial substrate pieces, but they are spread across the wrong places:

### Existing assets worth building on
- `src/lib/spatial/operation-helper.ts`
  - canonical product/engine orchestration already exists in embryo
  - handles validate → adapt → execute → artifact → history → DuckDB registration
- `src/lib/spatial/adapters.ts`
  - artifact ↔ operation input / output adaptation seam
- `src/lib/spatial/warning-codes.ts`
  - typed warning taxonomy seam
- `src/lib/spatial/types.ts`
  - support envelope + engine type definitions already exist in partial form
- `src/lib/spatial/index.ts`
  - current export surface for spatial subsystem

### Current architectural smell
- `operation-helper.ts` still owns the main single-input orchestration path and thin topology wrappers
- topology-family implementation has now been extracted, but deeper execution reuse is still incomplete
- operation capability truth is now far better centralized, but UI/docs do not yet consume the registry broadly
- CRS policy is still more procedural than declarative

---

## Phase 1 success criteria

Phase 1 is complete when all are true:

- [ ] there is a dedicated operation-definition / registry module
- [ ] there is a first-class product-level operation result type separate from engine result types
- [ ] at least one existing single-input operation can be described through the new registry
- [ ] current operation helper is clearly split into substrate vs operation-family concerns
- [ ] no support-envelope truth regresses
- [ ] build passes
- [ ] current high-value browser checks remain green

Nice-to-have, not required for phase completion:
- [ ] one operation is actually migrated to the registry-driven pipeline

---

## Recommended file/module cuts

## 1. New: `src/lib/operations/types.ts`

### Purpose
Canonical product-level operation substrate types.

### Add here
- `OperationFamily`
- `OperationSupportTier`
- `GeometryContract`
- `CrsContract`
- `OutputContract`
- `OperationUiHints`
- `OperationDefinition`
- `OperationExecutionContext`
- `OperationExecutionOutcome`
- `OperationRefusal`

### Why
These should not live in engine-oriented spatial types.
They describe **product operations**, not low-level engine messages.

### Suggested shape

```ts
export type OperationFamily =
  | 'single-geometry'
  | 'topology-two-input'
  | 'crs'
  | 'measurement'
  | 'aggregation'

export type OperationSupportTier =
  | 'universal'
  | 'validated_local'
  | 'environment_sensitive'
  | 'partial'
  | 'not_supported'

export interface GeometryContract {
  inputArity: 1 | 2
  allowedSourceGeometry?: string[]
  allowedSecondaryGeometry?: string[]
  refuseMixedGeometryCollections?: boolean
}

export interface CrsContract {
  requiresKnown: boolean
  requiresExactMatch?: boolean
  blocksOnUnknown?: boolean
  blocksOnMissing?: boolean
  allowsTransformPlan?: boolean
}

export interface OutputContract {
  attributePolicy?: 'source-only' | 'none' | 'merged-later'
  emptyResultMode?: 'honest-empty-success' | 'error'
  outputGeometryFamilies?: string[]
}

export interface OperationDefinition {
  id: string
  label: string
  family: OperationFamily
  supportTier: OperationSupportTier
  runtimeSensitive?: boolean
  geometryContract: GeometryContract
  crsContract: CrsContract
  outputContract: OutputContract
  warningCodes: string[]
  refusalCodes: string[]
  uiHints?: {
    secondaryRoleLabel?: string
    summary?: string
  }
}
```

---

## 2. New: `src/lib/operations/registry.ts`

### Purpose
Single source of truth for operation capability/contract declarations.

### Add here
Initial registry entries for current shipped operations at the time of this substrate cut included:
- `buffer`
- `centroid`
- `dissolve-global`
- `reproject`
- `clip-v1`
- `intersect-v1-refusal`

Current tree note: the registry has since grown beyond that first cut and now also carries later narrow shipped operations such as `convex-hull-v1`, `envelope-v1`, `simplify-v1`, `area-v1`, and executed `intersect-v1`.

### Important constraint
This registry should reflect **current shipped truth**, not aspirational future behavior.

### Why this matters
It gives one place that future UI/docs/tests can read from.

### Suggested first cut
Start with plain exported objects, not a fancy class.

```ts
export const OPERATION_REGISTRY: Record<string, OperationDefinition> = { ... }
export const getOperationDefinition = (id: string) => OPERATION_REGISTRY[id]
```

---

## 3. New: `src/lib/operations/capabilities.ts`

### Purpose
Bridge between product operation registry and support-envelope presentation.

### Add here
Helpers like:
- `getOperationSupportTier(id)`
- `isOperationSupported(id)`
- `getOperationSupportEnvelope(id)`

### Why
Avoid duplicating support logic between docs/UI/tests later.

---

## 4. New: `src/lib/operations/provenance-builder.ts`

### Purpose
Start extracting product-level history/provenance construction out of `operation-helper.ts`.

### Phase 1 scope
Do **not** fully rewrite all history creation.
Just extract the builder shape and one initial helper for generic single-input operation events.

### Add here
- `buildSingleInputOperationHistoryEvent(...)`
- type helpers for provenance detail payloads

### Why
This begins separating execution from history formatting.

---

## 5. New: `src/lib/operations/artifact-builder.ts`

### Purpose
Start extracting derived-artifact construction out of `operation-helper.ts`.

### Phase 1 scope
Create a narrow builder for single-input operation-derived artifacts.
Do not yet move clip-specific/two-input logic unless it falls out naturally.

### Add here
- `buildSingleInputDerivedArtifact(...)`
- maybe `registerDerivedArtifactTable(...)` if the cut stays clean

### Why
Artifact creation is one of the key repeatable substrate seams.

---

## 6. Refactor: `src/lib/spatial/operation-helper.ts`

### Goal
Make this file narrower and more honest.

### Keep here for now
- execution orchestration
- adapter usage
- engine invocation coordination

### Begin removing from here
- operation registry/capability truth
- provenance formatting details
- reusable derived-artifact construction details

### Desired end state after Phase 1
This file becomes closer to:
- execution coordinator

rather than:
- coordinator + registry + builder + topology family + policy dump

---

## 7. Optional: `src/lib/operations/index.ts`

### Purpose
Simple export barrel for new operation-substrate modules.

Useful once the first few modules exist.

---

## Recommended implementation order

## Step 1 — Define the types
Create:
- `src/lib/operations/types.ts`

Keep it minimal and real.
Do not over-generalize yet.

## Step 2 — Declare the current registry
Create:
- `src/lib/operations/registry.ts`

Encode current truthful support state only.
This is the first architectural anchor.

## Step 3 — Extract provenance and artifact builders
Create:
- `src/lib/operations/provenance-builder.ts`
- `src/lib/operations/artifact-builder.ts`

Move only the most generic single-input operation logic first.

## Step 4 — Refactor one existing path onto the new seam
Best candidate:
- `buffer` or `centroid`

Why:
- one input
- simpler provenance
- simpler artifact semantics
- lower CRS/topology complexity than clip/intersect

## Step 5 — Rebuild confidence
Run:
- production build
- current operation/browser validations that touch refactored paths

If stable, stop and document.
Do not immediately pile on more refactors.

---

## First operation to migrate

### Recommendation: `centroid`

Why centroid first:
- single input
- low parameter complexity
- no topology-family complexity
- simpler warnings/output semantics than buffer
- easier proof that registry + builder + execution seam can work

### Alternate: `buffer`
Also reasonable, but buffer carries approximation + unit caveat semantics, which makes it slightly noisier.

### Not recommended for Phase 1 first migration
- clip
- intersect
- reproject

Those are better Phase 2/3 forcing functions.

---

## What not to do in Phase 1

Avoid these traps:

### 1. Do not implement intersect yet
That would put feature pressure on the substrate before the seam exists.

### 2. Do not rewrite all operation dialogs
UI substrate can wait until core contract/execution seams exist.

### 3. Do not over-design transform planning yet
CRS planning belongs in Phase 2.
Phase 1 should just create the types/registry shape so Phase 2 has a place to attach.

### 4. Do not turn the registry into a giant abstraction machine
Plain objects and simple helpers are enough for the first cut.

### 5. Do not let docs drift while refactoring
If the architecture cut changes how the project is described, update docs at the end of the slice.

---

## Validation plan for Phase 1

### Required
- `npm run build`
- at least one current browser validation touching the migrated single-input path
- sanity check that docs/support claims still match runtime truth

### Recommended
- add one small non-browser contract test for operation registry shape

Example checks:
- known operations exist in registry
- support tiers are declared
- input arity is declared
- clip/intersect remain represented honestly as narrow/unsupported where appropriate

---

## Expected output of Phase 1

At the end of Phase 1, the project should have:
- a visible product-level operation substrate namespace
- a current-truth operation registry
- a first extraction of shared artifact/provenance builders
- one simple operation migrated through that seam
- no user-facing support envelope expansion

This is enough to make Phase 2 and Phase 3 real instead of theoretical.

---

## The sharp next move

If we execute exactly one development slice next, it should be:

> create the operation registry + types, extract single-input artifact/provenance builders, and migrate centroid onto the new seam.

That is the smallest honest proof that the substrate architecture is becoming real.
