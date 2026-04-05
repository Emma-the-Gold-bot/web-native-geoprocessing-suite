import fs from 'node:fs/promises';
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

  console.log('STEP 1: Import');
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await page.waitForTimeout(1000);

  // Check PROJ status
  console.log('STEP 1b: Check engine state');
  const engineState = await page.evaluate(() => {
    // @ts-ignore
    const w = window;
    return {
      hasSpatialEngine: typeof w.__spatialEngine !== 'undefined',
      bodySnippet: document.body.innerText.slice(0, 200),
    };
  });
  console.log('ENGINE:', JSON.stringify(engineState));

  // Try reproject
  console.log('STEP 2: Open reproject');
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  await page.waitForTimeout(2000);

  const dialogText = await page.locator('.import-overlay').innerText().catch(() => 'NO OVERLAY');
  console.log('DIALOG:', dialogText.slice(0, 500));

  const reprojectBtn = page.getByRole('button', { name: /^Reproject$/i }).last();
  const isDisabled = await reprojectBtn.isDisabled().catch(() => 'error');
  console.log('REPROJECT_DISABLED:', isDisabled);

  // Check console for PROJ errors
  const projMessages = consoleMessages.filter(m => /proj|PROJ|engine|SpatialEngine/i.test(m.text));
  console.log('PROJ_CONSOLE:');
  for (const m of projMessages.slice(-10)) {
    console.log(`  [${m.type}] ${m.text}`);
  }

  await shot('diagnosis');
} catch (error) {
  console.error('FATAL:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
