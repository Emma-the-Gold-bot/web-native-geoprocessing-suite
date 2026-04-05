#!/usr/bin/env node
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

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
  await page.getByRole('button', { name: /Materialize result/i }).click();
  await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('textbox').fill('lineage-debug-check');
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await page.getByRole('button', { name: /lineage-debug-check.*derived/i }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: /lineage-debug-check.*derived/i }).click();
  await page.waitForTimeout(1000);

  const bodyText = await page.locator('body').textContent();
  console.log('=== BODY_HAS_DIRECT_ARTIFACT_MATCH ===');
  console.log(bodyText?.includes('Direct artifact match'));
  console.log('=== BODY_HAS_lower_direct_artifact_match ===');
  console.log(bodyText?.includes('direct artifact match'));
  console.log('=== BODY_HAS_provenance_interpretation ===');
  console.log(bodyText?.includes('Provenance interpretation'));

  const cards = await page.locator('.right-panel .card').allTextContents();
  console.log('=== RIGHT_PANEL_CARDS ===');
  cards.forEach((t, i) => {
    console.log(`--- CARD ${i} ---`);
    console.log(t);
  });

  const lineageCard = await page.locator('.right-panel .card').nth(1).textContent().catch(() => null);
  console.log('=== LINEAGE_CARD_TEXT ===');
  console.log(lineageCard);
} finally {
  await browser.close();
}
