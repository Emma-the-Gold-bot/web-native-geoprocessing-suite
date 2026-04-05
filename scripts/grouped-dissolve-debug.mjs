import fs from 'node:fs/promises';
import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4196';
const outDir = path.resolve('tmp/playwright-grouped-dissolve');
const fixturePath = path.resolve('test-data/grouped-dissolve-input.geojson');

const {
  browser,
  page,
  consoleMessages,
  shot,
  bodyText,
  artifactButton,
  gotoApp,
  selectArtifact,
} = await createBrowserHarness({ appUrl, outDir });

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resetBrowserProjectState() {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
}

async function importFixture(filePath, artifactPattern) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(artifactPattern).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

try {
  await gotoApp();
  await resetBrowserProjectState();

  // Step 1: Import the fixture (has EPSG:4326)
  console.log('STEP 1: Import fixture');
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await shot('01-imported');

  // Step 2: Reproject to 3857 (needed for honest area measurement later, and it's the typical flow)
  console.log('STEP 2: Reproject to 3857');
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('gd_input_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(/gd_input_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot('02-reprojected');

  // Step 3: Select the reprojected artifact
  console.log('STEP 3: Select reprojected');
  await selectArtifact(/gd_input_3857.*derived/i);
  await page.waitForTimeout(500);

  // Step 4: Open grouped dissolve dialog
  console.log('STEP 4: Open dialog');
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible' });
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('gd_result');
  await page.waitForTimeout(500);
  await shot('03-dialog-ready');

  // Step 5: Run grouped dissolve and immediately capture console
  console.log('STEP 5: Run dissolve');
  const preRunConsoleLen = consoleMessages.length;
  
  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run button not found');
    setTimeout(() => runButton.click(), 0);
    return true;
  });
  
  // Wait longer for post-commit
  await page.waitForTimeout(3000);
  
  const postRunConsole = consoleMessages.slice(preRunConsoleLen);
  console.log('POST_RUN_CONSOLE:');
  for (const msg of postRunConsole) {
    console.log(`  [${msg.type}] ${msg.text}`);
  }

  // Step 6: Check if page is alive
  console.log('STEP 6: Check page alive');
  const pageAlive = await page.evaluate(() => {
    return {
      title: document.title,
      bodyLength: document.body?.innerHTML?.length ?? 0,
      errorElements: document.querySelectorAll('[class*="error"]').length,
    };
  }).catch((err) => ({ error: String(err) }));
  console.log('PAGE_STATE:', JSON.stringify(pageAlive));
  
  await shot('04-post-run');

  // Step 7: Check artifact list
  console.log('STEP 7: Check artifacts');
  const artifactTexts = await page.locator('.artifact-list').first().getByRole('button').allTextContents().catch((err) => {
    console.log('ARTIFACT_LIST_ERROR:', String(err));
    return [];
  });
  console.log('ARTIFACTS:', JSON.stringify(artifactTexts));

  // Step 8: Try selecting the result
  if (artifactTexts.some(t => /gd_result/i.test(t))) {
    console.log('STEP 8: Select result');
    await selectArtifact(/gd_result/i).catch(e => console.log('SELECT_ERROR:', String(e)));
    await page.waitForTimeout(1000);
    await shot('05-result-selected');
    
    const resultText = await bodyText().catch(() => 'BODY_ERROR');
    console.log('RESULT_BODY_SAMPLE:', resultText.slice(0, 500));
  }

  console.log('DONE');
  await shot('06-done');
} catch (error) {
  await shot('failure').catch(() => {});
  console.error('FATAL:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
