# UX Provenance & History Interaction Spec — Web-native geoprocessing suite

## Purpose

Define how provenance, operation history, lineage, and auditability should work in the browser-native spatial workbench.

This is not just a logging feature. It is one of the product’s main trust surfaces. The goal is to let users answer, at any time:
- What is this artifact?
- Where did it come from?
- What was done to it?
- What assumptions, warnings, and caveats came with that process?
- What can I safely do next?

In short: provenance is how the product avoids becoming a liar with a nice map.

---

## UX goals

The provenance/history experience should make users feel:
- oriented
- able to explain outputs
- protected from accidental ambiguity
- able to review and reuse prior work

### North-star outcomes
A user should be able to:
- select any layer/table/export and see its origin story
- understand source vs derived artifacts instantly
- inspect prior operations without losing workspace context
- trace warnings forward into outputs
- trust that exported results remain explainable

### Anti-goals
The history system must not feel like:
- decorative activity feed noise
- hidden technical audit logs for engineers only
- a giant workflow graph too abstract for normal work
- a notebook execution trace that depends on remembering cell order

---

## Scope

### In scope
- history panel behavior
- provenance summaries for datasets and derived outputs
- lineage presentation in MVP
- how warnings/caveats propagate through history
- source vs derived representation
- action affordances from history
- chronological feed vs lineage summary balance
- export history UX

### Out of scope
- full visual DAG editor
- multi-user version-control UI
- complete backend lineage schema
- collaborative review workflow

---

## Core UX thesis

For MVP, provenance should be presented as:

### 1. A chronological **history feed**
Good for:
- recent work
- orientation
- seeing what happened in order
- quick jump-back into prior steps

### 2. A contextual **lineage summary**
Good for:
- understanding a selected artifact
- answering “what produced this?”
- keeping complexity readable

### 3. A detailed **operation inspector**
Good for:
- parameters
- warnings
- CRS assumptions
- export settings
- rerun/fork later

This three-layer model is better for MVP than leading with a full graph view.

### Why not graph-first?
Because graph-first becomes spaghetti fast, especially when the user just wants to know where a layer came from. Graph views may become useful later, but they should emerge from a clean history model rather than substitute for one.

---

## Provenance object model

Every meaningful action should create a **history event**.

### History event types
- import
- query run
- query saved/materialized
- geometry transform
- CRS assign
- reproject
- validation/repair
- export
- deletion/archive later if supported

### Every artifact should know
- whether it is **source** or **derived**
- which history event created it
- which upstream artifact(s) it depends on
- whether it carries unresolved warnings/caveats

### Every history event should know
- timestamp
- action type
- actor (for MVP this can be local user/session context)
- inputs
- outputs
- parameters
- warnings/errors
- notes/summary text
- support tier when the event touches a limited or environment-sensitive operation

Without this model, the UI will eventually invent fake certainty.

---

## MVP presentation model

## A. Left rail artifact badges
Every dataset/layer/table in the project navigator should show at-a-glance provenance state.

### Recommended labels/badges
- **Source**
- **Derived**
- warning count or badge
- optional small icon for:
  - query-derived
  - transform-derived
  - exported-from maybe only in details/history

### Goal
A user should never have to guess whether something is original or produced inside the workspace.

---

## B. Right-panel lineage summary
When the user selects any artifact, the right panel should include a **lineage summary card** near the top.

### For source artifacts
Show:
- Source dataset
- import time
- import format
- CRS state
- import warnings count

### For derived artifacts
Show:
- Derived artifact
- produced by: query / transform / reproject / repair / etc.
- from: input artifact(s)
- created at: timestamp
- warnings carried forward
- jump links:
  - View operation details
  - View source artifact(s)
  - Compare inputs/outputs

### Goal
Answer “what is this?” in under five seconds.

---

## C. History feed in right panel / dedicated tab
The history view should be a chronological list of major events.

### Event card contents
Each event card should show:
- action icon/type
- human-readable summary
- timestamp
- input(s)
- output(s)
- warning indicator if applicable
- click to inspect details

### Example summaries
- Imported `parcels_2026` from GeoParquet — 2 warnings
- Ran query `flood_exposure_join` → created `parcels_in_floodzone`
- Assigned CRS `EPSG:2227` to `roads_raw`
- Reprojected `roads_fixed` → `roads_wgs84`
- Exported `parcels_in_floodzone` to GeoJSON — 1 fidelity warning

### UX principle
Summaries should be plain language first, technical detail second.

---

## Artifact selection behavior

## Selecting a source artifact
Right panel should prioritize:
- summary
- import details
- CRS status
- warnings
- lineage card indicating this is a source
- related downstream outputs if any

### Helpful section
**Used in derived outputs**
- `flood_join_result`
- `buffered_schools`
- `roads_wgs84`

This gives source artifacts downstream visibility.

## Selecting a derived artifact
Right panel should prioritize:
- artifact summary
- lineage summary
- originating operation/query
- inputs
- warnings carried into output
- compare/export actions

### Helpful section
**Produced from**
- parcels_2026
- flood_zones_fema

**By**
- spatial query `flood_exposure_join`

---

## History detail inspector

When a user clicks a history event, open a detailed operation view in the right panel.

## Required fields
- event type
- time
- readable summary
- inputs
- outputs
- parameters
- warnings/errors
- CRS metadata and transformations when relevant
- export settings when relevant

