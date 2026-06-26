# Slice 9 Review Checklist: Export Menu + Keyboard Shortcuts

**Reviewer:** (Judge fills in)
**Date:** (Judge fills in)
**Status:** ⬜ Pending

---

## Acceptance Criteria Verification

### AC1: Export button visible in top bar when artifact selected

- [ ] **`src/App.tsx`**: Export button exists in the top bar `.actions` section
- [ ] **`src/App.tsx`**: Button is only rendered/visible when `selectedArtifact` is truthy
- [ ] **`src/App.tsx`**: Button uses `Download` icon from lucide-react (or equivalent)
- [ ] **Visual test**: Select an artifact → Export button appears in top bar

### AC2: Export button hidden/disabled when no artifact selected

- [ ] **`src/App.tsx`**: Export button conditionally rendered based on `selectedArtifact`
- [ ] **Visual test**: Fresh load with no artifact → no Export button visible

### AC3: Dropdown shows available formats based on artifact type

- [ ] **`src/App.tsx`**: `getArtifactExportOptions(selectedArtifact)` called to get available formats
- [ ] **`src/App.tsx`**: GeoJSON option shown for spatial FeatureCollection artifacts
- [ ] **`src/App.tsx`**: JSON option shown for tabular artifacts
- [ ] **`src/App.tsx`**: Each option displays label + description
- [ ] **Functional test**: Select spatial artifact → dropdown shows GeoJSON + JSON; select tabular → dropdown shows JSON only

### AC4: Clicking a format triggers download and closes dropdown

- [ ] **`src/App.tsx`**: GeoJSON option calls `handleExportGeoJson()` (which calls `exportToGeoJson` + `triggerDownload`)
- [ ] **`src/App.tsx`**: JSON option calls `handleExportJson()` (which calls `exportToJson` + `triggerDownload`)
- [ ] **`src/App.tsx`**: Both handlers call `setShowExportMenu(false)` to close dropdown
- [ ] **Functional test**: Click GeoJSON option → file downloads, dropdown closes

### AC5: Clicking outside dropdown closes it

- [ ] **`src/App.tsx`**: Backdrop element or `onBlur` handler closes the dropdown
- [ ] **`src/App.tsx`**: `setShowExportMenu(false)` triggered on outside click
- [ ] **Functional test**: Open dropdown → click outside → dropdown closes

### AC6: Cmd/Ctrl+S opens save dialog (prevents browser default)

- [ ] **`src/App.tsx`**: `e.key === 's'` with modifier → `e.preventDefault()` + `setShowSaveDialog(true)`
- [ ] **`src/App.tsx`**: Works even when typing in input/textarea (guard bypassed for save)
- [ ] **Functional test**: Ctrl+S → save dialog opens, browser save dialog suppressed

### AC7: Cmd/Ctrl+O opens project

- [ ] **`src/App.tsx`**: `e.key === 'o'` with modifier + `!isTyping` → `e.preventDefault()` + `handleOpenProject`
- [ ] **Functional test**: Ctrl+O → file picker opens

### AC8: Cmd/Ctrl+N creates new project

- [ ] **`src/App.tsx`**: `e.key === 'n'` with modifier + `!isTyping` → `e.preventDefault()` + `handleNewProject`
- [ ] **Functional test**: Ctrl+N → new project confirmation dialog

### AC9: Cmd/Ctrl+K focuses command bar input

- [ ] **`src/App.tsx`**: `commandInputRef` exists as `useRef<HTMLInputElement>(null)`
- [ ] **`src/App.tsx`**: `e.key === 'k'` with modifier + `!isTyping` → `e.preventDefault()` + `commandInputRef.current?.focus()`
- [ ] **`src/App.tsx`**: `commandInputRef` is attached to the command bar `<input>` element
- [ ] **Functional test**: Ctrl+K → command bar input gets focus

### AC10: Cmd/Ctrl+B toggles layers sidebar

- [ ] **`src/App.tsx`**: `e.key === 'b'` with modifier + `!isTyping` → `e.preventDefault()` + `toggleSidebar('layers')`
- [ ] **Functional test**: Ctrl+B → layers sidebar toggles open/closed

### AC11: Shortcuts don't fire when typing in input/textarea (except Cmd/Ctrl+S)

- [ ] **`src/App.tsx`**: `isTyping` guard checks `target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'`
- [ ] **`src/App.tsx`**: Guard placed AFTER the Ctrl+S check (so save always works)
- [ ] **`src/App.tsx`**: Guard placed BEFORE all other shortcut checks
- [ ] **Functional test**: Focus input → Ctrl+O does nothing; Ctrl+S still works

