import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4181';

try {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  console.log('=== Running focused operation validation ===\n');
  
  // Click the "Run Focused In-Browser Validation" button
  const validationButton = await page.locator('button:has-text("Run Focused In-Browser Validation")');
  if (await validationButton.isVisible()) {
    await validationButton.click();
    console.log('Clicked validation button');
    await page.waitForTimeout(15000); // Wait for validation to complete
  }
  
  // Get validation results
  const results = await page.evaluate(() => {
    // Find the validation panel
    const panel = document.querySelector('.validation-panel, .panel');
    if (!panel) return { error: 'No panel found' };
    
    // Try to find results
    const pre = panel.querySelector('pre');
    if (pre) return { content: pre.textContent };
    
    // Get all text content
    return { content: panel.innerText };
  });
  
  console.log('\n=== VALIDATION RESULTS ===\n');
  console.log(results.content || results.error);
  
  // Also check console for specific pass/fail
  console.log('\n=== CONSOLE SUMMARY ===');
  for (const msg of consoleMessages) {
    if (msg.includes('PASS') || msg.includes('FAIL') || msg.includes('❌') || msg.includes('✅') || msg.includes('reproject')) {
      console.log(msg);
    }
  }
  
} catch (error) {
  console.error('Error:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
