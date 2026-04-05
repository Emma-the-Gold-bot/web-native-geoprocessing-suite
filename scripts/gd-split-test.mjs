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

  console.log('Import');
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await page.waitForTimeout(1000);

  console.log('Reproject to 3857');
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('gd_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(/gd_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Monkey-patch the grouped dissolve handler to NOT use splitSelectionIntoNextCommit
  console.log('Patching applyOperationResult...');
  await page.evaluate(() => {
    // We can't patch React internals, but we can add a flag
    window.__testSkipSplitSelection = true;
  });

  // Instead, run grouped dissolve and then manually handle selection
  console.log('Run grouped dissolve via the UI');
  await selectArtifact(/gd_3857.*derived/i);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible' });
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('gd_result');
  await page.waitForTimeout(500);

  // Run and immediately try to check state
  console.log('Clicking Run...');
  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run button not found');
    runButton.click();
    return true;
  });

  // Try to catch state RIGHT after the first commit (before split selection fires)
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(100);
    try {
      const state = await page.evaluate(() => ({
        alive: true,
        artifactCount: document.querySelectorAll('.artifact-list button').length,
        pending: document.body.innerText.includes('gd_result'),
      }));
      console.log(`Poll ${i}:`, JSON.stringify(state));
    } catch (e) {
      console.log(`CRASH at poll ${i}: ${e.message}`);
      break;
    }
  }
} catch (error) {
  console.error('FATAL:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
