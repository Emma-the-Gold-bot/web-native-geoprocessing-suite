# UX Design Review — Web-Native Geoprocessing Suite

> Fresh audit. No prior reviews consulted. Based on source code and desired outcomes only.

---

## 1. What exists

### Layout shell

A 3-column + top/bottom grid:

```
┌─────────────────────────────────────────────┐
│  Top Bar (56px) — 20+ buttons, status line  │
├──────┬──────────────────────┬───────────────┤
│ Left │       Map pane       │  Right panel  │
│ Rail │     (center)         │  (320px)      │
│280px │                      │  Details +    │
│      │                      │  History      │
├──────┴──────────────────────┴───────────────┤
│  Bottom Dock (260px) — Table/SQL/Results/    │
│  Ask/Discover tabs                          │
└─────────────────────────────────────────────┘
```

The structure itself is sensible. The UX-FRAMING.md got the four-pane layout right. The problem is what got stuffed into each pane.

### Visual language

Dark theme. Not dark with contrast — dark-flat-dark. The color palette:

| Token | Hex | Role |
|-------|-----|------|
| `#0b0f14` | Near-black | Shell background |
| `#111827` | Dark navy | Cards, top bar |
| `#0f172a` | Dark navy-2 | Left rail, right panel |
| `#09101a` | Deeper navy | Map background |
| `#1f2937` | Dark gray | Borders |
| `#e8edf2` | Light gray | Body text |
| `#94a3b8` | Muted gray | Secondary text |

Five nearly identical dark blues, one muted gray for text, no accent color beyond badge pills. Everything is a `.card` — cards inside cards inside cards. The visual hierarchy is communicated almost entirely through font-weight (`<strong>` vs `.muted`), which means it's nearly invisible on a dark background.

There are zero icons in the entire interface. Not one. Every affordance is text.

### Interaction patterns

- **Selection = clicking a card.** Every artifact, every history event, every saved query is a clickable `.card`. Selected state adds a blue border + subtle box-shadow.
- **Dialogs = floating `.import-overlay`.** Import review, save project, save query, and all 13+ operation dialogs share the same overlay class. They float over the map with a semi-opaque background, maximum width 760px.
- **Bottom tabs = Table, SQL, Results, Ask, Discover.** Click-to-switch tabs. The first three tabs are 260px of always-visible real estate even when empty.
- **No command palette, no keyboard shortcuts, no drag-and-drop** (except file import which is `<input type="file">`).
- **Top bar is the primary action surface.** Every action — New, Save, Open, Import, Load Sample, Export, Buffer, Centroid, Convex Hull, Envelope, Simplify, Grouped Dissolve, Area, Perimeter, Compactness, Reproject, Clip, Intersect, Attribute Join — lives in a horizontal button strip.

### Information density

Extreme at both ends. The top bar is saturated with 20+ controls. The right panel is a vertical dump of artifact metadata, CRS provenance (stored CRS + confidence + provenance source + display CRS), render issues, focused feature geometry + properties, lineage (source vs derived, event details, SQL if applicable), current notes, provenance notes, display runtime warnings, active warnings, and then history below all of that — all stacked, no collapsible sections, no progressive disclosure. The left rail is comparatively sparse: artifact list, saved queries, done.

The artifact cards pack 6+ badges into a single card: kind, CRS, CRS confidence, display-transform status, warning count, note count, provenance note count.

---

## 2. What's wrong

These are ranked by how much they block the 4 desired outcomes.

### Problem 1: The top bar is a visual assault (blocks Beauty, Elegance, Ease of use)

**Severity: Critical**

The top bar displays up to 23 interactive elements simultaneously: project name, status text, New, Save Project, Open Project, separator, Load Sample, Import, Export dropdown, and then — conditionally when a spatial artifact is selected — Buffer, Centroid, Convex Hull, Envelope, Simplify, Grouped Dissolve, Area, Perimeter, Compactness, Reproject, Clip, Intersect, Attribute Join.

