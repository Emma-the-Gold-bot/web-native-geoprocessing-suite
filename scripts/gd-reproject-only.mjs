import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4196';
const outDir = path.resolve('tmp/playwright-grouped-dissolve');
const fixturePath = path.resolve('test-data/grouped-dissolve-input.geojson');

const { browser, page, consoleMessages, shot, bodyText, artifactButton, gotoApp, selectArtifact }
  = await createBrowserHarness({ appUrl, outDir });

async function resetBrowserProjectState() {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
}

async function importFixture(filePath, artifactPattern) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(artifactPattern).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

try {
  await gotoApp();
  await resetBrowserProjectState();

  console.log('Import fixture');
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await page.waitForTimeout(1000);

  console.log('Reproject to 3857');
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('reprojected_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(/reprojected_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2000);

  console.log('Select reprojected artifact and wait...');
  await selectArtifact(/reprojected_3857.*derived/i);
  await page.waitForTimeout(5000);

  const alive = await page.evaluate(() => ({
    title: document.title,
    len: document.body?.innerHTML?.length ?? 0,
  })).catch((err) => ({ error: String(err) }));
  console.log('AFTER_REPROJECT_SELECT:', JSON.stringify(alive));

  if (alive.error) {
    console.log('CRASH: Reproject+select crashes the tab too!');
  } else {
    console.log('OK: Reproject+select is fine. Crash is specific to grouped dissolve.');
    const text = await bodyText().catch(() => '');
    console.log('BODY:', text.slice(0, 300));
  }
} catch (error) {
  console.error('FATAL:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
