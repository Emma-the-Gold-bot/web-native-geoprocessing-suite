import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4177';
const outDir = path.resolve('tmp/playwright-operation-validations');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });
  await page.waitForTimeout(2000);

  const result = await page.evaluate(async () => {
    const api = window.geoValidation;
    if (!api?.runOperationValidationBuckets || !api?.runOperationValidations) {
      return {
        error: 'window.geoValidation.runOperationValidationBuckets is not available in the app runtime',
        results: [],
        buckets: [],
        projValidation: null,
      };
    }

    const buckets = await api.runOperationValidationBuckets();
    const results = await api.runOperationValidations();
    let projValidation = null;
    try {
      projValidation = api.runProjValidation ? await api.runProjValidation() : { error: 'runProjValidation unavailable' };
    } catch (e) {
      projValidation = { error: String(e) };
    }
    return { results, buckets, projValidation };
  });

  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ verdict: result.results.every(r => r.passed) ? 'PASS' : 'FAIL', buckets: result.buckets, results: result.results, projValidation: result.projValidation }, null, 2));
  if (!result.results.every(r => r.passed)) process.exitCode = 1;
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'));
  await browser.close();
}
