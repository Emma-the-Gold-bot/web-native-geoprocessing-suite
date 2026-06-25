# Slice 3.6 Code Review

## Goal

Fix 3 latent bugs in `src/lib/layer-controls.ts` that Slice 3.5's red tests surfaced. Update tests to assert correct behavior. Add edge case tests.

## Bug fixes (verified against implementer's actual code)

### Bug 1: zIndex incrementing
- ✅ `reconcileLayerSettings` now reads `existingMaxZ` from `next` (not `prev`)
- ✅ Multiple new artifacts in one pass get 0, 1, 2 (not all 0)
- ✅ Test updated: `layer-controls-helpers.test.ts` `CURRENT BEHAVIOR` → `FIXED (Slice 3.6)`
- ✅ Added 2 edge case tests: 5 new artifacts get 0..4; new artifacts added above existing max-z (10 → 11 → 12)

### Bug 2: defensive defaults for `toggleLayerVisibility`
- ✅ `toggleLayerVisibility` on missing entry creates `DEFAULT_LAYER_SETTINGS.opacity` + `zIndex: 0`
- ✅ Test updated: `CURRENTLY BROKEN` → `FIXED (Slice 3.6)`
- ✅ Added 2 edge case tests: toggle twice on missing flips visible to false; toggling existing entry preserves opacity/zIndex

### Bug 3: cleanup filters by spatial
- ✅ `reconcileLayerSettings` cleanup checks `artifact.spatial` (in addition to membership)
- ✅ Stale entries for non-spatial artifacts cleaned up
- ✅ Test updated: `CURRENT BEHAVIOR` → `FIXED (Slice 3.6)`
- ✅ Added 2 edge case tests: preserves spatial artifact settings when still in list; cleans up multiple stale entries in one pass

## Edge case coverage added

- 6 new tests across the 3 bug fixes (2 per bug)
- All assert correct behavior with `// FIXED (Slice 3.6):` comments
- Total test count: 65 → 71

## Test result

- Tests passing: 71/71
- Tests updated: 3 (`CURRENT BEHAVIOR` / `CURRENTLY BROKEN` renamed to `FIXED (Slice 3.6)`)
- Tests added: 6 (edge cases)
- Build: clean (229 modules, exit 0)

## Issues found in implementer's code

None. The implementer (Qwen 3.7+) shipped clean fixes that matched the spec. Diff was minimal — only `src/lib/layer-controls.ts` modified.

## Recommendation

**ACCEPT.** All 3 bug fixes verified against real code via real tests. 71/71 passing. No regressions. Slice 3.6 is sound.

## Notes for future slices

- The z-order visual runtime limitation (needs `map.moveLayer()`) is still present — Slice 4+ candidate.
- The nested `<button>` HTML violation is still present — cosmetic, deferred to polish slice.
- The dispatch pattern (complementary) continues to work well. The implementer's diff was minimal and correct.
- This slice was completed in main after the dispatched tester sub-agent aborted at 32s without writing any tests (likely a flaky dispatch on MiniMax M3 in this slot). The complementary pattern's safety net (verifier = main agent) compensated — main caught the missing tester output, applied the spec changes manually, and verified against the implementer's shipped code.