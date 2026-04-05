# UX Import & Validation Spec — Web-native geoprocessing suite

## Purpose

Define the import review, validation, warning, and failure-handling UX for the browser-native spatial workbench.

This is a trust-critical spec. Import is where users first decide whether the product is serious, transparent, and safe enough to rely on. The goal is not merely to ingest bytes. The goal is to help users understand:
- what was detected
- what assumptions were made
- what might be wrong
- what can be fixed now
- what risks remain after import

This spec applies primarily to MVP vector-first import paths.

---

## UX goals

The import experience should make the user feel:
- informed, not surprised
- warned, not panicked
- assisted, not patronized
- able to proceed deliberately when data is imperfect

### North-star outcomes
A user should be able to answer, before confirming import:
- What format is this?
- What is inside it?
- Is it spatial, tabular, or mixed?
- What CRS does it use, or is that unknown?
- Are there any important warnings?
- If something is wrong, can I still proceed safely?

### Anti-goals
The import flow must avoid feeling like:
- a black box that silently guesses
- a wizard that hides assumptions until too late
- a wall of jargon that only geodesists understand
- a panic machine that screams about every imperfection equally

---

## Scope

### In scope
- local file import review UX
- preflight scan states
- warning taxonomy
- issue severity model
- blocking vs non-blocking issues
- CRS ambiguity handling at import time
- partial/degraded import messaging
- microcopy patterns
- handoff from import review into workspace state

### Out of scope
- exact parsing implementation
- complete format support matrix
- full remediation UX after import (covered elsewhere, though linked here)
- remote catalog/STAC search flows

---

## Supported import classes for MVP

## First-class formats
- GeoJSON
- FlatGeobuf
- GeoParquet

## Compatibility / best-effort imports
- Shapefile
- GeoPackage
- KML
- GPX

### UX principle
The UI should clearly distinguish:
- **first-class** support: expected strong fidelity and good metadata handling
- **compatibility** support: practical support with potentially more caveats

Do not pretend all formats are equally well supported.

---

## Import interaction model

## Entry points
- top bar: **Import data**
- empty-state CTA
- left rail: **Add dataset**
- drag-and-drop into workspace

## Primary model
Import should be a **review sheet / overlay** layered over the existing workspace.

Why:
- preserves project context
- avoids route fragmentation
- reinforces that import adds to a project rather than replacing the user’s context

### Import flow stages
1. **Select file(s)**
2. **Preflight scan**
3. **Review summary + warnings**
4. **Optional corrections / decisions**
5. **Confirm import**
6. **Import progress**
7. **Post-import handoff into workspace**

---

## Import review sheet structure

## Section A — File summary
Show immediately after file selection / scan:
- file name
- file size
- detected format
- support level:
  - first-class
  - compatibility
  - partial
  - unsupported

### Why
Users need a clean first read before the warning stack appears.

---

## Section B — Contents summary
Depending on format and scan depth, show:
- dataset/layer/table count
- feature count / row count estimate or exact count
- geometry type(s)
- attribute columns count
- extent preview if available
- whether the file is spatial, non-spatial, or mixed

### Special cases
- multi-layer formats should show a layer picker or detected sublayers
- non-spatial tables should be importable when useful, but labeled clearly as non-map data

---

## Section C — CRS status
This deserves its own visual block.

Possible states:
- **CRS detected**
- **CRS missing**
- **CRS ambiguous**
- **CRS detected with caution**

### Required UI content
- detected CRS label (e.g. EPSG code + human-readable name when available)
- source of detection:
  - embedded metadata
  - sidecar/prj
  - inferred from format-specific metadata
  - user-assigned
- confidence / certainty label where needed
- primary action if unresolved:
  - Assign CRS
  - Review CRS details

### UX principle
CRS should never be buried in advanced details. It is central.

---

## Section D — Warning summary
This section should summarize import issues with severity and actionability.

### Structure
- count by severity
- grouped cards or rows
- each warning includes:
  - title
  - short explanation
  - consequence
  - action now / action later

### Example warning shape
**Missing CRS metadata**
- Consequence: features may appear in the wrong place until a CRS is assigned.
- Action now: assign CRS before import.
- Action later: import anyway and fix in dataset details.

---

## Section E — Import options
Only show options that matter for the detected format/state.

Possible options:
- rename dataset on import
- choose sublayer
- import as table only
- assign CRS
- skip invalid features (only if we can explain consequence clearly)
- continue with warnings

### UX principle
No giant expert-settings graveyard in MVP. Keep options sparse, contextual, and legible.

---

## Severity model

Warnings and failures should be classified into a small, consistent severity system.