## By event type

### Import event details
Show:
- detected format
- support level
- scan summary
- warnings
- import mode: full / partial / degraded
- feature count
- CRS evidence source

### Query event details
Show:
- query name if saved
- SQL text or excerpt
- input tables
- output artifact
- row count/result summary
- engine warnings if meaningful

### Geometry operation details
Show:
- operation type
- support tier / support envelope status
- input dataset(s)
- key parameters
- output artifact
- validity or empty-result caveats
- whether behavior is display-only, validated-local-only, or environment-sensitive when relevant

### CRS event details
Show:
- assign vs reproject distinction clearly
- previous CRS state
- resulting CRS state
- transformation notes/warnings

### Export event details
Show:
- exported artifact
- chosen format
- file name
- CRS behavior
- metadata/fidelity warnings

---

## Warning propagation model

This is one of the most important UX details.

Warnings should not disappear just because a new artifact was created.

## Rules
### Rule 1 — Warnings belong both to events and artifacts
- An import event can have warnings.
- A source artifact can inherit unresolved warnings from that import.

### Rule 2 — Derived outputs should show inherited risk when relevant
Example:
- if an input had unresolved CRS ambiguity, derived outputs should indicate that they may inherit location uncertainty.

### Rule 3 — Resolved issues should remain historically visible
If a user fixes CRS later, the old warning should no longer present as active on the fixed artifact, but the history must still show that the original issue existed.

### Rule 4 — Warnings should distinguish active vs historical
Recommended labels:
- **Active warning**
- **Resolved in later step**
- **Historical caveat**

This prevents the UI from either erasing the past or over-alarming the present.

---

## Compare and audit interactions

Provenance becomes useful when it supports decisions, not just memory.

## Compare source and derived
When a derived artifact is selected, users should be able to:
- jump to source artifact
- toggle source + output visibility
- compare counts/schema in table view
- inspect the generating event

### MVP note
This can be lightweight at first:
- source links
- layer visibility toggles
- row count/schema summary

No need for a sophisticated visual diff engine yet.

---

## History affordances

The history system should expose meaningful actions.

## MVP actions
- View details
- Jump to input artifact
- Jump to output artifact
- Compare source/output
- Export selected artifact

## Later actions
- rerun event
- fork from event
- duplicate query with edits
- annotate event

### Principle
Even before true rerun/fork exists, the history UI should be structured so those actions make sense later.

---

## Provenance in the main shell

Provenance should not live only in one hidden tab.

## Shell-level indicators
- left rail: source/derived badges + warning badges
- right panel: lineage summary card
- history tab: chronological event feed
- export sheet: “exporting derived artifact from…” summary
- dataset details: import provenance block

### Goal
The system should feel provenance-aware everywhere, not provenance-themed nowhere.

---

## Feed design principles

## Principle 1 — Summaries should read like human actions
Good:
- “Imported `roads_raw` from Shapefile — CRS missing”

Bad:
- “EVENT_IMPORT_COMPLETED #92”

## Principle 2 — Keep chronology legible
Newest first is usually fine for the feed, but artifact lineage should not depend on reading history backwards in your head.

## Principle 3 — Don’t overload cards
History cards should summarize. Details belong in the inspector.

## Principle 4 — Make warnings quiet but visible
A small warning badge is enough on the feed card. The details pane can unpack it.

---

## Empty / early states

## No history yet
Show:
- “No project history yet.”
- hint: import data to begin

## Minimal project history
Early on, even a single import event should make the history view feel purposeful, not empty ceremony.

## Long history
If history grows long, support:
- filter by event type later
- search later
- collapse minor events later

These do not need to be MVP blockers.

---

## Microcopy guidelines

## Use verbs users understand
- Imported
- Queried
- Created
- Reprojected
- Repaired
- Exported

Not:
- materialized lineage node
- executed transformation primitive

## Name consequences when warnings exist
Good:
- “Derived from a dataset with unresolved CRS ambiguity.”

Better than:
- “Warning inherited.”

## Distinguish current truth from historical truth
Good:
- “This issue was present on import and resolved when `roads_fixed` was created.”

---

## Recommended MVP decisions

## Decision: use feed + lineage summary + detail inspector
This is the right complexity level for MVP.

## Decision: always label source vs derived
This should not be hidden in details.

## Decision: treat export as provenance-bearing event
Downloads without memory are amnesia.

## Decision: carry warnings forward until explicitly resolved
This is crucial for honesty.

## Decision: do not lead with a graph UI
Graph visualization can come later if the underlying model earns it.

---

## Open questions
- Should saved queries appear as history events only, or also as reusable project assets with their own provenance cards?
- How much SQL text should show by default in query-derived history details?
- Should imports and exports have pinned high-importance treatment in the feed?
- What is the right visual treatment for historical-but-resolved warnings?

---

## Recommended next artifacts

1. low-fidelity wireframes for history/details states
2. provenance/history data schema
3. Milestone 0 UI-state checklist
4. main workspace low-fi incorporating history panel behavior

---

## Bottom line

A browser-native spatial workbench should not just let users do operations. It should let them explain them.

The provenance/history UX is how the product earns that right.

If users can answer “what produced this, under what assumptions, and with what caveats?” the product becomes trustworthy.
If history is vague, decorative, or easy to ignore, the rest of the system starts to rot from the inside.
