# Milestone 0 UI-State Checklist — Web-native geoprocessing suite

## Purpose

Turn the Milestone 0 spike plan into a concrete checklist of user-visible states that the prototype must support. This is the anti-sloppiness document.

The goal is not visual polish. The goal is to ensure the spike has a coherent shell under real interactions instead of becoming a pile of technically successful but UX-incoherent fragments.

This checklist should be used while building the spike and again while reviewing whether Milestone 0 actually proved anything.

---

## How to use this checklist

For each state:
- verify it exists in the prototype
- verify the user remains oriented
- verify the next available action is clear
- verify source vs derived stays legible
- verify warnings and history do not vanish

A missing state here is not just missing UI. It often means missing product truth.

---

# 1. Workspace shell states

## 1.1 Empty project state
The app opens with no imported artifacts.

### Must show
- project shell, not a blank void
- import CTA in at least one obvious place
- left rail empty-state guidance
- map empty-state that still feels like the app, not an error
- bottom dock available but not noisy
- right panel empty-state or “select an artifact” guidance

### Must answer
- Where do I start?
- Am I in a project already?

### Pass condition
A first-time user can tell this is a spatial workspace and knows how to bring data in.

---

## 1.2 Workspace with one source artifact
After a successful import, the shell must visibly reorient around the new artifact.

### Must show
- artifact listed in left rail under source data
- map rendering or explicit non-spatial explanation
- table preview accessible in bottom dock
- right panel summary for selected artifact
- source badge visible
- warning badge visible if relevant

### Must answer
- What just got added?
- Is it source or derived?
- Is it spatial?

### Pass condition
The user does not need to hunt for the imported dataset.

---

## 1.3 Workspace with source + derived artifacts
The shell must stay readable once more than one artifact exists.

### Must show
- left rail grouping or clear visual distinction between source and derived
- selected artifact highlighted
- map reflects current visibility/selection cleanly
- right panel lineage summary updates with artifact selection

### Must answer
- Which artifact am I looking at?
- Which ones are original vs produced here?

### Pass condition
The shell does not collapse into an undifferentiated layer list.

---

# 2. Import states

## 2.1 Import entry state
The user has initiated import but has not selected a file yet.

### Must show
- file picker / drag-and-drop affordance
- support expectations at a glance if possible
- cancel/close path

### Pass condition
Import initiation feels like entering a review flow, not opening a raw OS dialog and praying.

---

## 2.2 Preflight scanning state
The file is selected and the app is inspecting it.

### Must show
- scanning/loading indicator
- concise message about what is being checked
- no frozen or ambiguous UI

### Must answer
- Is the app working?
- Did it hang?

### Pass condition
The user understands the system is inspecting the file and has not crashed.

---

## 2.3 Import review ready state
The file has been scanned and is ready for confirmation.

### Must show
- file summary
- contents summary
- CRS state
- warning summary if present
- primary action: import
- secondary action: cancel

### Must answer
- What is this file?
- Is anything suspicious?
- Can I proceed safely?

### Pass condition
The user can make a deliberate import decision.

---

## 2.4 Import review with warnings
The file is importable, but not clean.

### Must show
- warning severity visible
- consequence in plain language
- next-step guidance when possible
- import still possible unless truly blocking

### Must answer
- What is wrong?
- Is it fatal?
- What should I do now?

### Pass condition
Warnings feel honest and usable, not theatrical.

---

## 2.5 Blocking import state
The file cannot be safely imported.

### Must show
- explicit blocking reason
- why import is blocked
- recovery option if any
- cancel/back path

### Must answer
- Why won’t this import?
- Is this my mistake, the file’s problem, or lack of support?

### Pass condition
The user is blocked clearly, not mysteriously.

---

## 2.6 Import in progress state
User has confirmed import and the app is loading/constructing artifact state.

### Must show
- progress state or at least active loading feedback
- shell remains visible if possible
- no duplicate import actions

### Must answer
- Is import still happening?
- Should I wait?

### Pass condition
No dead-air moment where the user wonders if the app broke.

---

