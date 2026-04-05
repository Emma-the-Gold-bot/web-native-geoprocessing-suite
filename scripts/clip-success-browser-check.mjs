import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4184';
const outDir = path.resolve('tmp/playwright-clip-success');
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
const statusText = async () => (await page.locator('body').innerText());

async function importFile(filePath) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
}

async function importKnownFixture(filePath, artifactPattern) {
  await importFile(filePath);
  await artifactButton(artifactPattern).waitFor({ state: 'visible', timeout: 20000 });
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
  await artifactButton(new RegExp(`${outputName}.*derived`, 'i')).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function runClip(sourcePattern, maskPattern, outputName) {
  await artifactButton(sourcePattern).click();
  await page.getByRole('button', { name: /^Clip$/i }).click();
  await page.getByRole('heading', { name: /Clip Operation/i }).waitFor({ state: 'visible' });

  const select = page.locator('.import-overlay select').first();
  const optionTexts = await select.locator('option').allTextContents();
  const optionIndex = optionTexts.findIndex((text) => maskPattern.test(text));
  if (optionIndex < 0) {
    throw new Error(`Could not find clip mask option matching ${maskPattern}`);
  }
  await select.selectOption({ index: optionIndex });

  await page.locator('.import-overlay input[type="text"]').last().fill(outputName);
  await shot(`dialog-${outputName}`);
  await page.getByRole('button', { name: /Run Clip/i }).click();
  await page.waitForTimeout(1500);
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });

  // Build two known-CRS artifacts via reprojection from sample.
  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(/sample-parcels.*source/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);

  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('clip_success_source_3857');
  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('clip_success_mask_3857');

  // Successful non-empty clip.
  await runClip(/clip_success_source_3857.*derived/i, /clip_success_mask_3857/i, 'clip_success_output');
  const bodyAfterSuccess = await statusText();
  const successCreated = bodyAfterSuccess.includes('Clip created: clip_success_output');
  const derivedVisible = await artifactButton(/clip_success_output.*derived/i).isVisible().catch(() => false);
  await shot('01-clip-success-created');

  // Check history/detail signals for successful output.
  await artifactButton(/clip_success_output.*derived/i).click();
  const derivedBody = await statusText();
  const hasClipHistorySummary = derivedBody.includes('Clip clip_success_source_3857 by clip_success_mask_3857 → clip_success_output');
  const hasDerivedDetails = derivedBody.includes('clip_success_output') && derivedBody.includes('Clip operation');
  await shot('02-clip-success-details');

  // Empty-result path using disjoint polygon fixtures, then reprojection into known matching CRS.
  await importKnownFixture(path.resolve('test-data/disjoint-west-polygon.geojson'), /disjoint-west-polygon.*source/i);
  await artifactButton(/disjoint-west-polygon.*source/i).click();
  await reprojectSelected('empty_source_3857');

  await importKnownFixture(path.resolve('test-data/disjoint-east-polygon.geojson'), /disjoint-east-polygon.*source/i);
  await artifactButton(/disjoint-east-polygon.*source/i).click();
  await reprojectSelected('empty_mask_3857');

  await runClip(/empty_source_3857.*derived/i, /empty_mask_3857/i, 'clip_empty_output');
  const bodyAfterEmpty = await statusText();
  await fs.writeFile(path.join(outDir, 'empty-body.txt'), bodyAfterEmpty);
  const emptyCreated = bodyAfterEmpty.includes('Clip created: clip_empty_output');
  const emptyArtifactVisible = await artifactButton(/clip_empty_output.*derived/i).isVisible().catch(() => false);
  const emptyResultMention =
    bodyAfterEmpty.toLowerCase().includes('result artifact is intentionally empty') ||
    bodyAfterEmpty.toLowerCase().includes('no overlap was found') ||
    bodyAfterEmpty.toLowerCase().includes('clip result is intentionally empty');
  await shot('03-clip-empty-created');

  const report = {
    verdict: successCreated && derivedVisible && hasClipHistorySummary && hasDerivedDetails && emptyCreated && emptyArtifactVisible && emptyResultMention ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      successCreated,
      derivedVisible,
      hasClipHistorySummary,
      hasDerivedDetails,
      emptyCreated,
      emptyArtifactVisible,
      emptyResultMention,
    },
    screenshots: [
      path.join(outDir, 'dialog-clip_success_output.png'),
      path.join(outDir, '01-clip-success-created.png'),
      path.join(outDir, '02-clip-success-details.png'),
      path.join(outDir, '03-clip-empty-created.png'),
    ],
    consoleTail: consoleMessages.slice(-30),
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
