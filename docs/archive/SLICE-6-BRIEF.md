# Slice 6 — Discover Panel Workspace Wiring

**Project:** web-native-geoprocessing-suite
**Started:** 2026-06-25
**Goal:** Wire DiscoveryPanel into the workspace so the panel goes end-to-end:
external data → DuckDB registration → map rendering → Layers panel → SQL queryable.

## Scope (this slice)

Three concrete handlers in `App.tsx` that currently stub to a toast:

1. **6a. `onImport` (vector result → workspace artifact)**
   - Current line 2975: `onImport={() => addToast('Discovery import wired — implementation in Slice 3.', 'info')}`
   - Replace with real handler: convert vector `DiscoveryResult` to a workspace `Artifact`
     (DuckDB registration + map render + Layers entry + history event).
2. **6b. `onBboxPreview` (bbox rectangle overlay during confirm)**
   - Current line 2976: `onBboxPreview={() => {}}`
   - Replace with real handler: render bbox as semi-transparent rectangle
     on the map while user is in `confirming` state; clear otherwise.
3. **6c. `@osm/@ckan/@stac` prefix routing**
   - Current line 496: `addToast(\`Discovery prefix @${target} will route to DiscoveryPanel (placeholder)\`, 'info')`
   - Replace with real routing: open Discovery panel, set `source` to the
     prefix target, seed query with the trailing text.

## Out of scope (deferred)

- **Slice 7:** LLM resolver, parameter inference, chain condition handling
- **Slice 8:** Undo/redo stack
- **Slice 9:** Export menu + keyboard shortcuts
- Mobile UX density polish (Slice 5)
- New operations beyond the existing 15
- Raster ingestion beyond GeoJSON vector results (DiscoveryPanel supports
  raster and links kinds — Slice 6 handles vector end-to-end, raster
  surfaces its `data_url` with a "Link to asset" anchor, links surfaces
  the candidate list — matches existing panel UI; just no artifact creation).

## What "done" means

### 6a — vector import

- `App.tsx` accepts a new prop callback into `DiscoveryPanel` that receives
  an `ApiDiscoveryResult`.
- Handler:
  1. Validates `result.kind === 'vector'` and `result.data` is a FeatureCollection.
  2. Builds an `Artifact` mirroring the existing GeoJSON import path
     (`confirmImport` flow, lines 1611–1720). Use the same `makeId`,
     `buildImportCrsProvenance`, DuckDB `registerFileText` + `insertJSONFromPath`
     pattern. **Reuse the existing `confirmImport` path** — refactor
     `confirmImport` to accept either `importReview` or a pre-built
     `FeatureCollection`, then call from both the file import and the
     discovery import. Do not duplicate the registration logic.
  3. Artifact name: derive from `result.provenance.source` + bbox or query
     (e.g., `"osm-buildings-san-francisco"`); fallback to `"discovery-<n>"`.
  4. CRS: discovery results are WGS84 (geocode produces WGS84 bbox, OSM
     is WGS84) — set `crs: 'EPSG:4326'` with appropriate provenance.
  5. Warnings: copy through `result.trace` as a single `info`-severity
     historical warning titled "Discovery provenance".
  6. History event: `type: 'import'`, `summary: 'Imported <name> from <source>'`,
     details include source, bbox, license (if present), attribution.
  7. After artifact registered: `setSelectedArtifactId`, `setBottomTab('table')`,
     toast `"Imported <name>"`, status message, **close the Discovery panel**
     (set `activeSidebar(null)` or to `layers`).
- The panel's "Import to workspace" button calls this handler.
- If the discovery result has no `data` (e.g., `kind === 'links'` or
  `'raster'` without `data_url`), no artifact is created — panel just
  shows the links/asset (already does this).

### 6b — bbox preview

- `App.tsx` accepts a new prop callback that receives `BBox | null`.
- Handler:
  1. When bbox is non-null: add (or update) a dedicated source on the map
     called `__bbox-preview`, type `geojson`, data = bbox as a Polygon
     Feature (`{ type: 'Polygon', coordinates: [[
     [bbox.west, bbox.south], [bbox.east, bbox.south],
     [bbox.east, bbox.north], [bbox.west, bbox.north],
     [bbox.west, bbox.south]
     ]] }`).
  2. Add a dedicated layer `__bbox-preview-fill` (type: fill,
     `fill-color: '#22d3ee'`, `fill-opacity: 0.12`) and `__bbox-preview-line`
     (type: line, `line-color: '#22d3ee'`, `line-width: 2`,
     `line-dasharray: [2, 2]`).
  3. When bbox is null: remove source + layers.
  4. Source/layer ids use the `__` prefix so they are clearly internal —
     the existing artifact-sync effect (which iterates `artifacts`) will
     not touch them, but defensive: also exclude these ids from the
     cleanup pass at the bottom of the artifact-sync effect.
- The bbox-preview useEffect must run AFTER `mapRef.current` is set —
  guard with `if (!mapRef.current) return`.
- The bbox layer should render **below** artifact fills but above the
  OSM basemap. Use `beforeId` = undefined (last layer) for now; if
  z-order with artifacts looks wrong, use the artifact `fillId` of the
  lowest-zIndex artifact as `beforeId`. Don't overthink this — match
  the existing artifact sync pattern's style.