For a new user who has loaded nothing, they see 7 buttons. As soon as they import one dataset, 13 more buttons appear. The UX-FRAMING.md explicitly warns against "menus as primary interaction architecture." This is worse — it's 20 small text buttons in a single horizontal strip with no grouping, no icons, and no hierarchy.

The framing doc also says the UI "should avoid forcing all users into click-ops." Yet the top bar forces click-ops onto every user before they've even oriented themselves.

### Problem 2: Everything-at-once defeats nested complexity (blocks Nested complexity, Elegance)

**Severity: Critical**

The right panel loads ALL metadata immediately when an artifact is clicked. There are no collapsible sections. A user sees: artifact name + kind, format, row count, geometry label, output kind, CRS block (4 sub-fields), render issue card, focused feature card with geometry type + full property dump, lineage section (source vs derived, event timestamp, event details with structured groups, SQL code block), notes section, provenance notes section, display runtime section, warnings section, and then the entire history list below that.

The UX-FRAMING.md calls for "progressive disclosure over modal labyrinths." The right panel is the opposite: everything, always, with no way to hide what you don't need right now.

Similarly, the bottom dock is always 260px tall — even when the Table tab shows "Select or import a spatial artifact to inspect rows," that entire panel is visible. When the Results tab is empty ("No query result preview yet"), it still consumes 260px. When Ask has no query typed, it's 260px of interface asking the user to type something. That's 25% of the visible viewport height permanently occupied by a panel that is often empty.

### Problem 3: The visual language is oppressive, not atmospheric (blocks Beauty)

**Severity: High**

Five nearly-identical dark blue backgrounds. No whitespace (padding is uniformly 12-16px, margins are 4-6-8-12-16px in a tight rhythm). No icons. Bold/muted text distinction is the only visual hierarchy mechanism — and on a dark background with low-contrast muted text (`#94a3b8` on `#0b0f14`), the difference between "important" and "secondary" is barely perceptible.

Every component is a `.card` (border-radius: 10px, background: `#111827`, border: `1px solid #243041`). Artifact list items are cards. Operation dialogs contain cards. Warning items are cards. History events are cards. Notes are cards. The card is the only shape in the visual vocabulary, which means nothing has visual distinction. Everything looks like everything else.

Compare this to tools that inspire confidence through visual design: Figma's properties panel uses no cards — just clean rows with subtle separators and section headers. Linear's issues use cards but only for the list; the detail view uses distinct layout zones. Notion's blocks are content, not containers. The current design wraps everything in a container, which makes the interface feel like navigating a file system of nested folders rather than working with spatial data.

### Problem 4: The operation dialogs are unbranded modal wizards (blocks Elegance, Nested complexity)

**Severity: High**

There are 13+ distinct operation dialog renderings in the JSX, spread across thousands of lines. Some use `OperationExecutionShell` (a shared component that provides title, subtitle, source summary, contract, warnings, output semantics, disclosure, name input, and run button). Approximately half of the operation dialogs use this shell. The other half (Buffer, Centroid, Convex Hull, Envelope, Simplify, Reproject, Clip, Intersect, Attribute Join) have their own independent JSX blocks — each 80-150 lines of near-identical structure with slight variations.

This is a design failure because:
- Users cannot build a mental model of "how operations work" when each one renders differently.
- The inconsistency hurts trust. A user who does Buffer sees one pattern. Then they do Clip and see a different pattern. They wonder if something is wrong.
- Every new operation requires significant JSX duplication.

The UX-FRAMING.md explicitly calls for avoiding "modal wizards" and "opaque toolboxes with weak provenance." The current operation dialogs are literally modal wizards. They float over the map, block all other interaction, and present a form with fields, contract details, warnings, and a Run button. Some are 3 fields, some are 8. None feel consistent.

### Problem 5: The 30-second first-task test fails (blocks Ease of use)

**Severity: High**

The UX-FRAMING.md's north star: "A user should be able to answer: What data do I have? What state is it in? What produced this layer/result? What can I do next? Where am I in the project?"

Walk through a new user's first 30 seconds:

