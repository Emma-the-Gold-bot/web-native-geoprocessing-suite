# Reference Architecture & Data Flow — Web-native geoprocessing suite

## Purpose

Provide one compact architectural reference before implementation begins in earnest.

This document is not a full systems bible. It is a working map of:
- major runtime components
- how data moves through the system
- where state should live
- where responsibilities begin and end
- what Milestone 0 should prove

The goal is to reduce architectural drift before code starts multiplying.

---

## Architectural thesis

The browser-native spatial workbench should be built as a **local-first client runtime** with explicit boundaries between:
- **UI shell state**
- **artifact/project state**
- **query/compute runtime**
- **format ingestion/export paths**
- **map rendering adapters**
- **history/provenance state**

The browser is the primary workspace and compute surface for moderate workloads. Optional remote services may exist later, but the architecture must not depend on them for the core loop.

---

## System layers

## Layer 1 — UI shell
Owns:
- layout
- navigation within the workspace
- selected artifact
- open tabs/panels
- transient user interaction state

Examples:
- left rail expanded/collapsed
- selected dataset/layer
- SQL pane open
- right panel showing details vs history

### Rule
UI shell state should not be the source of truth for project data.

---

## Layer 2 — Project/artifact state
Owns:
- artifacts (source + derived)
- artifact metadata
- selection-independent project truth
- artifact-to-history links
- warning state attached to artifacts

This is the heart of the product ontology.

### Rule
Everything user-meaningful should become an artifact or event, not just a temporary UI side effect.

---

## Layer 3 — Compute/query runtime
Owns:
- DuckDB-WASM lifecycle
- table registration
- query execution
- result materialization support
- possibly some format decoding help in Milestone 0

### Rule
The query engine is a compute substrate, not the whole product state model.

---

## Layer 4 — Format ingest/export adapters
Owns:
- file parsing
- metadata extraction
- schema/geometry/CRS detection
- import warning generation
- conversion into artifact-ready structures
- export generation later

### Rule
Formats are ingress/egress surfaces, not the product’s identity.

---

## Layer 5 — Map/table adapters
Owns:
- rendering selected spatial artifacts on the map
- presenting selected artifact rows in table/grid
- adapting artifact/query results into UI-friendly forms

### Rule
Map and table should be projections of artifact state, not independent truth systems.

---

## Layer 6 — History/provenance runtime
Owns:
- event creation
- event storage in project state
- lineage summaries
- warning propagation rules

### Rule
History is not a debug log. It is a first-class trust layer.

---

## High-level component model

### Component A — Workspace Shell
Contains:
- top bar
- left rail
- map pane
- bottom dock
- right panel

Consumes:
- UI state
- selected artifact
- history summaries

### Component B — Artifact Store
Contains:
- artifact registry
- selected artifact id
- artifact metadata
- warnings attached to artifacts
- origin event references

### Component C — Event Store
Contains:
- chronological history events
- input/output relationships
- human-readable summaries
- event details payloads

### Component D — Import Service
Performs:
- file intake
- preflight inspection
- warning generation
- conversion into artifact records
- table registration request(s)

### Component E — Query Service
Performs:
- DuckDB registration
- SQL execution
- result preview creation
- result materialization request(s)

### Component F — Render Adapters
Performs:
- artifact → map layer translation
- artifact/result → table preview translation

### Component G — Warning Service
Performs:
- severity mapping
- warning normalization
- active vs historical warning propagation

These can begin as modules in one codebase, not independent services.

---

## Milestone 0 reference architecture

Milestone 0 only needs a thin slice of the eventual system.

## Included components
- Workspace Shell
- Artifact Store
- Event Store (minimal)
- Import Service (GeoJSON + GeoParquet only)
- Query Service (DuckDB-WASM)
- Render Adapters (map + table)

## Deferred or skeletal
- persistent project storage
- export pipeline
- CRS engine beyond basic metadata presence/unknown state
- geometry engine beyond what is needed for query/result loop
- worker partitioning sophistication if not required immediately

### Principle
Milestone 0 should prove the seam lines, not flesh out every organ.

---

## Core data flow

## Flow 1 — Import path

### Step 1: User selects file
UI shell triggers Import Service.

### Step 2: Preflight inspection
Import Service reads enough of file to produce:
- detected format
- feature/table estimate if possible
- geometry type(s)
- CRS state
- warning list

### Step 3: User confirms import
Import Service completes parsing/registration.

### Step 4: Artifact creation
Artifact Store receives a new **source artifact** with:
- identity
- metadata
- warning set
- map/table capabilities
- query registration info

### Step 5: Event creation
Event Store records an **import event** linked to the new source artifact.

### Step 6: UI update
Workspace Shell selects the new artifact.
Render Adapters update map/table views.
Right panel shows source summary.
History feed shows the import event.

---

## Flow 2 — Query path

### Step 1: User writes SQL
UI shell passes query text to Query Service.

### Step 2: Query execution
Query Service runs SQL against registered tables in DuckDB-WASM.

### Step 3: Result preview
Query Service returns a preview/result object distinct from saved artifacts.

### Step 4: UI update
Bottom dock shows result preview.
Map adapter may preview if result is spatial.
No new artifact exists yet.

### Step 5: User materializes result
UI asks Query Service / Artifact Store to create a saved output.

### Step 6: Derived artifact creation
Artifact Store creates a **derived artifact** with origin tied to the query event.

### Step 7: Event creation
Event Store records a **query/materialization event**.

### Step 8: UI update
Derived artifact appears in left rail and can be selected like any other artifact.

