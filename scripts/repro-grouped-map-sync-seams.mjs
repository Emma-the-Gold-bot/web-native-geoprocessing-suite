import path from 'node:path';
import { chromium } from 'playwright';

const baseAppUrl = process.env.APP_URL || 'http://127.0.0.1:4196';
const fixture = path.resolve('test-data/grouped-dissolve-input.geojson');

const variants = [
  { name: 'control', params: {} },
  { name: 'disable-base-source-sync', params: { debugDisableBaseSourceSync: '1' } },
  { name: 'disable-selected-source-sync', params: { debugDisableSelectedSourceSync: '1' } },
  { name: 'disable-display-transform-base', params: { debugDisableDisplayTransformForBase: '1' } },
  { name: 'disable-display-transform-selected', params: { debugDisableDisplayTransformForSelected: '1' } },
  { name: 'disable-layer-sync', params: { debugDisableLayerSync: '1' } },
];

function withParams(url, params) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
  return next.toString();
}

async function runVariant(browser, variant) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleMessages = [];
  const pageErrors = [];
  let crashed = false;
  page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('crash', () => {
    crashed = true;
  });

  const artifactButton = (pattern) => page.locator('.artifact-list').first().getByRole('button', { name: pattern });
  const result = { name: variant.name, params: variant.params, crashed: false, pageErrors: [], consoleTail: [], artifactAppeared: false, bodySnippet: '' };

  try {
    await page.goto(withParams(baseAppUrl, variant.params), { waitUntil: 'domcontentloaded' });
    await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });

    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: /Import into workspace/i }).click();
    await artifactButton(/grouped-dissolve-input.*source/i).waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1200);

    await artifactButton(/grouped-dissolve-input.*source/i).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Reproject$/i }).click();
    await page.getByRole('heading', { name: /Reproject/i }).waitFor({ state: 'visible', timeout: 15000 });
    const selects = page.locator('.import-overlay select');
    await selects.nth(0).selectOption('EPSG:4326');
    await selects.nth(1).selectOption('EPSG:3857');
    await page.locator('.import-overlay input[type="text"]').last().fill('grouped_dissolve_input_3857');
    await page.getByRole('button', { name: /^Reproject$/i }).last().click();
    await artifactButton(/grouped_dissolve_input_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1200);

    await artifactButton(/grouped_dissolve_input_3857.*derived/i).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
    await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible', timeout: 15000 });
    const overlay = page.locator('.import-overlay');
    await overlay.locator('select').first().selectOption('zone');
    await overlay.locator('input[type="text"]').last().fill('grouped_dissolve_result');
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /^Run Grouped Dissolve$/i }).click();

    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(500);
      if (crashed) break;
      try {
        const buttons = await page.locator('.artifact-list').first().getByRole('button').allTextContents();
        if (buttons.some((text) => /grouped_dissolve_result/i.test(text))) {
          result.artifactAppeared = true;
          break;
        }
      } catch {
        break;
      }
    }

    try {
      result.bodySnippet = (await page.locator('body').innerText()).slice(0, 500);
    } catch {
      result.bodySnippet = '';
    }
  } catch (error) {
    result.error = error?.message || String(error);
  } finally {
    result.crashed = crashed;
    result.pageErrors = pageErrors;
    result.consoleTail = consoleMessages.slice(-20);
    await page.close().catch(() => {});
  }

  return result;
}

const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const variant of variants) {
    // serialize variants so one crash doesn't contaminate shared state
    const variantResult = await runVariant(browser, variant);
    results.push(variantResult);
    console.log(JSON.stringify(variantResult));
  }
} finally {
  await browser.close();
}
