import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = 'http://127.0.0.1:4173';
const outDir = path.resolve('tmp/playwright-issue-5-review');
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
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible' });
  const notesVisibleInImportReview = await page.getByText(/^Notes$/i).isVisible().catch(() => false);
  const warningsVisibleInImportReview = await page.getByText(/^Warnings$/i).isVisible().catch(() => false);
  await shot('01-import-review');

  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /example.*source/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  const notesVisibleInDetails = await page.getByText(/^Notes$/i).isVisible().catch(() => false);
  const warningsVisibleInDetails = await page.getByText(/^Warnings$/i).isVisible().catch(() => false);
  const noteBadgeVisible = await page.getByText(/note\(s\)/i).isVisible().catch(() => false);
  await shot('02-artifact-details');

  // Open history event details
  await page.getByRole('button', { name: /Imported example from GeoParquet/i }).click();
  await page.waitForTimeout(500);
  const eventNotesVisible = await page.getByText(/Event notes/i).isVisible().catch(() => false);
  const eventWarningsVisible = await page.getByText(/Event warnings/i).isVisible().catch(() => false);
  await shot('03-history-details');

  const report = {
    verdict: notesVisibleInImportReview && warningsVisibleInImportReview && notesVisibleInDetails && noteBadgeVisible ? 'PASS' : 'FAIL',
    checks: {
      notesVisibleInImportReview,
      warningsVisibleInImportReview,
      notesVisibleInDetails,
      warningsVisibleInDetails,
      noteBadgeVisible,
      eventNotesVisible,
      eventWarningsVisible,
    },
    screenshots: [
      path.join(outDir, '01-import-review.png'),
      path.join(outDir, '02-artifact-details.png'),
      path.join(outDir, '03-history-details.png'),
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
