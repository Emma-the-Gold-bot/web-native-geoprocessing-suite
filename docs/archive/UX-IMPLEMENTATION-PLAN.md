# UX Redesign Implementation Plan — Web-native Geoprocessing Suite

**Date:** 2026-06-14
**Source:** UX-DESIGN-REVIEW.md (designer audit, z-ai/glm-5.1)
**Tracking:** DEVELOPMENT.md (lifecycle state)

---

## Guiding Principles

1. **Every task is testable** — "looks better" is not acceptance criteria
2. **Ship after every phase** — each phase leaves the app better than it found it
3. **No task touches the spatial engine** — presentation layer only
4. **Before/after screenshots at every phase gate** — visual regression by human inspection

---

## Dependency Map

```
Phase 1 (Foundation) — no dependencies, start immediately
  ├─ T1.1: Color palette
  ├─ T1.2: Spacing/typography tokens
  ├─ T1.3: Right panel accordion (depends on T1.2)
  ├─ T1.4: Bottom dock collapse (depends on T1.2)
  ├─ T1.5: Toast system
  └─ T1.6: Artifact card cleanup (depends on T1.1, T1.2)

Phase 2 (Structure) — depends on Phase 1
  ├─ T2.1: Command palette (⌘K)
  ├─ T2.2: Top bar slim-down (depends on T2.1)
  ├─ T2.3: Unified operation dialog shell
  ├─ T2.4: Contextual right panel (depends on T1.3)
  ├─ T2.5: Slide-up bottom dock (depends on T1.4)
  └─ T2.6: Discover tab relocation

Phase 3 (Polish) — depends on Phase 2
  ├─ T3.1: Import flow as right-side sheet
  ├─ T3.2: Hover previews on artifact cards
  ├─ T3.3: Keyboard shortcuts
  ├─ T3.4: Empty states / first-run experience
  ├─ T3.5: Animated transitions
  └─ T3.6: Focused feature as bottom-sheet
```

---

## Phase 1: Foundation (1-2 days)

**Goal:** Cleaner, lighter, more spacious — without changing any interaction model.

### T1.1: Lighten Color Palette [S]

- **Input:** Current `styles.css` color values
- **Action:** Update CSS custom properties to lighter dark palette (GitHub-dark inspired)
- **Output:** Updated `:root` variables in `styles.css`
- **Verification:**
  - [ ] App renders without visual breakage
  - [ ] Map, panels, cards all use new palette
  - [ ] Contrast ratio of body text meets WCAG AA (4.5:1 on background)
  - [ ] Before/after screenshot comparison

Specific changes:
```css
/* FROM → TO */
--shell-bg:     #0b0f14 → #0d1117
--surface:      #111827 → #161b22
--elevated:     (none)   → #1c2128
--border:       #1f2937 → #30363d
--text-primary: #e8edf2 → #e6edf3
--text-muted:   #94a3b8 → #8b949e
--accent:       #2563eb → #58a6ff
--warning:      #fbbf24 → #d29922
--success:      #86efac → #3fb950
```

### T1.2: Define Spacing & Typography Tokens [S]

- **Input:** Current ad-hoc spacing/font values in `styles.css`
- **Action:** Define CSS custom properties for spacing scale and type scale; apply globally
- **Output:** Updated `:root` in `styles.css` with new tokens
- **Verification:**
  - [ ] All padding/margin values in the app reference tokens (not hardcoded px)
  - [ ] Typography uses defined scale (no ad-hoc `font-size: 11px` scattered)
  - [ ] Visual rhythm is consistent across panels

Specific tokens:
```css
:root {
  /* Spacing (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Typography */
  --text-xs:   11px / 16px;
  --text-sm:   12px / 18px;
  --text-base: 14px / 20px;
  --text-lg:   16px / 24px;
  --text-xl:   20px / 28px;

  /* Font weight */
  --weight-normal:   400;
  --weight-medium:   500;
  --weight-semibold: 600;
}
```

### T1.3: Right Panel Accordion [M]

- **Input:** Current right panel JSX in `App.tsx` (Details/History section, ~300 lines)
- **Action:** Wrap sections in collapsible `<details>` or custom accordion component. Sections: Overview (expanded), Issues (collapsed unless blocking), Lineage (collapsed), History (collapsed)
- **Output:** Right panel with collapsible sections, auto-expand logic for warnings
- **Verification:**
  - [ ] Clicking section header toggles collapse/expand
  - [ ] "Issues" auto-expands when blocking warnings exist
  - [ ] "Lineage" auto-expands for derived artifacts
  - [ ] All existing metadata still accessible (nothing lost)
  - [ ] Panel height reduced by 50%+ when sections collapsed

### T1.4: Bottom Dock Default Collapsed [M]

- **Input:** Current bottom dock JSX and state management
- **Action:** Add collapse/expand state. Default = collapsed (32px bar showing active tab name + expand toggle). Expanded = current 260px behavior.
- **Output:** Collapsible bottom dock with state persistence
- **Verification:**
  - [ ] App opens with bottom dock collapsed
  - [ ] Clicking the bar or a tab label expands the dock
  - [ ] Clicking the map collapses the dock (optional, configurable)
  - [ ] Expanded state shows all 5 tabs as before
  - [ ] Collapse state shows: active tab name + row count + expand toggle

