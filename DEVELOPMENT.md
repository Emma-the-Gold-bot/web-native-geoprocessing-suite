# DEVELOPMENT.md — Web-native Geoprocessing Suite

**Project:** Web-native Geoprocessing Suite
**Started:** 2026-06-14
**Direction pivot:** 2026-06-24 (locked)

---

## Direction (Locked 2026-06-24)

**C. Wireframe-first, workbench emerging.**

The map is the only persistent surface. Everything else is summoned on demand via:
- Command bar at bottom center ("WHERE TO?")
- Sidebar icons that grow as needed
- Chain visualization panel (the primary operation surface)

### Three pillars

1. **Map-first shell.** Map dominates viewport (~70%+). No top-bar operation buttons, no persistent right panel, no persistent bottom dock by default.
2. **Sidebar icons, additive.** Initial icons:
   - 🗺️ **Layers** — what's visible on map, opacity, z-order
   - 🔍 **Discover** — data discovery (OSM, ArcGIS, CKAN, STAC) — backend intact, needs re-wiring
   - ➕ **Import** — file-based import (GeoJSON, GeoParquet)
   - 💬 **Query** — saved queries + SQL fallback
   - ⌛ **History** — operation lineage
   
   Add more icons later if the chain surface proves insufficient.
3. **Chain visualization as primary operation surface.** The 14 separate top-bar operation buttons (Buffer, Centroid, Clip, etc.) collapse into a single chat-style command bar. The NL resolver already produces plans (single op or pre-built chain from `CHAIN_REGISTRY.ts`, or ad-hoc chain). Before execution, the chain is rendered as a horizontal sequence of steps with editable parameters. The user confirms; execution happens.

### What happens to the 14 operation dialogs?

They're not deleted — they become a fallback path for "I know exactly what I want, skip the planning." Reachable via:
- The command bar's `/` prefix → direct SQL
- A "Run operation" entry in the command bar that lists operations
- Right-click on artifact → operation menu (later slice)

For Slice 1, the operation buttons remain *hidden in the chrome* but the code paths stay intact. They become reachable through the new shell without rewriting the dialogs themselves.

### What happens to existing components?

| Component | Status in Slice 1 |
|-----------|-------------------|
| `NLQueryPanel.tsx` | **Promoted** to primary input surface. Already implements NL→Plan→Confirm→Execute. Need: chain visualization (horizontal step sequence with editable parameters). |
| `DiscoveryPanel.tsx` | **Re-wired** into sidebar icon slot 2. Backend `discovery/` intact. |
| Topbar (14 operation buttons) | **Hidden** in Slice 1. Code preserved. |
| Right panel (details/history accordion) | **Collapsed** by default. Summonable via "History" sidebar icon or artifact click. |
| Bottom dock (table/sql/results) | **Collapsed** by default. Summonable via "Query" sidebar icon or command bar `/` prefix. |
| Import button | **Re-wired** into sidebar "Import" icon. |
| Export button | **Preserved** in artifact-focused right panel. |
| Toast system | **Preserved.** Already from Phase 1. |
| Artifact list (left rail) | **Preserved** in "Layers" sidebar panel. |

---

## Slice 2 — Layers Panel Extraction (COMPLETE 2026-06-24)

### Status: COMPLETE (2026-06-24)

Pure refactor — extracted the Layers sidebar drawer (project info, artifacts list, saved queries) from inline JSX in `App.tsx` into `src/components/LayersPanel.tsx`. Zero behavior change, all state via props, all CSS classes preserved.

- App.tsx: −85 lines (5230 → 5157)
- LayersPanel.tsx: 117 lines (new)
- Build: ✅ exit 0, 228 modules
- Dispatch: **Qwen 3.7+ alone, 3min 25s, 109.7k tokens** (vs Kimi K2.7's 850k tokens / 0 working code on Slice 1; vs MiMo v2.5's 376k tokens / 15min timeout on Slice 1)

### Validation outcome for `complex-code` pipeline

Qwen 3.7+ validated as primary complex-code worker. First real dispatch was a small, well-scoped refactor — the right kind of validation slice. Confirms:
- 3-min 25s runtime (vs 15min timeouts on bigger slice)
- 109.7k tokens (vs 850k for Kimi failure)
- Byte-for-byte identical JSX preservation
- Clean build, no fixes needed after

### Open followups (Slice 1)
- Playwright smoke test of UI shape + NL test queries 1-5
- Cleanup: root-level CHAIN-REGISTRY.ts / OPERATION-INTENT-MAP.ts now duplicate of src/lib/operations/{chain-registry,intent-data}.ts — safe to remove

---

