import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4191';
const outDir = path.resolve('tmp/playwright-crs-confidence');
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
  if (optionIndex < 0) throw new Error(`Could not find clip mask option matching ${maskPattern}`);
  await select.selectOption({ index: optionIndex });
  await page.locator('.import-overlay input[type="text"]').last().fill(outputName);
  await page.getByRole('button', { name: /Run Clip/i }).click();
  await artifactButton(new RegExp(`${outputName}.*derived`, 'i')).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(/sample-parcels.*source/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);

  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('confidence_source_3857');
  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('confidence_mask_3857');
  await runClip(/confidence_source_3857.*derived/i, /confidence_mask_3857/i, 'confidence_clip_output');

  const sourceText = await artifactButton(/confidence_source_3857.*derived/i).innerText();
  const maskText = await artifactButton(/confidence_mask_3857.*derived/i).innerText();
  const clipText = await artifactButton(/confidence_clip_output.*derived/i).innerText();

  await artifactButton(/confidence_source_3857.*derived/i).click();
  const sourceDetails = await page.locator('body').innerText();
  await shot('01-source-details');

  await artifactButton(/confidence_clip_output.*derived/i).click();
  const clipDetails = await page.locator('body').innerText();
  await shot('02-clip-details');

  const report = {
    verdict: (
      sourceText.includes('CRS: EPSG:3857') &&
      sourceText.includes('KNOWN') &&
      !sourceText.includes('CRS is unknown') &&
      clipText.includes('CRS: EPSG:3857') &&
      clipText.includes('KNOWN') &&
      !clipText.includes('CRS is unknown') &&
      sourceDetails.includes('EPSG:3857') &&
      sourceDetails.includes('KNOWN') &&
      clipDetails.includes('EPSG:3857') &&
      clipDetails.includes('KNOWN')
    ) ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      sourceBadgeKnown: sourceText.includes('KNOWN'),
      sourceCrs3857: sourceText.includes('CRS: EPSG:3857'),
      sourceNoUnknownLabel: !sourceText.includes('CRS is unknown'),
      clipBadgeKnown: clipText.includes('KNOWN'),
      clipCrs3857: clipText.includes('CRS: EPSG:3857'),
      clipNoUnknownLabel: !clipText.includes('CRS is unknown'),
      sourceDetailsKnown: sourceDetails.includes('KNOWN'),
      clipDetailsKnown: clipDetails.includes('KNOWN'),
    },
    screenshots: [
      path.join(outDir, '01-source-details.png'),
      path.join(outDir, '02-clip-details.png'),
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
