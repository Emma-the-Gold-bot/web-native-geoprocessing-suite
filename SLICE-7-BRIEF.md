# Slice 7 — Chain Condition Handling

**Project:** web-native-geoprocessing-suite
**Started:** 2026-06-25
**Goal:** Make `step.condition` actually filter chain steps. Two chains are affected:
`conflict-detection` (optional enrichment join) and `prepare-for-analysis` (optional simplify).

## Context — what triggered this slice

`TOMORROW.md` priority list said:
1. NL loop QA with real data
2. Parameter inference
3. LLM resolver
4. Chain condition handling

Re-read in 2026-06-25 light:

- **(1) NL loop QA** — already proven. 137 tests passing, smoke test green,
  the 5 example queries from TOMORROW.md exercise the resolver path
  end-to-end via NLQueryPanel. Not blocking.
- **(2) Parameter inference** — already wired. `resolveArtifactParameter`
  in `plan-builder.ts` (lines 296+) tries id → name → role hint. Working
  as designed for current scope.
- **(3) LLM resolver** — explicitly deferred by TOMORROW.md itself: "Do
  not build the LLM resolver before the trigger-matching path is tested."
  Still deferred.
- **(4) Chain condition handling** — NOT done. `step.condition` declared
  in `chain-registry.ts` (lines 24–25, 195, 238) is **ignored** by
  `buildChainSteps` (`plan-builder.ts` lines 200–270). The bug:

```ts
for (let i = 0; i < chain.steps.length; i++) {
  const step = chain.steps[i];
  // ... no evaluation of step.condition
  // Step is unconditionally added to plan
}
```

Concrete user impact:
- "Show me board members who own land" → plan includes the `attribute-join-v1`
  enrichment step with empty params, which then fails at exec with
  "Missing source_key or join_key for attribute join".
- "Prepare the parcels for area analysis" (no tolerance mentioned)
  → plan includes the `simplify-v1` step, which then refuses or produces
  garbage because `tolerance` param is undefined.

Both chains are partially broken without this fix.

## Scope (this slice)

