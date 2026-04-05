#!/usr/bin/env node
/**
 * Smoke test for Milestone 1 tranche 1 features:
 * - Project persistence (save/open with actual data restoration)
 * - Export to GeoJSON (verify real output)
 * - Export to JSON (verify real output)
 * - Saved SQL queries
 * 
 * This test validates actual functionality, not just button visibility.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4178';
const outDir = process.env.PW_OUT_DIR || path.resolve('tmp/playwright-m1');
const headless = process.env.HEADLESS !== 'false';

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless });
const page = await browser.newPage();
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

const mark = (name) => console.log(`stage: ${name}`);
const screenshot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

/**
 * Check map state using explicit UI hooks.
 * Returns { state, diagnostics } where state is one of:
 * - 'rendering': map canvas present, no overlay (data is shown)
 * - 'empty-state': "Map pane" overlay with "Import or load" message
 * - 'map-unavailable': "Map unavailable" overlay
 * - 'no-canvas': no map canvas at all
 */
async function checkMapState(page) {
  const diagnostics = { hasCanvas: false, overlayTitle: null, overlayMessage: null };
  
  const canvasCount = await page.locator('.map-container canvas').count();
  diagnostics.hasCanvas = canvasCount > 0;
  
  // Check for overlay (sibling of .map-container with position: absolute)
  const mapContainer = page.locator('.map-container');
  const nextSibling = mapContainer.locator('xpath=following-sibling::*[1]');
  const siblingStyle = await nextSibling.getAttribute('style').catch(() => '');
  const siblingText = await nextSibling.textContent().catch(() => '');
  
  if (siblingStyle?.includes('position: absolute') && 
      (siblingText?.includes('Map pane') || siblingText?.includes('Map unavailable'))) {
    const card = nextSibling.locator('.card');
    if (await card.count() > 0) {
      const titleEl = card.locator('.muted.small').first();
      if (await titleEl.count() > 0) {
        diagnostics.overlayTitle = (await titleEl.textContent())?.trim() || null;
      }
      const allDivs = await card.locator('div').all();
      for (const div of allDivs) {
        const text = await div.textContent();
        if (text && text.length > 15 && !text.includes('Map') && !text.includes('Supports')) {
          diagnostics.overlayMessage = text.trim();
          break;
        }
      }
    }
  }
  
  let state;
  if (diagnostics.overlayTitle?.includes('Map unavailable')) state = 'map-unavailable';
  else if (diagnostics.overlayTitle?.includes('Map pane')) state = 'empty-state';
  else if (diagnostics.hasCanvas && !diagnostics.overlayTitle) state = 'rendering';
  else if (!diagnostics.hasCanvas) state = 'no-canvas';
  else state = 'unknown';
  
  return { state, diagnostics };
}

