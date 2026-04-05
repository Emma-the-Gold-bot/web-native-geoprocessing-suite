import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4203';
const fixture = path.resolve(process.env.FIXTURE || 'tmp/grouped-dissolve-stepped-3857.geojson');
const label = process.env.LABEL || path.basename(fixture, path.extname(fixture));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
const pageErrors = [];
let crashed = false;
page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('crash', () => { crashed = true; });
const artifactButton = (pattern) => page.locator('.artifact-list').first().getByRole('button', { name: pattern });

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  const fitSkippedForProjectedArtifact = consoleMessages.some((message) =>
    message.includes('Could not compute display bounds for artifact') ||
    message.includes('Skipping fitBounds for projected CRS artifact'),
  );
  console.log(JSON.stringify({ label, fixture, crashed, fitSkippedForProjectedArtifact, pageErrors, consoleTail: consoleMessages.slice(-25) }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ label, fixture, crashed, pageErrors, error: error?.message || String(error), consoleTail: consoleMessages.slice(-25) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
