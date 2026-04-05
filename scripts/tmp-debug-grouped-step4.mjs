import { chromium } from 'playwright';
import path from 'node:path';
const appUrl=process.env.APP_URL || 'http://127.0.0.1:4196';
const fixture=path.resolve('test-data/grouped-dissolve-input.geojson');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('console', msg=>console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err=>console.log('[pageerror]', err.message));
const artifactButton=(pattern)=>page.locator('.artifact-list').first().getByRole('button',{name:pattern});
try {
  await page.goto(appUrl,{waitUntil:'domcontentloaded'});
  await page.getByText('Web-native Geoprocessing Suite').waitFor();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByText('Web-native Geoprocessing Suite').waitFor();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('heading',{name:/Import review/i}).waitFor();
  await page.getByRole('button',{name:/Import into workspace/i}).click();
  await artifactButton(/grouped-dissolve-input.*source/i).waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(1200);
  await artifactButton(/grouped-dissolve-input.*source/i).click();
  await page.getByRole('button',{name:/^Reproject$/i}).click();
  await page.getByRole('heading',{name:/Reproject \/ Transform/i}).waitFor();
  const selects=page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('grouped_dissolve_input_3857');
  await page.getByRole('button',{name:/^Reproject$/i}).last().click();
  await artifactButton(/grouped_dissolve_input_3857.*derived/i).waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(1200);
  await artifactButton(/grouped_dissolve_input_3857.*derived/i).click();
  await page.getByRole('button',{name:/^Grouped Dissolve$/i}).click();
  await page.getByRole('heading',{name:/^Grouped Dissolve Operation$/i}).waitFor();
  const overlay=page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('grouped_dissolve_result');
  await page.waitForTimeout(500);
  console.log('before evaluate');
  await page.locator('.import-overlay').getByRole('button', { name: /^Run Grouped Dissolve$/i }).evaluate((button) => {
    console.log('eval clicking button', button.textContent);
    button.click();
  });
  console.log('after evaluate');
  for (let i=0;i<10;i++) {
    await page.waitForTimeout(1000);
    console.log('tick', i, await page.locator('.artifact-list').first().getByRole('button').allTextContents());
  }
} catch (error) {
  console.error('STEP4_FAIL', error?.stack || String(error));
} finally { await browser.close(); }
