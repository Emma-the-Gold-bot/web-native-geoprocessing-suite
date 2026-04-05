import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4176';
const outDir = path.resolve('tmp/playwright-final-qa');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

const shot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

async function mapState() {
  return await page.evaluate(() => {
    const hasCanvas = document.querySelectorAll('.map-container canvas').length > 0;
    const overlayCards = [...document.querySelectorAll('.main-pane > div[style*="position: absolute"] .card')];
    const overlay = overlayCards.find((card) => {
      const text = card.textContent || '';
      return text.includes('Map pane') || text.includes('Map unavailable');
    });
    const overlayText = overlay?.textContent || '';
    const overlayTitle = overlayText.includes('Map unavailable') ? 'Map unavailable' : overlayText.includes('Map pane') ? 'Map pane' : null;
    let state = 'unknown';
    if (overlayTitle === 'Map unavailable') state = 'map-unavailable';
    else if (overlayTitle === 'Map pane') state = 'empty-state';
    else if (hasCanvas) state = 'rendering';
    else state = 'no-canvas';
    return { hasCanvas, overlayTitle, overlayText, state };
  });
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });
  const emptyState = await mapState();
  await shot('01-empty');

  // Sample import path
  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /sample-parcels.*source/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  const sampleMap = await mapState();
  await shot('02-sample-imported');

  // Save query and run SQL
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.locator('textarea').fill('SELECT id, name, category FROM sample_parcels LIMIT 3');
  await page.getByRole('button', { name: /Save Query/i }).click();
  await page.getByRole('heading', { name: /Save Query/i }).waitFor({ state: 'visible' });
  await page.locator('input[placeholder="Query name..."]').fill('QA Query');
  await page.locator('.import-overlay').getByRole('button', { name: 'Save Query' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
  await shot('03-results-preview');

  // Materialize tabular-only result to verify explicit unavailable state and first-class export behavior
  await page.getByRole('button', { name: /Materialize result/i }).click();
  await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible' });
  await page.getByRole('textbox').fill('qa_tabular_result');
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await page.getByRole('button', { name: /qa_tabular_result.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: /qa_tabular_result.*derived/i }).click();
  await page.waitForTimeout(1000);
  const tabularMap = await mapState();
  await page.getByRole('button', { name: /Export/i }).click();
  await page.getByText(/Export to JSON/i).waitFor({ state: 'visible' });
  const tabularGeoJsonVisible = await page.getByText(/Export to GeoJSON/i).isVisible().catch(() => false);
  const tabularJsonDownload = page.waitForEvent('download', { timeout: 10000 }).then(download => download.path());
  await page.getByRole('button', { name: /Export to JSON/i }).click();
  const tabularJsonPath = await tabularJsonDownload;
  const tabularJson = JSON.parse(await fs.readFile(tabularJsonPath, 'utf8'));
  await shot('04-tabular-unavailable');

  // Switch back to source artifact and test export menu
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.waitForTimeout(1000);
  const sourceReselectedMap = await mapState();
  await page.getByRole('button', { name: /Export/i }).click();
  await page.getByText(/Export to GeoJSON/i).waitFor({ state: 'visible' });
  await page.getByText(/Export to JSON/i).waitFor({ state: 'visible' });
  await shot('05-source-reselected-export');

  // Save/open project flow
  await page.getByRole('button', { name: /Save Project/i }).click();
  await page.getByRole('heading', { name: /Save Project/i }).waitFor({ state: 'visible' });
  await page.locator('input[placeholder="Project name..."]').fill('Final QA Project');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(/saved successfully/i).waitFor({ state: 'visible', timeout: 10000 });

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /^New$/i }).click();
  await page.getByText(/New project created/i).waitFor({ state: 'visible', timeout: 10000 });
  const postNewMap = await mapState();
  await shot('06-post-new');

  await page.getByRole('button', { name: /Open Project/i }).click();
  await page.getByText(/loaded successfully/i).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: /sample-parcels.*source/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  const reloadedMap = await mapState();
  await shot('07-reloaded');

  // GeoParquet path
  await page.locator('input[type="file"]').setInputFiles(path.resolve('test-data/example.parquet'));
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  // Check for import review notes/warnings - look for headers OR badge counts like "2 Warnings"
  const notesVisible = await page.locator('.import-overlay').getByText(/^Notes$/i).isVisible().catch(() => false);
  const warningsVisible = await page.locator('.import-overlay').getByText(/Warnings/i).first().isVisible().catch(() => false);
  const hasImportNotesOrWarnings = notesVisible || warningsVisible;
  await shot('08-geoparquet-review');
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /example.*source/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  const geoParquetMap = await mapState();
  await shot('09-geoparquet-imported');

  const report = {
    verdict: (
      emptyState.state === 'empty-state' &&
      sampleMap.state === 'rendering' &&
      tabularMap.state === 'map-unavailable' &&
      !tabularGeoJsonVisible &&
      Array.isArray(tabularJson) &&
      tabularJson.length === 3 &&
      sourceReselectedMap.state === 'rendering' &&
      postNewMap.state === 'empty-state' &&
      reloadedMap.state === 'rendering' &&
      hasImportNotesOrWarnings &&
      geoParquetMap.state === 'rendering'
    ) ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      emptyState,
      sampleMap,
      tabularMap,
      tabularExport: {
        geoJsonVisible: tabularGeoJsonVisible,
        jsonRowCount: Array.isArray(tabularJson) ? tabularJson.length : null,
      },
      sourceReselectedMap,
      postNewMap,
      reloadedMap,
      importReviewNotesVisible: notesVisible,
      importReviewWarningsVisible: warningsVisible,
      geoParquetMap,
    },
    screenshots: [
      path.join(outDir, '01-empty.png'),
      path.join(outDir, '02-sample-imported.png'),
      path.join(outDir, '03-results-preview.png'),
      path.join(outDir, '04-tabular-unavailable.png'),
      path.join(outDir, '05-source-reselected-export.png'),
      path.join(outDir, '06-post-new.png'),
      path.join(outDir, '07-reloaded.png'),
      path.join(outDir, '08-geoparquet-review.png'),
      path.join(outDir, '09-geoparquet-imported.png'),
    ],
    consoleTail: consoleMessages.slice(-20),
  };

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 1;
} catch (error) {
  await shot('failure').catch(() => {});
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
