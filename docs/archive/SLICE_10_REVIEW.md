# Slice 10 Review — Bottom Dock Clipping Fix

**Reviewer:** Tester subagent  
**Date:** 2026-06-25  
**Status:** ✅ PASS with observations

---

## Build & Tests

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Clean (9.18s) |
| `npm test` | ✅ 262 passed (8 test files) |

---

## What Changed

The bottom dock switched from **transform-based** collapse to **max-height-based** collapse:

| Property | Before | After |
|----------|--------|-------|
| Collapsed | `transform: translateY(calc(100% - 6px))`, max-height: 45vh | `max-height: 8px`, no transform |
| Expanded | `transform: translateY(0)` | `max-height: 40vh` |
| Transition | `transform 200ms ease` | `max-height 200ms ease` |
| z-index | 35 | 36 |
| Handle padding | 6px | 2px |
| Border-radius (collapsed) | 14px 14px 0 0 | none |
| Border-radius (expanded) | inherited from base | 12px 12px 0 0 |

### Z-Index Hierarchy (new)

| Element | z-index | Context |
|---------|---------|---------|
| Tab bar | 50 | Mobile only |
| Command bar | 44 | Always |
| Command surface | 43 | When open |
| NL plan sheet | 43 | When active |
| Bottom sheet | 42 | General |
| Empty-state sheet | 42 | When no data |
| Bottom dock | 36 | Always |
| Sheet backdrop | 35 | When sheets open |

---

## CSS Analysis

### ✅ No orphaned transform references for `.bottom-dock`

Grep confirms zero `transform` properties on any `.bottom-dock*` selector. The old `translateY(calc(100% - 8px))` and `translateY(0)` were cleanly removed. The `transform` references that remain in the file belong to:
- `.bottom-sheet` (still uses transform-based show/hide — separate component, correct)
- `.sidebar-drawer` / `.right-panel` (sidebar animations, unrelated)
- `.command-surface` (centering via `translateX(-50%)`, unrelated)

### ⚠️ Collapsed handle: 1px clipping due to border-box

The global `box-sizing: border-box` (line 36) means `max-height: 8px` includes the `border-top: 1px`. Available content space is **7px**, not 8px.

The handle needs:
- `::before` pseudo-element: 4px
- Handle padding: 2px + 2px = 4px
- **Total content: 8px** — 1px more than the 7px available

The `overflow: hidden` clips 1px from the bottom padding. The grip bar itself (4px) is fully visible — only bottom padding is affected. **Visually negligible**, but technically a 1px mismatch.

**Fix options (if desired):**
- Set `max-height: 9px` to accommodate the border
- Or remove `border-top` from the collapsed state and apply it only when expanded
- Or reduce handle padding to `2px 2px 1px`

Not blocking — the 1px clip is invisible at typical viewport sizes.

### ✅ Transitions are consistent

Both `max-height 200ms ease` (dock) and `transform 200ms ease` (bottom sheet) use the same 200ms duration. The visual rhythm is consistent when both animate near each other.

### ✅ Mobile spacing is coherent (768px breakpoint)

| Element | bottom | Height/extent | z-index |
|---------|--------|---------------|---------|
| Tab bar | 0 | 56px | 50 |
| Dock | 56px | 8px collapsed | 36 |
| Command bar | 64px | 44px | 44 |
| Sheets / surfaces | 108px | up to 45vh | 42–43 |

The tab bar clips any dock overflow (z-index 50 > 36), but in practice the dock handle (8px) sits entirely above the tab bar at 56–64px. No clipping needed — the z-index is a safety net.

### ✅ Small mobile (480px) is consistent

Command bar `bottom: 64px`, command surface `bottom: 108px` — same as 768px breakpoint. Consistent.

### ✅ No specificity conflicts detected

Mobile overrides use the same single-class specificity as desktop rules, relying on source order (media query comes later). This is the standard pattern and works correctly.

---

## Edge Cases

### ✅ Bottom sheet (NL plan) overlays correctly when expanded

NL plan sheet: z-index 43, bottom 100px (desktop) / 108px (mobile), max-height 45vh.  
Bottom dock: z-index 36, max-height 40vh when expanded.  
The sheet cleanly overlays the dock. No z-index conflict.

### ✅ Empty state bottom sheet works with new z-index

Empty-state sheet: z-index 42, same as general `.bottom-sheet`. Renders above the dock (36) and below the command bar (44). Correct stacking.

### ✅ Command bar show/hide is unaffected

The command bar has no visibility toggling in CSS — it's always rendered. The command surface (dropdown examples) is conditionally rendered via JSX (`commandFocused || activeSidebar === 'chain'`). Neither depends on the dock's transform state. Clean separation.

### ✅ No `.bottom-dock` uses `bottom-sheet--collapsed`

App.tsx uses `bottom-sheet--collapsed` only on bottom sheets (lines 5348, 5374 use `--expanded`). The dock uses its own `expanded` class toggle. No cross-contamination.

---

## Observations (non-blocking)

### 1. Z-index stacking tests use stale inline values

The z-index stacking tests in `bottom-sheet.test.tsx` (lines 477–525) use **inline styles** with the old z-index values:

```
Old: dock=35, command-bar=40, plan-sheet=38, backdrop=34
New: dock=36, command-bar=44, plan-sheet=43, backdrop=35
```

Tests still pass because they verify *relative ordering* using their own inline values, not the CSS. But they no longer validate the actual CSS z-index hierarchy. If someone changes the CSS z-index values and breaks the ordering, these tests wouldn't catch it.

**Recommendation:** Consider adding tests that read computed z-index from the stylesheet rather than hardcoded inline values. Not a blocker — the tests are still useful for locking in the ordering contract.

### 2. Command surface and NL plan sheet share z-index: 43

If both are ever visible simultaneously (theoretical edge case — requires `activeSidebar === 'chain'` with empty `commandInput`), DOM order determines stacking. In the JSX, command surface renders before NL plan sheet, so the plan sheet would appear on top. This is likely the desired behavior but is implicit rather than explicit.

**Recommendation:** If intentional, no action needed. If stacking order matters, give NL plan sheet z-index 44 or document the DOM-order dependency.

### 3. Desktop gap between dock and command bar

On desktop: dock handle occupies 0–8px, command bar sits at `bottom: 48px`. There's a 40px gap. This is fine visually (the dock is a thin accent strip), but worth noting that the dock handle and command bar don't feel connected. Intentional design choice, not a bug.

---

## Verdict

**✅ Slice 10 is clean.** The transform-to-max-height migration is correctly implemented, z-index hierarchy is coherent, mobile spacing aligns, no orphaned CSS remains, and the JSX structure works with the new CSS. Build passes, all 262 tests pass.

**One minor finding:** the collapsed handle clips 1px of bottom padding due to `border-box` + `border-top` eating into the 8px max-height. Visually imperceptible but worth a one-line fix (`max-height: 9px` or remove border-top from collapsed state).

**One test gap:** the z-index stacking tests use hardcoded old values (35/38/40) rather than reading from the stylesheet. They still validate ordering but won't catch regressions if CSS values drift. Non-blocking.
