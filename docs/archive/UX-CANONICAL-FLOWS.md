# UX Canonical Flows — Web-native geoprocessing suite

## Purpose

Translate the UX framing into concrete, buildable flow outlines for the MVP. These are not pixel wireframes. They are **interaction blueprints** that define user intent, entry points, screen/state transitions, key UI elements, and success criteria.

These flows should be stable enough to guide architecture, low-fidelity wireframes, and Milestone 0 / Milestone 1 implementation.

---

## How to read this document

Each flow includes:
- **user goal**
- **entry points**
- **preconditions**
- **main path**
- **important states**
- **edge/failure states**
- **UI surfaces involved**
- **design notes**
- **build implications**

---

## Shared workspace shell

All canonical flows assume the same main shell:

- **Left rail** — project/data navigator
- **Center** — map
- **Bottom dock** — table / SQL / results tabs
- **Right panel** — details / history / warnings / styling
- **Top bar** — project name, import, export, run-status, save/sync state later

The product should avoid route-hopping whenever possible. Most work should happen in a single coherent workspace with contextual panels.

---

# Flow 1 — Open and understand a dataset

## User goal
“I have a file or dataset. I need to know what it is, whether it is healthy, and whether I can trust it.”

## Entry points
- Top bar: **Import data**
- Empty-state CTA in a new project
- Left rail: **Add dataset**
- Drag-and-drop into workspace

## Preconditions
- User is inside a project workspace, or the app can create a new project automatically before import

## Main path

### Step 1 — Start import
User activates import.

**UI response**
- Open **Import Review** overlay/sheet (not a dead-end wizard route unless necessary)
- Allow:
  - local file selection
  - drag-and-drop
  - optional “open sample data” in demos

### Step 2 — Preflight scan
System scans the file before full commit.

**Visible fields**
- file name
- detected format
- file size
- layer/table count if applicable
- geometry type(s)
- row/feature estimate if available
- CRS detected / unknown / ambiguous
- extent preview if available
- schema preview
- warnings count

**Primary actions**
- Import
- Cancel

**Secondary actions**
- rename on import
- choose layer/table if multi-layer input
- assign/fix CRS if missing
- open “details” for more metadata

### Step 3 — Review warnings
If warnings exist, they are shown before import finalization.

**Examples**
- missing CRS metadata
- mixed geometry types
- invalid geometries detected in sample or scan
- unsupported columns or partial support
- large file may degrade performance
- fidelity caveat for format conversion path

**UX rule**
Warnings do not need to block import by default, but they must be visible and sticky.

### Step 4 — Confirm import
User clicks **Import**.

**System behavior**
- dataset is added to project
- import progress is visible in top bar and/or left rail
- upon completion:
  - dataset appears in left rail under Sources
  - map fits to extent
  - table preview opens in bottom dock
  - right panel shows dataset details summary
  - history logs import event

### Step 5 — Understand dataset in workspace
The user can now inspect:
- map rendering
- schema table
- metadata details
- warnings and CRS status

## Important UI states
- empty workspace
- import review pending
- scanning / parsing
- warnings present
- import in progress
- import complete
- import partial / degraded

## Edge / failure states
- unsupported format
- corrupted file
- geometry parse failure
- no CRS metadata
- import succeeds but render fails
- import exceeds browser memory or practical threshold

### Failure UX requirements
- explain what failed
- name whether failure is fatal or partial
- preserve access to diagnostic details
- offer fallback actions when possible:
  - import as table only
  - retry with another layer
  - assign CRS
  - continue with warnings

## UI surfaces involved
- top bar
- import review overlay
- left rail
- map
- bottom table tab
- right details panel
- history panel/entry

## Design notes
- Import should feel like a **reviewable transaction**, not a mysterious file picker.
- The user’s first trust decision happens here.
- Do not dump users directly into the map with silent assumptions.

## Build implications
- requires preflight inspection pipeline
- requires import warning model
- requires dataset detail schema
- requires history event creation on import

---

# Flow 2 — Query and derive a new result

## User goal
“I want to ask a question of one or more datasets and create a new output.”

## Entry points
- bottom dock: SQL tab
- left rail: dataset context action → Query
- top bar: New query
- operation shortcut from a selection or layer

## Preconditions
- at least one dataset is imported
- query engine is initialized or can initialize on demand

## Main path

### Step 1 — Enter query workspace
User opens SQL tab.

**UI response**
- bottom dock foregrounds SQL editor
- available datasets/tables are visible nearby
- result target behavior is explicit:
  - preview only
  - save as derived layer/table

### Step 2 — Compose query
User writes SQL or starts from a template/snippet.

**Helpful UI elements**
- available tables/layers list
- schema browser
- saved query list
- common examples/snippets
- run button

### Step 3 — Execute query
User clicks **Run**.

