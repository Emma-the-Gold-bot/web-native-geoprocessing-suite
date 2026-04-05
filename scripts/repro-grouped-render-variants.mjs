import path from 'node:path';
import { chromium } from 'playwright';

const baseAppUrl = process.env.APP_URL || 'http://127.0.0.1:4203';
const fixture = path.resolve('test-data/grouped-dissolve-input.geojson');

const variants = [
  { name: 'control', params: {} },
  { name: 'fill-disabled', params: { debugDisablePolygonFill: '1' } },
  { name: 'line-only', params: { debugPolygonLineOnly: '1' } },
  { name: 'fill-disabled-no-display-transform', params: { debugDisablePolygonFill: '1', debugDisableDisplayTransformForBase: '1', debugDisableDisplayTransformForSelected: '1' } },
];

function withParams(url, params) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
  return next.toString();
}

async function runVariant(variant) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleMessages = [];
  const pageErrors = [];
  let crashed = false;
  page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('crash', () => { crashed = true; });
  const artifactButton = (pattern) => page.locator('.artifact-list').first().getByRole('button', { name: pattern });

  const result = { name: variant.name, params: variant.params, crashed: false, pageErrors: [], consoleTail: [], artifactAppeared: false, outputSelected: false, mapCanvasCount: 0 };
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
    await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
    await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible', timeout: 15000 });
    const overlay = page.locator('.import-overlay');
    await overlay.locator('select').first().selectOption('zone');
    await overlay.locator('input[type="text"]').last().fill('grouped_dissolve_result');
    await page.waitForTimeout(250);

    await page.evaluate(() => {
      const overlay = document.querySelector('.import-overlay');
      const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
      if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run Grouped Dissolve button not found');
      setTimeout(() => runButton.click(), 0);
    });

    for (let i = 0; i < 30; i += 1) {
      await page.waitForTimeout(300);
      if (crashed) break;
      const buttons = await page.locator('.artifact-list').first().getByRole('button').allTextContents().catch(() => []);
      if (buttons.some((text) => /grouped_dissolve_result/i.test(text))) {
        result.artifactAppeared = true;
        break;
      }
    }

    if (!crashed && result.artifactAppeared) {
      await artifactButton(/grouped_dissolve_result.*derived/i).click({ timeout: 5000 });
      result.outputSelected = true;
      result.mapCanvasCount = await page.locator('.maplibregl-canvas').count().catch(() => 0);
      await page.waitForTimeout(1000);
    }
  } catch (error) {
    result.error = error?.message || String(error);
  } finally {
    result.crashed = crashed;
    result.pageErrors = pageErrors;
    result.consoleTail = consoleMessages.slice(-25);
    await browser.close().catch(() => {});
  }
  return result;
}

const results = [];
for (const variant of variants) {
  const result = await runVariant(variant);
  results.push(result);
  console.log(JSON.stringify(result));
}
