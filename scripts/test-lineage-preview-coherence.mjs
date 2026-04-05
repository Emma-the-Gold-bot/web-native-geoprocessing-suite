#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const outDir = process.env.PW_OUT_DIR || path.resolve('tmp/playwright-lineage-preview-coherence');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const findings = [];

function note(kind, text) {
  findings.push({ kind, text });
  console.log(`${kind.toUpperCase()}: ${text}`);
}

async function shot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Web-native Geoprocessing Suite');
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /sample-parcels.*source/i }).waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.locator('textarea').fill('SELECT id, name, category FROM sample_parcels LIMIT 3');
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
  await shot('01-preview');

  const previewText = await page.locator('body').textContent();
  if (previewText?.includes('Provenance strength:') && (previewText.includes('Direct artifact match') || previewText.includes('direct artifact match'))) {
    note('good', 'Result preview shows explicit provenance-strength classification.');
  } else {
    note('bad', 'Result preview does not show explicit provenance-strength classification.');
  }

  if (previewText?.includes('All referenced tables mapped directly to workspace artifacts.')) {
    note('good', 'Result preview shows aligned human-readable direct-match explanation.');
  } else {
    note('bad', 'Result preview is missing the direct-match explanation text.');
  }

  if (previewText?.includes('This preview uses the same provenance-strength, output-kind, and persisted-artifact vocabulary that will be recorded if you materialize it.')) {
    note('good', 'Result preview explicitly promises vocabulary continuity into materialization.');
  } else {
    note('bad', 'Result preview is missing the continuity statement.');
  }

  await page.getByRole('button', { name: /Materialize result/i }).click();
  await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('textbox').fill('lineage-coherence-check');
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await page.getByRole('button', { name: /lineage-coherence-check.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });
  await shot('02-materialized');

  await page.getByRole('button', { name: /lineage-coherence-check.*derived/i }).click();
  await page.waitForTimeout(700);
  const lineagePanelText = await page.locator('body').textContent();

  if (lineagePanelText?.includes('Provenance interpretation') && lineagePanelText.includes('Direct artifact match')) {
    note('good', 'Derived artifact lineage panel preserves the same provenance-strength classification.');
  } else {
    note('bad', 'Derived artifact lineage panel does not show the expected provenance-strength classification.');
  }

  await page.getByRole('button', { name: /Materialized query result/i }).first().click().catch(() => null);
  await page.waitForTimeout(500);
  await shot('03-history');

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify({ appUrl, findings }, null, 2));
  process.exitCode = findings.some((f) => f.kind === 'bad') ? 1 : 0;
} catch (error) {
  await shot('failure');
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
