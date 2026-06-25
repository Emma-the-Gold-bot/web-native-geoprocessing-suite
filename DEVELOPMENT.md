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