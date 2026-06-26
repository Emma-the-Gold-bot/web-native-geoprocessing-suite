# Excellence Checkpoint — Web-native geoprocessing suite

## Decision

The most excellent next move is **not** to implement intersect immediately.

The project has just finished a difficult truth-tightening pass around:
- support-envelope honesty
- preview-safe validation
- clip v1 refusal seam
- clip v1 topology
- empty-result handling
- CRS confidence / provenance cleanup
- product wording / warning polish

That work should be treated as a deliberate checkpoint, not a launchpad for immediate feature sprawl.

## Why this is the excellent move

Because excellence here means:
- refusing to dilute the support envelope right after finally making it honest
- refusing to stack a second topology operation on top of a still-fresh clip seam
- preserving the clarity that was just earned
- letting intersect remain a contract until there is a stronger reason to build it

The suite is in a materially better state now because we kept choosing:
1. contract
2. refusal seam
3. implementation
4. browser verification
5. doc alignment

That method is working. Do not betray it for momentum theater.

## Current recommendation

### Hold intersect at contract level

Keep intersect as:
- `not_supported`
- documented
- well-scoped
- available for future decision

Do **not** implement the intersect refusal seam or topology path yet unless one of these becomes true:
- a concrete user workflow clearly requires it now
- clip v1 has had time to prove stable in use
- the current project debt is low enough that a second topology seam will not blur the product truth surface

## What should happen instead

### 1. Preserve the clean state

Treat the current state as a quality checkpoint:
- docs aligned
- validation legible
- clip narrow and real
- provenance language materially improved

### 2. Prefer maintenance over novelty for the next step

If work continues immediately, the next acceptable work should be one of:
- tiny repo cleanup with no semantic churn
- test ergonomics / script readability improvements
- deployment/readiness/documentation refinement
- real usage-driven bug fixing

### 3. Make intersect earn implementation later

If intersect comes back onto the table, the first question should not be:
- "can we implement it?"

It should be:
- "what concrete workflow now justifies the complexity and semantic risk?"

## Bottom line

The most excellent move is restraint.

The project has reached a point where **not adding the next feature too quickly** is part of the quality bar.

Hold the line.
Intersect stays on paper until it earns reality.
