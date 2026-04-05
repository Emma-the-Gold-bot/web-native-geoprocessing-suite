import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4196';
const fixture = path.resolve('test-data/grouped-dissolve-input.geojson');

const variant = {
  name: process.env.VARIANT_NAME || 'control',
  params: Object.fromEntries(
    [
      ['debugLogMapSync', '1'],
      process.env.DEBUG_DISABLE_SELECTION === '1' ? ['debugDisableOperationSelection', '1'] : null,
      process.env.DEBUG_DEFER_SELECTION === '1' ? ['debugDeferOperationSelection', '1'] : null,
      process.env.DEBUG_DISABLE_BASE === '1' ? ['debugDisableBaseSourceSync', '1'] : null,
      process.env.DEBUG_DISABLE_SELECTED === '1' ? ['debugDisableSelectedSourceSync', '1'] : null,
      process.env.DEBUG_DISABLE_LAYER === '1' ? ['debugDisableLayerSync', '1'] : null,
      process.env.DEBUG_DISABLE_FILL === '1' ? ['debugDisablePolygonFill', '1'] : null,
      process.env.DEBUG_LINE_ONLY === '1' ? ['debugPolygonLineOnly', '1'] : null,
      process.env.DEBUG_DISABLE_AUTOFIT === '1' ? ['debugDisableAutoFit', '1'] : null,
    ].filter(Boolean),
  ),
};

function withParams(url, params) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
  return next.toString();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
const pageErrors = [];
let crashed = false;
page.on('console', (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  consoleMessages.push(line);
  console.log(line);
});
page.on('pageerror', (err) => {
  pageErrors.push(err.message);
  console.log('[pageerror]', err.message);
});
page.on('crash', () => {
  crashed = true;
  console.log('[crash] page crashed');
});
const artifactButton = (pattern) => page.locator('.artifact-list').first().getByRole('button', { name: pattern });

try {
  await page.goto(withParams(appUrl, variant.params), { waitUntil: 'domcontentloaded' });
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
  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run Grouped Dissolve button not found');
    setTimeout(() => runButton.click(), 0);
  });

  for (let i = 0; i < 16; i += 1) {
    await page.waitForTimeout(400);
    if (crashed) break;
    try {
      const probe = await page.evaluate(() => ({
        selectedArtifactLabel: document.querySelector('.artifact-list > button.card.selected strong')?.textContent ?? null,
        artifactButtons: Array.from(document.querySelectorAll('.artifact-list button')).map((button) => button.textContent?.replace(/\s+/g, ' ').trim()),
        overlayPresent: Boolean(document.querySelector('.import-overlay')),
        bodySnippet: document.body?.innerText?.slice(0, 300) ?? '',
        debugLastGroupedResult: (window).__debugLastGroupedResult ?? null,
      }));
      console.log('probe', i, JSON.stringify(probe));
    } catch (error) {
      console.log('probe', i, 'EVAL_FAILED', error?.message || String(error));
      break;
    }
  }

  console.log('summary', JSON.stringify({
    variant,
    crashed,
    pageErrors,
    consoleTail: consoleMessages.slice(-50),
  }, null, 2));
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
