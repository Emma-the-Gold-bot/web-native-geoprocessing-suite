# Slice 5: Bottom Sheet Pattern + Density Cleanup

## Goal

Replace centered/floating overlays with a unified **bottom sheet** pattern that works on both desktop and mobile. Tighten bottom chrome density so the map gets maximum viewport on all screen sizes.

## Current State

- **Desktop bottom chrome:** command bar (48px, `bottom: 48px`) + command surface (`bottom: 106px`) + bottom dock (peek 32px, `left: 56px`, `bottom: 0`). Centered map overlay card is absolutely positioned center-screen.
- **Mobile bottom chrome (≤768px):** bottom tab bar (56px) + command bar (44px, `bottom: 64px`) + command surface (`bottom: 118px`) + bottom dock (`bottom: 56px`). Centered overlay card is center-screen.
- **Problems:**
  1. Centered overlay card (empty state, status messages) floats awkwardly in the middle of the map on both desktop and mobile.
  2. Bottom dock peek bar (32px) eats viewport even when the dock is empty / unused.
  3. On mobile, ~120px of bottom chrome on a 390px screen — map gets <60% of viewport.
  4. NL plan panel (chain visualization) is embedded in sidebar drawer — feels disconnected from the command bar that triggered it.
  5. No unified "sheet" component — each surface rolls its own positioning.

## Design: Bottom Sheet Pattern

### New `.bottom-sheet` component

A single reusable surface that:
- Anchors to bottom of viewport (above bottom dock or tab bar)
- Slides up with a transition (transform: translateY)
- Has a drag handle (visual grip bar)
- Collapsible: full → peek → hidden
- Backdrop on mobile (tap to dismiss), no backdrop on desktop

### Surfaces that become bottom sheets

| Surface | Current behavior | New behavior |
|---------|------------------|-------------|
| Empty-state map overlay | Centered absolute card | Bottom sheet (peek: 80px, shows CTA buttons) |
| Command surface (examples) | Floats above command bar | Folds into command bar's own sheet (no separate element) |
| NL plan / chain visualization | Embedded in sidebar drawer | Bottom sheet above command bar, full width on desktop |
| Bottom dock (table/sql/results) | Fixed dock, 32px peek | Bottom sheet (collapsed: handle only, expanded: 45vh) |
| Status/error overlay | Centered card | Toast (already exists) — remove centered overlay entirely |

### Density rules

**Desktop (>768px):**
- Command bar: `bottom: 0`, centered, pill shape (unchanged position)
- Bottom dock sheet: `bottom: 0`, `left: 0`, `right: 0` (full width, no sidebar offset — sidebar is an overlay, not a permanent column). Collapsed = handle only (8px). No 32px peek bar.
- NL plan sheet: slides up from above command bar (`bottom: 56px`), max-height 50vh
- Map overlay empty state: bottom sheet anchored above command bar

**Mobile (≤768px):**
- Bottom tab bar: stays at `bottom: 0` (56px)
- Command bar: `bottom: 60px` (just above tab bar)
- Bottom dock sheet: collapses to handle-only (4px), expands to 60vh
- NL plan sheet: slides up from command bar, full width
- No centered cards. Everything docks to bottom.

**Small mobile (≤480px):**
- Same as mobile, but command bar goes full-width (no side margins)
- Sheet max-height: 70vh (more screen for content)

### Z-index stacking

```
bottom-tab-bar (mobile):     z-index: 30
bottom-dock (sheet):         z-index: 35
command-bar:                 z-index: 40
nl-plan-sheet:               z-index: 38
bottom-sheet (empty state):   z-index: 37
sidebar-drawer:              z-index: 25
map canvas:                  z-index: 1
backdrop:                    z-index: 34
```

### Files to modify

| File | Change |
|------|--------|
| `src/App.tsx` | Replace centered overlay card with bottom sheet component. Extract NL plan from sidebar drawer into bottom sheet. Wire sheet open/close state. ~150-200 lines changed. |
| `src/styles.css` | Add `.bottom-sheet`, `.bottom-sheet-handle`, `.bottom-sheet--collapsed`, `.bottom-sheet--expanded` classes. Remove `.command-surface` (folds into sheet). Update bottom-dock to sheet pattern. ~200 lines added/changed. |
| `src/components/NLQueryPanel.tsx` | Add `sheetMode` prop or extract plan visualization into a sheet-compatible layout. ~30-50 lines changed. |

### Files NOT touched

- `src/lib/**` — all engine code
- `src/components/LayersPanel.tsx` — sidebar drawer stays as-is
- `src/components/DiscoveryPanel.tsx` — stays in sidebar
- Test infrastructure

### Acceptance criteria

1. No centered absolute-positioned cards on the map (desktop or mobile)
2. Bottom dock collapsed state is handle-only (no 32px peek bar eating viewport)
3. NL plan visualization appears as a bottom sheet above the command bar, not in the sidebar drawer
4. Empty-state CTAs appear in a bottom sheet, not centered overlay
5. On mobile (390px viewport), bottom chrome when nothing is active: tab bar (56px) + command bar (44px) = 100px. No dock peek.
6. All existing tests pass (107/107)
7. `npm run build` clean
8. Smoke test passes (6/6)

### Risks

- **App.tsx size (5530 lines):** Bottom sheet state management adds complexity. Keep sheet state in existing `activeSidebar` / `bottomDockExpanded` pattern — don't introduce new state machines.
- **NLQueryPanel extraction:** Moving plan visualization out of sidebar drawer changes the component's rendering context. Keep the component itself intact, just change where it's rendered.
- **Z-index conflicts:** Sheet vs sidebar drawer vs command bar. Stacking order above is designed to avoid overlap.

### Out of scope

- Discover panel wiring (Slice 6)
- Discovery prefixes (Slice 7)
- Undo/redo (Slice 8)
- Export menu (Slice 9)
- Any engine or lib changes
