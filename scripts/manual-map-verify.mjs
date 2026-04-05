import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const outDir = path.resolve('tmp/playwright-manual-map-verify');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

const shot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });
  await shot('01-empty');

  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByText(/Import review/i).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /sample-parcels.*source/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('North Parcel').waitFor({ state: 'visible' });
  await page.waitForTimeout(2000);
  await shot('02-after-import');

  const report = {
    verdict: 'PASS',
    appUrl,
    screenshots: [
      path.join(outDir, '01-empty.png'),
      path.join(outDir, '02-after-import.png')
    ],
    consoleMessages,
  };
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await shot('failure').catch(() => {});
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
