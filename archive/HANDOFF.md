# Handoff — Web-native geoprocessing suite

**Date:** 2026-03-20

## Current state

The core CRS/reprojection seam is now in materially better shape and browser-verified:

- PROJ runtime-path defect fixed
- GeoJSON ↔ PROJ coordinate-order bug fixed
- projected-artifact map framing contract fixed via display normalization
- stored artifact CRS truth preserved
- CRS/display provenance is now surfaced in the UI
- end-to-end browser reprojection flow passes
- docs were cleaned up to match reality

Key verified browser outcome:
- import sample GeoParquet
- reproject `EPSG:4326 -> EPSG:3857`
- derived artifact `example_reprojected_3857` created
- artifact shows truthful stored CRS (`EPSG:3857`)
- map framing uses display-transformed WGS84 bounds

## Important docs

Read these first in a fresh session:
- `ACTIVE_TODO.md`
- `PROGRESS.md`
- `docs/PROJ-WASM-DIAGNOSIS.md`
- `PROJ-WASM-PRODUCTION-READINESS.md`
- `docs/KNOWN-CONSOLE-MESSAGES.md`

## Tomorrow list

### 1. Split the support-envelope test contract cleanly
Current issue: new support-envelope tests exist, but PROJ-dependent cases are unstable in headless browser environments.

Do this:
- separate **always-green structural tests** from **environment-dependent PROJ/browser verification tests**
- make it obvious which suite is expected to pass in headless CI and which requires the hardened browser runtime
- keep claims honest in docs and script names

### 2. Review clip/intersect honestly before implementation
Do **not** jump straight into coding.

First produce an honest support review covering:
- geometry families supported / unsupported
- whether GEOS path is reliable enough
- expected failure modes
- what refusal language the product should use

Only implement after the support envelope is explicit.

### 3. Tighten CRS/display provenance wording if needed
The UI is better now, but a fresh eye should confirm the wording is crisp:
- stored CRS
- display CRS / display normalization
- confidence badge meaning
- provenance source labels

If anything feels muddy, tighten copy before adding more feature surface.

## What not to do next

- do not add multiple new geometry ops at once
- do not chase headless WebGL noise as if it were core product work
- do not weaken truthful CRS/display distinctions for convenience
- do not overclaim PROJ stability in headless environments

## Suggested first move in fresh session

Start by making the test story honest and legible:
1. inspect the new support-envelope tests
2. split stable vs environment-dependent paths
3. update docs if naming/claims are too loose
4. then move to clip/intersect support review