## 2.7 Import complete state
Import succeeded.

### Must show
- source artifact in left rail
- map or non-spatial explanation
- table preview access
- right-panel summary
- history event created

### Should show
- success toast/banner with quick summary

### Pass condition
Import completion changes the shell in a way that is obvious and orienting.

---

## 2.8 Imported with warnings state
Import succeeded, but caveats remain.

### Must show
- source artifact plus warning badge
- warning persistence in right panel/details
- history event reflects warnings

### Pass condition
Warnings survive the transition into the main workspace.

---

# 3. Artifact selection states

## 3.1 Source artifact selected

### Must show
- source badge
- artifact summary
- import provenance block
- warning block if any
- row count/geometry type/CRS if known

### Must answer
- What is this source dataset?
- When/how was it imported?

### Pass condition
The selected source artifact is self-explanatory.

---

## 3.2 Derived artifact selected

### Must show
- derived badge
- lineage summary card
- originating event/query link
- input artifact references
- warning inheritance if relevant

### Must answer
- What produced this?
- Is this trustworthy enough to inspect/export?

### Pass condition
The user can understand derived status without opening a deep detail maze.

---

# 4. Table states

## 4.1 Table preview for source artifact

### Must show
- rows from selected artifact
- columns/schema visible enough to understand structure
- correspondence with selected artifact

### Must answer
- Am I viewing the table for the thing I selected?

### Pass condition
Table is obviously tied to artifact selection.

---

## 4.2 Empty/non-spatial table state

### Must show
- useful explanation if no map geometry is available
- table still inspectable if data exists

### Pass condition
Non-spatial data does not feel like a broken map case.

---

## 4.3 Query result preview state

### Must show
- rows for current result preview
- whether preview is ephemeral or saveable
- relation to the current query execution

### Pass condition
User can distinguish preview from saved derived artifact.

---

# 5. SQL/query states

## 5.1 SQL idle state

### Must show
- SQL editor
- run action
- visible available datasets/tables nearby or inferable

### Must answer
- What can I query?
- Where do I write/run SQL?

### Pass condition
The editor is not orphaned from project context.

---

## 5.2 SQL running state

### Must show
- clear running feedback
- disabled/restricted duplicate run behavior
- optional cancel if feasible

### Must answer
- Is the query still executing?

### Pass condition
The user does not assume the app froze.

---

## 5.3 SQL error state

### Must show
- query failed
- useful error category or message
- keep SQL text intact
- allow correction and rerun

### Must answer
- What broke?
- Can I fix it without losing my work?

### Pass condition
Failure is recoverable and legible.

---

## 5.4 SQL success, unsaved preview state

### Must show
- result preview visible
- whether result is spatial or not
- action to materialize/save as derived artifact

### Must answer
- Did the query work?
- Is this result temporary or now part of the project?

### Pass condition
Preview does not masquerade as a saved project object.

---

## 5.5 Result materialization state
User saves a query result into the project.

### Must show
- create/save derived artifact action
- output name or naming path
- transition from preview to derived object

### Pass condition
The “becoming real” moment is explicit.

---

## 5.6 Query result saved state

### Must show
- derived artifact in left rail
- history event for query/materialization
- map rendering if spatial
- right panel lineage summary for selected derived artifact

### Must answer
- Is this now a project artifact?
- What produced it?

### Pass condition
Saved query results feel first-class.

---

# 6. Map states

## 6.1 Map empty state

### Must show
- map shell or canvas area
- no confusing “error-like” blankness

### Pass condition
An empty map still feels intentional.

---

## 6.2 Source artifact rendered on map

### Must show
- visible layer if spatial
- basic visibility tied to selected artifact state
- fit-to-extent behavior or equivalent orientation

### Pass condition
The user can clearly see that imported spatial data is on the map.

---

## 6.3 Derived artifact rendered on map

### Must show
- derived output spatially rendered
- distinction between source and derived still recoverable via shell selection

### Pass condition
Derived output is not just table-only unless truly non-spatial.

---

## 6.4 Non-renderable spatial failure state
If query/import succeeded but render fails.