**System behavior**
- show running state with cancel if feasible
- result appears in Results tab
- map preview updates if result is spatial
- row count / column summary shown

### Step 4 — Materialize output
If query is meaningful, user chooses to save result.

**Prompt or inline action**
- name output
- classify as:
  - derived layer
  - derived table
- optional notes/tag

### Step 5 — Result becomes first-class artifact
Saved result appears in:
- left rail under Derived
- map if spatial
- table/results tabs
- history as a query/derive step
- right panel with lineage summary

## Important UI states
- SQL idle
- query running
- query preview loaded
- empty result
- non-spatial result
- spatial result
- saved derived result

## Edge / failure states
- SQL syntax error
- unknown table/column
- unsupported spatial function
- query too large / memory pressure
- spatial result cannot render due to invalid geometry

### Failure UX requirements
- errors should point to the broken assumption
- do not collapse failure into generic engine noise
- distinguish:
  - syntax problem
  - unsupported capability
  - resource failure
  - render failure after successful query

## UI surfaces involved
- bottom SQL tab
- results tab
- left rail
- map
- right panel lineage/details
- history

## Design notes
- Query output must feel **real**, not like ephemeral notebook stdout.
- Saving a result should be friction-light.
- The query/result relationship should be obvious enough that users can explain it later.

## Build implications
- requires query execution states
- requires result preview model
- requires saved-query model
- requires result materialization + dataset registration
- requires lineage links from query to output

---

# Flow 3 — Run a common geometry operation without writing SQL

## User goal
“I need a standard geoprocessing operation, but I don’t want to hand-write SQL for it.”

## Entry points
- left rail item context menu → Transform
- top bar / command palette → Geometry operation
- right panel quick actions for selected dataset/layer

## Preconditions
- one or more spatial datasets are available

## Main path

### Step 1 — Choose operation
User opens operation panel.

**MVP operations**
- buffer
- clip
- intersect
- dissolve
- simplify
- centroid
- convex hull
- validity check / repair

### Step 2 — Fill operation form
System shows a compact form:
- input dataset(s)
- operation-specific parameters
- output name
- optional preview scope / selection scope
- “create derived output” default

### Step 3 — Review expected effect
Before run, user can see:
- input(s)
- operation name
- key parameters
- whether result will create a new derived artifact

### Step 4 — Execute
User clicks **Run**.

**System behavior**
- show running/progress state
- on success:
  - add derived output to left rail
  - render on map
  - create history entry
  - show operation summary in right panel

## Important UI states
- operation picker
- parameter form
- running
- success with output
- partial warning

## Edge / failure states
- invalid geometry blocks operation
- CRS mismatch between inputs
- unsupported parameter combination
- operation produces empty result

### Failure UX requirements
- name the failed precondition
- suggest likely fix:
  - repair geometry
  - reproject layer
  - choose polygon layer instead of point layer

## UI surfaces involved
- right panel or dedicated operation drawer
- left rail
- map
- bottom results/table
- history

## Design notes
- This is the bridge for users who are not SQL-first.
- Operation panel should not become an unbounded toolbox swamp in MVP.
- Favor a small set of high-trust operations.

## Build implications
- requires operation schema / form model
- requires standardized result registration
- requires history event structure shared with SQL-derived results

---

# Flow 4 — Diagnose CRS or geometry issues

## User goal
“Something is wrong, and I need to understand whether it is metadata, projection, or geometry.”

## Entry points
- warning badge on dataset/layer in left rail
- warning chip in import summary
- right panel dataset details
- map anomaly noticed by user and investigated via details

## Preconditions
- dataset exists with warning, mismatch, or suspected issue

## Main path

### Step 1 — Open diagnostics context
User clicks warning badge or dataset details.

**UI response**
Right panel opens a diagnostics-oriented detail view.

### Step 2 — Show health summary
System presents:
- dataset type and geometry type
- CRS status:
  - known
  - missing
  - ambiguous
  - mismatched with compared layer
- geometry validity status
- extent / bounds sanity hints
- import warnings / parse caveats
- suggested actions

### Step 3 — Choose remediation
Available actions depend on state:
- Assign CRS
- Reproject
- Validate geometry
- Repair geometry
- Duplicate as fixed copy

### Step 4 — Execute and log
Action creates:
- updated or derived output (derive-by-default preferred)
- new history step
- updated warning state

### Step 5 — Reinspect result
User sees whether issue resolved in map and metadata panel.

## Important UI states
- clean dataset
- warning present
- diagnostic detail open
- remediation pending
- remediation complete
- unresolved / partial fix

## Edge / failure states
- user confuses assign CRS vs reproject
- no valid target CRS chosen
- geometry repair is lossy or partial
- issue remains unresolved after action

### Failure UX requirements
- distinguish **assigning metadata** from **changing coordinates** in plain language
- show before/after metadata clearly
- preserve old state as provenance

