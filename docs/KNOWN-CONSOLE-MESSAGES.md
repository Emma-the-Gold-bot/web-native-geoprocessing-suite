# Known Console Messages - Environmental vs App-Caused

**Last Updated:** 2026-03-20

This document catalogs console messages observed during runtime and classifies them as either:
- **Environmental**: Browser/headless/testing environment artifacts, not app bugs
- **App-caused**: Issues that can be addressed at the application level
- **Previously documented**: Already tracked in other docs

---

## Environmental Messages (Non-Blocking)

These messages appear due to the browser environment (especially headless testing) and do not indicate application bugs.

### 1. "Could not compile fragment shader"

- **Type:** Page error
- **Severity:** Error (but environmental)
- **Frequency:** Once per page load
- **Cause:** MapLibre GL attempts WebGL shader compilation in headless environments where GPU access is limited or unavailable. This is a known issue with MapLibre in CI/headless browsers.
- **Impact:** Map canvas may not render correctly in headless tests, but works in real browsers with GPU support.
- **Mitigation:** None needed - this is an environmental constraint. In real browsers with WebGL, this error does not occur.
- **Status:** Documented as known limitation

### 2. "WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost"

- **Type:** Warning
- **Severity:** Warning
- **Frequency:** Once per page load
- **Cause:** WebGL context loss in headless Chrome. The browser's GPU emulation is limited and can drop the context.
- **Impact:** Map rendering may be degraded in headless tests, but functions normally in real browsers.
- **Mitigation:** None needed - environmental limitation
- **Status:** Documented as known limitation

### 3. "GPU stall due to ReadPixels"

- **Type:** Warning (GL Driver Message)
- **Severity:** Warning
- **Frequency:** Multiple times during map interaction
- **Cause:** OpenGL driver performance message when the CPU waits for GPU to finish readback operations. This is common in headless Chrome's software GPU emulation.
- **Impact:** Performance warning only - no functional impact
- **Mitigation:** None needed - environmental limitation
- **Status:** Documented as known limitation

---

## App-Caused Messages

These messages may have application-level solutions.

### 4. "Geometry exceeds allowed extent, reduce your vector tile buffer size"

- **Type:** MapLibre internal / renderer warning
- **Severity:** Warning
- **Status:** Observed in headless-browser validation after reprojection fixes
- **Notes:** This message can still appear after projected-artifact framing is corrected. In the current verified flows it does **not** correlate with broken reprojection, failed artifact creation, or incorrect CRS metadata. The more serious app-level framing failure (`Invalid LngLat latitude value`) has been removed by the display-normalization layer that derives WGS84 bounds for projected artifacts.
- **Assessment:** Treat as non-blocking renderer/environmental noise unless it starts appearing alongside user-visible map corruption in real browsers.
- **If observed in real browser usage:** Re-open investigation around MapLibre rendering limits, source extent, or geometry complexity rather than assuming a PROJ defect.

---

## Previously Documented Issues

### 5. "SQLite error [ file is not a database ]"

- **Status:** ✅ RESOLVED
- **Symptom (historical):** PROJ-WASM loaded a small (~1.4KB) file instead of the ~10MB proj.db
- **Current status:** Review work confirmed there is no remaining live PROJ path defect in the verified runtime paths. PROJ-WASM correctly loads the ~10MB `proj.db` in both dev and preview modes, and the known copies in `public/`, `dist/assets/`, and `dist/node_modules/proj-wasm/dist/` all match the correct runtime size.
- **When it appeared (historical):** During PROJ-WASM initialization and coordinate transformations in preview mode
- **Impact (historical):** CRS reprojection could fail or produce incorrect results
- **Resolution:** `vite.config.ts` now copies PROJ-WASM files to `dist/node_modules/proj-wasm/dist/` during build, and preview serving is configured so the resolved runtime path is actually available.

See `docs/PROJ-WASM-DIAGNOSIS.md` for full diagnosis and resolution details.

---

## Summary

| Message | Type | Status | Action Needed |
|---------|------|--------|---------------|
| "Could not compile fragment shader" | Error (environmental) | Known | None - document only |
| "WebGL: CONTEXT_LOST_WEBGL" | Warning (environmental) | Known | None - document only |
| "GPU stall due to ReadPixels" | Warning (environmental) | Known | None - document only |
| "Geometry exceeds allowed extent" | MapLibre / renderer | Observed intermittently | Monitor; non-blocking unless it coincides with visible map corruption |
| "SQLite error [ file is not a database ]" | App | ✅ Resolved | Fixed in vite.config.ts - files copied to dist/node_modules/ |

---

## Validation Commands

To verify these messages in local testing:

```bash
# Start dev server
npm run dev

# Run e2e test to capture console
node scripts/capture-warnings.mjs
```

The test script captures all console messages and filters for warnings and errors.
