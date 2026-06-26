# UX Framing — Web-native geoprocessing suite

## Purpose

Define the product UX shape early enough to guide architecture and MVP scope without drifting into premature visual polish. This document focuses on **interaction model, information architecture, canonical workflows, and interface metaphors** for the browser-native spatial workbench.

This is not a visual design system and not a pixel spec.

---

## Core UX thesis

The product should feel like:
- a **serious spatial data workbench**
- with the inspectability of a **notebook / query environment**
- the directness of a **map + table tool**
- and the continuity of a **local-first project workspace**

It should **not** feel like:
- desktop GIS crammed into a browser chrome prison
- a notebook with a map stapled on the side
- a thin SaaS form builder for geospatial APIs
- a pile of modal wizards and side effects with no memory

### UX north star

A user should be able to answer, at any time:
- What data do I have?
- What state is it in?
- What produced this layer/result?
- What can I do next?
- Where am I in the project?

If the interface cannot answer those cleanly, it is lying to the user.

---

## Primary object model

This matters because most UX confusion is really ontology confusion.

### Primary object: **project workspace**
The core object should be the **project**, not the file.

A project contains:
- source datasets
- derived layers/tables
- saved queries
- operation history
- map/table/query state
- exports and artifacts

Why:
- files alone cannot represent provenance
- layers alone cannot represent cross-dataset workflow
- queries alone cannot represent map and artifact state
- workflows alone are too abstract for initial entry

### Secondary objects
- **dataset** — a source or imported artifact
- **layer** — a map-visible representation of data
- **table** — a queryable / inspectable tabular representation
- **query** — a saved analytical step
- **operation** — a transform with parameters and outputs
- **export** — an emitted artifact with fidelity/warning metadata

### Crucial distinction
The UI should distinguish clearly between:
- **source datasets**
- **derived outputs**
- **temporary selections/views**

Desktop GIS often blurs these. We should not.

---

## Recommended interface metaphor

The best early metaphor is:

### **Workbench with synchronized panes**

Notebook-only is too code-forward.
Map-only is too shallow.
Workflow-graph-first is too abstract.

The workbench metaphor supports the actual workflow:
- inspect
- compare
- query
- transform
- review
- export

### Core panes
The MVP should revolve around four primary surfaces:

1. **Project / Data pane**
   - datasets
   - derived layers
   - saved queries
   - exports
   - warnings/status badges

2. **Map pane**
   - spatial context
   - selection
   - styling
   - spatial inspection

3. **Table / Query pane**
   - schema
   - rows
   - SQL
   - result tables
   - quick stats/filtering

4. **History / Details pane**
   - operation lineage
   - dataset details
   - CRS metadata
   - warnings/errors
   - step parameters

This gives the product a clear native form.

---

## Canonical user flows

These should anchor the product. If the interface serves these badly, nothing else matters.

## Flow 1 — Open and understand a dataset

### User intent
“I just got this file / dataset. What is it?”

### Ideal flow
1. User opens a project or creates a new one.
2. User imports a dataset.
3. System presents an import summary:
   - format
   - feature count / row count
   - geometry type
   - CRS / CRS ambiguity
   - extent
   - schema preview
   - warnings
4. User confirms import.
5. Data appears in project pane, map, and table.
6. User can inspect metadata and health details without losing context.

### UX requirements
- import should feel inspectable, not magical
- warnings should be surfaced early and persist in dataset details
- no hidden coercion of broken data

### Success feeling
“I trust what was imported, and I understand what I’m looking at.”

---

## Flow 2 — Query and derive a result

### User intent
“I want to ask a question of this data and make a new result.”

### Ideal flow
1. User selects one or more datasets.
2. User opens query workspace.
3. User writes SQL or chooses a common operation.
4. Query executes in background with visible progress/state.
5. Result appears as:
   - new derived table/layer
   - map overlay
   - history step
6. User can save the query and rename the output.

