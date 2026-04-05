#!/usr/bin/env node
/**
 * Smoke test for map rendering states.
 * 
 * Tests that the app correctly distinguishes between:
 * (a) Map rendered successfully - spatial artifact on canvas with no overlay
 * (b) Map intentionally unavailable - tabular artifact shows explicit message
 * (c) Map failed unexpectedly - no canvas or contradictory overlay state
 * 
 * This addresses the QA issue where map assertions are weaker than table assertions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4178';
const outDir = process.env.PW_OUT_DIR || path.resolve('tmp/playwright-map-assertions');
const headless = process.env.HEADLESS !== 'false';

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless });
const page = await browser.newPage();
const consoleMessages = [];
const consoleErrors = [];
page.on('console', msg => {
  consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => {
  consoleMessages.push(`[pageerror] ${err.message}`);
  consoleErrors.push(err.message);
});

const mark = (name) => console.log(`stage: ${name}`);
const screenshot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

/**
 * Check map state using explicit UI hooks.
 * The overlay is a sibling of .map-container with position: absolute.
 * It contains a .card with "Map pane" (empty) or "Map unavailable" (warning).
 */
async function checkMapState(page) {
  const diagnostics = {
    hasCanvas: false,
    overlayTitle: null,
    overlayMessage: null,
    overlayTone: null,
    artifactCount: 0,
    selectedArtifactName: null,
  };

  diagnostics.hasCanvas = (await page.locator('.map-container canvas').count()) > 0;
  diagnostics.artifactCount = await page.locator('.artifact-list > button.card').count().catch(() => 0);

  const selectedArtifactLabel = page.locator('.artifact-list > button.card.selected strong').first();
  diagnostics.selectedArtifactName = await selectedArtifactLabel.textContent().catch(() => null);

  const overlays = page.locator('.main-pane > div[style*="position: absolute"] .card');
  const overlayCount = await overlays.count();
  for (let i = 0; i < overlayCount; i += 1) {
    const card = overlays.nth(i);
    const text = await card.textContent().catch(() => '');
    if (!text || (!text.includes('Map pane') && !text.includes('Map unavailable'))) continue;

    const titleEl = card.locator('.muted.small').first();
    diagnostics.overlayTitle = (await titleEl.textContent().catch(() => ''))?.trim() || null;

    const allDivs = await card.locator('div').all();
    for (const div of allDivs) {
      const divText = (await div.textContent().catch(() => ''))?.trim();
      if (!divText) continue;
      if (divText === diagnostics.overlayTitle) continue;
      if (divText.includes('Supports GeoJSON')) continue;
      diagnostics.overlayMessage = divText;
      break;
    }

    const cardStyle = await card.getAttribute('style').catch(() => '') || '';
    diagnostics.overlayTone = cardStyle.includes('#3f2a11') ? 'warning' : 'neutral';
    break;
  }

  let state;
  if (diagnostics.overlayTitle?.includes('Map unavailable')) state = 'map-unavailable';
  else if (diagnostics.overlayTitle?.includes('Map pane')) state = 'empty-state';
  else if (diagnostics.hasCanvas) state = 'rendering';
  else state = 'no-canvas';

  return { state, diagnostics };
}

