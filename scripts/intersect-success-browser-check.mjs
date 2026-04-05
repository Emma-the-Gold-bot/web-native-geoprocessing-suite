import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4195';
const outDir = path.resolve('tmp/playwright-intersect-success');
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

async function importFile(filePath, artifactPattern) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
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

async function runIntersect(sourcePattern, overlayPattern, outputName) {
  await artifactButton(sourcePattern).click();
  await page.getByRole('button', { name: /^Intersect$/i }).click();
  await page.getByRole('heading', { name: /Intersect Operation/i }).waitFor({ state: 'visible' });

  const select = page.locator('.import-overlay select').first();
  const optionTexts = await select.locator('option').allTextContents();
  const optionIndex = optionTexts.findIndex((text) => overlayPattern.test(text));
  if (optionIndex < 0) throw new Error(`Could not find intersect overlay option matching ${overlayPattern}`);
  await select.selectOption({ index: optionIndex });

  await page.locator('.import-overlay input[type="text"]').last().fill(outputName);
  await shot(`dialog-${outputName}`);
  await page.getByRole('button', { name: /Run Intersect/i }).click();
  await page.waitForTimeout(1800);
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(/sample-parcels.*source/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);

  await importFile(path.resolve('test-data/intersect-overlay.geojson'), /intersect-overlay.*source/i);

  await artifactButton(/sample-parcels.*source/i).click();
  await reprojectSelected('intersect_source_3857');
  await artifactButton(/intersect-overlay.*source/i).click();
  await reprojectSelected('intersect_overlay_3857');

  await runIntersect(/intersect_source_3857.*derived/i, /intersect_overlay_3857/i, 'intersect_success_output');
  const bodyAfterSuccess = await statusText();
  const successCreated = bodyAfterSuccess.includes('Intersect created: intersect_success_output');
  const mentionsSourceOnly = bodyAfterSuccess.includes('Source attributes were preserved; overlay attributes are not merged in v1.');
  const derivedVisible = await artifactButton(/intersect_success_output.*derived/i).isVisible().catch(() => false);
  await shot('01-intersect-success-created');

  await artifactButton(/intersect_success_output.*derived/i).click();
  const successDetails = await statusText();
  const hasHistorySummary = successDetails.includes('Intersect intersect_source_3857 with intersect_overlay_3857 → intersect_success_output');
  const hasOverlayLineage = successDetails.includes('Overlay Artifact Name') && successDetails.includes('intersect_overlay_3857');
  const hasSourceOnlySemantics = successDetails.includes('Output Attribute Semantics') && successDetails.includes('source-only');
  await shot('02-intersect-success-details');

  await importFile(path.resolve('test-data/disjoint-west-polygon.geojson'), /disjoint-west-polygon.*source/i);
  await artifactButton(/disjoint-west-polygon.*source/i).click();
  await reprojectSelected('intersect_empty_source_3857');

  await importFile(path.resolve('test-data/disjoint-east-polygon.geojson'), /disjoint-east-polygon.*source/i);
  await artifactButton(/disjoint-east-polygon.*source/i).click();
  await reprojectSelected('intersect_empty_overlay_3857');

  await runIntersect(/intersect_empty_source_3857.*derived/i, /intersect_empty_overlay_3857/i, 'intersect_empty_output');
  const bodyAfterEmpty = await statusText();
  const emptyCreated = bodyAfterEmpty.includes('Intersect created: intersect_empty_output');
  const emptyArtifactVisible = await artifactButton(/intersect_empty_output.*derived/i).isVisible().catch(() => false);
  const emptyResultMention = bodyAfterEmpty.toLowerCase().includes('no overlapping area was found') || bodyAfterEmpty.toLowerCase().includes('intentionally empty');
  await shot('03-intersect-empty-created');

  const report = {
    verdict: successCreated && mentionsSourceOnly && derivedVisible && hasHistorySummary && hasOverlayLineage && hasSourceOnlySemantics && emptyCreated && emptyArtifactVisible && emptyResultMention ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      successCreated,
      mentionsSourceOnly,
      derivedVisible,
      hasHistorySummary,
      hasOverlayLineage,
      hasSourceOnlySemantics,
      emptyCreated,
      emptyArtifactVisible,
      emptyResultMention,
    },
    screenshots: [
      path.join(outDir, 'dialog-intersect_success_output.png'),
      path.join(outDir, '01-intersect-success-created.png'),
      path.join(outDir, '02-intersect-success-details.png'),
      path.join(outDir, '03-intersect-empty-created.png'),
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
