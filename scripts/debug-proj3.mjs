import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));
page.on('response', response => {
  if (response.url().includes('proj')) {
    console.log('FETCH:', response.url(), 'status:', response.status());
  }
});

try {
  await page.goto('http://localhost:4180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  console.log('\n=== CONSOLE WITH PROJ ===');
  for (const msg of consoleMessages) {
    if (msg.includes('proj') || msg.includes('PROJ')) {
      console.log(msg);
    }
  }
  
} catch (error) {
  console.error('Error:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