### Must show
- render problem explanation
- preserve artifact in rail/table/history
- do not silently drop the artifact

### Pass condition
Rendering failure does not erase the project truth.

---

# 7. Right panel states

## 7.1 Nothing selected state

### Must show
- instruction or empty-state guidance

### Pass condition
Right panel does not look broken when idle.

---

## 7.2 Source details state

### Must show
- artifact summary
- import metadata
- CRS status
- warnings

### Pass condition
The right panel acts as a useful artifact inspector.

---

## 7.3 Derived lineage state

### Must show
- derived summary
- produced by …
- from …
- warning carry-forward if any

### Pass condition
Lineage summary answers “what produced this?” fast.

---

## 7.4 History detail state

### Must show
- clicked event details
- readable summary
- inputs/outputs
- warnings

### Pass condition
History is inspectable, not just a feed of dead text.

---

# 8. History states

## 8.1 No history yet state

### Must show
- empty-state copy
- hint that import/query actions create history

### Pass condition
History panel feels intentionally empty, not unimplemented.

---

## 8.2 Minimal history state
After first import.

### Must show
- import event card
- timestamp or relative time
- artifact summary link/selection path

### Pass condition
Even one event makes the system feel provenance-aware.

---

## 8.3 Mixed history state
After import + query + result materialization.

### Must show
- import event(s)
- query/materialization event
- readable summaries
- warning indicators if any

### Must answer
- What happened in this project so far?

### Pass condition
The event chain is intelligible at a glance.

---

# 9. Warning states

## 9.1 No warnings state

### Must show
- clean artifact state without fake warning placeholders

### Pass condition
No-warning artifacts feel confidently boring.

---

## 9.2 Active import warning state

### Must show
- warning badge on artifact
- warning in right panel
- warning reflected in history event

### Pass condition
The system does not lose warning truth after import.

---

## 9.3 Warning inherited into derived artifact
If relevant in spike data.

### Must show
- derived artifact can still indicate inherited uncertainty/caveat

### Pass condition
The system does not launder uncertainty through derivation.

---

# 10. Orientation and recovery states

## 10.1 After error, user remains oriented
Whether import or query fails.

### Must show
- shell remains intact
- existing artifacts remain visible
- error message local to the failed action

### Pass condition
A failure does not make the app feel reset or incoherent.

---

## 10.2 Returning from import to workspace

### Must show
- smooth transition back into shell
- new artifact visibly selected or otherwise foregrounded

### Pass condition
The user sees the consequence of the import immediately.

---

## 10.3 Returning from result preview to saved derived artifact

### Must show
- saved artifact becomes selectable and visible in left rail/history
- user understands preview → artifact transition happened

### Pass condition
The project ontology stays clean.

---

# 11. Milestone 0 minimum pass/fail checklist

Milestone 0 passes only if all are true:

- [ ] Empty project state is coherent
- [ ] Import entry state is clear
- [ ] Preflight scanning is visible
- [ ] Import review summary is legible
- [ ] Import warnings are understandable
- [ ] Source artifact appears clearly after import
- [ ] Map/table shell stays coherent with one source artifact
- [ ] SQL workspace is clearly tied to imported data
- [ ] Query running state is visible
- [ ] Query errors are recoverable
- [ ] Query preview is distinguishable from saved result
- [ ] Materialized result becomes a derived artifact
- [ ] Source vs derived is visible in left rail and/or details
- [ ] Minimal history shows import and query-result creation
- [ ] Right panel can answer “what produced this?” for derived artifacts
- [ ] Failures do not destroy shell orientation

If multiple boxes fail, the spike has not proved the thesis yet, even if isolated technical parts work.

---

## Recommended follow-on use

Once this checklist exists, use it for:
- implementation reviews
- internal dogfooding
- deciding if Milestone 0 is complete
- identifying which UX gaps are really architecture gaps

---

## Bottom line

Milestone 0 should not be judged only by whether data loads and queries run.
It should be judged by whether the prototype maintains **coherence under state transitions**.

That’s the difference between a demo and the beginning of a real workbench.
