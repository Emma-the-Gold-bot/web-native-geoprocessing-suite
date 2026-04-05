import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4176';
const outDir = path.resolve('tmp/playwright-issue-2');
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
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });

  await page.locator('input[type="file"]').setInputFiles(path.resolve('test-data/example.parquet'));
  await page.getByText(/Import review/i).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /example.*source/i }).waitFor({ state: 'visible', timeout: 20000 });

  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.locator('textarea').fill('SELECT * FROM example LIMIT 5');
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.getByRole('button', { name: /^Results$/i }).click();
  await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText(/This is still a preview/i).waitFor({ state: 'visible' });
  await shot('01-before-materialize');

  await page.getByRole('button', { name: /Materialize result/i }).click();
  await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible' });
  await page.getByRole('textbox').fill('issue2_check_artifact');
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await page.getByRole('button', { name: /issue2_check_artifact.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1000);
  await shot('02-after-materialize');

  const previewTextStillVisible = await page.getByText(/This is still a preview\. Materialize it to create a derived artifact\./i).isVisible().catch(() => false);
  const materializedTextVisible = await page.getByText(/Materialized as artifact\./i).isVisible().catch(() => false);
  const viewArtifactVisible = await page.getByRole('button', { name: /View artifact/i }).isVisible().catch(() => false);

  const report = {
    verdict: !previewTextStillVisible && materializedTextVisible ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      previewTextStillVisible,
      materializedTextVisible,
      viewArtifactVisible,
    },
    screenshots: [
      path.join(outDir, '01-before-materialize.png'),
      path.join(outDir, '02-after-materialize.png'),
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