---

## Flow 3 — Provenance lookup path

### Step 1: User selects artifact
Artifact Store resolves selected artifact.

### Step 2: Right panel requests lineage summary
System gathers:
- source vs derived status
- origin event
- upstream inputs
- active warnings

### Step 3: UI presents lineage summary
If source:
- import summary
If derived:
- produced by / from / warning carry-forward

### Step 4: User opens event details
Event Store returns full event payload for detail inspector.

---

## Data ownership model

This is where architecture either stays sane or starts decomposing.

## UI shell owns
- panel/tab open state
- current editor contents (until saved/executed)
- transient preview mode state
- loading indicators

## Artifact Store owns
- artifacts
- artifact metadata
- selected artifact id maybe shared with shell state
- warning attachments to artifacts
- source/derived truth

## Event Store owns
- history events
- lineage references
- chronological ordering
- event-level warnings/details

## Query Service owns
- DuckDB connection/instance
- table registrations
- query result preview objects before materialization

## Render Adapters own
- ephemeral map-layer instances
- table/grid row model derived from selected artifact/result

### Critical rule
No component should invent its own unofficial version of what an artifact is.

---

## Suggested artifact shape

A practical Milestone 0 artifact can look like:

```ts
interface Artifact {
  id: string;
  name: string;
  kind: 'source' | 'derived';
  format: string;
  spatial: boolean;
  geometryType?: string;
  rowCount?: number;
  crs?: string | 'unknown';
  warnings: WarningRef[];
  originEventId: string;
  inputArtifactIds?: string[];
  tableName?: string;
  renderRef?: string;
}
```

### Notes
- `renderRef` can point to a map-friendly representation cached elsewhere
- `inputArtifactIds` matters mainly for derived artifacts
- this should stay intentionally small in Milestone 0

---

## Suggested event shape

```ts
interface HistoryEvent {
  id: string;
  type: 'import' | 'query';
  timestamp: string;
  summary: string;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  warnings: WarningRef[];
  details: Record<string, unknown>;
}
```

### Notes
- query preview should not automatically create an event unless we intentionally log previews
- query materialization should create the meaningful event in Milestone 0

---

## Warning flow architecture

Warnings enter the system primarily through import and later through transforms/exports.

## Warning lifecycle
1. Import Service detects issue
2. Warning normalized into standard structure
3. Warning attached to import event
4. Relevant warning attached to source artifact as active
5. If derived artifact depends on unresolved risk, warning may propagate as inherited/active depending on logic

### Key principle
Warnings should be normalized once, then reused everywhere.
Do not let map, table, import sheet, and history invent separate warning semantics.

---

## Rendering architecture

## Map path
Selected artifact → Render Adapter → map-friendly source/layer config → MapLibre

### Requirement
The map should not need to understand DuckDB internals directly.

## Table path
Selected artifact or preview result → Table Adapter → grid rows/columns

### Requirement
The table should remain tied to artifact selection or result preview state explicitly.

### Architectural smell to avoid
If map and table each need a separate bespoke copy of the dataset with unrelated state semantics, expect drift.

---

## Worker model guidance

For Milestone 0, worker partitioning can stay pragmatic.

## Minimum acceptable approach
- main thread for shell/UI orchestration
- off-main-thread query runtime if feasible and not too costly to wire
- format parsing off-main-thread when heavy enough to matter

## Acceptable temporary compromise
If some import path initially happens on main thread for small sample data, document it as technical debt rather than pretending it is fine long-term.

### Rule
Worker boundaries should be added where they prevent obvious shell freeze, not as architecture cosplay.

---

## Persistence stance for now

Milestone 0 does **not** need full project persistence.

### However
The architecture should avoid painting us into a corner.
That means:
- artifacts and events should already look serializable
- render-layer objects should stay outside serializable state
- query engine runtime objects should stay outside serializable state

### Principle
Serializable project truth, non-serializable runtime adapters.

---

## Architecture risks / fault lines

## Fault line 1 — Artifact vs table identity drift
If DuckDB tables and artifact identities diverge without stable linkage, the shell becomes confusing.

## Fault line 2 — GeoParquet preview/render mismatch
If the easiest way to query GeoParquet differs radically from the easiest way to render it, we may need a stronger intermediate representation.

## Fault line 3 — Preview vs artifact confusion
If query previews are not explicitly separate from saved artifacts, provenance will rot immediately.

## Fault line 4 — Warning semantics fragmentation
If import warnings live only in the import sheet, later UI will become dishonest.

## Fault line 5 — Overbinding to one library’s quirks
If internal product architecture becomes a mirror of DuckDB or MapLibre implementation quirks, adaptation later will hurt.

---

## Milestone 0 architecture review questions

When reviewing the spike, ask:
- Did artifacts remain the product truth, or did runtime tables become the hidden truth?
- Was preview vs saved artifact kept clean?
- Did warnings survive transitions?
- Did map/table/query state synchronize through explicit ownership or accidental coupling?
- Did GeoParquet take a reasonable path through the system, or expose an architectural mismatch?

---

## Recommended next step after this doc

After this reference architecture, the next move should be implementation-oriented:
- begin the Milestone 0 spike
- use the UI-state checklist during build review
- write findings against the architecture fault lines above

---

## Bottom line

The architecture should stay simple enough to move, but structured enough not to lie.

For this product, the core rule is:

### **Artifacts and events are the truth. Everything else is an adapter.**

If we hold that line, the workbench can grow without losing its mind.
If we lose that line, the browser app will become a pile of clever runtimes with no reliable product ontology.