### T1.5: Toast Status System [M]

- **Input:** Current `statusMessage` state + `<div className="muted small">{statusMessage}</div>` in top bar
- - **Action:** Replace inline status with toast notification system. Toasts appear bottom-right, auto-dismiss after 5s (success), persist until dismissed (warnings/errors).
- **Output:** `Toast.tsx` component + toast state management
- **Verification:**
  - [ ] Status messages appear as toasts, not inline text
  - [ ] Success toasts auto-dismiss after 5 seconds
  - [ ] Warning/error toasts persist until clicked
  - [ ] Multiple toasts stack vertically
  - [ ] Top bar no longer shows status text

### T1.6: Artifact Card Cleanup [M]

- **Input:** Current artifact card JSX in left rail (~40 lines per card)
- **Action:** Reduce badges from 8+ to 3: name + kind, format + row count, geometry + warning count + CRS. All other metadata accessible on hover or in right panel.
- **Output:** Simplified artifact cards in left rail
- **Verification:**
  - [ ] Each card shows max 3 lines of info
  - [ ] Full metadata still available in right panel when artifact selected
  - [ ] Cards are scannable — user can identify artifacts at a glance
  - [ ] No information is permanently lost (moved to inspector, not deleted)

---

## Phase 2: Structure (3-5 days)

**Goal:** Transform from "everything visible" to "what you need, when you need it."

### T2.1: Command Palette (⌘K) [L]

- **Input:** All operation definitions, artifact list, saved queries
- **Action:** Build `CommandPalette.tsx` — modal overlay with fuzzy search. Sources: operations (buffer, clip, etc.), artifacts (by name), saved queries, project actions (save, open, export). Keyboard navigation (↑↓ Enter Esc).
- **Output:** Working command palette triggered by ⌘K
- **Verification:**
  - [ ] ⌘K opens palette, Esc closes it
  - [ ] Typing filters operations/artifacts/queries with fuzzy match
  - [ ] Selecting an operation opens the corresponding dialog
  - [ ] Selecting an artifact selects it in the left rail
  - [ ] Selecting a saved query loads it into SQL editor
  - [ ] Arrow keys navigate, Enter selects
  - [ ] Palette shows category headers (Operations, Artifacts, Queries)

### T2.2: Top Bar Slim-Down [M] (depends on T2.1)

- **Input:** Current top bar JSX (~100 lines of buttons) + command palette from T2.1
- **Action:** Remove all operation buttons from top bar. Replace with: project name (left), ⌘K trigger (center-right), status dot (right). Move New/Save/Open/Import/Export into command palette.
- **Output:** 40px top bar with 3 elements
- **Verification:**
  - [ ] Top bar shows: project name, ⌘K trigger, status indicator
  - [ ] All operations accessible via ⌘K
  - [ ] Import accessible via ⌘K (opens import sheet — T3.1, or keeps current overlay until then)
  - [ ] No functionality is lost
  - [ ] Top bar height reduced from 56px to 40px

### T2.3: Unified Operation Dialog Shell [L]

- **Input:** 13+ inline operation dialog implementations in App.tsx
- **Action:** Refactor all operation dialogs to use `OperationExecutionShell` (already partially exists). Single component with: source summary → parameters slot → warnings (collapsed) → name input → run button. Each operation provides only its unique parameters.
- **Output:** One `OperationDialog.tsx` component + operation-specific parameter configs
- **Verification:**
  - [ ] All 13 operations use the same dialog shell
  - [ ] Each operation shows only its relevant parameters (no contract/semantics cards by default)
  - [ ] "Show details" disclosure reveals contract/semantics info
  - [ ] Dialog appearance is consistent across all operations
  - [ ] Each operation's dialog is <30 lines of JSX (vs current 80-150)

### T2.4: Contextual Right Panel [L] (depends on T1.3)

- **Input:** Accordion right panel from T1.3 + selected artifact context
- **Action:** Right panel adapts sections based on selection state. Nothing selected → project summary + quick actions. Artifact selected → Overview/Issues/Lineage/Actions. Feature selected → feature properties.
- **Output:** Context-sensitive right panel
- **Verification:**
  - [ ] Nothing selected: shows project summary, artifact count, quick actions
  - [ ] Artifact selected: shows relevant sections only
  - [ ] Derived artifact: Lineage auto-expanded
  - [ ] Artifact with blocking warnings: Issues auto-expanded
  - [ ] Sections not relevant to current selection are hidden

### T2.5: Slide-Up Bottom Dock [M] (depends on T1.4)

- **Input:** Collapsible bottom dock from T1.4
- **Action:** Convert to slide-up panel. Default: 32px collapsed bar. Expanded: slides up to 300px with smooth CSS transition. Auto-expand on query result arrival.
- **Output:** Slide-up bottom dock with CSS transitions
- **Verification:**
  - [ ] Default state: 32px bar at bottom
  - [ ] Expanding: smooth slide-up animation (200ms)
  - [ ] Collapsing: smooth slide-down animation
  - [ ] Auto-expands when SQL query returns results
  - [ ] Map fills reclaimed space when dock collapsed

