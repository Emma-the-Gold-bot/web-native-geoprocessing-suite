import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const outDir = path.resolve('tmp/playwright-issue-3-review');
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
  await page.locator('input[type="file"]').setInputFiles(path.resolve('test-data/example.parquet'));
  await page.getByText(/Import review/i).waitFor({ state: 'visible' });
  await shot('01-geoparquet-import-review');
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /example.*source/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot('02-after-geoparquet-import');

  const mapUnavailableVisible = await page.getByText(/Map unavailable/i).isVisible().catch(() => false);
  const renderIssueTextVisible = await page.getByText(/registered and queryable|cannot be rendered|remains queryable/i).isVisible().catch(() => false);
  const emptyImportPromptVisible = await page.getByText(/Import or load a spatial dataset to see it on the map/i).isVisible().catch(() => false);

  const report = {
    verdict: mapUnavailableVisible || renderIssueTextVisible ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      mapUnavailableVisible,
      renderIssueTextVisible,
      emptyImportPromptVisible,
    },
    screenshots: [
      path.join(outDir, '01-geoparquet-import-review.png'),
      path.join(outDir, '02-after-geoparquet-import.png'),
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
