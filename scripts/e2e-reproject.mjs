import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4184';
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

  const importButton = page.getByRole('button', { name: /Import into workspace/i });
  await importButton.click();
  await page.waitForTimeout(3500);

  const statusAfterImport = await page.locator('.topbar .muted.small').first().innerText().catch(() => null);
  const artifactCards = page.locator('.artifact-list .card');
  const artifactCountAfterImport = await artifactCards.count();

  const reprojectButton = page.getByRole('button', { name: /^Reproject$/i });
  await reprojectButton.click();
  await page.waitForTimeout(800);

  const sourceSelect = page.locator('select').nth(0);
  const targetSelect = page.locator('select').nth(1);
  await sourceSelect.selectOption('EPSG:4326');
  await targetSelect.selectOption('EPSG:3857');

  const nameInput = page.locator('input[type="text"]').last();
  await nameInput.fill('example_reprojected_3857');

  await page.getByRole('button', { name: /^Reproject$/i }).last().click();

  let finalStatus = null;
  let artifactTexts = [];
  let selectedDetails = '';
  let artifactCreated = false;
  let outputCrsConfirmed = false;
  let historyConfirmed = false;

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    finalStatus = await page.locator('.topbar .muted.small').first().innerText().catch(() => null);
    artifactTexts = await page.locator('.artifact-list .card').allInnerTexts().catch(() => []);
    selectedDetails = await page.locator('.right-panel').innerText().catch(() => '');

    artifactCreated = artifactTexts.some((text) =>
      text.includes('example_reprojected_3857') && text.includes('CRS: EPSG:3857')
    );
    outputCrsConfirmed = selectedDetails.includes('example_reprojected_3857') && selectedDetails.includes('CRS EPSG:3857');
    historyConfirmed = selectedDetails.includes('Reproject example from EPSG:4326 to EPSG:3857');

    if (artifactCreated && outputCrsConfirmed && historyConfirmed) {
      break;
    }
  }

  const success = artifactCreated && outputCrsConfirmed && historyConfirmed;

  const result = {
    appUrl,
    importedArtifactCount: artifactCountAfterImport,
    statusAfterImport,
    finalStatus,
    success,
    artifactCreated,
    outputCrsConfirmed,
    historyConfirmed,
    artifactTexts,
    selectedDetailsSnippet: selectedDetails.slice(0, 3000),
    consoleMessages,
    pageErrors,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!success) {
    await page.screenshot({ path: '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/tmp/e2e-reproject-failure.png', fullPage: true });
    process.exitCode = 1;
  }
} catch (error) {
  await page.screenshot({ path: '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/tmp/e2e-reproject-error.png', fullPage: true });
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
