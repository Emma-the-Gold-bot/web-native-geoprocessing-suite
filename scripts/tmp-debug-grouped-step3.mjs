import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const appUrl=process.env.APP_URL || 'http://127.0.0.1:4196';
const fixture=path.resolve('test-data/grouped-dissolve-input.geojson');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('console', msg=>console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err=>console.log('[pageerror]', err.message));
const artifactButton=(pattern)=>page.locator('.artifact-list').first().getByRole('button',{name:pattern});
const bodyText=()=>page.locator('body').innerText();
async function mark(name){console.log('\n===',name,'===');}
try {
  await mark('goto');
  await page.goto(appUrl,{waitUntil:'domcontentloaded'});
  await page.getByText('Web-native Geoprocessing Suite').waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByText('Web-native Geoprocessing Suite').waitFor();

  await mark('import');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('heading',{name:/Import review/i}).waitFor({timeout:15000});
  await page.getByRole('button',{name:/Import into workspace/i}).click();
  await artifactButton(/grouped-dissolve-input.*source/i).waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(1200);

  await mark('reproject');
  await artifactButton(/grouped-dissolve-input.*source/i).click();
  await page.waitForTimeout(500);
  await page.getByRole('button',{name:/^Reproject$/i}).click();
  await page.getByRole('heading',{name:/Reproject \/ Transform/i}).waitFor();
  const selects=page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill('grouped_dissolve_input_3857');
  await page.getByRole('button',{name:/^Reproject$/i}).last().click();
  await artifactButton(/grouped_dissolve_input_3857.*derived/i).waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(1200);

  await mark('open dissolve');
  await artifactButton(/grouped_dissolve_input_3857.*derived/i).click();
  await page.waitForTimeout(500);
  await page.getByRole('button',{name:/^Grouped Dissolve$/i}).click();
  await page.getByRole('heading',{name:/^Grouped Dissolve Operation$/i}).waitFor();
  const overlay=page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption('zone');
  await overlay.locator('input[type="text"]').last().fill('grouped_dissolve_result');
  await page.waitForTimeout(500);

  await mark('run dissolve');
  await page.getByRole('button',{name:/^Run Grouped Dissolve$/i}).click();
  await page.waitForTimeout(2500);
  const buttonsAfterRun = await page.locator('.artifact-list').first().getByRole('button').allTextContents();
  console.log('buttonsAfterRun', buttonsAfterRun);
  const groupedArtifactLabel = buttonsAfterRun.find((text) => /grouped_dissolve_result/i.test(text));
  console.log('groupedArtifactLabel', groupedArtifactLabel);
  const groupedArtifactPattern = new RegExp(groupedArtifactLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  await mark('details');
  await artifactButton(groupedArtifactPattern).waitFor({state:'visible',timeout:20000});
  await artifactButton(groupedArtifactPattern).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button',{name:/^Table$/i}).click();
  await page.waitForTimeout(500);
  console.log('table headers', await page.locator('.table-wrap thead th').allTextContents());
  console.log('table rows', await page.locator('.table-wrap tbody tr').count());

  await mark('sql');
  await page.getByRole('button',{name:/^SQL$/i}).click();
  await page.waitForTimeout(300);
  const sqlPaneText = await page.locator('.bottom-dock').innerText();
  const queryableTableMatches = [...sqlPaneText.matchAll(/(dissolve_grouped_v1_[a-z0-9_]+) \(derived\)/ig)].map((m)=>m[1]);
  console.log('queryableTableMatches', queryableTableMatches);
  const groupedTableName = queryableTableMatches.at(-1);
  await page.locator('textarea').fill(`SELECT zone FROM ${groupedTableName} ORDER BY zone`);
  await page.getByRole('button',{name:/Run query/i}).click();
  await page.waitForTimeout(1500);
  console.log('query done', (await bodyText()).includes('Result preview'));

  await mark('export json');
  const downloadJson = page.waitForEvent('download', { timeout: 10000 }).then((d) => d.path());
  await artifactButton(groupedArtifactPattern).click();
  await page.getByRole('button',{name:/Export/i}).click();
  await page.waitForTimeout(300);
  await page.getByRole('button',{name:/Export to JSON/i}).click();
  const exportJsonPath = await downloadJson;
  console.log('exportJsonPath', exportJsonPath);
  console.log('exportedJsonLen', JSON.parse(await fs.readFile(exportJsonPath, 'utf8')).length);

  await mark('save');
  await page.getByRole('button',{name:/Save Project/i}).click();
  await page.getByRole('heading',{name:/Save Project/i}).waitFor({timeout:10000});
  await page.locator('input[placeholder="Project name..."]').fill('Grouped Dissolve Validation');
  await page.getByRole('button',{name:'Save', exact:true}).click();
  await page.getByText(/saved successfully/i).waitFor({state:'visible',timeout:10000});
  console.log('saved ok');

  await mark('new/open');
  page.once('dialog', d => d.accept());
  await page.getByRole('button',{name:/^New$/i}).click();
  await page.getByText(/New project created/i).waitFor({state:'visible',timeout:10000});
  await page.getByRole('button',{name:/Open Project/i}).click();
  await page.getByText(/loaded successfully/i).waitFor({state:'visible',timeout:10000});
  console.log('opened ok');
} catch (error) {
  console.error('DEBUG_FAIL', error?.stack || String(error));
  await page.screenshot({path:'tmp/playwright-grouped-dissolve/debug-step3-failure.png', fullPage:true}).catch(()=>{});
} finally { await browser.close(); }