try {
  mark('goto');
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Web-native Geoprocessing Suite');
  await page.waitForTimeout(1000);
  await screenshot('00-initial');
  
  // ============================================================
  // TEST 1: Empty state - no artifacts loaded
  // Expected: "Import or load a spatial dataset" message
  // ============================================================
  mark('test-1-empty-state');
  
  const emptyState = await checkMapState(page);
  console.log('Empty state check:', JSON.stringify(emptyState, null, 2));
  
  const test1Pass = emptyState.state === 'empty-state' && 
    emptyState.diagnostics.overlayMessage?.includes('Import or load');
  
  console.log(`Test 1 (empty state): ${test1Pass ? 'PASS' : 'FAIL'} - ${emptyState.state}`);
  console.log(`  Title: ${emptyState.diagnostics.overlayTitle}, Message: ${emptyState.diagnostics.overlayMessage?.substring(0, 50)}`);
  await screenshot('01-empty-state');
  
  // ============================================================
  // TEST 2: Sample GeoJSON render - success case
  // Expected: Map canvas present, NO overlay message
  // ============================================================
  mark('test-2-geojson-render');
  
  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /sample-parcels.*source/i }).waitFor({ state: 'visible', timeout: 15000 });
  
  // Wait for map to render
  await page.waitForTimeout(2000);
  await screenshot('02-geojson-loaded');
  
  // Click the artifact to select it
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.waitForTimeout(1500);
  
  const geoJsonState = await checkMapState(page);
  console.log('GeoJSON state check:', JSON.stringify(geoJsonState, null, 2));
  
  // For success: canvas should exist AND no overlay message
  const test2Pass = geoJsonState.diagnostics.hasCanvas && 
    !geoJsonState.diagnostics.overlayTitle;
  
  console.log(`Test 2 (GeoJSON render): ${test2Pass ? 'PASS' : 'FAIL'} - ${geoJsonState.state}`);
  console.log(`  Canvas: ${geoJsonState.diagnostics.hasCanvas}, Overlay: ${geoJsonState.diagnostics.overlayTitle || 'none'}`);
  await screenshot('02-geojson-rendered');
  
  // ============================================================
  // TEST 3: Tabular artifact - intentional unavailability
  // Create a query result with no geometry
  // ============================================================
  mark('test-3-tabular-unavailable');
  let test3Pass = true; // Default to pass if we can't test
  
  try {
    // Go to SQL and create a tabular-only result from the current source artifact.
    await page.getByRole('button', { name: /^SQL$/i }).click();
    await page.waitForTimeout(500);
    await page.locator('textarea').fill('SELECT id, name, category FROM sample_parcels LIMIT 3');
    await page.getByRole('button', { name: /Run query/i }).click();

    await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText(/This is still a preview/i).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: /Materialize result/i }).click();
    await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('textbox').fill('tabular-query-result');
    await page.getByRole('button', { name: /Confirm & Create/i }).click();
    await page.getByRole('button', { name: /tabular-query-result.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });

    await page.getByRole('button', { name: /tabular-query-result.*derived/i }).click();
    await page.waitForTimeout(1000);

    const tabularState = await checkMapState(page);
    console.log('Tabular state check:', JSON.stringify(tabularState, null, 2));

    test3Pass = tabularState.state === 'map-unavailable' &&
      (tabularState.diagnostics.overlayMessage?.includes('tabular artifact') ||
       tabularState.diagnostics.overlayMessage?.includes('no geometry'));

    console.log(`Test 3 (tabular unavailable): ${test3Pass ? 'PASS' : 'FAIL'} - ${tabularState.state}`);
    console.log(`  Message: ${tabularState.diagnostics.overlayMessage}`);
  } catch (queryError) {
    console.log('Test 3 failed unexpectedly:', queryError instanceof Error ? queryError.message : String(queryError));
    test3Pass = false;
  }
  await screenshot('03-tabular-unavailable');
  
  // ============================================================
  // TEST 4: Switch back to spatial artifact
  // Should return to rendering state
  // ============================================================
  mark('test-4-spatial-reselected');
  
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.waitForTimeout(1500);
  
  const reselectedState = await checkMapState(page);
  console.log('Reselected state check:', JSON.stringify(reselectedState, null, 2));
  
  const test4Pass = reselectedState.diagnostics.hasCanvas && 
    !reselectedState.diagnostics.overlayTitle;
  
  console.log(`Test 4 (spatial reselected): ${test4Pass ? 'PASS' : 'FAIL'} - ${reselectedState.state}`);
  await screenshot('04-spatial-reselected');
  
  // ============================================================
  // Summary
  // ============================================================
  const allPassed = test1Pass && test2Pass && test3Pass && test4Pass;
  
  const report = {
    verdict: allPassed ? 'PASS' : 'FAIL',
    appUrl,
    tests: {
      '1-empty-state': { pass: test1Pass, state: emptyState.state },
      '2-geojson-render': { pass: test2Pass, state: geoJsonState.state, hasCanvas: geoJsonState.diagnostics.hasCanvas },
      '3-tabular-unavailable': { pass: test3Pass, state: 'tested-if-applicable' },
      '4-spatial-reselected': { pass: test4Pass, state: reselectedState.state },
    },
    consoleErrors: consoleErrors.slice(0, 5),
    screenshots: [
      path.join(outDir, '00-initial.png'),
      path.join(outDir, '01-empty-state.png'),
      path.join(outDir, '02-geojson-loaded.png'),
      path.join(outDir, '02-geojson-rendered.png'),
      path.join(outDir, '03-tabular-unavailable.png'),
      path.join(outDir, '04-spatial-reselected.png'),
    ],
    notes: [
      'Map state detection uses explicit UI hooks (overlay sibling of .map-container)',
      'Distinguishes rendering (canvas + no overlay) from unavailable states',
      'Empty state: "Map pane" title with "Import or load" message',
      'Unavailable state: "Map unavailable" title with explanatory message',
      'Console errors captured for failure diagnosis',
    ],
  };
  
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  
  if (!allPassed) {
    console.error('\n=== TEST FAILURES ===');
    if (!test1Pass) console.error('Test 1 (empty state): Expected "Import or load" message');
    if (!test2Pass) console.error('Test 2 (GeoJSON render): Expected canvas with no overlay');
    if (!test3Pass) console.error('Test 3 (tabular unavailable): Expected "Map unavailable" message');
    if (!test4Pass) console.error('Test 4 (spatial reselected): Expected canvas with no overlay');
    process.exitCode = 1;
  }
} catch (error) {
  await screenshot('failure').catch(() => {});
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'), 'utf8').catch(() => {});
  console.error(`Smoke test failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
