# Slice 4.3 Code Review

## Goal
Improve sidebar rail affordances — visible active state, visible labels, Import separator.

## Sidebar rail improvements

### Active state
- **Before:** `background: #1e293b; border-color: #60a5fa; color: #eff6ff` — dark blue-gray background with blue border, barely distinguishable from hover state
- **After:** `background: rgba(20, 184, 166, 0.15); border-color: transparent; color: var(--accent-primary, #14b8a6)` — filled teal/transparent background with accent teal text and icon, no border. CSS specificity also targets `.sidebar-rail-btn.active svg` and `.sidebar-rail-btn.active .sidebar-rail-label` for consistent accent coloring.

### Labels
- **Before:** 5 icon-only buttons with `title` tooltips (no visible text)
- **After:** Each button now contains a `<span className="sidebar-rail-label">` below the SVG icon showing: "Layers", "Discover", "Import", "Query", "History". Labels styled at 9px font-size, muted color (#8b949e), with text-overflow ellipsis. Labels brighten to #e6edf3 on hover and accent teal on active state.

### Import separator
- **Before:** Import button identical to other drawer toggle buttons
- **After:** Import button has `import-btn` class. CSS applies `margin-top: var(--space-1)` for extra spacing and a `::before` pseudo-element creating a subtle 1px horizontal line (`rgba(255, 255, 255, 0.1)`) positioned above the button. The separator is visually subtle — it's a 25%-width centered line at `top: calc(var(--space-1) * -0.5)`. On mobile (≤480px), the separator is hidden via `display: none`.

### Layout changes
- Sidebar rail width: 48px → 56px
- Button width: 36px → 44px, min-height: 36px (was fixed height)
- Button layout: changed from single-icon to `flex-direction: column` to accommodate label below icon
- Button gap: 8px → 4px (tighter spacing for label+icon pairs)
- Button padding: 4px 2px
- Sidebar drawer left position: 48px → 56px (follows rail width)
- Bottom dock left position: 48px → 56px (follows rail width)

## Tests

- **Updated:** `LayersPanel.test.tsx` — file header comment updated to document Slice 4.3 coverage
- **Added:** 9 new tests in `describe('Sidebar rail — affordances (Slice 4.3)')`:
  - `each rail button has a visible label` — verifies all 5 labels are present with correct class
  - `each label is inside its corresponding button` — verifies label text content per button
  - `active button has filled background (active class)` — verifies `.active` class on Layers button only
  - `History button has active class when rightPanelOpen is true` — verifies History active state
  - `Import button has import-btn class (separator target)` — verifies `.import-btn` class
  - `labels are muted by default (sidebar-rail-label class present)` — verifies all 5 labels have the class
  - `active button label also has accent color (via active parent)` — verifies label inside active button
  - `all 5 buttons preserve click handlers via title attribute` — verifies title-based selectors still work
  - `no active buttons when sidebar is null and rightPanel is closed` — verifies clean default state

- **Total passing:** 107/107 (98 existing + 9 new)
- **Existing tests:** All 98 pass without modification — `button[title="Layers"]` selectors still work because `title` attribute is preserved

## Visual evidence
- `screenshots/desktop-sidebar-labels.png` — Desktop view with Layers panel open. Shows all 5 sidebar buttons with visible text labels (Layers, Discover, Import, Query, History). Layers button has teal accent active state. Import separator line is subtle but present.
- `screenshots/desktop-sidebar-import-separator.png` — Desktop view with no panel open. Shows sidebar rail with all labels visible. Import separator visible as subtle spacing above Import button.
- `screenshots/mobile-sidebar-labels.png` — Mobile view (375px). Labels are correctly hidden via `display: none`. Icons remain visible. Import separator also hidden.

## Issues found

1. **Import separator visibility:** The separator is very subtle — `rgba(255, 255, 255, 0.1)` at 25% width is hard to see even in screenshots. This may be intentional ("subtle" was in the spec) but could be strengthened if discoverability is a concern.

2. **No tablet-specific label handling:** Labels are visible on tablet (768px breakpoint) where buttons are 44px. This is acceptable since tablet has more space, but worth noting the labels don't hide until ≤480px.

## Recommendation

**ACCEPT**

All three affordance improvements are implemented and working:
- ✅ Visible labels below each icon
- ✅ Filled accent-color active state (teal, not just border)
- ✅ Import separator (subtle but present via `::before` pseudo-element)
- ✅ All 5 click handlers preserved (title attributes unchanged)
- ✅ Labels hidden on mobile (≤480px)
- ✅ 107/107 tests passing
- ✅ Build succeeds
- ✅ No IMPLEMENTER files modified by tester

## Notes for future slices

- The active state uses `rgba(20, 184, 166, 0.15)` which is a 15% opacity teal fill — quite subtle against the dark background. If stronger visual distinction is needed, consider bumping to 25-30% opacity.
- The rail width increase (48px → 56px) affects all left-offset positions (drawer, bottom-dock, command-bar on mobile). These were updated consistently, but any future sidebar changes need to keep these in sync.
- Consider adding `aria-pressed` to active buttons for better screen reader support (currently uses class-only active state).