1. **0s**: They see a dark interface. 7 buttons in the top bar (New, Save Project, Open Project, Load Sample, Import). Empty left rail ("No project artifacts yet."). A map showing San Francisco. Right panel: "Select an artifact to inspect..." Bottom dock: Table tab, showing "Select or import a spatial artifact..."

2. **5s**: They find "Load sample" in the top bar. Click it. An overlay appears: "Import review" with file name, support level, format, row count, geometry type, CRS, warnings. A button: "Import into workspace."

3. **10s**: They click Import. The overlay disappears. The map now shows parcels. Left rail shows one artifact card. Right panel immediately floods with metadata, CRS blocks, lineage, no warnings. History shows one event. Bottom dock table shows row data.

4. **15s**: They want to ask a question about the data. Where do they go? The top bar now has 20 buttons. They might click "Ask" in the bottom dock tabs. They type "clip parcels to Butte County." The NL panel shows "No matching operations found. Try SQL query instead." 

5. **30s**: They've succeeded at importing data and seeing it on a map. But they haven't asked a question about it, and the interface gave them no guidance on what to do next.

The import flow itself works — it's the best-designed part of the application. But the moment the import completes, the user is dropped into an interface with 20 top-bar buttons, a wall of metadata in the right panel, and no clear next step. The "Ask" tab fails because it can't answer a straightforward geographic question.

### Problem 6: The bottom dock wastes vertical space (blocks Elegance, Nested complexity)

**Severity: Medium**

260px — roughly 25% of the viewport on a 1080p display — is permanently occupied by five tabs, only two of which are likely to have content at any given time (Table when an artifact is selected, Results after a query). The SQL tab is useful but not 260px-of-always-visible useful. The Ask tab is aspirational but currently returns "No matching operations found" for most queries. The Discover tab is a data catalog search.