### T2.6: Discover Tab Relocation [S]

- **Input:** Discover tab currently in bottom dock
- **Action:** Move Discover to a section in the left rail (below Saved Queries) or make it accessible via command palette ("Discover data...")
- **Output:** Discover accessible from left rail or ⌘K
- **Verification:**
  - [ ] Discover no longer in bottom dock tabs
  - [ ] Discover accessible from left rail or command palette
  - [ ] All discover functionality preserved

---

## Phase 3: Polish (3-5 days)

**Goal:** Make it feel like a tool someone wants to use.

### T3.1: Import as Right-Side Sheet [M]

- **Input:** Current import overlay (`.import-overlay`)
- **Action:** Replace with right-side sheet (400-500px, slides in from right). Steps: file select → preflight review → warnings → name + confirm. Map remains visible behind sheet.
- **Output:** Import flow as a slide-in sheet
- **Verification:**
  - [ ] Import opens as right-side sheet, not center overlay
  - [ ] Map visible behind sheet during import review
  - [ ] Sheet slides in smoothly (200ms transition)
  - [ ] All import steps (scan, review, confirm) work as before
  - [ ] Sheet closes on successful import with toast confirmation

### T3.2: Hover Previews on Artifact Cards [M]

- **Input:** Artifact cards in left rail + map state
- **Action:** Hovering an artifact card highlights its geometry on the map (subtle glow/opacity change). Leaves preview on mouse-out.
- **Output:** Map preview on artifact hover
- **Verification:**
  - [ ] Hovering artifact card highlights its features on map
  - [ ] Mouse-out restores normal styling
  - [ ] Performance: no lag on hover (debounced if needed)
  - [ ] Works for all geometry types (point, line, polygon)

### T3.3: Keyboard Shortcuts [M]

- **Input:** Command palette operation list
- **Action:** Add keyboard shortcuts for common operations: ⌘K (palette), ⌘S (save), ⌘I (import), ⌘E (export), Esc (close panel/dialog)
- **Output:** Keyboard shortcut bindings
- **Verification:**
  - [ ] ⌘K opens command palette
  - [ ] ⌘S saves project
  - [ ] ⌘I triggers import
  - [ ] Esc closes active panel/dialog
  - [ ] Shortcuts shown in command palette next to operation names

### T3.4: Empty States & First-Run [M]

- **Input:** Current empty states (blank map, empty table, no artifacts)
- **Action:** Design welcoming empty states. First run: auto-load sample data with subtle "Using demo data — import yours anytime" banner. Empty table: "Select an artifact to inspect its rows." Empty right panel: project summary with quick actions.
- **Output:** Contextual empty states throughout the app
- **Verification:**
  - [ ] First open: sample data auto-loaded, map shows parcels
  - [ ] Banner indicates demo data is loaded
  - [ ] Empty states are contextual (not generic "nothing here")
  - [ ] No blank/dead surfaces in the app

### T3.5: Animated Transitions [S]

- **Input:** Panel expand/collapse, dock slide-up, sheet slide-in
- **Action:** Add CSS transitions (200-300ms ease-out) to all state changes: panel accordion, dock collapse, sheet open/close, toast enter/exit
- **Output:** Smooth transitions throughout
- **Verification:**
  - [ ] All panel state changes animate smoothly
  - [ ] No jarring jumps or pops
  - [ ] Transitions don't interfere with interaction (no blocking)

### T3.6: Focused Feature as Bottom-Sheet [S]

- **Input:** Current focused feature display in right panel
- **Action:** Move focused feature properties to a floating bottom-sheet (above the dock, 200px), separate from the right panel
- **Output:** Floating feature detail sheet
- **Verification:**
  - [ ] Clicking a feature on map shows its properties in a bottom-sheet
  - [ ] Sheet doesn't block the right panel
  - [ ] Sheet dismissible (click away or Esc)
  - [ ] Properties display same as current right panel

---

## Verification Protocol

### Per-Task
- Each task has explicit verification checkboxes
- Coder marks checkboxes complete before task is considered done
- Main reviews verification before moving to next task

### Per-Phase Gate
Before starting the next phase, confirm:
1. [ ] All tasks in current phase are verified complete
2. [ ] App builds without errors (`npm run build`)
3. [ ] App runs without console errors
4. [ ] Before/after screenshots taken and compared
5. [ ] No regressions in spatial engine functionality (load sample, run buffer, check map)
6. [ ] DEVELOPMENT.md updated with phase status

### Final Acceptance
After Phase 3:
1. [ ] All 4 desired outcomes demonstrably improved
2. [ ] Time-to-first-task < 30 seconds (test with fresh browser session)
3. [ ] No visible placeholder text or broken layouts
4. [ ] All operations accessible via command palette
5. [ ] Right panel adapts to selection context
6. [ ] Bottom dock collapses by default
