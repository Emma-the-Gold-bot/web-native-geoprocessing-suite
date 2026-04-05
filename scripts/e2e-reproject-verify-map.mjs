import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4187';
const samplePath = '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/test-data/example.parquet';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const consoleMessages = [];
const pageErrors = [];

page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => pageErrors.push(String(err)));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

try {
  await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const importLabel = page.locator('label:has-text("Import")');
  await importLabel.locator('input[type="file"]').setInputFiles(samplePath);
  await page.waitForTimeout(2500);

  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.waitForTimeout(3500);

  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.waitForTimeout(800);

  const sourceSelect = page.locator('select').nth(0);
  const targetSelect = page.locator('select').nth(1);
  await sourceSelect.selectOption('EPSG:4326');
  await targetSelect.selectOption('EPSG:3857');

  const nameInput = page.locator('input[type="text"]').last();
  await nameInput.fill('example_reprojected_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();

  let artifactCreated = false;
  let outputCrsConfirmed = false;
  let historyConfirmed = false;
  let fitBoundsFailure = false;
  let displayTransformLog = false;
  let projectedSkipLog = false;
  let selectedDetails = '';
  let artifactTexts = [];

  for (let i = 0; i < 35; i++) {
    await sleep(1000);
    artifactTexts = await page.locator('.artifact-list .card').allInnerTexts().catch(() => []);
    selectedDetails = await page.locator('.right-panel').innerText().catch(() => '');

    artifactCreated = artifactTexts.some((text) =>
      text.includes('example_reprojected_3857') && text.includes('CRS: EPSG:3857')
    );
    outputCrsConfirmed = artifactTexts.some((text) =>
      text.includes('example_reprojected_3857') && text.includes('CRS: EPSG:3857')
    ) || (
      selectedDetails.includes('example_reprojected_3857') &&
      selectedDetails.includes('CRS:') &&
      selectedDetails.includes('EPSG:3857')
    );
    historyConfirmed = selectedDetails.includes('Reproject example from EPSG:4326 to EPSG:3857');

    fitBoundsFailure = consoleMessages.some((m) => m.includes('fitBounds failed') || m.includes('Invalid LngLat latitude value'));
    displayTransformLog = consoleMessages.some((m) => m.includes('display') && m.toLowerCase().includes('transform'));
    projectedSkipLog = consoleMessages.some((m) => m.includes('Skipping fitBounds for projected CRS artifact'));

    if (artifactCreated && outputCrsConfirmed && historyConfirmed) break;
  }

  const mapVisible = await page.locator('.map-container').isVisible().catch(() => false);
  const screenshotPath = '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/tmp/e2e-map-verification.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const success = artifactCreated && outputCrsConfirmed && historyConfirmed && !fitBoundsFailure;

  const result = {
    appUrl,
    success,
    artifactCreated,
    outputCrsConfirmed,
    historyConfirmed,
    fitBoundsFailure,
    displayTransformLog,
    projectedSkipLog,
    mapVisible,
    screenshotPath,
    artifactTexts,
    selectedDetailsSnippet: selectedDetails.slice(0, 2000),
    consoleMessages,
    pageErrors,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!success) {
    process.exitCode = 1;
  }
} catch (error) {
  await page.screenshot({ path: '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/tmp/e2e-map-verification-error.png', fullPage: true });
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