## Slice 3 — Per-Artifact Layer Controls (COMPLETE 2026-06-24)

### Status: COMPLETE (2026-06-24)

Added per-artifact layer controls to the Layers sidebar panel:
- **Visibility toggle** (👁/🚫) — show/hide artifact on map, source preserved
- **Opacity slider** (0–100%, stored 0–1) — changes fill opacity on map immediately
- **Z-order buttons** (▲/▼) — swap zIndex with adjacent spatial artifact, disabled at boundaries

### Files

| File | Change |
|------|--------|
| `src/types.ts` | +7 lines (`LayerSettings` interface) |
| `src/App.tsx` | +97/-2 lines (state, 4 helpers, init useEffect, map-sync effect extensions) |
| `src/components/LayersPanel.tsx` | +70 lines (controls rendered per spatial artifact, `stopPropagation` on each) |
| `src/styles.css` | +121 lines (`.layer-controls`, `.layer-visibility-toggle`, `.layer-opacity-slider`, `.layer-zorder-btn`) |
| `src/components/__tests__/layer-controls-helpers.test.ts` | 295 lines (26 tests) |
| `src/components/__tests__/LayersPanel.test.tsx` | 289 lines (13 tests) |
| `src/components/__tests__/map-sync-effect.test.ts` | 192 lines (12 tests) |
| `SLICE_3_REVIEW.md` | Code review + coverage report |
| `vitest.config.ts` | Test infrastructure (Vitest + jsdom) |

### Test results
- 51/51 tests passing in 1.28s
- `npm run build` exit 0, 228 moduleshers
- Build + tests run via `npm test` and `npm run build`

### Dispatch pattern: COMPLEMENTARY (new 2026-06-24)

First dispatch using the complementary pattern (implementer + tester, disjoint file scopes):
- **Implementer:** Qwen 3.7+ wrote `src/types.ts`, `src/App.tsx`, `src/components/LayersPanel.tsx`, `src/styles.css` (5m 25s, 138k tokens)
- **Tester:** MiMo v2.5 Pro wrote `src/components/__tests__/*` + `SLICE_3_REVIEW.md` + `vitest.config.ts` (16m 18s, 135k tokens)
- **Judge:** GLM 5.2 synthesized impl + tests + review, checked 8 acceptance criteria against code evidence → ACCEPT verdict

Zero file collision because implementer and tester owned disjoint file scopes by design.

### Known limitations (follow-up slices)

- **Z-order visual reorder:** MapLibre renders layers by add-order, not zIndex. State model is correct (buttons update zIndex, boundary disabling works), but visual reorder on already-rendered layers requires `map.moveLayer()` calls in the map-sync effect. TODO comment added at the relevant code path.
- **Nested `<button>` HTML violation:** Artifact card is a `<button>` containing layer control `<button>`s. HTML-invalid, React warns in test output. Functionally works, but semantically wrong. Fix: change outer `<button>` to `<div role="button" tabIndex={0}>` with keyboard handlers.
- **`toggleLayerVisibility` missing-entry edge case:** Creates entry with `undefined` opacity/zIndex. Unreachable through normal UI (init useEffect populates defaults before user can interact), but defensive fix recommended.
- **Helper extraction for testability:** The 4 helpers (`updateLayerSetting`, `toggleLayerVisibility`, `changeLayerOpacity`, `reorderLayer`) are closures in App.tsx, so tests reimplement the logic to verify correctness. Extract to `src/lib/layer-controls.ts` for direct import.

### Next slices (planned)

The original list is outdated. See "Slice 4 — UX Fix Loop" below for what actually got dispatched. Current remaining work:

- **Slice 5: Polish mobile UX density.** Center "Map pane" card → bottom sheet on mobile. Bottom area crowding (command bar + tab bar + attribution). Backdrop dismiss for full-screen drawers.
- **Slice 6: Discover panel wiring.** Discovery panel still has a stub handler (`addToast('Discovery import wired — implementation in Slice 3.', 'info')`). Wire it to the discovery backend that ships in `src/lib/discovery.ts` (7 protocol clients, 14 tests).
- **Slice 7: Geocode + discovery prefixes.** Command-bar routing for `@osm`, `@ckan`, `@stac` — currently just opens the Discovery panel instead of actually parsing the prefix.
- **Slice 8: Undo/redo stack.** Not started.
- **Slice 9: Export menu.** Right-panel context menu, keyboard shortcuts.

---

## Slice 4 — UX Fix Loop (COMPLETE 2026-06-24)

Pilgrim got grumpy about UI/UX: "No human would enjoy or understand interacting with that mess." Designer sub-agent dispatched for honest critique. Five small slices shipped in one hour in response.