**7a — Evaluate `step.condition` in plan builder.** Two known conditions:
`'enrichment provided'` and `'tolerance provided'`. Both check whether
the relevant parameter is present in `candidate.parameters`. If false,
skip the step entirely (don't include it in `steps[]`, don't count
it as a refusal, don't break subsequent step refs).

**7b — `condition` syntax in chain-registry.ts.** Currently a free-text
string. Pin it down to a tiny mini-language:

```ts
type ChainCondition =
  | { kind: 'param-provided'; paramName: string }   // user param is present
  | { kind: 'param-equals'; paramName: string; value: unknown }
```

Replace the existing string literals (`'enrichment provided'`,
`'tolerance provided'`) with the new typed conditions. Update the two
chains in `chain-registry.ts` accordingly.

**7c — Plan executor step ref safety.** When a step is skipped, the
output name from that step is gone. If a later step references
`$stepN.output`, that reference will fail to resolve. Audit: do any
chains in the registry have a later step that depends on an optional
step's output? If yes, the later step should ALSO be skipped (transitively).
If no, document that the constraint is "optional steps must be terminal
or only feed into themselves."

Looking at the two affected chains:
- `conflict-detection`: step 0 (intersect) → step 1 (attribute-join).
  Step 1 is the optional one. Step 0 is NOT optional. So removing
  step 1 is safe — nothing else depends on it. ✓
- `prepare-for-analysis`: step 0 (reproject) → step 1 (simplify).
  Step 1 is the optional one. Step 0 is NOT optional. Removing
  step 1 is safe. ✓

Both chains comply with the constraint. Good. **No transitive
skipping needed for current chains.**

**7d — Update plan description when optional step is skipped.**
The plan's `description` currently comes verbatim from `chain.description`.
When an optional step is skipped, the plan should still read truthfully.
For both affected chains, the existing descriptions don't lie when the
optional step is skipped:
- "Find where two layers overlap and enrich with attributes from both."
  → truthful if no enrichment provided (just intersection).
- "Reproject a layer to a projected CRS suitable for area/distance
  calculations, then simplify for performance."
  → truthful if no simplification requested (just reprojection).

The "then" in prepare-for-analysis is mildly misleading when simplify
is skipped. Acceptable for now; flagged for copy review. Could add a
`(skipped: simplify)` suffix to the plan description when an optional
step is dropped, but that's polish — defer unless trivial.

## Out of scope (deferred)

- **LLM resolver** — explicitly deferred by TOMORROW.md and not on the
  critical path. Trigger matching covers all 5 example queries.
- **Transitive step skipping** — not needed for current chains. Add
  when a chain with a non-terminal optional step is added.
- **Plan description polish** — current descriptions are truthful enough.
- **New operations or chains** — Slice 7 doesn't add either.
- **NL resolver parameter extraction improvements** — current heuristic
  extraction (`extractOperationParameters`, `extractChainParameters`)
  is functional. Not the priority.

## What "done" means

### 7a + 7b — typed chain conditions

- `src/lib/operations/chain-registry.ts`:
  - New exported type `ChainCondition = { kind: 'param-provided'; paramName: string }`
    (start with just this one; the equals variant isn't needed by
    current chains — add it when a chain actually needs it).
  - `ChainStep.condition` retyped from `string` to `ChainCondition`.
  - Two chains updated:
    - `conflict-detection` step 1: `condition: { kind: 'param-provided', paramName: 'enrichment' }`
    - `prepare-for-analysis` step 1: `condition: { kind: 'param-provided', paramName: 'tolerance' }`
- `src/lib/nl/plan-builder.ts`:
  - New helper `function evaluateCondition(condition: ChainCondition | undefined, parameters: Record<string, unknown>): boolean`
    — returns `true` if condition is undefined (no gating) or if the
    named parameter is present (defined and not null/undefined) in
    `parameters`.
  - In `buildChainSteps`, before pushing each step: if
    `evaluateCondition(step.condition, parameters) === false`, skip
    the step (continue without pushing). Track the skipped step index
    in a `Set<number>` so later steps don't try to reference it.
  - If a later step DOES reference a skipped step, fail that step
    with `refusal: 'Optional upstream step was skipped'` (defensive).

### 7c — ref safety

- The `Set<number>` of skipped steps is used in step-ref resolution:
  if a step's `inputs` reference `$stepN.output` where N is in the
  skipped set, treat as missing → push a refusal step for that index.

### 7d — description polish (optional, only if trivial)

- If skipped, add a small note to the plan's `description` like
  `(simplify step skipped — tolerance not provided)`. Implementation:
  in `buildChainSteps`, track which step indices were skipped, and in
  `buildPlan`, append a `(skipped: <op>)` suffix for each skipped step.
- Skip this if it adds more than ~10 lines.

### Tests required

`src/lib/__tests__/plan-builder.test.ts` (new — check if exists first):

- `evaluateCondition(undefined, params)` → `true`
- `evaluateCondition({ kind: 'param-provided', paramName: 'tolerance' }, { tolerance: 0.5 })` → `true`
- `evaluateCondition({ kind: 'param-provided', paramName: 'tolerance' }, {})` → `false`
- `evaluateCondition({ kind: 'param-provided', paramName: 'tolerance' }, { tolerance: undefined })` → `false`
- `buildChainSteps` with `conflict-detection` + `{ source, overlay }` (no enrichment) → 1 step, no join step
- `buildChainSteps` with `conflict-detection` + `{ source, overlay, enrichment, source_key, enrichment_key }` → 2 steps
- `buildChainSteps` with `prepare-for-analysis` + `{ source, target_crs }` (no tolerance) → 1 step, no simplify
- `buildChainSteps` with `prepare-for-analysis` + `{ source, target_crs, tolerance: 0.5 }` → 2 steps
- `buildPlan` end-to-end with `conflict-detection` chain + workspace containing source + overlay → produces 1-step plan with no canExecute refusal
- `buildPlan` end-to-end with `conflict-detection` chain + workspace containing source only → produces 1-step plan with refusal (missing overlay)
- If a chain ever has a non-terminal optional step referenced by a later step: that later step gets a refusal. (Skip if no such chain exists in the registry.)

Target: 137 → 150+ tests passing (add ~10–13).

### Smoke test additions

- Optional. The smoke test already exercises NL Query Panel via the
  "Ask" tab. If the implementer can wire a chain query into the smoke
  test without backending the panel interaction, add one assertion that
  the chain's plan builder skips the optional step. Otherwise skip —
  the unit tests above are sufficient.

## Architecture constraints

- **No new files unless absolutely necessary.** This is a small change
  to plan-builder + chain-registry types.
- **No changes to operations/registry, intent-data, or query-resolver.**
  This slice is bounded.
- **Backwards compatibility**: chain-registry type change breaks any
  consumer using `step.condition` as a string. Grep should show only
  plan-builder and chain-registry itself reference it. Confirm in impl.

## Files to touch

- `src/lib/operations/chain-registry.ts` — new type + 2 chain updates
- `src/lib/nl/plan-builder.ts` — evaluateCondition helper + skip logic
- `src/lib/__tests__/plan-builder.test.ts` — new test file (or extend
  existing if a test file already exists)

## Files NOT to touch

- `src/lib/nl/query-resolver.ts` — works correctly
- `src/lib/nl/plan-executor.ts` — works correctly
- `src/components/NLQueryPanel.tsx` — UI is fine; this is a back-end fix
- `src/lib/operations/**` (except chain-registry.ts) — operations unchanged
- NL resolver, parameter extraction, LLM — explicitly deferred

## Risks

- **Risk: breaking existing chain consumers.** Grep for `.condition` in
  the codebase. If anything besides chain-registry.ts and plan-builder.ts
  reads `step.condition`, it may break. Implementer must verify.
- **Risk: changing the ChainStep type breaks TS compilation elsewhere.**
  Implementer runs `npm run build` and confirms zero errors. If other
  code touches ChainStep, fix on the spot or flag for followup.
- **Risk: condition semantics drift.** The current strings
  ('enrichment provided', 'tolerance provided') are informal. Pinning
  to `{ kind: 'param-provided', paramName }` is a contract improvement,
  not a regression — but document the change in DEVELOPMENT.md.

## Dispatch plan

Complementary pattern (proven on Slices 3.5–6):

- **Implementer:** Qwen 3.7+ — type changes + plan-builder updates.
  Small surface. 600s timeout is enough.
- **Tester:** MiMo v2.5 Pro — ~10 tests in plan-builder.test.ts.
  600s timeout.
- **Judge:** GLM 5.2 — only if the diff touches more than 3 files
  or implementer and tester reports conflict. Otherwise skip and
  rely on the test suite (proven pattern from Slice 6).

## Verification

- `npm run build` exit 0
- `npm test` 150+ tests passing (137 → 150+)
- No console errors in preview server
- Existing smoke test still passes
- `git log` shows clean Slice 7 commit

## Post-slice

- DEVELOPMENT.md Slice 7 section
- MEMORY.md web-native GIS section update
- TOMORROW.md updated: chain conditions no longer on list (item struck);
  remaining items: LLM resolver (still deferred), Slice 8 (undo/redo),
  Slice 9 (export menu + keyboard shortcuts), Slice 5 (mobile density)