## Severity 1 — Info
Meaning:
- notable but not risky

Examples:
- compatibility format imported successfully
- mixed geometry types handled as generic geometry
- large attribute table may affect preview performance

Default UX:
- visible but quiet
- import allowed
- logged in dataset details/history

## Severity 2 — Caution
Meaning:
- import likely usable, but user should understand caveat

Examples:
- missing CRS metadata
- ambiguous CRS
- unsupported styling metadata ignored
- large file may reduce responsiveness
- some optional columns/metadata not preserved internally

Default UX:
- visible in warning summary
- import allowed
- one-click path to review/fix if possible

## Severity 3 — Serious warning
Meaning:
- import can proceed, but results may be wrong, incomplete, or degraded unless user intervenes

Examples:
- invalid geometry detected
- CRS mismatch inside layered package
- partial parse succeeded, some features failed
- format conversion path may lose fidelity
- geometry type inconsistency affecting some operations

Default UX:
- visually prominent
- import allowed, but confirm button may require explicit acknowledgment
- recommended action strongly surfaced

## Severity 4 — Blocking error
Meaning:
- system cannot safely import in current state

Examples:
- unsupported format
- corrupted file with no usable parse
- required sublayer missing/inaccessible
- file too malformed for partial salvage
- critical parser failure

Default UX:
- import blocked
- clear explanation
- recovery options if any

---

## Warning taxonomy

This taxonomy should drive both UI and underlying issue objects.

## A. Format / support warnings
Examples:
- unsupported format
- compatibility import path
- partial support only
- embedded style/symbology ignored
- unsupported field types

## B. Data integrity warnings
Examples:
- invalid geometries detected
- malformed features skipped
- duplicate or conflicting field names
- empty geometry rows present
- mixed geometry collection complexity

## C. CRS / projection warnings
Examples:
- missing CRS metadata
- ambiguous CRS
- embedded CRS not recognized cleanly
- layered dataset contains multiple CRSs
- coordinate ranges look suspicious

## D. Performance / scale warnings
Examples:
- large file may be slow to import
- preview sampled due to data size
- row count estimate only
- rendering may require simplification/clustering later

## E. Fidelity / conversion warnings
Examples:
- importing via fallback conversion path
- some source metadata not preserved
- target internal representation may not keep all source semantics
- non-spatial attachments/ancillary metadata ignored

## F. User-action-required warnings
Examples:
- must choose layer from multi-layer source
- must assign CRS before accurate mapping
- import as table only unless geometry issue resolved

---

## Blocking vs non-blocking rules

## Block import when:
- file format is unsupported
- parsing fails with no usable recovery path
- required user choice has not been made (e.g. layer selection in a package where none can be assumed safely)
- file is clearly corrupt beyond safe interpretation

## Allow import with warnings when:
- CRS is missing or ambiguous but import can still be useful if clearly labeled
- some features are invalid but dataset remains inspectable
- some metadata/styling/fidelity will be lost
- file is large and performance may degrade
- internal support is partial but meaningful

### Important principle
Do not block merely because data is imperfect. Block when the system cannot form a minimally honest representation.

---

## CRS handling at import time

This is one of the most important UX details.

## Distinguish two user actions clearly
### 1. Assign CRS
Meaning:
- label coordinates with the correct CRS
- does **not** move coordinates

### 2. Reproject
Meaning:
- transform coordinates into a different CRS
- changes coordinates

At import time, the user should generally be offered **Assign CRS**, not **Reproject**, unless import explicitly includes conversion.

### Recommended UI wording
Instead of raw jargon only, use paired plain-language guidance:

**Assign CRS**
- Use when the file’s coordinates are correct but the CRS label is missing or wrong.
- This does not move the data.

**Reproject**
- Use after import if you want to convert the data into another CRS.
- This changes coordinates.
- In the current product surface, runtime support for reprojection is validated in the hardened local runtime and should be presented as environment-sensitive elsewhere.

### CRS status messaging patterns
**Detected**
- “Detected CRS: EPSG:4326 — WGS 84.”

**Missing**
- “No CRS metadata was found. The data may draw in the wrong place until you assign one.”
- If the user attempts reprojection in an unsupported runtime, say so explicitly rather than implying the data itself is invalid.

**Ambiguous**
- “We found projection clues, but they are not conclusive. Review before importing if location accuracy matters.”

**Suspicious**
- “The coordinates do not look consistent with the detected CRS. Import can continue, but review is recommended.”

---

## Preflight scan states

## State: waiting for file
- clean dropzone / chooser
- support list visible

