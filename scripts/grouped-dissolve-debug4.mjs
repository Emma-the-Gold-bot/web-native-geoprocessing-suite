import fs from 'node:fs/promises';
import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = (process.env.APP_URL || 'http://127.0.0.1:4196') + '?debugDisableAutoFit=1';
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

  console.log('STEP 1: Import (has EPSG:4326)');
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await page.waitForTimeout(1000);

  // Skip reproject - run grouped dissolve directly on the WGS84 source
  console.log('STEP 2: Open grouped dissolve on WGS84 source');
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible' });
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('gd_result');
  await page.waitForTimeout(500);
  await shot('01-dialog-wgs84');

  console.log('STEP 3: Run dissolve on WGS84');
  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run button not found');
    setTimeout(() => runButton.click(), 0);
    return true;
  });
  await page.waitForTimeout(3000);

  console.log('STEP 4: Check alive');
  const alive = await page.evaluate(() => ({
    title: document.title,
    len: document.body?.innerHTML?.length ?? 0,
  })).catch((err) => ({ error: String(err) }));
  console.log('ALIVE:', JSON.stringify(alive));

  if (!alive.error) {
    console.log('SUCCESS - no crash on WGS84 path');
    const artifacts = await page.locator('.artifact-list').first().getByRole('button').allTextContents().catch(() => []);
    console.log('ARTIFACTS:', JSON.stringify(artifacts));
    const text = await bodyText().catch(() => '');
    console.log('BODY:', text.slice(0, 500));
    await shot('02-success');
  } else {
    console.log('CRASHED even on WGS84 path');
    await shot('02-crashed');
  }
} catch (error) {
  await shot('failure').catch(() => {});
  console.error('FATAL:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
