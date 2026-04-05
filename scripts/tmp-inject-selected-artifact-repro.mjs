import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4196';
const fixturePath = path.resolve(process.env.FIXTURE || 'tmp/grouped-dissolve-stepped-3857.geojson');
const selectInjected = process.env.SELECT_INJECTED !== '0';

const geojson = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const artifactId = 'artifact-injected-3857';
const project = {
  version: '1.0',
  name: 'Injected repro',
  artifacts: [{
    id: artifactId,
    name: 'injected_3857',
    kind: 'derived',
    outputKind: 'spatial-artifact',
    format: 'Injected fixture',
    spatial: true,
    geometryType: 'Polygon',
    rowCount: geojson.features.length,
    crs: 'EPSG:3857',
    warnings: [],
    originEventId: 'event-injected',
    inputArtifactIds: ['artifact-source'],
    tableName: 'injected_3857_table',
    data: geojson,
  }],
  history: [{
    id: 'event-injected',
    type: 'operation',
    timestamp: new Date().toISOString(),
    summary: 'Injected derived artifact',
    inputArtifactIds: ['artifact-source'],
    outputArtifactIds: [artifactId],
    warnings: [],
    details: { injected: true },
  }],
  savedQueries: [],
  selectedArtifactId: selectInjected ? artifactId : null,
  activeTab: 'table',
  savedAt: new Date().toISOString(),
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
const pageErrors = [];
let crashed = false;
page.on('console', (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  consoleMessages.push(line);
  console.log(line);
});
page.on('pageerror', (err) => {
  pageErrors.push(err.message);
  console.log('[pageerror]', err.message);
});
page.on('crash', () => {
  crashed = true;
  console.log('[crash] page crashed');
});

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate((payload) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('geoprocessing_project', JSON.stringify(payload));
  }, project);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Open Project/i }).click();
  await page.waitForTimeout(4000);
  const snapshot = await page.evaluate(() => ({
    bodySnippet: document.body?.innerText?.slice(0, 400) ?? '',
    artifactButtons: Array.from(document.querySelectorAll('.artifact-list button')).map((button) => button.textContent?.replace(/\s+/g, ' ').trim()),
    selectedLabel: document.querySelector('.artifact-list > button.card.selected strong')?.textContent ?? null,
  })).catch((error) => ({ evalError: error?.message || String(error) }));
  console.log('snapshot', JSON.stringify(snapshot));
  console.log('summary', JSON.stringify({ selectInjected, crashed, pageErrors, consoleTail: consoleMessages.slice(-40) }, null, 2));
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
