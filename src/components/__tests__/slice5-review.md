# Slice 5 Review Checklist: Bottom Sheet Pattern + Density Cleanup

**Reviewer:** (Judge fills in)
**Date:** (Judge fills in)
**Status:** ⬜ Pending

---

## Acceptance Criteria Verification

### AC1: No centered absolute-positioned cards on the map

- [ ] **`src/App.tsx`**: The old centered overlay pattern (`position: absolute; inset: 0; display: flex; align-items: center; justify-content: center`) is **removed** from the map empty state / status overlay
- [ ] **`src/App.tsx`**: The empty-state map overlay now renders as a `.bottom-sheet` element anchored to the bottom
- [ ] **`src/styles.css`**: No remaining CSS rules that create a centered absolute overlay on the map for empty state / status messages
- [ ] **Desktop + mobile**: Verify both viewport sizes — no centered floating cards remain

**Grep check:**
```bash
grep -n 'position.*absolute.*inset.*0\|align-items.*center.*justify-content.*center' src/App.tsx
# Should return NO matches for the map overlay area (lines ~3300-3360)
```

### AC2: Bottom dock collapsed state is handle-only

- [ ] **`src/App.tsx`**: When `bottomDockExpanded` is false, the dock renders a handle element (`.bottom-sheet-handle`), NOT the old 32px peek bar with tab labels
- [ ] **`src/App.tsx`**: The old `.bottom-dock-bar` with tab buttons (Table/SQL/Results) visible in collapsed state is **removed**
- [ ] **`src/styles.css`**: The old `transform: translateY(calc(100% - 32px))` on `.bottom-dock` is replaced with handle-only collapsed state
- [ ] **`src/styles.css`**: `.bottom-sheet--collapsed` shows only the handle (height: 8px desktop, 4px mobile)
- [ ] **Visual test**: On desktop, collapsed dock should look like a thin grip bar at the bottom, not a 32px strip

**Grep check:**
```bash
grep -n 'translateY.*100%.*32px\|height.*32px' src/styles.css
# Should return NO matches for bottom-dock
grep -n 'bottom-dock-bar' src/App.tsx
# Should either be removed or refactored to use .bottom-sheet-handle
```

### AC3: NL plan visualization in bottom sheet

- [ ] **`src/App.tsx`**: When `activeSidebar === 'chain'`, the `NLQueryPanel` is rendered in a `.bottom-sheet` container, NOT inside the `<aside className="sidebar-drawer">` element
- [ ] **`src/App.tsx`**: The NL plan sheet is positioned above the command bar (`bottom: 56px` or similar)
- [ ] **`src/App.tsx`**: The NL plan sheet has max-height ≤ 50vh (desktop) / 60vh (mobile)
- [ ] **`src/components/NLQueryPanel.tsx`**: Component still renders correctly in its new context (no broken props or layout assumptions)
- [ ] **`src/styles.css`**: `.bottom-sheet` for NL plan has correct z-index (38 per spec)

**Grep check:**
```bash
grep -n 'activeSidebar.*chain' src/App.tsx
# Check the render location: should be a .bottom-sheet, NOT inside .sidebar-drawer
grep -n 'NLQueryPanel' src/App.tsx
# Verify it's rendered outside the <aside> block
```

### AC4: Empty-state CTAs in bottom sheet

- [ ] **`src/App.tsx`**: The empty-state overlay (no artifacts, no selection) renders as a `.bottom-sheet` with peek state showing CTA buttons
- [ ] **`src/App.tsx`**: The "Import file" and "Try sample data" buttons are inside the bottom sheet, not a centered card
- [ ] **`src/App.tsx`**: The "Discover data" link (if present) is also inside the sheet
- [ ] **Visual test**: CTAs should be visible at the bottom of the map, not floating in the center

### AC5: Mobile bottom chrome density (390px viewport)