### 6c — prefix routing

- `handleCommandChange` already opens Discovery panel on `@`. Extend the
  branch: if `@osm` / `@ckan` / `@stac` is the prefix, additionally
  pass `source` and seeded `query` to the DiscoveryPanel.
- Concrete: add state `const [discoverySource, setDiscoverySource] = useState<string | null>(null)`
  and `const [discoverySeedQuery, setDiscoverySeedQuery] = useState<string>('')`,
  pass both to `DiscoveryPanel` as props.
- DiscoveryPanel accepts optional `source?: string` and `initialQuery?: string`
  props. On mount, if `initialQuery` is non-empty and the panel's query
  state is empty, seed it. (Don't override user typing.)
- After user successfully runs a discovery, the `source` and seed state
  can be cleared (or left — they don't hurt). Prefer to clear when
  DiscoveryPanel unmounts (closes).

## Architecture constraints

- **No new files unless absolutely necessary.** All handlers belong in
  `App.tsx` where `setArtifacts`, `setHistory`, `addToast`, `mapRef`, and
  the existing `confirmImport` flow already live. If 6a's refactor of
  `confirmImport` is invasive, extract the post-validation registration
  into a small helper in `src/lib/utils.ts` or a new file
  `src/lib/importFlow.ts` — but only if extraction is cleaner than inline.
- **Reuse existing patterns.** The GeoJSON registration path is the
  reference. The bbox source/layer pattern follows the artifact-sync
  effect's `addSource` / `addLayer` / `removeLayer` style.
- **No CSS changes required** for this slice. The panel UI already
  supports the confirm state. The bbox overlay uses the existing map
  paint property vocabulary (cyan accent matches the design system).

## Files to touch

- `src/App.tsx` — three handlers + state additions for prefix routing
- `src/components/DiscoveryPanel.tsx` — accept `source`, `initialQuery`,
  `onImport`, `onBboxPreview` props (most already exist; add the two new ones)
- Optionally: `src/lib/importFlow.ts` (new) if `confirmImport` extraction
  is cleaner than inline

## Files NOT to touch

- `src/lib/discovery.ts` (the backend client) — already complete
- `discovery/` Python backend — already complete
- `src/lib/operations/**` — engine layer untouched
- Existing operation handlers, NL resolver, plan builder, plan executor

## Tests required

Following the Slice 3.5 / Slice 4.x pattern:

- `src/components/__tests__/DiscoveryPanel.test.tsx` — 8+ tests:
  - Initial render: empty state
  - Source / initialQuery props populate input on mount
  - `initialQuery` does NOT override user typing (initial mount only)
  - `onBboxPreview` fires when bbox confirmed
  - `onImport` fires when "Import to workspace" clicked
  - Import button hidden for `kind === 'links'`
- `src/App.test.tsx` or extract `src/lib/importFlow.test.ts` if helper
  extracted — 6+ tests for the vector→artifact conversion:
  - Builds Artifact with correct id, name, crs, tableName
  - Registers DuckDB table
  - Adds history event
  - Sets selectedArtifactId
  - Closes Discovery panel after import
  - Returns null/undefined for non-vector results (no artifact created)

Target: 107 → 121+ tests passing.

## Acceptance criteria (smoke test additions)

Extend `scripts/smoke-test.mjs`:
- Open Discover sidebar
- Type "@osm buildings in San Francisco" → assert Discover panel open,
  input shows "buildings in San Francisco"
- (Discovery backend requires Python service running — smoke test should
  skip the actual network call and just verify the UI state, OR start
  the backend in the smoke script. Document which approach taken.)
- Verify map renders bbox rectangle when bbox confirmed (mock or skip
  if backend unavailable)

## Risks

- **6a risk: confirming an import via Discovery shouldn't open the
  `confirmImport` import-review dialog.** That dialog is for the file
  import flow with warnings. Discovery results should bypass review and
  import directly. The refactor must preserve this distinction.
- **6b risk: bbox source/layer cleanup.** When user closes the panel,
  the source/layer must be removed. The `useEffect` cleanup path needs
  to handle this. The current `onBboxPreview` is a one-way push — add
  cleanup logic so unmounting also clears.
- **6c risk: prefix routing vs. typing.** If user types `@osm` and then
  deletes it, the panel shouldn't be stuck on `osm` source. Clear
  `discoverySource` when the command bar input no longer starts with `@`.
  Or simpler: clear on panel unmount.

## Dispatch plan

Complementary pattern (proven on Slices 3.5–4.x):

- **Implementer:** Qwen 3.7+ — three handlers + state additions,
  refactor `confirmImport` if cleaner
- **Tester:** MiMo v2.5 Pro — test files covering all three sub-fixes
- **Judge:** GLM 5.2 — verdict on completeness against this brief

Timeout: 1200s (Slice 3.5/3.6/3.7 baseline).

## Verification

- `npm run build` exit 0
- `npm test` 121+ tests passing (107 → 121+)
- Smoke test additions pass
- No console errors in preview server
- `git log` shows clean commits per sub-fix (6a, 6b, 6c) or single
  Slice 6 commit if tightly coupled

## Post-slice

- DEVELOPMENT.md Slice 6 section (impl + tests + reviewer notes)
- Update MEMORY.md web-native GIS section