## State: scanning
- spinner/progress indicator
- message like: “Inspecting file structure, geometry, and metadata…”
- if scan is long, show sub-status when possible:
  - reading metadata
  - checking geometry
  - detecting CRS

## State: review ready
- summary populated
- warnings grouped
- import button enabled or blocked depending on severity

## State: correction needed
- user must choose layer or assign/confirm CRS for certain cases

## State: importing
- progress visible
- import button disabled
- keep summary visible if possible

## State: imported with warnings
- success banner + persistent warning badges

## State: blocked / failed
- explanation + recovery options

---

## Partial and degraded imports

The product should be honest about degraded paths.

## Examples
- imported as table only because geometry could not be parsed
- imported subset because some features failed validation
- imported via compatibility path with reduced metadata fidelity

### UX requirement
When degradation happens, the interface must say:
1. what was preserved
2. what was lost
3. where the evidence is recorded

### Example microcopy
**Imported with warnings**
- 12,430 features loaded.
- 83 features could not be parsed and were skipped.
- CRS metadata was missing and remains unresolved.

Not:
- “Import succeeded.”

That’s how you breed bad decisions.

---

## Large-file and performance messaging

Users need honesty here too.

## Trigger cases
- large local files
- huge row counts
- expensive preview generation
- browser memory risk

### Messaging principles
- be clear without sounding catastrophic
- offer choices when available
- avoid fake precision if estimates are rough

### Example messages
**Caution**
- “This file is large. Import should work, but preview and map rendering may be slower than usual.”

**Serious warning**
- “This dataset may exceed practical browser limits for full interactive rendering. You can still import it, but some previews may be sampled or deferred.”

### Optional actions
- continue anyway
- import as table first
- import selected layer only
- disable auto-zoom/render until ready

---

## Microcopy guidelines

## Principle 1 — explain consequences, not just conditions
Bad:
- “CRS missing.”

Better:
- “No CRS metadata was found. The data may draw in the wrong place until a CRS is assigned.”

## Principle 2 — distinguish unknown from wrong
Bad:
- “Projection error.”

Better:
- “The CRS is unknown.”
or
- “The detected CRS may not match the coordinate values.”

## Principle 3 — avoid turning the user into a parser engineer
Do not surface raw engine noise unless tucked behind details.

## Principle 4 — give a next step whenever possible
Every warning should ideally imply:
- review now
- continue anyway
- fix later in details

## Principle 5 — reserve red for truly blocking or high-risk cases
If everything screams, nothing speaks.

---

## Handoff into workspace

After successful import, the user should land in a strongly oriented state.

## Desired post-import behavior
- new dataset visible in left rail under Sources
- map zooms to extent if spatial and safe to do so
- bottom panel opens table preview
- right panel opens dataset details summary
- warning badges persist
- history logs import with issue count and metadata snapshot

### Success banner / toast example
**Imported: parcels_2026**
- 152,442 features
- Polygon geometry
- CRS: EPSG:2227
- 2 warnings

The banner should link to **View details**.

---

## Data model implications for UX

To support this spec, imported datasets should retain:
- import source type
- support level
- detected format
- geometry type(s)
- CRS status and evidence source
- warning list with severity + taxonomy
- import mode:
  - full
  - partial
  - degraded
- skipped feature counts if any
- provenance event id

Without this, the UI will lie later.

---

## Recommended MVP decisions

## Decision: show warning summary before import finalization
Do not defer all diagnostics to after import.

## Decision: do not require perfection for import
Allow work to continue on imperfect data when the system can still be honest.

## Decision: keep CRS review close to import
The longer the system waits to surface CRS ambiguity, the more likely users are to misread the map.

## Decision: warning badges must persist after import
Import warnings are not transient toast trivia.

## Decision: degraded import must be explicit
If geometry was dropped, features skipped, or fidelity lost, the dataset identity should reflect that history.

---

## Open questions
- Should MVP allow skipping invalid features during import, or only warn and import full data when possible?
- How much of geometry validity checking should happen preflight versus post-import background validation?
- For large files, should the product support deferred full validation after a quick import path?
- Should support-level labels be visible in the main dataset list, or only in details?

---

## Recommended next artifacts

1. provenance/history interaction spec
2. low-fidelity wireframes for import review states
3. format support matrix tied to warning taxonomy
4. Milestone 0 UI-state checklist for import + query + result materialization

---

## Bottom line

Import is the first courtroom in this product.

If the system is honest, legible, and calm under imperfect data, users will trust it enough to keep working.
If it hand-waves ambiguity, hides degradation, or screams incoherently, trust dies before the first query runs.
