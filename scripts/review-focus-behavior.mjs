#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const outDir = process.env.PW_OUT_DIR || path.resolve('tmp/playwright-focus-review');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const findings = [];
const screenshots = [];

async function shot(name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(file);
}

function note(kind, text) {
  findings.push({ kind, text });
  console.log(`${kind.toUpperCase()}: ${text}`);
}

async function existsText(rx) {
  return await page.getByText(rx).first().isVisible().catch(() => false);
}

async function focusedRowCount() {
  return await page.locator('tbody tr.focused-row').count().catch(() => 0);
}

async function focusBannerText() {
  return await page.locator('.inspection-focus-banner').textContent().catch(() => null);
}

async function tryMapClickGrid() {
  const canvas = page.locator('.maplibregl-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    return { success: false, attempts: [], reason: 'Map canvas bounding box unavailable' };
  }

  const candidateFractions = [
    [0.50, 0.50],
    [0.42, 0.48],
    [0.58, 0.48],
    [0.35, 0.55],
    [0.65, 0.55],
    [0.50, 0.38],
    [0.50, 0.62],
    [0.28, 0.50],
    [0.72, 0.50],
  ];

  const attempts = [];

  for (let index = 0; index < candidateFractions.length; index += 1) {
    const [fx, fy] = candidateFractions[index];
    const x = Math.round(box.x + box.width * fx);
    const y = Math.round(box.y + box.height * fy);

    const clearBtn = page.getByRole('button', { name: /Clear focus/i });
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(250);
    }

    await page.mouse.click(x, y);
    await page.waitForTimeout(900);

    const rowCount = await focusedRowCount();
    const banner = await focusBannerText();
    const tableTabActive = await page.getByRole('button', { name: /^Table$/i }).evaluate((el) => el.className).catch(() => '');

    const hit = rowCount > 0 || Boolean(banner);
    attempts.push({ index, x, y, rowCount, banner, tableTabActive });

    if (hit) {
      return { success: true, attempts, hit: { index, x, y, rowCount, banner } };
    }
  }

  return { success: false, attempts, reason: 'No click in candidate grid produced focused-row or banner state' };
}

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Web-native Geoprocessing Suite');
  await page.waitForTimeout(1200);
  await shot('00-initial');

  await page.getByRole('button', { name: /Load sample/i }).click();
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await page.getByRole('button', { name: /sample-parcels.*source/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /sample-parcels.*source/i }).click();
  await page.waitForTimeout(1800);
  await shot('01-loaded');

  // Table -> feature focus
  await page.getByRole('button', { name: /^Table$/i }).click();
  await page.waitForTimeout(500);
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  if (rowCount < 2) throw new Error(`Expected sample rows, found ${rowCount}`);

  await rows.nth(1).click();
  await page.waitForTimeout(600);
  await shot('02-row-clicked');

  if (await existsText(/Focused feature/i)) {
    note('good', 'Selecting a table row exposes focused feature detail in the right panel.');
  } else {
    note('bad', 'Focused feature detail did not appear after row selection.');
  }

  if (await page.getByRole('button', { name: /Clear focus/i }).isVisible().catch(() => false)) {
    note('good', 'Clear focus action is visible once a feature is selected.');
  } else {
    note('bad', 'Clear focus action did not appear for focused selection.');
  }

  // Map -> table focus using a candidate click grid.
  const clearBtn = page.getByRole('button', { name: /Clear focus/i });
  if (await clearBtn.isVisible().catch(() => false)) {
    await clearBtn.click();
    await page.waitForTimeout(300);
  }

  const gridResult = await tryMapClickGrid();
  await shot('03-map-click-grid');

  if (gridResult.success) {
    note('good', `Map click drives visible table focus state (hit on grid attempt ${gridResult.hit.index + 1}).`);
  } else {
    note('warn', `Map click proof remains inconclusive: ${gridResult.reason}.`);
  }

  // Clear focus behavior
  if (await clearBtn.isVisible().catch(() => false)) {
    await clearBtn.click();
    await page.waitForTimeout(500);
    await shot('04-focus-cleared');
    const stillFocused = await existsText(/Focused feature/i);
    if (!stillFocused) {
      note('good', 'Clear focus removes focused feature panel content cleanly.');
    } else {
      note('bad', 'Focused feature panel remains after clearing focus.');
    }
  }

  // Check whether selection stays coherent when switching artifacts to a tabular result
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.waitForTimeout(500);
  await page.locator('textarea').fill('SELECT id, name, category FROM sample_parcels LIMIT 3');
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Materialize result/i }).click();
  await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('textbox').fill('focus-review-tabular');
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await page.getByRole('button', { name: /focus-review-tabular.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: /focus-review-tabular.*derived/i }).click();
  await page.waitForTimeout(1000);
  await shot('05-tabular-switch');

  const clearAfterSwitch = await page.getByRole('button', { name: /Clear focus/i }).count();
  if (clearAfterSwitch === 0) {
    note('good', 'Focus clears when switching to a tabular/non-spatial artifact.');
  } else {
    note('warn', 'Clear focus remained visible after switching artifacts; worth checking state reset.');
  }

  const report = { appUrl, findings, screenshots, gridResult };
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  const bads = findings.filter(f => f.kind === 'bad').length;
  process.exitCode = bads ? 1 : 0;
} catch (error) {
  await shot('failure');
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
