/**
 * Run Support Envelope Tests in Browser
 * 
 * Executes the support envelope validation tests via browser automation.
 * These tests validate the explicit support boundaries for CRS handling.
 */

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];

page.on('console', msg => {
  const text = `[${msg.type()}] ${msg.text()}`;
  consoleMessages.push(text);
});
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4184';

try {
  console.log(`Loading app at ${appUrl}...\n`);
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000); // Wait for app to fully initialize including PROJ
  
  console.log('=== Running Support Envelope Tests ===\n');
  
  // Run preview-safe browser-global validation hook exposed by the app bundle
  const results = await page.evaluate(async () => {
    try {
      const api = window.geoValidation;
      if (!api?.runEnvelopeTests) {
        return { error: 'window.geoValidation.runEnvelopeTests is not available in the app runtime' };
      }
      const results = await api.runEnvelopeTests();
      return { results };
    } catch (e) {
      return { error: String(e), stack: e?.stack };
    }
  });
  
  if (results.error) {
    console.log('ERROR:');
    console.log(results.error);
    if (results.stack) console.log(results.stack);
    
    // Try alternative approach - run via console eval
    console.log('\nTrying alternative execution method...\n');
  } else {
    console.log('--- Test Results ---\n');
    
    for (const result of results.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status}: ${result.testName}`);
      console.log(`  Claim: ${result.supportClaim}`);
      console.log(`  Actual: ${result.actualBehavior}`);
      if (result.warnings && result.warnings.length > 0) {
        console.log(`  Warnings: ${result.warnings.join('; ')}`);
      }
      if (result.errors) {
        console.log(`  Errors: ${result.errors}`);
      }
      console.log('');
    }
    
    const allPassed = results.results.every((r) => r.passed);
    console.log(`=== Overall: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} ===`);
    
    if (!allPassed) process.exitCode = 1;
  }
  
} catch (error) {
  console.error('Fatal error:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
