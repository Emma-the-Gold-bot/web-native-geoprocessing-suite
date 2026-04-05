import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4180';
const outDir = path.resolve('tmp/playwright-proj-debug');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

try {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Run test in browser context using the app-exposed validation globals.
  // Importing /src/... from a preview server is misleading because preview serves dist, not source modules.
  const result = await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const api = window.geoValidation;
    let projValidation = null;
    let operationResults = [];
    let error = null;

    if (!api?.runOperationValidations) {
      return {
        projValidation,
        operationResults,
        error: 'window.geoValidation.runOperationValidations unavailable',
      };
    }

    try {
      console.log('[TEST] Starting PROJ validation...');
      projValidation = api.runProjValidation ? await api.runProjValidation() : null;
      console.log('[TEST] PROJ validation result:', projValidation);
    } catch (e) {
      console.log('[TEST] PROJ validation error:', e);
      error = String(e);
    }

    try {
      console.log('[TEST] Starting operation validation...');
      operationResults = await api.runOperationValidations();
      console.log('[TEST] Operation validation results:', operationResults);
    } catch (e) {
      console.log('[TEST] Operation validation error:', e);
      error = String(e);
    }

    return {
      projValidation,
      operationResults,
      error,
    };
  });

  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, 'console.log'), consoleMessages.join('\n'));
  await browser.close();
}