### AC12: All existing tests pass

- [ ] Run `npm test` — all tests pass (previously 227+, now includes new Slice 9 tests)
- [ ] No regressions in LayersPanel, DiscoveryPanel, map-sync-effect, layer-controls, undo-redo, or bottom-sheet tests

### AC13: `npm run build` clean

- [ ] Run `npm run build` — no TypeScript errors
- [ ] No unused imports or dead code warnings

### AC14: Smoke test passes (9/9)

- [ ] Run smoke test suite — all 9 pass

---

## Grep Commands for Verification

```bash
# Export button in top bar
grep -n 'Export\|showExportMenu\|Download.*icon' src/App.tsx | head -20

# showExportMenu toggled
grep -n 'setShowExportMenu' src/App.tsx

# Keyboard shortcuts in handler
grep -n "e\.key === 's'\|e\.key === 'o'\|e\.key === 'n'\|e\.key === 'k'\|e\.key === 'b'\|e\.key === 'e'\|e\.key === '/'" src/App.tsx

# commandInputRef attached to input
grep -n 'commandInputRef' src/App.tsx

# isTyping guard present
grep -n 'isTyping' src/App.tsx

# Export options usage
grep -n 'getArtifactExportOptions\|canExportArtifactAs\|exportToGeoJson\|exportToJson' src/App.tsx

# Download icon import
grep -n 'Download' src/App.tsx | head -5
```

---

## Structural Checks

### Export dropdown

- [ ] **`src/App.tsx`**: `showExportMenu` state exists (`useState(false)`)
- [ ] **`src/App.tsx`**: `exportOptions` derived from `getArtifactExportOptions(selectedArtifact)` (memoized)
- [ ] **`src/App.tsx`**: Dropdown renders when `showExportMenu && selectedArtifact`
- [ ] **`src/App.tsx`**: Backdrop/overlay element for outside-click-to-close
- [ ] **`src/App.tsx`**: Each option shows label + description text
- [ ] **`src/styles.css`**: Export dropdown styles (~15-20 lines) — positioning, z-index, card appearance

### Keyboard handler

- [ ] **`src/App.tsx`**: `useEffect` keyboard handler is the SAME useEffect as undo/redo (not a second listener)
- [ ] **`src/App.tsx`**: Cleanup function removes event listener
- [ ] **`src/App.tsx`**: `commandInputRef` declared with `useRef<HTMLInputElement>(null)`
- [ ] **`src/App.tsx`**: `commandInputRef` attached to the command bar `<input>` element via `ref={commandInputRef}`
- [ ] **`src/App.tsx`**: Dependency array includes `selectedArtifact` (for Ctrl+E conditional)

### Import/export wiring

- [ ] **`src/App.tsx`**: Imports `getArtifactExportOptions` from `./lib/export`
- [ ] **`src/App.tsx`**: `handleExportGeoJson` uses `exportToGeoJson` + `triggerDownload` from lib
- [ ] **`src/App.tsx`**: `handleExportJson` uses `exportToJson` + `triggerDownload` from lib

---

## Files Changed (verify against spec)

| File | Expected Change | Verified |
|------|----------------|----------|
| `src/App.tsx` | Export button + dropdown in top bar, keyboard shortcuts added to existing handler, `commandInputRef` for Ctrl+K | ⬜ |
| `src/styles.css` | Export dropdown styles (~15-20 lines) | ⬜ |
| New test file | `src/components/__tests__/export-menu.test.ts` — 29 test cases | ⬜ |
| New review file | `src/components/__tests__/slice9-review.md` — this checklist | ⬜ |

---

## Risks from Spec (verify mitigated)

- [ ] **Dropdown positioning**: Export dropdown positioned absolutely below button — verify doesn't overflow viewport on small screens
- [ ] **Outside click**: Dropdown closes on outside click — verify no event propagation issues
- [ ] **Ctrl+S always works**: Save shortcut bypasses `isTyping` guard — verify ordering is correct (save check BEFORE isTyping guard)
- [ ] **Ctrl+E conditional**: Export shortcut only opens dropdown when `selectedArtifact` exists — verify no crash when artifact is null
- [ ] **Stale closure**: Keyboard handler `useEffect` must have `selectedArtifact` in dependency array for Ctrl+E conditional
- [ ] **No conflict with undo/redo**: Verify 'z' and 'y' keys are checked BEFORE the new shortcuts (or in a separate branch)

---

## Notes

_(Judge fills in findings here)_
