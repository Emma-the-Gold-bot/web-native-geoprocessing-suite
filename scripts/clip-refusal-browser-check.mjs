import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4184';
const outDir = path.resolve('tmp/playwright-clip-refusal');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

const shot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

const artifactButton = (name) => page.locator('.artifact-list').first().getByRole('button', { name });

async function loadSample() {
  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(/sample-parcels.*source/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function reprojectSelected(outputName) {
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });

  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill(outputName);
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await page.getByRole('button', { name: new RegExp(`${outputName}.*derived`, 'i') }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });

  // Scenario 1: unknown CRS source should refuse clip before any topology call.
  await loadSample();
  await page.getByRole('button', { name: /^Clip$/i }).click();
  await page.getByRole('heading', { name: /Clip Operation/i }).waitFor({ state: 'visible' });
  const runClipButton = page.getByRole('button', { name: /Run Clip/i });
  const clipDisabledWithoutMask = await runClipButton.isDisabled();
  await shot('01-clip-dialog-no-mask');
  await page.getByRole('button', { name: /Cancel/i }).click();

  // Create a second sample-derived artifact so there is a second candidate mask.
  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('clip_source_3857');
  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('clip_mask_3857');

  // Scenario 2: unknown-CRS source + known-CRS mask should still refuse.
  await artifactButton(/sample-parcels.*source/i).click();
  await page.getByRole('button', { name: /^Clip$/i }).click();
  await page.getByRole('heading', { name: /Clip Operation/i }).waitFor({ state: 'visible' });
  await page.locator('.import-overlay select').first().selectOption({ index: 2 });
  await page.locator('.import-overlay input[type="text"]').last().fill('should_refuse_unknown_crs');
  await runClipButton.click();
  await page.waitForTimeout(800);
  const unknownCrsStatus = await page.locator('.topbar').locator('..').evaluate(() => document.body.textContent || '');
  const unknownCrsRefused = unknownCrsStatus.includes('Clip refused:') && unknownCrsStatus.includes('known CRS');
  await shot('02-clip-refused-unknown-crs');

  // Scenario 3: known matching stored CRS source+mask should no longer refuse at the old engine seam.
  await artifactButton(/clip_source_3857.*derived/i).click();
  await page.getByRole('button', { name: /^Clip$/i }).click();
  await page.getByRole('heading', { name: /Clip Operation/i }).waitFor({ state: 'visible' });
  await page.locator('.import-overlay select').first().selectOption({ index: 2 });
  await page.locator('.import-overlay input[type="text"]').last().fill('should_clip_successfully');
  await runClipButton.click();
  await page.waitForTimeout(1500);
  const bodyText = await page.locator('body').innerText();
  const validKnownCrsDidNotRefuse = !bodyText.includes('Clip failed:') && !bodyText.includes('Clip refused:');
  const derivedArtifactCreated = await page.getByRole('button', { name: /should_clip_successfully.*derived/i }).isVisible().catch(() => false);
  await shot('03-clip-valid-contract-success');

  const report = {
    verdict: clipDisabledWithoutMask && unknownCrsRefused && validKnownCrsDidNotRefuse && derivedArtifactCreated ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      clipDisabledWithoutMask,
      unknownCrsRefused,
      validKnownCrsDidNotRefuse,
      derivedArtifactCreated,
    },
    screenshots: [
      path.join(outDir, '01-clip-dialog-no-mask.png'),
      path.join(outDir, '02-clip-refused-unknown-crs.png'),
      path.join(outDir, '03-clip-valid-contract-success.png'),
    ],
    consoleTail: consoleMessages.slice(-20),
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
