import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4193';
const outDir = path.resolve('tmp/playwright-intersect-refusal');
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

async function importFile(filePath, artifactPattern) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(artifactPattern).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function reprojectSelected(outputName, sourceCrs = 'EPSG:4326', targetCrs = 'EPSG:3857') {
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption(sourceCrs);
  await selects.nth(1).selectOption(targetCrs);
  await page.locator('.import-overlay input[type="text"]').last().fill(outputName);
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(new RegExp(`${outputName}.*derived`, 'i')).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function bodyText() {
  return await page.locator('body').innerText();
}

async function chooseOverlayByPattern(pattern) {
  const select = page.locator('.import-overlay select').first();
  const optionTexts = await select.locator('option').allTextContents();
  const optionIndex = optionTexts.findIndex((text) => pattern.test(text));
  if (optionIndex < 0) {
    throw new Error(`Could not find intersect overlay option matching ${pattern}`);
  }
  await select.selectOption({ index: optionIndex });
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });

  await loadSample();
  await importFile(path.resolve('test-data/intersect-overlay.geojson'), /intersect-overlay.*source/i);
  await importFile(path.resolve('test-data/wgs84-points.geojson'), /wgs84-points.*source/i);

  // Scenario 1: the dialog surfaces the current narrow v1 contract honestly.
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.getByRole('button', { name: /^Intersect$/i }).click();
  await page.getByRole('heading', { name: /Intersect Operation/i }).waitFor({ state: 'visible' });
  const dialogText = await page.locator('.import-overlay').innerText();
  const dialogStatesNarrowContract =
    dialogText.includes('Polygon or MultiPolygon source and overlay artifacts') &&
    dialogText.includes('known matching CRS') &&
    dialogText.includes('does not auto-transform') &&
    dialogText.includes('preserves source attributes only');
  await shot('01-dialog-contract');
  await page.getByRole('button', { name: /Cancel/i }).click();

  // Build known-CRS artifacts for exact-contract refusal checks.
  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('intersect_source_3857');

  await artifactButton(/intersect-overlay.*source/i).click();
  await reprojectSelected('intersect_overlay_3857');
  await artifactButton(/intersect_overlay_3857.*derived/i).click();
  await reprojectSelected('intersect_overlay_4326', 'EPSG:3857', 'EPSG:4326');

  await artifactButton(/wgs84-points.*source/i).click();
  await reprojectSelected('intersect_points_3857');

  const runIntersectButton = page.getByRole('button', { name: /Run Intersect/i });

  // Scenario 2: source unknown CRS + known overlay must refuse.
  await artifactButton(/sample-parcels.*source/i).click();
  await page.getByRole('button', { name: /^Intersect$/i }).click();
  await page.getByRole('heading', { name: /Intersect Operation/i }).waitFor({ state: 'visible' });
  await chooseOverlayByPattern(/intersect_overlay_3857/i);
  await page.locator('.import-overlay input[type="text"]').last().fill('should_refuse_unknown_intersect');
  await runIntersectButton.click();
  await page.waitForTimeout(800);
  const unknownRefusalText = await bodyText();
  const unknownCrsRefused = unknownRefusalText.includes('Intersect refused:') && unknownRefusalText.includes('known stored CRS');
  await shot('02-refused-unknown-crs');

  // Scenario 3: known-but-mismatched CRS must refuse.
  await artifactButton(/intersect_source_3857.*derived/i).click();
  await page.getByRole('button', { name: /^Intersect$/i }).click();
  await page.getByRole('heading', { name: /Intersect Operation/i }).waitFor({ state: 'visible' });
  await chooseOverlayByPattern(/intersect_overlay_4326/i);
  await page.locator('.import-overlay input[type="text"]').last().fill('should_refuse_mismatched_intersect');
  await runIntersectButton.click();
  await page.waitForTimeout(800);
  const mismatchRefusalText = await bodyText();
  const mismatchedCrsRefused = mismatchRefusalText.includes('Intersect refused:') && mismatchRefusalText.includes('matching known stored CRS');
  await shot('03-refused-crs-mismatch');

  // Scenario 4: unsupported geometry family must refuse even with known matching CRS.
  await artifactButton(/intersect_points_3857.*derived/i).click();
  await page.getByRole('button', { name: /^Intersect$/i }).click();
  await page.getByRole('heading', { name: /Intersect Operation/i }).waitFor({ state: 'visible' });
  await chooseOverlayByPattern(/intersect_overlay_3857/i);
  await page.locator('.import-overlay input[type="text"]').last().fill('should_refuse_points_intersect');
  await runIntersectButton.click();
  await page.waitForTimeout(800);
  const geometryRefusalText = await bodyText();
  const unsupportedGeometryRefused = geometryRefusalText.includes('Intersect refused:') && geometryRefusalText.includes('supports only Polygon and MultiPolygon');
  const noArtifactCreated = !(await artifactButton(/should_refuse_(unknown|mismatched|points)_intersect.*derived/i).isVisible().catch(() => false));
  await shot('04-refused-unsupported-geometry');

  const report = {
    verdict: dialogStatesNarrowContract && unknownCrsRefused && mismatchedCrsRefused && unsupportedGeometryRefused && noArtifactCreated ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      dialogStatesNarrowContract,
      unknownCrsRefused,
      mismatchedCrsRefused,
      unsupportedGeometryRefused,
      noArtifactCreated,
    },
    screenshots: [
      path.join(outDir, '01-dialog-contract.png'),
      path.join(outDir, '02-refused-unknown-crs.png'),
      path.join(outDir, '03-refused-crs-mismatch.png'),
      path.join(outDir, '04-refused-unsupported-geometry.png'),
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