### Slice 4.1 — Bottom dock clipping fix (commit `8cd5dc0`)
- **Problem:** Command bar (48px tall, `bottom: 14px`) overlapped the 32px bottom dock peek bar on every viewport.
- **Fix:** Moved command bar up so it sits above the dock peek with a gap. `.command-bar: bottom 14px → 48px`, `.command-surface: bottom 72px → 106px`.
- **File:** `src/styles.css` (2 lines).

### Slice 4.2 — Actionable empty states (commit `ad2746c`)
- **Problem:** Every empty state was passive text. Users told what to do but given no way to do it.
- **Fix:** Added CTAs to empty states:
  - **Layers panel (no artifacts):** "Import file" button + "Try sample data" button + "Discover data →" link.
  - **Saved queries:** "Save your first query" link.
  - **Map overlay:** hidden when sidebar drawer is open; otherwise shows "Import file" + "Try sample data" buttons.
- **Files:** `src/components/LayersPanel.tsx` (+34), `src/App.tsx` (+14), `src/styles.css` (+33).
- **Tests:** 82 → 98 (+16 new).

### Slice 4.3 — Sidebar rail affordances (commit `411757c`)
- **Problem:** 5 identical icons with only `title` tooltips. Active state was a nearly-invisible 1px blue border. No visual distinction between Import (action trigger) and drawer toggles.
- **Fix:**
  - Visible labels under each icon (9px muted, brightens on hover, accent color when active).
  - Filled active state (`rgba(20, 184, 166, 0.15)` teal background, accent icon color, border removed).
  - Subtle 1px horizontal separator above Import button.
  - Rail widened 48px → 56px to fit labels; drawer + bottom-dock offsets updated.
  - Labels hidden at ≤480px for mobile space.
- **Files:** `src/App.tsx` (+7), `src/styles.css` (+69/-7).
- **Tests:** 98 → 107 (+9 new).

### Slice 4.4 — NL plan artifact picker + disabled Execute (commit `34b1d6f`)
- **Problem:** Free-text input for source artifact. Execute button looked enabled even when `canExecute` was false. Errors repeated 3x ("Missing source artifact" in step card, summary, plan metadata).
- **Fix:**
  - Replaced free-text input with `<select>` dropdown for artifact-referencing params (`source`, `mask`, `overlay`, `join_table`). Populated from spatial artifacts with name + geometry type.
  - Interactive plan validation: selecting an artifact clears the refusal + recomputes `canExecute` (Execute transitions disabled → enabled).
  - Disabled Execute styling: `opacity 0.5`, `cursor: not-allowed`, `filter: grayscale(0.5)`, no hover effects.
  - Consolidated errors: removed plan-level warnings/refusals summary. One actionable line per step.
- **Files:** `src/components/NLQueryPanel.tsx` (+89/-52), `src/styles.css` (+24).
- **Tests:** 107/107 passing (no new test file).
- **Note:** `ARTIFACT_PARAM_KEYS` set hardcoded — minor coupling to plan builder's intent data.

### Slice 4.5 — Mobile refactor (commit `4b53bc6`)
- **Problem:** Slice 1.5+1.6 added mobile CSS but the underlying layout assumed desktop. Sidebar rail + fixed-width drawer + full top bar all crammed into 390px.
- **Fix:** Real mobile architecture change at ≤768px:
  - **Sidebar rail hidden** (`display: none`, stays in DOM).
  - **Bottom tab bar** at bottom (5 icons + labels) — same icons/state handlers as sidebar rail.
  - **Sidebar drawers → full-screen overlays** (top:0, bottom:56px, width:100%).
  - **Right panel grip hidden.**
  - **Top bar collapsed** (`.btn-text` hidden, icons only, project name truncated).
  - **Command bar repositioned** above tab bar (`bottom: 64px`).
  - **Bottom dock above tab bar** (`bottom: 56px`).
  - **Map bottom offset** for tab bar clearance.
  - **`.sidebar-drawer-backdrop` hidden** (not needed for full-screen).
- **Files:** `src/App.tsx` (+24), `src/styles.css` (+172/-131, rewrote ≤768px breakpoint).
- **Tests:** 107/107 passing (no new test file).
- **Verified visually:** mobile screenshot shows real bottom tab bar + hidden rail + full-screen panel overlay. Mobile-native pattern, not just CSS patches.

### Loop outcome