### UX requirements
- results should feel first-class, not temporary console output
- query and output relationship must be obvious
- failure messages must name the broken assumption, not just throw stack-gibberish

### Success feeling
“I produced a result I can inspect, trust, and reuse.”

---

## Flow 3 — Diagnose CRS / geometry problems

### User intent
“Something looks wrong. Why?”

### Ideal flow
1. User notices mismatch, import warning, or invalid geometry badge.
2. User opens dataset details.
3. System shows:
   - current CRS / unknown state
   - source metadata
   - geometry validity status
   - suggested next actions
4. User can:
   - assign CRS
   - reproject
   - run validity check / repair
5. The action creates a new history entry and, when appropriate, a derived layer.

### UX requirements
- CRS should never be invisible
- warnings need to be legible and actionable
- “assign CRS” and “reproject” must be clearly distinguished

### Success feeling
“I know whether the problem was bad metadata, wrong assumptions, or broken geometry—and I can fix it without guessing.”

---

## Flow 4 — Compare source and derived outputs

### User intent
“What changed, and can I trust the result?”

### Ideal flow
1. User selects a derived layer.
2. UI shows provenance summary:
   - inputs
   - operation/query
   - parameters
   - warnings
3. User compares source and result in map/table.
4. User can inspect operation details or rerun/fork later.

### UX requirements
- provenance must be visible without opening a deep technical panel maze
- derived artifacts should carry their lineage with them

### Success feeling
“I can explain what this layer is, where it came from, and whether it’s fit to export.”

---

## Flow 5 — Export a trustworthy artifact

### User intent
“I want to take this result elsewhere without losing the plot.”

### Ideal flow
1. User selects a source or derived output.
2. User chooses export.
3. UI shows:
   - format options
   - CRS behavior
   - possible fidelity loss / warnings
4. User exports.
5. Export is recorded in project history.

### UX requirements
- exporting is not just downloading bytes; it is a documented project event
- warn on metadata/CRS/fidelity loss in plain language

### Success feeling
“I know what I exported and what caveats went with it.”

---

## Recommended information architecture

## Left rail: Project navigator
Contains:
- project name/state
- datasets
- derived layers
- saved queries
- exports
- status badges

### Why left rail
It gives stable orientation and reinforces that the project is the primary object.

### Anti-pattern to avoid
Do not make the layer list the whole ontology. A layer list is not a project model.

---

## Center: Primary work surface
Default center surface should be **map + contextual lower panel**.

### Suggested default layout
- center: map
- bottom dock: table/query tabs
- right panel: details/history
- left rail: project navigator

This gives the user a strong spatial anchor while preserving analytical power.

### Why this layout
- map remains the intuitive orientation tool
- tables and queries remain near, not buried
- details/history can be inspected without losing the central workspace

### Alternative mode
A split mode may allow expanded query/table work for SQL-heavy users, but the product should not open by looking like an IDE first.

---

## Right panel: context-sensitive inspector
The right panel should switch between:
- dataset details
- layer styling
- operation details
- CRS metadata
- warnings/errors
- history step details

### Principle
Keep the user in one spatial-analytical workspace. Don’t shove every action into modal dialogs.

---

## Bottom panel: table + query workspace
Tabs might include:
- Table
- SQL
- Results
- Stats (later)

### Principle
Tabular and query work should feel adjacent to the map, not like a separate subsystem.

---

## Interface modes to support

## Mode 1 — Explore
Map/table inspection with low cognitive load.

Use when:
- opening data
- checking schema/extents
- selecting features
- basic styling

## Mode 2 — Analyze
Querying, transforming, and creating derived outputs.

Use when:
- writing SQL
- running spatial ops
- saving outputs

## Mode 3 — Audit
Understanding provenance, warnings, and metadata.

Use when:
- validating outputs
- checking CRS
- reviewing steps before export

The UI should let users move between these modes fluidly without pretending they are separate applications.

---

