import { chromium } from 'playwright';
import path from 'node:path';
const appUrl='http://127.0.0.1:4198';
const fixture=path.resolve('test-data/grouped-dissolve-input.geojson');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('console', msg=>console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err=>console.log('[pageerror]', err.message));
const artifactButton=(pattern)=>page.locator('.artifact-list').first().getByRole('button', {name: pattern});
const bodyText=()=>page.locator('body').innerText();
try {
 await page.goto(appUrl,{waitUntil:'domcontentloaded'});
 await page.getByText('Web-native Geoprocessing Suite').waitFor();
 await page.locator('input[type="file"]').setInputFiles(fixture);
 await page.getByRole('heading', {name:/Import review/i}).waitFor();
 await page.getByRole('button', {name:/Import into workspace/i}).click();
 await artifactButton(/grouped-dissolve-input.*source/i).waitFor({state:'visible',timeout:20000});
 await artifactButton(/grouped-dissolve-input.*source/i).click();
 await page.getByRole('button',{name:/^Reproject$/i}).click();
 await page.getByRole('heading',{name:/Reproject \/ Transform/i}).waitFor();
 const selects=page.locator('.import-overlay select');
 await selects.nth(0).selectOption('EPSG:4326');
 await selects.nth(1).selectOption('EPSG:3857');
 await page.locator('.import-overlay input[type="text"]').last().fill('grouped_dissolve_input_3857');
 await page.getByRole('button',{name:/^Reproject$/i}).last().click({noWaitAfter:true});
 await artifactButton(/grouped_dissolve_input_3857.*derived/i).waitFor({state:'visible',timeout:20000});
 await artifactButton(/grouped_dissolve_input_3857.*derived/i).click();
 await page.getByRole('button',{name:/^Grouped Dissolve$/i}).click();
 await page.getByRole('heading',{name:/^Grouped Dissolve Operation$/i}).waitFor();
 const overlay=page.locator('.import-overlay');
 await overlay.locator('select').first().selectOption('zone');
 await overlay.locator('input[type="text"]').last().fill('grouped_dissolve_result');
 await page.evaluate(() => {
   const runButton = [...document.querySelectorAll('button')].find((btn) => /Run Grouped Dissolve/i.test(btn.textContent || ''));
   if (!runButton) throw new Error('button missing');
   runButton.click();
 });
 for (let i=0;i<15;i++) {
   await page.waitForTimeout(1000);
   const snippets=(await bodyText()).split('\n').filter(l=>/Grouped dissolve|grouped_dissolve_result|zone|failed|created/.test(l)).slice(0,20);
   const buttons=await page.locator('.artifact-list').first().getByRole('button').allTextContents();
   console.log('tick',i,'snippets=',snippets,'buttons=',buttons);
 }
} finally { await browser.close(); }