| Slice | Wall time | Tokens | Tests added | Files touched |
|-------|-----------|--------|-------------|---------------|
| 4.1 (direct) | ~1 min | n/a | 0 | 1 |
| 4.2 | 14m 29s (impl 3m31s + test 10m58s) | 270k | +16 | 5 |
| 4.3 | 17m 24s | 322k | +9 | 4 |
| 4.4 | 14m 50s | 493k | 0 | 3 |
| 4.5 | 21m 8s | 351k | 0 | 3 |

**5 commits pushed to origin.** Loop completed at ~24:00 PDT, ~5 hours after first Slice 1 commit.

---

## Slice 1 — Map-First Shell + Chain Visualization (COMPLETE 2026-06-24)

### Goal

Ship the wireframe-first shape without rewriting the engine, schema, or any operation logic. The NL loop test queries (1–5 in `ACTIVE_TODO.md`) must still work after Slice 1.

### Files to modify (Slice 1)

| File | Change |
|------|--------|
| `src/App.tsx` | Restructure layout: map full-viewport, sidebar icons, command bar, collapse right panel + bottom dock by default. Hide 14 top-bar operation buttons (keep handlers). Wire `NLQueryPanel` + `DiscoveryPanel`. |
| `src/components/NLQueryPanel.tsx` | Add chain visualization: when plan contains multi-step chain, render horizontal step sequence with editable parameter inputs. Confirm button executes plan. (Currently shows plan summary only.) |
| `src/components/DiscoveryPanel.tsx` | (Re-wired only — minimal change.) |
| `src/styles.css` | Add sidebar icon rail styles, command bar styles, chain step styles. Light theme tokens already exist from Phase 1. |

### Files NOT to touch (Slice 1)

- `src/lib/**` — all engine, schema, registry, persistence code preserved
- `OPERATION_REGISTRY.ts`, `OPERATION_INTENT-MAP.ts`, `CHAIN-REGISTRY.ts` — already correct
- `ACTIVE_TODO.md` — test queries still apply
- `discovery/**` backend — already works

### Acceptance criteria

1. `npm run build` passes (TypeScript compile + Vite bundle).
2. Default UI: full-viewport map, 5 sidebar icons on left, command bar at bottom center, no top-bar operation buttons, right panel + bottom dock collapsed.
3. Sidebar icons expand panels: Layers (artifacts), Discover (data sources), Import (file picker), Query (SQL + saved queries), History (operation lineage).
4. Command bar:
   - Plain text → NL→Plan→Confirm→Execute (existing behavior).
   - `/` prefix → SQL editor (replaces existing bottom dock SQL tab).
   - Geocode/discovery prefixes (`@osm`, `@ckan`, `@stac`) — route to DiscoveryPanel (later slice — placeholder for now).
5. NLQueryPanel shows chain visualization:
   - Single op → show op + parameters, confirm button.
   - Multi-step chain (from `CHAIN_REGISTRY.ts`) → show horizontal step sequence, each step clickable to expand parameters, confirm executes whole chain.
   - Ambiguous → ask for clarification (existing behavior preserved).
6. Hidden operation buttons: still reachable — temporarily via direct SQL or via existing dialog code path on artifact click (preserve current "Buffer/Centroid/etc." on selected artifact right-panel context).
7. Existing tests/build pass. No regressions in artifact persistence, history, map sync.

### Slice 1 risks

- **App.tsx size:** 2000+ lines. Restructure must not delete state or handlers — only reorganize render.
- **Map sync effect chain:** preserve as-is. Sidebar collapse must not break map re-render on artifact change.
- **NLQueryPanel import:** currently NOT imported in App.tsx (orphaned per `ACTIVE_TODO.md`). Slice 1 fixes this.
- **Debug params:** `debugParams.logMapSync` etc. must still work.

### Slice 1 verification — smoke test (2026-06-24)

`scripts/smoke-test.mjs` runs against `vite preview` of the built app, verifies all 7 acceptance criteria in browser, and captures screenshots to `smoke-screenshots/`.

First-run results: **6/6 passed, 0 console errors.** Confirmed:
- ✅ 5 sidebar icons present (Layers / Discover / Import / Query / History)
- ✅ Command bar present at bottom with placeholder for `/` SQL and `@osm/@ckan/@stac` prefixes
- ✅ 14 top-bar operation buttons hidden (0 found in chrome)
- ✅ Map element rendered (MapLibre + OpenStreetMap basemap)
- ✅ Layers icon opens drawer with empty-state ("No project artifacts yet")
- ✅ NL pipeline: "Buffer parcels by 500 feet" → plan visualization renders (op=Buffer, distance_unit=feet, confidence=Low, "Missing source artifact")
- ✅ 0 console errors

What it does NOT verify (requires fixtures + follow-up slice):
- End-to-end spatial operations with real data
- Layer controls (visibility/opacity/z-order) on actual artifacts
- Hidden operation dialogs reachability
- Z-order visual reorder at runtime

