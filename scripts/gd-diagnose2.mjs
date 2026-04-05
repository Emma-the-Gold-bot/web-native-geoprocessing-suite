import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4196';
const outDir = path.resolve('tmp/playwright-grouped-dissolve');
const fixturePath = path.resolve('test-data/grouped-dissolve-input.geojson');

const { browser, page, consoleMessages, shot, bodyText, artifactButton, gotoApp, selectArtifact }
  = await createBrowserHarness({ appUrl, outDir });

async function resetBrowserProjectState() {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
}

try {
  await gotoApp();
  await resetBrowserProjectState();
  
  // Wait for engine init
  console.log('Waiting for engine init...');
  await page.waitForTimeout(10000);
  
  const allConsole = consoleMessages.map(m => `[${m.type}] ${m.text}`);
  console.log('ALL_CONSOLE:');
  allConsole.forEach(m => console.log('  ' + m));
} catch (error) {
  console.error('FATAL:', error?.stack || String(error));
} finally {
  await browser.close();
}