Compare to Linear: the equivalent area (comments/activity) slides up from the bottom when needed and hides when not. Arc's sidebar auto-hides. Notion's database views expand to fill the space. Permanent bottom docks in data tools are a remnant of IDE thinking (VS Code's terminal panel) — but this isn't an IDE, it's a spatial workbench.

### Problem 7: The design ignores that users have different modes (blocks Nested complexity, Elegance)

**Severity: Medium**

The UX-FRAMING.md identifies three modes: Explore, Analyze, Audit. The current UI serves all three modes simultaneously, which means it serves none well.

- **Explore mode** (opening data, checking schema, selecting features) — fights with the Analyze mode buttons in the top bar and the Audit mode warnings in the right panel.
- **Analyze mode** (writing SQL, running ops, creating outputs) — competes with the Explore mode table and the ever-present history list.
- **Audit mode** (validating outputs, checking CRS, reviewing steps) — is hard to find amid the other two modes.

The interface should adapt to what the user is doing. A user exploring data doesn't need the SQL editor visible. A user writing a query doesn't need 13 operation buttons visible. A user auditing lineage doesn't need the bottom dock taking up 260px. But because everything is always visible, every mode feels cluttered.

---

## 3. Design direction

### What the UI should feel like

**Linear's command palette + focus.** Linear is the gold standard for professional tool UIs because it understands that a power tool needs a command surface, not a button bar. ⌘K opens everything. The sidebar handles navigation. The main area handles content. There is no toolbar with 20 buttons. Every action is two keystrokes away: ⌘K → type → Enter. The interface recedes and lets the user focus.

**Figma's properties panel.** Figma's right panel is contextual. Select a frame → see frame properties. Select text → see text properties. Select nothing → the panel is minimal. The panel doesn't show frame properties when text is selected, and it doesn't show text properties when nothing is selected. Every element earns its place based on what's selected. That's the pattern the right panel should follow.

**Notion's slash commands and clean chrome.** Notion understands that most actions should be invoked on demand, not displayed preemptively. `/table` creates a table. `/database` creates a database. The command palette IS the interface for actions. The buttons that do exist (New page, Settings, Share) are minimal and contextual.

**Arc's spatial-first design.** Arc treats the web page as the primary interface and hides everything else until needed. The sidebar is optional. The URL bar is optional. What matters is the content. For a GIS workbench, the map is the "web page" — it should dominate the interface, and tooling should orbit around it, not compete with it.

### The emotional target

The interface should feel like:
- **A clean desk with a map spread across it** — not a cockpit with 20 toggle switches.
- **A tool you reach for** — not a tool you tolerate.
- **Something that thinks with you** — the right information appears when you need it. The interface doesn't shout everything at once.

The current interface feels like a developer's first pass at layout — technically correct, functionally complete, visually unconsidered. The framing was right (four-pane workbench, map-first, inspectable operations). The execution crammed everything into those panes without editing.

---

## 4. Specific recommendations

These are wireframe-level. Each assumes React + TypeScript + CSS — no new frameworks.

### Recommendation 1: Kill the top bar, replace with a 40px command bar

**Current state:** 56px top bar with 20+ buttons, project name, and status line. The most densely packed surface in the app.

**Target state:** A 40px slim bar containing:
- Left: Project name (treat as editable, click to rename)
- Center: Nothing. Clean.
- Right: Three elements only:
  - **Command palette trigger** (`⌘K` badge + search icon) — opens a Linear-style command palette with all operations, import, export, save, etc.
  - **Status indicator** — a small dot or subtle text showing running/idle state and warning count. Clickable to show a notification center.
  - **Profile/settings** (future)

The status message that currently lives as tiny text under the project name moves to a toast system (bottom-right, auto-dismissing for success, persistent+dismissable for warnings).

The operation buttons (Buffer, Centroid, etc.) move entirely into the command palette.

The project management buttons (New, Save, Open) move into the command palette. Save state is indicated by the project name's unsaved dot, which opens a dropdown on click.

**Result:** The top of the screen goes from 56px of button noise to 40px of clean orientation. The user's eye goes directly to the map.

**Lines of code removed from App.tsx:** ~50 lines of button JSX.

### Recommendation 2: Contextual right panel with collapsible sections

**Current state:** The right panel is a vertical dump of every piece of metadata, every warning category, every provenance note, and the full history list — all at once, no collapsing.

**Target state:** A panel that adapts to what's selected:

**When nothing is selected:**
- A compact project summary: artifact count, warning summary, recent activity
- Quick actions: Import data, Open sample data
- This is the "onboarding home" — it should be welcoming, not empty.

**When an artifact is selected:**
The panel shows collapsible accordion sections, each with a header and expand/collapse:

1. **Overview** (expanded by default)
   - Artifact name + kind badge
   - Format, row count, geometry type
   - Output kind label
   - CRS status (compact row: stored CRS + confidence badge)
   - A "Show CRS details" link that expands → full CRS provenance block

2. **Issues** (collapsed unless warnings exist, auto-expands when there are blocking warnings)
   - Shows a summary count: "2 warnings, 1 note"
   - Expand to see individual warning/note cards
   - Each warning shows severity badge + title + message + recovery hint

3. **Lineage** (collapsed by default, auto-expands for derived artifacts)
   - Source artifact(s) with links
   - Operation/query that produced this artifact
   - Event timestamp
   - SQL if applicable (shown in a small code block)

4. **Actions** (always visible, at the top of the panel, not in a section)
   - Quick action buttons: the 3-5 most relevant operations based on artifact type
   - "More actions…" link that opens the full operation menu or command palette

**Focused feature** (when a row is selected in the table):
- A floating bottom-sheet or inline panel that shows feature properties
- NOT a card in the right panel — it's a separate visual zone because it's a different kind of information (data about one feature vs metadata about the artifact)

**History** moves to a separate tab within a collapsible section at the bottom of the panel, collapsed by default.

**Result:** The right panel goes from 500+ lines of always-visible JSX to a clean 3-4 section accordion. Users see what they need when they need it.

### Recommendation 3: Bottom dock → slide-up panel

**Current state:** The bottom dock is always 260px tall with 5 tabs, even when empty.

**Target state:** A collapsible panel that slides up from the bottom:

- **Default state:** A 32px collapsed bar showing the current mode (e.g., "Table — 3,845 rows") with tabs as small labels. Click any tab or the bar to expand.
- **Expanded state:** Slides up to 300px. Shows the selected tab's content.
- **Auto-behavior:** Expands automatically when a query result arrives or an artifact is selected. Collapses when the user clicks the map or the collapse toggle.
- **Tabs reorganized:**
  - **Table** — artifact data rows
  - **SQL** — query editor + results preview
  - **Ask** — natural language (kept but secondary to SQL)
  - **Discover** — moved to the left rail or a separate panel (it's not a bottom-dock activity)
  - **Results** — merged into SQL tab (results appear below the editor, Linear-style)

**Result:** The map gains 260px of vertical space when the user doesn't need the dock. When they do, it's a deliberate action to open it. This alone transforms the interface from "cramped" to "spacious."

### Recommendation 4: Command palette as primary action surface

**Target:** ⌘K opens a searchable command palette:

```
┌────────────────────────────────────────┐
│ 🔍 Type a command...                   │
│                                        │
│ ── ACTIONS ────────────────────────── │
│ 📦 Import data                         │
│ 📋 Load sample data                    │
│ 💾 Save project                        │
│ 📂 Open project                        │
│ ↗  Export artifact…                    │
│                                        │
│ ── GEOMETRY OPERATIONS ────────────── │
│ ◉ Buffer                               │
│ ⊕ Centroid                             │
│ △ Convex Hull                          │
│ □ Envelope                             │
│ 〰 Simplify                            │
│                                        │
│ ── SPATIAL OPERATIONS ─────────────── │
│ ✂ Clip                                │
│ ∩ Intersect                            │
│ ⎇ Attribute Join                       │
│                                        │
│ ── MEASUREMENT ─────────────────────── │
│ 📐 Area                                │
│ 📏 Perimeter                           │
│ ⬡ Compactness                         │
└────────────────────────────────────────┘
```

Implementation: a simple React component that renders over the map. Filter operations by what's available (hide spatial ops when no spatial artifact is selected). Use `useEffect` for the keyboard shortcut.

This eliminates 13+ top-bar buttons, 13+ state variables (showBufferDialog, showCentroidDialog, etc.), and ~200 lines of top-bar button JSX. It also provides a natural home for keyboard shortcuts.

### Recommendation 5: Redesign the visual language

**Color system:**

| Token | Current | Proposed | Rationale |
|-------|---------|----------|-----------|
| Shell bg | `#0b0f14` | `#0d1117` | Slightly lighter, matches GitHub dark |
| Surface/card | `#111827` | `#161b22` | GitHub-dark surface, more contrast |
| Elevated | None | `#1c2128` | For dialogs, hover states |
| Border | `#1f2937` | `#30363d` | More visible grid lines |
| Text primary | `#e8edf2` | `#e6edf3` | Keep as-is, it works |
| Text secondary | `#94a3b8` | `#8b949e` | Slightly warmer gray |
| Accent | `#2563eb` | `#58a6ff` | Brighter blue, more visible |
| Warning | `#fbbf24` | `#d29922` | Less harsh amber |
| Success | `#86efac` | `#3fb950` | GitHub green |

**Spacing system:**
- Use a consistent 4px grid (4, 8, 12, 16, 24, 32)
- Panel padding: 24px (currently 16px)
- Card padding: 16px (currently 12px)
- Gap between cards: 12px (currently 8px)
- Section spacing: 24px between major sections

**Typography:**
- Panel titles: 11px uppercase with tighter tracking is fine — keep this
- Add section subtitles (13px, slightly bolder) to break up the right panel
- Use 14px body, 12px secondary — the current sizes are mostly right

**Cards → sections:**
- Artifacts in the left rail should be clickable rows with subtle hover, not cards
- Warnings should be grouped under section headers, not individual cards
- The right panel should use section dividers (thin horizontal rules) not card borders
- Cards should be reserved for "self-contained information units" — operation contracts, error states, focused feature details

**Icons:**
- Add a minimal icon set — even emoji (📍 for CRS, ⚠ for warnings, 🔗 for joins) would be a massive improvement
- For the command palette and action buttons, use simple SVG icons
- Don't over-icon things: the current text-only approach works for labels and badges

### Recommendation 6: Redesign the import flow as a sheet, not an overlay

**Current state:** Import is a popup overlay (`.import-overlay`, width 760px, centering via inset). It covers the map and creates a visual break.

**Target state:** Import opens as a right-side sheet (slides in from the right, 400-500px wide):

```
Step 1: Drop a file or click to browse
Step 2: Review summary (preflight results)
Step 3: Review warnings (if any)
Step 4: Name + confirm import
```

The sheet should:
- Slide in smoothly (CSS transition, 200ms)
- Show a progress indicator during import
- Close automatically on success (with a toast confirmation)
- Allow the map to remain visible behind it (useful if the user wants to verify coordinates)

**Result:** Import feels lightweight and contextual rather than "a modal you have to get through."

### Recommendation 7: Clean up the artifact card

**Current state:** Each artifact card shows: name, kind badge, format, row count, geometry label, CRS badge, CRS confidence badge, display-transform badge, warning count badge, note count badge, provenance note count badge. Up to 9 badges on a single card.

**Target state:**
```
┌──────────────────────────────────┐
│ ● parcel_data        source      │  ← dot = spatial indicator, name + kind
│ GeoJSON · 4,592 rows             │  ← format + count
│ 〰 Polygon  ⚠ 2  📍 EPSG:4326   │  ← geometry type, warning count, CRS
└──────────────────────────────────┘
```

- Kind badge is replaced by a subtle visual treatment (source = outlined row, derived = filled row with left accent bar)
- CRS confidence, display-transform, note counts, provenance counts → all consolidated into the warning count or shown on hover/expansion
- Hovering the card shows a tooltip with full metadata
- Right-clicking opens a context menu with operations and export

This makes the artifact list scannable instead of a wall of badges.

---

## 5. Phased approach

### Phase 1: Quick wins (1-2 days, biggest visual impact per hour)

| Change | Effort | Impact |
|--------|--------|--------|
| Collapse right panel sections into accordions | 3 hours | **High** — Right panel becomes usable |
| Move status message to toast system | 2 hours | **Medium** — Cleans up top bar |
| Reduce top bar height to 40px, remove status text | 1 hour | **Medium** — More map space |
| Lighten color palette (shell, surface, border) | 1 hour | **High** — Dramatic visual improvement |
| Add 4-5 emoji/icons to key labels | 30 min | **Medium** — Scanability |
| Remove "No warnings detected" card when empty | 15 min | **Low** — Less noise. Just show nothing. |
| Condense bottom dock to collapsed state by default | 2 hours | **Medium** — More map space |
| Merge Results tab into SQL tab | 1 hour | **Low** — Fewer tabs |

**Phase 1 delivers:** A cleaner, lighter interface that uses space better without changing any interaction model. The user can see more map and less chrome.

### Phase 2: Structural improvements (3-5 days)

| Change | Effort | Impact |
|--------|--------|--------|
| Command palette (⌘K) with all operations | 1 day | **High** — Removes 13+ top-bar buttons |
| Move operation buttons from top bar to command palette | 3 hours | **High** — Top bar becomes clean |
| Contextual right panel (shows relevant sections only) | 1 day | **High** — Right panel adapts to selection |
| Unified operation dialog shell (consolidate 13+ dialogs) | 1 day | **High** — Consistency, maintainability |
| Bottom dock → slide-up panel with collapse/expand | 1 day | **High** — Map-first becomes real |
| Redesign artifact cards in left rail | 4 hours | **Medium** — Cleaner artifact list |
| Discover tab moves to left rail section | 2 hours | **Low** — Better IA |

**Phase 2 delivers:** The interface transforms from "everything visible" to "what you need, when you need it." The command palette handles actions. The right panel shows contextual information. The bottom dock becomes optional.

### Phase 3: Polish (3-5 days)

| Change | Effort | Impact |
|--------|--------|--------|
| Import flow as smooth right-side sheet | 1 day | **High** — Best onboarding experience |
| Hover previews on artifact cards (show geometry on map) | 1 day | **High** — Spatial-first becomes real |
| Toast/notification system | 1 day | **Medium** — Professional feel |
| Keyboard shortcuts for common operations | 4 hours | **Medium** — Power user affordance |
| Empty states design (first-run experience) | 1 day | **Medium** — Welcoming onboarding |
| Animated transitions (panel expand, slide-up dock) | 1 day | **Medium** — Perceived quality |
| Focused feature as bottom-sheet instead of right panel card | 4 hours | **Low** — Better spatial organization |

**Phase 3 delivers:** The polish that makes the difference between "functional" and "someone cared about this." Smooth transitions, helpful empty states, keyboard-first power.

---

## 6. What to preserve

These aspects of the current design are genuinely good and should survive any redesign:

### The four-pane layout structure

The `grid-template: 280px 1fr 320px` + `56px / 1fr / 260px` was the right call. Left rail for data, center for map, right for details, bottom for table/query. This maps directly to what the UX-FRAMING.md called for. The issue was what went INTO those panes, not the arrangement itself.

### The artifact-as-primary-object model

Making artifacts first-class objects with IDs, provenance, warnings, metadata, and a clear source/derived distinction. This is the right ontology. The card pattern is a reasonable container for this information — it just needs visual refinement.

### The badge system

The badge taxonomy (source/derived, CRS confidence levels, warning severity levels, active/historical scope) is well-thought-out. The problem is density — not the badges themselves. Keep the badge system; just use fewer of them per card.

### The operation contract pattern

Showing users: "Here's what this operation will do. Here are the preconditions. Here are the warnings. Here's what the output will be." — this is the trust-building pattern the UX-FRAMING.md called for. The `OperationContractDisplay`, `OperationOutputSemantics`, and `TypedWarningPanel` components are correctly structured. They just need a unified shell (already partly done via `OperationExecutionShell`) and less modal presentation.

### The warning taxonomy

Distinguishing between active warnings (current state issues), notes (informational), provenance notes (historical context), and scoping them correctly — this is sophisticated and correct. Keep the taxonomy. Improve the presentation (grouping, collapsing).

### The map sync engine

The map-to-artifact synchronization, click-to-select-feature, WKb decoding, CRS display normalization — these are complex spatial engineering feats handled correctly. They are not UX concerns and should not change.

### The import preflight pattern

Scanning a file before committing, presenting summary/warnings/options before import — this is exactly what the framing doc called for. It's the best-designed flow in the application. The only issue is the visual container (overlay vs sheet).

### The dark theme concept

Keeping a dark theme for a spatial data tool is correct — maps look better on dark backgrounds, and long analytical sessions benefit from reduced eye strain. The issue is the specific color values, not the choice of dark mode.

### The NL Query panel's plan → execute flow

The NLQueryPanel's pattern of: type query → see candidates with confidence → select → see execution plan with steps/warnings → execute → see result — this is a thoughtfully designed progressive disclosure flow. It's a mini-version of what the whole interface should do. The panel itself needs the visual language update, but the interaction pattern is correct.

---

## Summary

The current interface has the right bones. The layout, the artifact model, the warning taxonomy, the operation contracts, the map sync — these are well-conceived. The failure is in the presentation layer: everything is visible at once, the color palette has no contrast, cards are used for everything, and the top bar is a landfill of buttons.

The 4 desired outcomes are achievable without changing the spatial engine or the data model. The work is editing — removing what doesn't serve the user, creating visual hierarchy, and building progressive disclosure into the panels that already exist.

**Estimated total effort: 8-14 days** across three phases. Phase 1 alone (~2 days) would deliver visible improvement. Phase 2 (~4 days) would achieve the nested complexity goal. Phase 3 (~5 days) would make it beautiful.

Start with the top bar. It's the most visible thing wrong with the interface, and fixing it (command palette + slim bar) removes the largest source of visual noise while also creating the infrastructure for all other operations to be invoked elegantly.
