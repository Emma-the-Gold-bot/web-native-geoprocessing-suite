# Upgrade Progress Tracker

## Status: IN PROGRESS
## Started: 2026-06-25 23:53 PDT

## Session 1 — Engine Tests (parallel)
- [ ] Slice 16: NL pipeline tests (plan-executor + query-resolver)
- [ ] Slice 17: Validation core tests
- [ ] Slice 18: Operation execution tests (5 files)
- [ ] Slice 19: Spatial engine tests (3 files)
- [ ] Slice 20: Registry tests

## Session 2 — NL Hardening (sequential, depends on 1A)
- [ ] Slice 21: Fix parameter extraction
- [ ] Slice 22: Wire attribute-join
- [ ] Slice 23: Resolver robustness

## Session 3 — Decompose: Dialogs (sequential)
- [ ] Slice 24: Extract 12 operation dialogs (5 sub-tasks)

## Session 4 — Decompose: Hooks + Panels (sequential)
- [ ] Slice 25: Extract 4 hooks
- [ ] Slice 26: Extract RightPanel + BottomDock
- [ ] Slice 27: Slim App.tsx <1,500 lines

## Session 5 — E2E + Cleanup (parallel tracks)
- [ ] Slice 28: Test datasets + Playwright e2e
- [ ] Slice 29: E2E validation report
- [ ] Slice 30: Archive docs + commit untracked

## Session 6 — Code-Split
- [ ] Slice 31: Bundle code-split <2MB

## Final Verification
- [ ] npm run build clean
- [ ] npm test ≥500 tests
- [ ] node scripts/smoke-test.mjs 9/9
- [ ] node scripts/e2e-canonical-queries.mjs 5/5
- [ ] wc -l src/App.tsx < 1,500
- [ ] git status clean
- [ ] Main bundle <2MB