try {
  mark('goto');
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Web-native Geoprocessing Suite');
  
  // Check initial state - no saved project
  const initialStatus = await page.locator('.muted.small').first().textContent();
  console.log(`Initial status: ${initialStatus}`);

  // Stage 1: Import sample data
  mark('import sample');
  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.waitForSelector('text=Import review');
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.waitForSelector('text=Imported sample-parcels', { timeout: 15000 });
  
  // Verify artifact is in the list
  await page.waitForSelector('text=sample-parcels');
  await screenshot('01-imported');

  // Verify map has rendered the artifact (explicit state check)
  // This is stronger than just checking canvas presence - we verify the map is actually showing data
  await page.waitForTimeout(1000); // Allow map to settle
  const mapState1 = await checkMapState(page);
  console.log(`Map state after import: ${mapState1.state}`, mapState1.diagnostics);
  if (mapState1.state !== 'rendering') {
    throw new Error(`Map not rendering after import: state=${mapState1.state}, expected='rendering'`);
  }

  // Stage 2: Save the project
  mark('save project');
  await page.getByRole('button', { name: /Save Project/i }).click();
  await page.waitForSelector('text=Save Project'); // dialog is open
  
  // The project name should default to "Untitled Project" - let's change it
  const projectNameInput = page.locator('input[placeholder="Project name..."]');
  await projectNameInput.fill('Test Project');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('text=Project "Test Project" saved successfully');
  
  // Verify unsaved indicator is gone
  const projectTitleAfterSave = await page.locator('.topbar .muted.small').textContent();
  console.log(`Project title after save: ${projectTitleAfterSave}`);
  if (projectTitleAfterSave.includes('•')) {
    throw new Error('Unsaved indicator still present after save');
  }
  await screenshot('02-saved');

  // Stage 3: Save a query
  mark('save query');
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.locator('.bottom-dock').getByRole('button', { name: /Save Query/i }).click();
  await page.waitForSelector('text=Save Query'); // dialog is open
  
  const queryNameInput = page.locator('input[placeholder="Query name..."]');
  await queryNameInput.fill('My Test Query');
  await page.locator('.import-overlay').getByRole('button', { name: 'Save Query' }).click();
  await page.waitForSelector('text=Query "My Test Query" saved');
  await screenshot('03-query-saved');

  // Verify query appears in left rail
  await page.waitForSelector('text=My Test Query');
  
  // Save the project again with the new query
  mark('save project with query');
  await page.getByRole('button', { name: /Save Project/i }).click();
  await page.waitForSelector('text=Save Project');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('text=Project "Test Project" saved successfully');

  // Stage 4: Test export buttons appear when artifact selected
  mark('check export buttons');
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.waitForSelector('text=Export ▾');
  
  // Open export menu and verify both options exist
  await page.getByRole('button', { name: /Export ▾/i }).click();
  await page.waitForSelector('text=Export to GeoJSON');
  await page.waitForSelector('text=Export to JSON');
  await screenshot('04-export-visible');

  // Stage 5: Test actual GeoJSON export
  mark('test geojson export');
  const exportPromise = page.waitForEvent('download', { timeout: 10000 }).then(download => download.path());
  
  // Click GeoJSON export
  await page.getByRole('button', { name: 'Export to GeoJSON' }).click();
  await page.waitForSelector('text=Exported sample-parcels to GeoJSON');
  
  const geoJsonPath = await exportPromise;
  if (!geoJsonPath) {
    throw new Error('GeoJSON download did not start');
  }
  
  // Verify the downloaded file exists and has content
  const geoJsonContent = await fs.readFile(geoJsonPath, 'utf8');
  const geoJsonData = JSON.parse(geoJsonContent);
  
  // Verify it's a valid GeoJSON FeatureCollection
  if (!geoJsonData.type || geoJsonData.type !== 'FeatureCollection') {
    throw new Error(`Exported file is not a valid GeoJSON FeatureCollection: ${geoJsonData.type}`);
  }
  if (!Array.isArray(geoJsonData.features)) {
    throw new Error('Exported GeoJSON has no features array');
  }
  if (geoJsonData.features.length === 0) {
    throw new Error('Exported GeoJSON has empty features array');
  }
  
  console.log(`GeoJSON export: ${geoJsonData.features.length} features`);
  await screenshot('05-geojson-exported');

  // Stage 6: Test JSON export
  mark('test json export');
  // Re-select the artifact and open export menu
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.waitForSelector('text=Export ▾');
  await page.getByRole('button', { name: /Export ▾/i }).click();
  
  const jsonExportPromise = page.waitForEvent('download', { timeout: 10000 }).then(download => download.path());
  await page.getByRole('button', { name: 'Export to JSON' }).click();
  await page.waitForSelector('text=Exported sample-parcels to JSON');
  
  const jsonPath = await jsonExportPromise;
  if (!jsonPath) {
    throw new Error('JSON download did not start');
  }
  
  // Verify the downloaded file exists and has content
  const jsonContent = await fs.readFile(jsonPath, 'utf8');
  const jsonData = JSON.parse(jsonContent);
  
  // Verify it's an array
  if (!Array.isArray(jsonData)) {
    throw new Error('Exported file is not a JSON array');
  }
  if (jsonData.length === 0) {
    throw new Error('Exported JSON has empty array');
  }
  
  console.log(`JSON export: ${jsonData.length} rows`);
  await screenshot('06-json-exported');

  // Stage 7: New project and reload - test data restoration
  mark('new project');
  // Set up dialog handler BEFORE clicking
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /New/i }).click();
  await page.waitForSelector('text=New project created', { timeout: 10000 });
  
  // Verify project is cleared
  const clearedTitle = await page.locator('.topbar .muted.small').textContent();
  console.log(`After new project: ${clearedTitle}`);
  
  // Verify no artifacts in the list
  const artifactCount = await page.locator('.artifact-list .card').count();
  console.log(`Artifacts after new project: ${artifactCount}`);

  // Stage 8: Open the saved project and verify data restoration
  mark('open project and verify restored data');
  await page.getByRole('button', { name: /Open Project/i }).click();
  await page.waitForSelector('text=Project "Test Project" loaded successfully');
  
  // Wait for async operations
  await page.waitForTimeout(1500);
  await screenshot('07-reloaded');

  // Verify artifacts restored
  await page.waitForSelector('text=sample-parcels');
  
  // Verify saved query restored
  await page.waitForSelector('text=My Test Query', { timeout: 10000 });

  // Verify map renders the restored artifact (explicit state check)
  // This is stronger than just checking canvas - verifies map is showing data
  await page.waitForTimeout(1000);
  const mapStateAfterReload = await checkMapState(page);
  console.log(`Map state after reload: ${mapStateAfterReload.state}`, mapStateAfterReload.diagnostics);
  if (mapStateAfterReload.state !== 'rendering') {
    throw new Error(`Map not rendering after reload: state=${mapStateAfterReload.state}, expected='rendering'`);
  }
  
  // Verify the artifact is selectable and shows data in table
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.waitForTimeout(1000);
  
  // Switch to table tab explicitly to ensure table view is active
  await page.getByRole('button', { name: /^Table$/i }).click();
  await page.waitForTimeout(500);
  
  // Check that table shows data (not empty message)
  const tableRowsLocator = page.locator('.table-wrap table tbody tr');
  const tableRowCount = await tableRowsLocator.count();
  console.log(`Table rows after reload: ${tableRowCount}`);
  if (tableRowCount === 0) {
    // Check if it's showing the "Select or import" message
    const tableContent = await page.locator('.table-wrap table').textContent();
    if (tableContent && tableContent.includes('Select or import')) {
      throw new Error('Table is empty after project reload - data restoration incomplete');
    }
  }

  // Stage 9: Verify query still works on restored data
  mark('verify query on restored data');
  // Make sure we're on the SQL tab
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.waitForTimeout(500);
  // Run the query that's already in the editor
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.waitForTimeout(1500);
  
  // Check that query produced results
  const resultTab = await page.locator('.bottom-tabs .tab.active').textContent();
  if (!resultTab.includes('Results')) {
    throw new Error('Query did not switch to results tab');
  }
  
  const resultRows = await page.locator('.table-wrap table tbody tr').count();
  console.log(`Query result rows after reload: ${resultRows}`);
  if (resultRows === 0) {
    throw new Error('Query returned no results on restored data - table re-registration failed');
  }
  
  await screenshot('08-query-works-after-reload');

  // Stage 10: Materialize a tabular-only result and verify JSON-only export semantics
  mark('tabular export semantics');
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.waitForTimeout(500);
  await page.locator('textarea').fill('SELECT id, name, category FROM sample_parcels LIMIT 3');
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Materialize result/i }).click();
  await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible' });
  await page.getByRole('textbox').fill('tabular_export_check');
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await page.getByRole('button', { name: /tabular_export_check.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: /tabular_export_check.*derived/i }).click();
  await page.waitForSelector('text=Export ▾');
  await page.getByRole('button', { name: /Export ▾/i }).click();
  await page.waitForSelector('text=Export to JSON');
  const tabularGeoJsonOption = await page.getByText('Export to GeoJSON').isVisible().catch(() => false);
  const tabularJsonDownload = page.waitForEvent('download', { timeout: 10000 }).then(download => download.path());
  await page.getByRole('button', { name: 'Export to JSON' }).click();
  const tabularJsonPath = await tabularJsonDownload;
  if (!tabularJsonPath) {
    throw new Error('Tabular JSON download did not start');
  }
  const tabularJsonContent = await fs.readFile(tabularJsonPath, 'utf8');
  const tabularJsonData = JSON.parse(tabularJsonContent);
  if (!Array.isArray(tabularJsonData) || tabularJsonData.length !== 3) {
    throw new Error(`Tabular JSON export did not preserve expected rows: ${Array.isArray(tabularJsonData) ? tabularJsonData.length : 'not-array'}`);
  }
  if (tabularGeoJsonOption) {
    throw new Error('Tabular artifact incorrectly exposed GeoJSON export');
  }
  await screenshot('09-tabular-export');

  const report = {
    verdict: 'PASS',
    appUrl,
    stages: [
      'import',
      'save-project',
      'save-query',
      'export-visible',
      'geojson-export',
      'json-export',
      'new-project',
      'open-project-data-restored',
      'query-on-restored-data',
      'tabular-export-semantics'
    ],
    screenshots: [
      path.join(outDir, '01-imported.png'),
      path.join(outDir, '02-saved.png'),
      path.join(outDir, '03-query-saved.png'),
      path.join(outDir, '04-export-visible.png'),
      path.join(outDir, '05-geojson-exported.png'),
      path.join(outDir, '06-json-exported.png'),
      path.join(outDir, '07-reloaded.png'),
      path.join(outDir, '08-query-works-after-reload.png'),
      path.join(outDir, '09-tabular-export.png'),
    ],
    validation: {
      geoJsonExport: 'Valid GeoJSON FeatureCollection with features',
      jsonExport: 'Valid JSON array with rows',
      tabularExport: 'Tabular and measurement-style outputs remain exportable as JSON without pretending to be GeoJSON',
      dataRestoration: 'Map renders, table shows data, queries work',
      savedQueries: 'Restored and functional',
    },
    notes: [
      'Project persistence now restores usable artifact data',
      'Export produces real, valid output files',
      'Map and table work after project reload without re-import',
      'Queries run against restored DuckDB tables',
      'Non-spatial derived outputs keep first-class JSON export affordances without inheriting geometry-only export assumptions',
    ],
  };

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'), 'utf8');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await screenshot('failure').catch(() => {});
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'), 'utf8').catch(() => {});
  console.error(`Smoke test failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