## Recommended UX principles

## 1. Make state visible
Always expose:
- source vs derived
- CRS
- warnings
- selection count
- unsaved work / active operation state

## 2. Prefer progressive disclosure over modal labyrinths
Desktop GIS often buries meaning in dialogs. The browser app should keep context alive.

## 3. Make transforms inspectable by default
Every meaningful operation should leave a readable trace.

## 4. Avoid hidden side effects
Running a query/operation should clearly state whether it:
- previews a result
- replaces something
- creates a new artifact
- updates map styling only

## 5. Keep map and table synchronized
Selection, filters, and result identity should travel between them.

## 6. Respect both low-code and code-forward users
The product should support:
- direct manipulation for common tasks
- SQL for power users

But avoid forcing all users into notebooks or all users into click-ops.

## 7. Treat warnings as product features, not error afterthoughts
Good import and CRS warnings build trust.

---

## Specific UX decisions I’d recommend

## Decision: map-first, not notebook-first
The default should open on a map-centered workspace.

Why:
- spatial orientation matters immediately
- notebook-first makes the product feel more niche and abstract
- map-first is friendlier without sacrificing analytical power

## Decision: SQL is first-class, but not the only front door
Have a serious SQL surface, but pair it with:
- common operation shortcuts
- dataset summaries
- interactive selection/filtering

## Decision: provenance is a sidecar that should become a spine
For MVP, a right-side history/details model is enough.
Longer term, provenance may deserve a richer graph/timeline view.

## Decision: import is a review step, not just a file picker
Users should see enough before commit to catch obvious trouble.

## Decision: derive-by-default over destructive edit-by-default
Most operations should create derived outputs unless the user explicitly chooses replacement.
That preserves trust and aligns with reproducibility.

---

## What to preserve from desktop GIS
- strong metadata inspection
- clear layer control
- CRS seriousness
- geometry validity awareness
- map/table duality
- explicit export control

## What to reject from desktop GIS
- modal wizard overload
- opaque toolboxes with weak provenance
- destructive operations without good lineage
- menus as primary interaction architecture
- file-path-centric identity over project/workflow identity

## What to preserve from notebooks/data tools
- inspectability
- repeatability
- saved analytical steps
- clear query-to-result relationship

## What to reject from notebooks/data tools
- making the whole product feel like code-first infrastructure
- weak map-centric orientation
- hidden state in cells/session order
- poor affordances for visual comparison and spatial inspection

---

## Suggested MVP screen model

## Screen 1 — Project workspace (main)
Contains:
- left: project/data navigator
- center: map
- bottom: table/query/results
- right: details/history

This is the main application shell.

## Screen 2 — Import review
Can be modal or route-level, but should preserve project context.
Contains:
- file summary
- schema preview
- CRS detection/assignment
- warnings
- import options

## Screen 3 — Export review
Contains:
- artifact summary
- format choice
- CRS/fidelity warnings
- export target/action

Everything else should ideally happen inside the main workspace.

---

## Open UX questions
- Should queries live in tabbed bottom panels only, or also as saved cards in the project rail?
- What is the best visual language for source vs derived artifacts?
- Should operation history be shown as a chronological feed, a graph, or both?
- How much styling belongs in MVP versus deferring to later map-design work?
- How should large-result previews degrade gracefully without misleading the user?

---

## Recommended next UX artifacts

1. **canonical user-flow wire outlines**
2. **information architecture diagram**
3. **import-validation UX spec**
4. **provenance/history interaction spec**
5. **low-fidelity wireframes for the main workspace**

---

## Bottom-line recommendation

Discuss UX now, but discuss the right layer of UX.

The immediate job is to lock down:
- the primary object model
- the canonical flows
- the default workspace layout
- the relationship between map, table, query, and history
- the trust model around import, CRS, and provenance

If we get those right, visual design can sharpen the blade later.
If we get those wrong, beautiful UI will only make the confusion more expensive.
