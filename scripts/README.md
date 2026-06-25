# Web-native Geoprocessing Suite — Smoke Test

## What this verifies

Browser-side integration test for Slice 1 (map-first shell) and Slice 3 (layer controls). Verifies the app actually renders and behaves as expected, not just that the build succeeds.

## How to run

```bash
cd projects/web-native-geoprocessing-suite
npm run build                  # build the app
npx vite preview --port 4173   # serve the built app (in another terminal)
node scripts/smoke-test.mjs    # run the smoke test
```

Output goes to `./smoke-screenshots/` (PNGs of each major state + a JSON results file + console error log).

## What it checks (Slice 1 acceptance criteria)

- ✅ 5 sidebar icons present (Layers / Discover / Import / Query / History)
- ✅ Command bar present at bottom
- ✅ Top-bar operation buttons hidden (Buffer/Centroid/Clip etc. removed from chrome)
- ✅ Map element rendered
- ✅ Layers icon opens drawer
- ✅ No console errors

## What it checks (Slice 3 acceptance criteria — empty-state path)

- ✅ Layers panel renders empty state ("No project artifacts yet")
- ✅ Layer controls only render when spatial artifacts exist (correct gate)

## What it checks (NL pipeline — Slice 1 chain viz)

- ✅ Typing "Buffer parcels by 500 feet" in the command bar produces a plan visualization
- ✅ Plan shows: op=Buffer, distance_unit=feet, output=output_buffer
- ✅ Confidence: Low, "Missing source artifact" (correct — no parcels loaded)
- ✅ Execute button present (gated on missing source)

## What this does NOT verify

- **End-to-end spatial operations.** Requires loading actual GeoJSON data. Smoke test runs against the empty state.
- **Layer controls (visibility/opacity/z-order) on real artifacts.** Same — no fixtures loaded.
- **Hidden operation dialogs reachability.** Slice 1 hid them from chrome but kept code paths; this test doesn't try to reach them via artifact context menu (a future slice should).
- **Z-order visual reorder at runtime.** Slice 3.7 added `map.moveLayer()` calls; can't verify without 2+ spatial layers on the map.

## Future improvements

- Load a sample GeoJSON fixture (e.g., a small parcels file) before the smoke test runs, so layer controls and end-to-end NL→execute can be verified.
- Add a test for the 14 hidden operation dialogs (find them via artifact context menu or `/run-op` command).
- Add visual diff checks against a baseline screenshot to catch unintended UI regressions.

## Results from first run (2026-06-24)

```
=== SMOKE TEST: 6/6 passed, 0 failed ===
```

All Slice 1 UI acceptance criteria verified in browser. NL pipeline confirmed working (chain visualization produced for Buffer query). Zero console errors.