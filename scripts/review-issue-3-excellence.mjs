import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4174';
const outDir = path.resolve('tmp/playwright-issue-3-excellence');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const shot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor();

  // Empty state baseline
  const emptyVisible = await page.getByText(/Import or load a spatial dataset to see it on the map/i).isVisible();
  await shot('01-empty');

  // GeoParquet path now renders; make sure stale non-renderable warning copy is gone
  await page.locator('input[type="file"]').setInputFiles(path.resolve('test-data/example.parquet'));
  await page.getByText(/Import review/i).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /example.*source/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  const staleWarningVisible = await page.getByText(/Direct map rendering is not wired yet/i).isVisible().catch(() => false);
  await shot('02-geoparquet-renderable');

  // Query result with no geometry should show in-pane map unavailable state when selected
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.locator('textarea').fill('SELECT name, pop_est, iso_a3 FROM example LIMIT 5');
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.getByRole('button', { name: /^Results$/i }).click();
  await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText(/This is still a preview/i).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Materialize result/i }).click();
  await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible' });
  await page.getByRole('textbox').fill('tabular_only_result');
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await page.getByRole('button', { name: /tabular_only_result.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: /tabular_only_result.*derived/i }).click();
  await page.waitForTimeout(1000);

  const mapUnavailableVisible = await page.getByText(/Map unavailable/i).isVisible().catch(() => false);
  const tabularMessageVisible = await page.getByText(/tabular artifact with no geometry to draw/i).isVisible().catch(() => false);
  await shot('03-tabular-artifact-map-unavailable');

  const report = {
    verdict: emptyVisible && !staleWarningVisible && mapUnavailableVisible && tabularMessageVisible ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      emptyVisible,
      staleWarningVisible,
      mapUnavailableVisible,
      tabularMessageVisible,
    },
    screenshots: [
      path.join(outDir, '01-empty.png'),
      path.join(outDir, '02-geoparquet-renderable.png'),
      path.join(outDir, '03-tabular-artifact-map-unavailable.png'),
    ]
  };
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 1;
} catch (error) {
  await shot('failure').catch(() => {});
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