## UI surfaces involved
- left rail warning badges
- right detail panel
- map
- history

## Design notes
- This flow is trust-critical.
- Users must not be gaslit by geospatial terminology.
- Good microcopy matters here more than stylish UI.

## Build implications
- requires warning taxonomy
- requires dataset health model
- requires explicit remediation actions and provenance capture

---

# Flow 5 — Compare source and derived outputs

## User goal
“I need to understand what changed between my input and my result.”

## Entry points
- select derived layer in left rail
- click lineage chip in right panel
- click history entry

## Preconditions
- at least one derived artifact exists

## Main path

### Step 1 — Select derived output
User selects a derived layer/table.

### Step 2 — Show provenance summary
Right panel shows:
- artifact name/type
- derived from which input(s)
- operation/query name
- parameters summary
- warnings/caveats
- creation timestamp

### Step 3 — Compare in workspace
User can:
- toggle source and output visibility
- inspect both in map
- compare row counts/schema in table
- jump to originating query or operation details

### Step 4 — Decide next action
User can:
- export result
- fork from result
- rerun with changes later
- inspect inputs further

## Important UI states
- derived output selected
- source/output comparison active
- history step highlighted

## Edge / failure states
- output has multiple parents
- output is non-spatial and not map-renderable
- source data removed or unavailable in later project state

### Failure UX requirements
- provenance should still be readable even if artifacts are unavailable
- multiple-input lineage must remain legible, not spaghetti

## UI surfaces involved
- left rail
- map layer controls
- bottom table/results tabs
- right panel provenance summary
- history pane

## Design notes
- This is the product’s trust differentiator.
- If users cannot explain an output, the product fails its promise.

## Build implications
- requires lineage summary component
- requires source ↔ derived navigation
- requires map/table compare affordances

---

# Flow 6 — Export a trustworthy artifact

## User goal
“I want to take a dataset or derived result out of the workspace and know exactly what I’m taking with me.”

## Entry points
- top bar Export
- left rail context action on source/derived artifact
- right panel export action for current artifact

## Preconditions
- at least one exportable artifact exists

## Main path

### Step 1 — Start export
User chooses export on a selected artifact.

### Step 2 — Review export sheet
UI shows:
- artifact name and type
- source vs derived status
- format choices
- CRS behavior
- fidelity or compatibility warnings
- file naming

### Step 3 — Confirm export
User chooses target format and confirms.

### Step 4 — Export and log
System:
- generates file
- prompts download/save behavior
- records export event in history
- associates export with source artifact and settings

## Important UI states
- export review open
- export running
- export complete
- export warning acknowledged

## Edge / failure states
- format cannot preserve some metadata
- non-geographic CRS caveat in target format
- large export causes performance problem
- export succeeds but with downgraded fidelity

### Failure UX requirements
- explain loss in plain language
- allow cancel/back before destructive downgrade in meaning

## UI surfaces involved
- export review overlay
- history
- right panel

## Design notes
- Export is not a trivial download action. It is a documented handoff.
- The product should teach users what they are losing when they flatten reality into a format.

## Build implications
- requires export metadata schema
- requires warning mapping by format and CRS situation
- requires history event logging

---

# Cross-flow design rules

## Rule 1 — Source vs derived must always be visible
Users should never have to guess whether an artifact is original or produced by the workspace.

## Rule 2 — Every meaningful action leaves a trace
Imports, transforms, reprojections, queries, and exports create inspectable history.

## Rule 3 — Status should be ambient, not hidden
Warnings, running state, and unsaved/derived state should be visible in the shell.

## Rule 4 — Most actions should return users to the main workspace
Import and export can use overlays/sheets, but the app should not fragment into many disconnected pages.

## Rule 5 — Failures should preserve context
When something breaks, the user should stay oriented in the project and understand what broke.

---

# Priority ranking for implementation

## Must-have flow quality in MVP
1. Open and understand a dataset
2. Query and derive a result
3. Diagnose CRS / geometry issues
4. Export a trustworthy artifact

## High-value but can be lighter in MVP
5. Compare source and derived outputs
6. No-SQL geometry operation flow

Rationale:
- SQL-driven derive flow can carry more early power than a broad no-SQL operation UI.
- Comparison/provenance can begin with a simpler side-panel version before richer diffing.

---

# Recommended next artifacts

1. **low-fidelity wireframes mapped to these flows**
2. **import-validation UX spec**
3. **provenance/history interaction spec**
4. **Milestone 0 UI-state checklist**

---

## Bottom line

These canonical flows define the real product skeleton.

If the system can make these six flows feel coherent, inspectable, and trustworthy, it has the beginnings of a real browser-native spatial workbench.

If these flows feel brittle, magical, or ambiguous, no amount of architectural elegance or visual polish will save it.
