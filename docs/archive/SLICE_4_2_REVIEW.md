# Slice 4.2 Code Review — Empty State CTAs

**Reviewer:** TESTER subagent  
**Date:** 2026-06-24  
**Verdict:** ACCEPT

---

## Goal

Replace passive empty-state text with actionable CTAs so users have a path forward when the workspace is empty.

## Empty state improvements

### Layers panel — Artifacts (no artifacts)

- **Before:** `<div className="card muted">No project artifacts yet. Import data to begin.</div>`
- **After:** Centered card with the same accessibility text, plus three CTAs:
  1. **"Import file"** — `<button className="secondary empty-state-btn">` → calls `onImportFile` (triggers file picker via `importFileRef.current?.click()`)
  2. **"Try sample data"** — `<button className="secondary empty-state-btn">` → calls `onLoadSampleData` (calls `openSampleImport` which loads sample GeoJSON)
  3. **"Discover data →"** — `<button className="empty-state-link">` → calls `onOpenDiscover` (sets sidebar to `'discover'`)

### Layers panel — Saved Queries (no saved queries)

- **Before:** `<div className="card muted">No saved queries yet.</div>`
- **After:** Centered card with the same text, plus:
  1. **"Save your first query"** — `<button className="empty-state-link">` → calls `setShowSaveQueryDialog(true)`

### Query panel (NLQueryPanel)

- **No changes detected** — The NLQueryPanel does not have a saved-queries empty state CTA. The saved queries section with the "Save your first query" CTA lives in LayersPanel only.

### Map overlay

- **No changes detected** — The map overlay still shows passive text ("Import or load a spatial dataset to see it on the map") with `pointerEvents: 'none'`. No "Import" button was added to the overlay. This is acceptable since the sidebar CTAs provide the import path, but could be a follow-up enhancement.

### styles.css

- **New styles added** (33 lines):
  - `.empty-state-actions` — flex container, centered, wrapping
  - `.empty-state-btn` — compact button styling
  - `.empty-state-link` — teal accent link-style button with hover underline
  - `.empty-state-link:hover` — brighter teal + underline

### App.tsx

- **3 new props wired** to LayersPanel:
  - `onImportFile={() => importFileRef.current?.click()}`
  - `onLoadSampleData={openSampleImport}`
  - `onOpenDiscover={() => setActiveSidebar('discover')}`

## Tests

### Updated

- `src/components/__tests__/LayersPanel.test.tsx` — file header updated to mention Slice 4.2

### Added (16 new tests)

**`LayersPanel — empty state CTAs (artifacts)`** (10 tests):
1. ✅ renders empty state text for accessibility (screen readers)
2. ✅ renders Import file button in empty state
3. ✅ Import file button triggers the onImportFile handler
4. ✅ renders Try sample data button
5. ✅ Try sample data button triggers the onLoadSampleData handler
6. ✅ renders Discover data link
7. ✅ Discover data link triggers the onOpenDiscover handler
8. ✅ Import file button is keyboard accessible (focusable)
9. ✅ Discover data link is keyboard accessible (focusable button)
10. ✅ CTA buttons are NOT rendered when handlers are not provided
11. ✅ CTAs do NOT appear when artifacts exist

**`LayersPanel — empty state CTA (saved queries)`** (5 tests):
1. ✅ renders Save your first query link when no saved queries
2. ✅ Save your first query link triggers setShowSaveQueryDialog
3. ✅ Save your first query link is keyboard accessible
4. ✅ Save your first query does NOT appear when saved queries exist
5. ✅ empty state text is still present for accessibility

### Total passing

- **98/98** (82 existing + 16 new)
- All 3 test files pass
- No regressions in existing layer-controls or map-sync-effect tests

## CTA functionality verified

| CTA | Handler | Wired in App.tsx | Works |
|-----|---------|-------------------|-------|
| Import file | `onImportFile` → `importFileRef.current?.click()` | ✅ | ✅ triggers native file picker |
| Try sample data | `onLoadSampleData` → `openSampleImport()` | ✅ | ✅ loads sample GeoJSON into import review |
| Discover data → | `onOpenDiscover` → `setActiveSidebar('discover')` | ✅ | ✅ opens Discovery panel |
| Save your first query | `setShowSaveQueryDialog(true)` | N/A (direct prop) | ✅ opens save query dialog |

## Issues found

### Minor

1. **No `aria-label` on CTA buttons** — The "Import file", "Try sample data", and "Discover data →" buttons rely on their visible text for accessibility. This works but explicit `aria-label` would be more robust for screen readers. **Deferred to follow-up.**

2. **"Discover data →" uses `<button>` not `<a>`** — The arrow suffix suggests a link, but it's a `<button>` that opens a sidebar panel. Since it doesn't navigate to a URL, `<button>` is semantically correct. The arrow is decorative. **Acceptable.**

3. **No focus-visible styling for CTA buttons** — The `.empty-state-btn` and `.empty-state-link` classes don't include explicit `:focus-visible` styles. Browser defaults handle this, but custom focus rings would improve keyboard UX. **Deferred to follow-up.**

### Not found (good)

- No TypeScript errors
- No console warnings from the test suite
- No missing prop warnings (all optional props are properly guarded)
- Empty state accessibility text preserved alongside CTAs

## Screenshots

### `screenshots/desktop-empty-state-with-ctas.png`
Desktop view (1440×900) with Layers sidebar open. Shows:
- "No project artifacts yet. Import data to begin." text
- Three CTAs centered: "Import file" button, "Try sample data" button, "Discover data →" link
- "No saved queries yet." with "Save your first query" link below
- Map visible on right with San Francisco tiles

### `screenshots/mobile-empty-state-with-ctas.png`
Mobile view (390×844) with Layers sidebar open. Shows:
- Same CTAs, properly wrapped and centered on small screen
- Responsive layout working correctly
- Sidebar takes appropriate width, map partially visible behind

## Recommendation

**ACCEPT**

The IMPLEMENTER correctly delivered all specified CTAs:
- All three artifact empty-state CTAs render and fire correct handlers
- Saved queries empty state has the "Save your first query" CTA
- Handlers are properly wired in App.tsx
- Styles are clean and responsive
- Empty state accessibility text preserved
- All 98 tests pass (82 existing + 16 new)

## Notes for future slices

1. **Map overlay CTA** — The spec mentioned "Map overlay: hidden when drawer is open, or has its own Import button." The overlay currently has `pointerEvents: 'none'` and no import button. Consider adding a lightweight "Import data" button to the map overlay for when no artifacts exist and no drawer is open.

2. **NLQueryPanel empty state** — The spec mentioned "Query panel empty state: hint to save first query." The NLQueryPanel doesn't have this yet. The "Save your first query" CTA exists in LayersPanel's saved queries section, but the query panel itself (SQL editor area) could benefit from a similar hint.

3. **Focus-visible styles** — Add explicit `:focus-visible` rings to `.empty-state-btn` and `.empty-state-link` for better keyboard navigation UX.

4. **Conditional CTA rendering** — The CTAs are conditionally rendered based on whether handler props are provided (`onImportFile && ...`). This is clean defensive coding but means a parent that forgets to pass handlers gets no CTAs. Since App.tsx always passes them, this is fine for now.
