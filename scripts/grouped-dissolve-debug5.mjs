import fs from 'node:fs/promises';
import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = (process.env.APP_URL || 'http://127.0.0.1:4196') + '?debugDisableAutoFit=1&debugLogMapSync=1';
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

async function resetBrowserProjectState() {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
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

  console.log('STEP 1: Import');
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await page.waitForTimeout(1000);

  console.log('STEP 2: Reproject');
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('gd_3857');
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(/gd_3857.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Capture console at this point
  const preDissolveConsoleLen = consoleMessages.length;

  console.log('STEP 3: Grouped dissolve on projected');
  await selectArtifact(/gd_3857.*derived/i);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible' });
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('gd_result');
  await page.waitForTimeout(500);

  // Add a console.log right before running, and inject monitoring
  await page.evaluate(() => {
    window.__crashMonitor = { lastLog: Date.now(), logs: [] };
    const origLog = console.log;
    console.log = function(...args) {
      window.__crashMonitor.lastLog = Date.now();
      window.__crashMonitor.logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      if (window.__crashMonitor.logs.length > 100) window.__crashMonitor.logs.shift();
      origLog.apply(console, args);
    };
  });

  console.log('STEP 4: Run');
  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Run button not found');
    console.log('[MONITOR] About to click Run Grouped Dissolve');
    setTimeout(() => {
      console.log('[MONITOR] Clicking Run Grouped Dissolve');
      runButton.click();
      console.log('[MONITOR] Click dispatched');
    }, 0);
    return true;
  });

  // Poll for crash in small increments
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const state = await page.evaluate(() => {
      try {
        return {
          alive: true,
          logs: window.__crashMonitor?.logs?.slice(-5) ?? [],
          artifactCount: document.querySelectorAll('.artifact-list button').length,
        };
      } catch (e) {
        return { alive: false, error: String(e) };
      }
    }).catch((err) => ({ alive: false, error: String(err) }));

    if (i % 5 === 0) console.log(`POLL ${i}:`, JSON.stringify(state));
    if (!state.alive) {
      console.log(`CRASH at poll ${i}:`, state.error);
      break;
    }
  }

  // Final check
  const finalState = await page.evaluate(() => {
    try {
      return {
        alive: true,
        title: document.title,
        bodyLen: document.body?.innerHTML?.length ?? 0,
        lastLogs: window.__crashMonitor?.logs?.slice(-10) ?? [],
      };
    } catch (e) {
      return { alive: false, error: String(e) };
    }
  }).catch((err) => ({ alive: false, error: String(err) }));
  console.log('FINAL:', JSON.stringify(finalState, null, 2));

  // Also dump the pre-crash console
  const postDissolveConsole = consoleMessages.slice(preDissolveConsoleLen);
  console.log('POST_DISSOLVE_CONSOLE:');
  for (const msg of postDissolveConsole.slice(-15)) {
    console.log(`  [${msg.type}] ${msg.text}`);
  }
} catch (error) {
  console.error('FATAL:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
