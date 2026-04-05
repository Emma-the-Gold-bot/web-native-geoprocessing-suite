#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const fixturePath = process.env.FIXTURE_PATH || path.resolve('test-data/example.parquet');
const outDir = process.env.PW_OUT_DIR || path.resolve('tmp/playwright');
const headless = process.env.HEADLESS !== 'false';
const artifactName = 'example';
const derivedName = 'example_smoke_result';

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless });
const page = await browser.newPage();
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

const mark = (name) => console.log(`stage: ${name}`);
const screenshot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};
const expectVisible = async (locator, timeout = 10000) => {
  await locator.waitFor({ state: 'visible', timeout });
};

try {
  mark('goto');
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page.getByText('Web-native Geoprocessing Suite'));

  mark('upload fixture');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);

  mark('wait for import review');
  await expectVisible(page.getByText(/Import review/i), 15000);
  await expectVisible(page.getByText(/example.parquet/i));
  await screenshot('01-import-review');

  mark('confirm import');
  await page.getByRole('button', { name: /Import into workspace/i }).click();

  mark('wait for source artifact');
  await expectVisible(page.locator('.left-rail').getByText(/Imported example/i), 20000);
  await expectVisible(page.getByRole('button', { name: new RegExp(`${artifactName}.*source`, 'i') }), 10000);
  await screenshot('02-source-imported');

  mark('check table state');
  await page.getByRole('button', { name: /^Table$/i }).click();
  await expectVisible(page.locator('table'));

  mark('run sql');
  await page.getByRole('button', { name: /^SQL$/i }).click();
  const sqlEditor = page.locator('textarea');
  await expectVisible(sqlEditor);
  await sqlEditor.fill('SELECT * FROM example LIMIT 5');
  await page.getByRole('button', { name: /Run query/i }).click();

  mark('wait for results preview');
  await page.getByRole('button', { name: /^Results$/i }).click();
  await expectVisible(page.getByText(/Result preview/i), 15000);
  await expectVisible(page.getByText(/This is still a preview/i));
  await screenshot('03-results-preview');

  mark('materialize');
  await page.getByRole('button', { name: /Materialize result/i }).click();
  await expectVisible(page.getByText(/Name your derived artifact/i));
  const nameInput = page.getByRole('textbox');
  await nameInput.fill(derivedName);
  await page.getByRole('button', { name: /Confirm & Create/i }).click();

  mark('wait for derived artifact');
  await expectVisible(page.getByText(new RegExp(`Created derived artifact ${derivedName}`, 'i')), 20000);
  await expectVisible(page.getByRole('button', { name: new RegExp(`${derivedName}.*derived`, 'i') }), 10000);
  await screenshot('04-derived-created');

  mark('history visible');
  await expectVisible(page.locator('.right-panel strong').getByText(/Materialized query result/i));
  await screenshot('05-history');

  const mapState = await page.evaluate(() => {
    const hasCanvas = document.querySelectorAll('.map-container canvas').length > 0;
    const overlayCards = [...document.querySelectorAll('.main-pane > div[style*="position: absolute"] .card')];
    const overlay = overlayCards.find((card) => {
      const text = card.textContent || '';
      return text.includes('Map pane') || text.includes('Map unavailable');
    });
    const overlayText = overlay?.textContent || '';
    const overlayTitle = overlayText.includes('Map unavailable') ? 'Map unavailable' : overlayText.includes('Map pane') ? 'Map pane' : null;
    const state = overlayTitle === 'Map unavailable'
      ? 'map-unavailable'
      : overlayTitle === 'Map pane'
        ? 'empty-state'
        : hasCanvas
          ? 'rendering'
          : 'no-canvas';
    return { hasCanvas, overlayTitle, state };
  });

  if (mapState.state !== 'rendering') {
    throw new Error(`Expected renderable map after GeoParquet import flow, got ${mapState.state}`);
  }

  const report = {
    verdict: 'PASS',
    appUrl,
    fixturePath,
    artifactName,
    derivedName,
    mapState,
    screenshots: [
      path.join(outDir, '01-import-review.png'),
      path.join(outDir, '02-source-imported.png'),
      path.join(outDir, '03-results-preview.png'),
      path.join(outDir, '04-derived-created.png'),
      path.join(outDir, '05-history.png'),
    ],
    notes: [
      'Verified import review, source artifact creation, table visibility, SQL results preview, derived artifact creation, and history visibility.',
      'Map rendering is only indirectly asserted through successful import/materialization shell state; visual geometry fidelity still benefits from human screenshot review.',
    ],
  };

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'), 'utf8');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await screenshot('failure').catch(() => {});
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'), 'utf8').catch(() => {});
  console.error(`Smoke test failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