### After Slice 1

- Slice 2: Layer panel + opacity/z-order controls
- Slice 3: Geocode + discovery prefixes (`@osm`, `@ckan`)
- Slice 4: Undo/redo stack
- Slice 5: Export menu in artifact context, keyboard shortcuts, empty/welcome states

---

## Previous Plan (superseded — kept for reference)

### Phase 1: Foundation ✅ COMPLETE (2026-06-15)
| # | Task | Size | Status | Verified |
|---|------|------|--------|----------|
| T1.1 | Lighten color palette | S | ✅ | ✅ |
| T1.2 | Spacing & typography tokens | S | ✅ | ✅ |
| T1.3 | Right panel accordion | M | ✅ | ✅ |
| T1.4 | Bottom dock default collapsed | M | ✅ | ✅ |
| T1.5 | Toast status system | M | ✅ | ✅ |
| T1.6 | Artifact card cleanup | M | ✅ | ✅ |

### Phase 2/3 (superseded 2026-06-15 by direction pivot)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-14 | Designer model → z-ai/glm-5.1 | Fresh audit, no pre-baked solutions |
| 2026-06-14 | 3-phase plan from designer review | Phased delivery, each phase ships improvement |
| 2026-06-14 | Start with palette + tokens (T1.1/T1.2) | Foundation for all other visual changes |
| 2026-06-15 | Phase 1 complete (T1.1–T1.6) | All tasks verified |
| 2026-06-15 | Direction pivot: map-first wireframe (proposed) | Pilgrim's hand-drawn wireframe + designer analysis |
| 2026-06-15 | Designer subagent unreliable for image analysis | 3 attempts failed (glm-5v-turbo couldn't read Telegram image) |
| 2026-06-24 | **Lock direction C (wireframe-first, workbench emerging)** | Pilgrim confirmed: "1.c / 2. as many sidebar icons as we need / 3. Discovery valuable + chain visualization valuable" |
| 2026-06-24 | **Slice 1 = map-first shell + chain visualization** | Re-shell UI without touching engine/schema. NL loop test queries (1–5) must still work. |
| 2026-06-24 | **Chain visualization = primary operation surface** | NL resolver already produces plans; render before commit. 14 dialog buttons hidden but preserved. |
| 2026-06-24 | **Sidebar icons: Layers / Discover / Import / Query / History** | Add more later if needed. |
| 2026-06-24 | **Slice 1.5+1.6 — SVG icons + mobile CSS** (commit `c0e1912`) | Pilgrim rejected emoji icons + desktop-shrunk mobile. Replaced emoji with lucide-react SVGs. Added CSS media queries — but architecture still desktop, so mobile didn't actually fix. Honest lesson: CSS patches don't restructure layout philosophy. |
| 2026-06-24 | **Slice 3.5 — extract helpers into `src/lib/layer-controls.ts`** | Slice 3 tests reimplemented logic as local functions (tester couldn't import closure-scoped helpers). Tests were theater, not testing. Extraction enables real tests against real code. |
| 2026-06-24 | **Slice 3.6 — fix 3 latent bugs** (commit `9b359dc`) | Found by real tests after extraction: (1) zIndex collision, (2) toggleLayerVisibility missing-entry creates partial object, (3) cleanup didn't filter by spatial. All TDD-ready for future bug-fix slices. |
| 2026-06-24 | **Slice 3.7 — z-order visual reorder + nested `<button>` fix** (commit `5d89ad4`) | Two tech debt items from SLICE_3_REVIEW.md: added `map.moveLayer()` reconciliation pass + changed outer card from `<button>` to `<div role="button">` with keyboard handlers. |
| 2026-06-24 | **Dispatch pattern: COMPLEMENTARY** (worker + tester with disjoint file scopes) | Slice 3 fusion caused data loss (parallel writers, last-write-wins). New pattern: implementer writes src/, tester writes tests + review doc in different files. Zero collision by design. |
| 2026-06-24 | **Verifier role removed; Judge subsumes verification** | Judge already checks acceptance criteria against code evidence. Tester is the proactive second lens (writes failing tests). Verifier was redundant cost without demonstrated value. |
| 2026-06-24 | **Slice 4.1-4.5 — UX fix loop** (commits `8cd5dc0` → `4b53bc6`) | Pilgrim grumpy about UI/UX. Designer sub-agent dispatched for critique. 5 small slices shipped in one hour in response: bottom dock fix, empty state CTAs, sidebar affordances, NL plan picker, mobile refactor. 107/107 tests passing by end. |