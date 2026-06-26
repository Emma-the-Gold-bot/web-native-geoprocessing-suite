# Slice 9: Export Menu + Keyboard Shortcuts

## Goal

1. Wire the existing export functionality into a dropdown menu on artifact selection (handlers exist, UI is missing)
2. Add keyboard shortcuts for common operations (undo/redo already done; add the rest)

## Current State

### Export
- `showExportMenu` state exists (line 624) but is never toggled to `true` — no UI button renders
- `handleExportGeoJson()` and `handleExportJson()` exist and work (lines 1526-1559)
- `src/lib/export.ts` has `getArtifactExportOptions()`, `canExportArtifactAsGeoJson()`, `canExportArtifactAsJson()`
- Export is triggered from... nowhere. The handlers are orphaned.

### Keyboard shortcuts
- Undo/redo: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y (Slice 8) ✅
- Escape: clears command bar (existing) ✅
- That's it. No shortcuts for: new project, save, open, import, focus command bar, toggle layers, export

## Design

### Part 1: Export dropdown menu

Add a dropdown menu triggered from the top bar. When an artifact is selected, an Export button appears in the `.actions` section. Clicking it opens a small dropdown with available export formats (GeoJSON, JSON) based on artifact type.

**Placement:** In the top bar `.actions` section, after the Open Project button, before Settings. Only visible when `selectedArtifact` is truthy.

**Behavior:**
- Click Export button → toggles `showExportMenu`
- Dropdown shows available formats from `getArtifactExportOptions(selectedArtifact)`
- Each option shows label + description
- Click a format → calls the appropriate handler, closes dropdown
- Click outside → closes dropdown (use a backdrop or onBlur)
- Disabled state: if no export options available (non-spatial, non-tabular artifact), button disabled with tooltip "No export formats available"

**Styling:** Match existing dropdown patterns. Small card, positioned below button. Use existing `.card` class for the dropdown container. Inline styles for positioning (absolute, below button).

### Part 2: Keyboard shortcuts

Add to the existing `useEffect` keyboard handler:

| Shortcut | Action | Condition |
|----------|--------|-----------|
| Cmd/Ctrl+S | Save project (trigger `setShowSaveDialog(true)`) | always, preventDefault |
| Cmd/Ctrl+O | Open project (`handleOpenProject`) | always, preventDefault |
| Cmd/Ctrl+N | New project (`handleNewProject`) | always, preventDefault |
| Cmd/Ctrl+K | Focus command bar input | always, preventDefault |
| Cmd/Ctrl+E | Export selected artifact (opens dropdown) | when artifact selected |
| Cmd/Ctrl+B | Toggle layers sidebar | always |
| Cmd/Ctrl+/ | Show keyboard shortcuts help (toast or small overlay) | always |

**Implementation notes:**
- Add to existing `onKeyDown` function in the `useEffect`
- For Cmd/Ctrl+K: need a ref to the command bar input element, call `.focus()`
- For Cmd/Ctrl+B: call `toggleSidebar('layers')`
- Don't trigger shortcuts when focus is in a text input/textarea (except Cmd/Ctrl+S which should always prevent browser save dialog). Check `e.target` tagName.
- Don't conflict with undo/redo (already handled with 'z' and 'y' keys)

### Files to modify

| File | Change |
|------|--------|
| `src/App.tsx` | Export button + dropdown in top bar, keyboard shortcuts in existing handler, command bar input ref for Cmd+K focus |
| `src/styles.css` | Export dropdown styles (small, ~20 lines) |

### Files NOT touched

- `src/lib/**` — export.ts is done
- `src/components/**` — no component changes
- `src/types.ts`
- Test files (tester creates new)
- `discovery/**`

## Acceptance Criteria

1. Export button visible in top bar when artifact selected
2. Export button hidden/disabled when no artifact selected
3. Dropdown shows available formats based on artifact type (GeoJSON for spatial, JSON for tabular)
4. Clicking a format triggers download and closes dropdown
5. Clicking outside dropdown closes it
6. Cmd/Ctrl+S opens save dialog (prevents browser default)
7. Cmd/Ctrl+O opens project
8. Cmd/Ctrl+N creates new project
9. Cmd/Ctrl+K focuses command bar input
10. Cmd/Ctrl+B toggles layers sidebar
11. Shortcuts don't fire when typing in input/textarea (except Cmd/Ctrl+S)
12. All existing tests pass (227/227)
13. `npm run build` clean
14. Smoke test passes (9/9)

## Out of scope

- Keyboard shortcuts help overlay (Cmd/Ctrl+/ can just show a toast listing shortcuts)
- Export to additional formats (Shapefile, GeoParquet, CSV) — future work
- Right-click context menu on artifacts for export
- Persistence of keyboard shortcut preferences