- [ ] **`src/styles.css`**: On mobile (≤768px), bottom chrome when nothing is active = tab bar (56px) + command bar (44px) = **100px**
- [ ] **`src/styles.css`**: No dock peek bar visible in idle state on mobile
- [ ] **`src/styles.css`**: Command bar at `bottom: 60px` (just above 56px tab bar)
- [ ] **`src/styles.css`**: Bottom dock sheet collapses to handle-only (4px) on mobile
- [ ] **`src/styles.css`**: Small mobile (≤480px): command bar is full-width (no side margins)

**CSS check:**
```bash
# Verify mobile command bar positioning
grep -A5 '@media.*max-width.*768' src/styles.css | grep -A3 'command-bar'
# Verify no 32px dock peek on mobile
grep -A5 '@media.*max-width.*768' src/styles.css | grep 'bottom-dock'
```

### AC6: All existing tests pass (107/107)

- [ ] Run `npm test` — all 107 existing tests pass
- [ ] No regressions in LayersPanel, DiscoveryPanel, map-sync-effect, or layer-controls tests

### AC7: `npm run build` clean

- [ ] Run `npm run build` — no TypeScript errors, no build failures
- [ ] No unused imports or dead code warnings

### AC8: Smoke test passes (6/6)

- [ ] Run smoke test suite — all 6 pass

---

## Structural Checks

### Bottom sheet component pattern

- [ ] **`src/styles.css`**: `.bottom-sheet` class exists with:
  - `position: fixed; bottom: 0` (or anchored above tab bar on mobile)
  - `left: 0; right: 0` (full width, no sidebar offset)
  - Transition: `transform 200ms ease` (or similar slide-up animation)
- [ ] **`src/styles.css`**: `.bottom-sheet-handle` exists with visible grip bar
- [ ] **`src/styles.css`**: `.bottom-sheet--collapsed` and `.bottom-sheet--expanded` classes exist
- [ ] **`src/styles.css`**: `.bottom-sheet-grip` exists (visual bar element)

### Command surface removal

- [ ] **`src/styles.css`**: `.command-surface` class is **removed** or repurposed
- [ ] **`src/App.tsx`**: The old `<div className="command-surface">` element is removed
- [ ] **`src/App.tsx`**: Command examples are now rendered inside the command bar's own sheet (`.command-bar-sheet` or similar)

### Z-index stacking

- [ ] **`src/styles.css`**: Z-index values match the spec:
  - `.sidebar-drawer`: z-index 25
  - `.bottom-dock` (sheet): z-index 35
  - `.command-bar`: z-index 40
  - NL plan sheet: z-index 38
  - Empty state sheet: z-index 37
  - Backdrop: z-index 34
  - Map canvas: z-index 1

### Bottom dock density

- [ ] **Desktop**: Collapsed dock = handle only (8px), no 32px peek
- [ ] **Mobile**: Collapsed dock = handle only (4px), no peek
- [ ] **Desktop**: Expanded dock = 45vh max-height
- [ ] **Mobile**: Expanded dock = 60vh max-height
- [ ] **Small mobile**: Expanded dock = 70vh max-height

---

## Code Quality Checks

- [ ] No new `any` types introduced
- [ ] Sheet state management uses existing `activeSidebar` / `bottomDockExpanded` pattern (no new state machines)
- [ ] NLQueryPanel component is not significantly refactored — only rendering context changed
- [ ] No dead code left behind (old overlay patterns, unused CSS classes)
- [ ] Comments updated to reflect new pattern

---

## Files Changed (verify against spec)

| File | Expected Change | Verified |
|------|----------------|----------|
| `src/App.tsx` | ~150-200 lines changed: replace overlay, extract NL plan, fold command examples | ⬜ |
| `src/styles.css` | ~200 lines added/changed: .bottom-sheet classes, density updates, z-index | ⬜ |
| `src/components/NLQueryPanel.tsx` | ~30-50 lines: sheetMode prop or layout adaptation | ⬜ |

---

## Risks from Spec (verify mitigated)

- [ ] **App.tsx complexity**: Sheet state management doesn't introduce new state machines
- [ ] **NLQueryPanel extraction**: Component renders correctly in new context
- [ ] **Z-index conflicts**: No visual overlap between sheets, sidebar, and command bar

---

## Notes

_(Judge fills in findings here)_
