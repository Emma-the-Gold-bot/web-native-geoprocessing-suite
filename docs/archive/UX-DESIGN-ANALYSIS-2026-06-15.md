# UX Design Analysis — Map-first Wireframe

**Date:** 2026-06-15
**Source:** Designer subagent (glm-5v-turbo, v3 — text description input)
**Context:** Pilgrim's hand-drawn wireframe on graph paper

---

## Wireframe Description

- Screen dominated by large rectangular MAP AREA (center, ~70% of viewport)
- LEFT SIDEBAR: 4 square icon buttons stacked vertically (thin, ~48px wide)
- TOP RIGHT: gear/settings icon
- BOTTOM CENTER: input bar labeled "WHERE TO?" — spans most width below map
- Minimal chrome. No bottom dock, no side panels, no tabs.

---

## 1. Does This Achieve "Elegant, Hides Complexity"?

**Yes — with conviction.** Three high-leverage design moves:

**Map as protagonist.** 70% viewport to map is right. Geospatial tools suffer from chrome creep — panels, inspectors, property sheets leaving map gasping. This refuses that. The map *is* the interface.

**Chat interface metaphor.** Spatial queries are conversational — "show me parcels within 500ft of rivers" is how humans think. Users already know chat. Input bar mirrors every messaging app. No learning curve.

**Constraint as clarity.** Four icons, no tabs, no dock, no panels. Not minimalism for aesthetics — forcing product to earn every pixel. If a feature can't justify itself as one of four toolbar actions, maybe it shouldn't be primary UI.

**Risk:** Everything hidden behind command bar + sidebar icons. If discoverability is wrong, elegant becomes opaque. Command bar intelligence carries entire UX burden.

---

## 2. The Four Sidebar Icons (top to bottom)

| # | Icon | Label | Rationale |
|---|------|-------|-----------|
| 1 | 🗺️ | **Layers** | Map's state — what's visible, opacity, z-order, toggle. Most frequently accessed GIS control. Non-negotiable. |
| 2 | 🔍 | **Discover** | Data discovery (OSM, ArcGIS REST, CKAN, STAC). App's unique value prop — finding/loading from multiple sources. |
| 3 | ➕ | **Import** | File-based import (GeoJSON, GeoParquet, Shapefile). Needs visual drop target and progress. |
| 4 | 💬 | **Query** | Persistent SQL/NL query panel with history and saved queries. Separate from command bar because command bar is quick one-shots; this opens full query environment. |

**Cut:**
- Draw → becomes contextual map overlay, not sidebar slot
- Bookmarks → sub-feature of Layers (saved viewports + layer states)

**Alternative:** If command bar absorbs SQL, swap Query for Draw/measure.

---

## 3. "WHERE TO?" Unified Command Bar

### Intent Router Architecture

```
User types → Intent Classifier → Dispatches to Handler
                │
    ┌───────────┼───────────┬──────────────┐
    ▼           ▼           ▼              ▼
  Geocode   Discover    NL → SQL      Direct SQL
```

### Prefix System (fast, predictable)

| User types | Detected as | Action |
|------------|-------------|--------|
| `1600 Pennsylvania Ave` | Geocode | Fly to location, drop pin |
| `parcels near water` | NL query | Route to NL→SQL translator, execute |
| `@osm buildings portland` | Discover | Search OpenStreetMap |
| `@ckan flood zones` | Discover | Search CKAN portals |
| `@stac sentinel-2 california 2024-06` | Discover | Search STAC catalog |
| `/SELECT * FROM parcels WHERE...` | SQL | Execute directly in DuckDB-WASM |
| `/` then anything | SQL mode | Open SQL-aware autocomplete |

**Intelligent fallback:** If no prefix matches, lightweight NLP classifier. Geocoding looks like addresses (numbers + street names); NL queries look like sentences with spatial prepositions ("within", "near", "along").

### Autocomplete Panel

Floating panel above input bar showing:
- 📍 Geocode results: "1600 Pennsylvania Ave NW, Washington, DC"
- 📦 Dataset matches: "OSM: buildings — Portland, OR (124,332 features)"
- 💬 Query suggestions: "Show parcels within 500ft of rivers" (saved/previous)
- 🕐 Recent places: "Downtown Seattle" (from history)

Compact (max 5 items), keyboard-navigable, disappears on blur.

### Active Query Indicator

Pill/badge near command bar showing what the map is currently answering:
```
🟢 3 layers active │ 🔍 parcels within 500ft of rivers
```

---

## 4. How Results Appear Without Cluttering the Map

| Layer | What | Behavior |
|-------|------|----------|
| **Primary** | Map layers | Spatial results render as vector layers. Layers panel shows: toggle, opacity, z-order, color swatch, feature count. |
| **Secondary** | Transient result bar | Slides up from command bar. Shows summary ("Found 3 datasets · 2,341 features"). Expands on click, auto-dismisses after 8s. |
| **Tertiary** | Map popups | Click feature → lightweight popup with attributes. Standard MapLibre. No side panel. |
| **Errors** | Command bar feedback | Red flash + error text, fades after 5s. |

**What this avoids:**
- ❌ Side panels covering the map
- ❌ Modal dialogs blocking interaction
- ❌ Persistent result tables stealing viewport
- ❌ Tabbed bottom dock

---

## 5. What's Missing

### Critical Gaps

- **Undo/Redo** — operation stack, keyboard shortcuts (Ctrl+Z/Ctrl+Shift+Z). No UI needed, capability must exist.
- **Layer legend / symbology** — small expandable legend in Layers panel. Auto-generated from layer style.
- **Export** — GeoJSON, GeoParquet, PNG screenshot, shareable link. Home: "..." overflow menu on each layer, or settings/gear menu.
- **Keyboard shortcut discoverability** — Cmd+K to focus command bar. Shift+? for help modal listing all shortcuts (Figma/GitHub convention).
- **Empty/first-run states** — blank map + blinking cursor is intimidating, not elegant. Welcome overlay, quick-start suggestions, or sample dataset pre-loaded.
- **Data source attribution** — OSM requires attribution. Legal requirement. Small always-visible strip at map bottom edge.

### Nice-to-Have

- **Collaboration indicators** — colored cursors/viewports for multi-user. Not V1.
- **Measurement tool** — distance/area. Command bar (`/measure distance`) or floating tool in Draw mode.
- **Basemap switcher** — satellite vs streets vs dark tiles. Map corner toggle or Layers sub-option.

---

## 6. Implementation Phasing

### Week 1: Ship the Wireframe Skeleton
MapLibre full-viewport, 48px left sidebar, command bar bottom-center, settings gear top-right. No bottom dock, no tabs, no panels. Test the feel.

### Weeks 2-3: Command Bar Intelligence
1. Geocode first — simplest, highest value. Provider: Photon/OSM or Mapbox.
2. Prefix routing — `@osm`, `@ckan`, `@stac`, `@arcgis`, `/` for SQL.
3. NL→SQL translation (existing spatial query system).
4. Autocomplete panel.

### Weeks 3-4: Sidebar Panels
Layers, Discover, Import, Query — each as floating/overlay panels summoned by icon click.

### Week 5: Polish
Undo/redo, export, keyboard shortcuts, empty states, attribution.
