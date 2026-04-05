import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4198';
const fixture = path.resolve('test-data/grouped-dissolve-input.geojson');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
page.on('crash', () => console.log('[crash] page crashed'));
const artifactButton = (pattern) => page.locator('.artifact-list').first().getByRole('button', { name: pattern });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(/grouped-dissolve-input.*source/i).waitFor({ state: 'visible', timeout: 20000 });
  await wait(1200);

  await artifactButton(/grouped-dissolve-input.*source/i).click();
  await wait(500);
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject/i }).waitFor({ state: 'visible', timeout: 15000 });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('grouped_dissolve_input_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(/grouped_dissolve_input_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await wait(1200);

  await artifactButton(/grouped_dissolve_input_3857.*derived/i).click();
  await wait(500);
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /Grouped Dissolve Operation/i }).waitFor({ state: 'visible', timeout: 15000 });
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('grouped_dissolve_result');
  await wait(500);

  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run button not found');
    setTimeout(() => runButton.click(), 0);
  });

  for (let i = 0; i < 20; i += 1) {
    await wait(500);
    try {
      const probe = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 300) ?? '',
        artifactButtons: Array.from(document.querySelectorAll('.artifact-list button')).map((button) => button.textContent?.replace(/\s+/g, ' ').trim()),
        heading: document.querySelector('h1')?.textContent ?? null,
      }));
      console.log('probe', i, JSON.stringify(probe));
    } catch (error) {
      console.log('probe', i, 'EVAL_FAILED', error?.message || String(error));
      break;
    }
  }
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
