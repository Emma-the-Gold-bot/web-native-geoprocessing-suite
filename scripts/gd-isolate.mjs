import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = (process.env.APP_URL || 'http://127.0.0.1:4196') + '?debugLogMapSync=1';
const outDir = path.resolve('tmp/playwright-grouped-dissolve');
const fixturePath = path.resolve('test-data/grouped-dissolve-input.geojson');

const { browser, page, consoleMessages, artifactButton, gotoApp, selectArtifact }
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

  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await page.waitForTimeout(1000);

  // Reproject
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('gd_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(/gd_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Grouped dissolve
  await selectArtifact(/gd_3857.*derived/i);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible' });
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('gd_result');
  await page.waitForTimeout(500);

  const preRunLen = consoleMessages.length;

  // Click run
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.import-overlay button')]
      .find(b => /Run Grouped Dissolve/i.test(b.textContent || ''));
    btn.click();
  });

  // Poll with detailed state
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    try {
      const info = await page.evaluate(() => {
        return {
          t: performance.now(),
          mem: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null,
        };
      });
      if (i % 5 === 0) console.log(`Poll ${i}: alive, t=${info.t?.toFixed(0)}, mem=${info.mem?.used}`);
    } catch (e) {
      console.log(`CRASH at poll ${i} (${i * 100}ms): ${e.message?.slice(0, 80)}`);
      break;
    }
  }

  // Dump console
  const postRun = consoleMessages.slice(preRunLen);
  console.log('Post-run console:');
  postRun.slice(-20).forEach(m => console.log(`  [${m.type}] ${m.text?.slice(0, 200)}`));
} catch (error) {
  console.error('FATAL:', error?.message?.slice(0, 100));
} finally {
  await browser.close();
}
