import fs from 'node:fs/promises';
import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = (process.env.APP_URL || 'http://127.0.0.1:4196') + '?debugDisableBaseSourceSync=1&debugDisableSelectedSourceSync=1';
const outDir = path.resolve('tmp/playwright-grouped-dissolve');
const fixturePath = path.resolve('test-data/grouped-dissolve-input.geojson');

const {
  browser,
  page,
  consoleMessages,
  shot,
  bodyText,
  artifactButton,
  gotoApp,
  selectArtifact,
} = await createBrowserHarness({ appUrl, outDir });

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resetBrowserProjectState() {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
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

  console.log('STEP 1: Import fixture (map sources disabled)');
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await page.waitForTimeout(1000);

  console.log('STEP 2: Reproject to 3857');
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('gd_input_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(/gd_input_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2000);

  console.log('STEP 3: Select reprojected + open grouped dissolve');
  await selectArtifact(/gd_input_3857.*derived/i);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible' });
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('gd_result');
  await page.waitForTimeout(500);

  console.log('STEP 4: Run dissolve (map sources disabled)');
  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run button not found');
    setTimeout(() => runButton.click(), 0);
    return true;
  });
  await page.waitForTimeout(3000);

  console.log('STEP 5: Check page alive');
  const pageAlive = await page.evaluate(() => ({
    title: document.title,
    bodyLen: document.body?.innerHTML?.length ?? 0,
  })).catch((err) => ({ error: String(err) }));
  console.log('PAGE:', JSON.stringify(pageAlive));

  if (!pageAlive.error) {
    console.log('STEP 6: Read artifacts');
    const artifacts = await page.locator('.artifact-list').first().getByRole('button').allTextContents().catch(e => { console.log('ERR:', e.message); return []; });
    console.log('ARTIFACTS:', JSON.stringify(artifacts));
    
    const resultText = await bodyText().catch(() => 'ERROR');
    console.log('BODY_SAMPLE:', resultText.slice(0, 300));
  }

  console.log('DONE - no crash with map sources disabled');
} catch (error) {
  await shot('failure').catch(() => {});
  console.error('FATAL:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
