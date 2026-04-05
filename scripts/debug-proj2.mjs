import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));
page.on('response', response => {
  if (response.url().includes('proj.db')) {
    console.log('PROJ.DB FETCH:', response.url(), 'status:', response.status(), 'size:', response.headers()['content-length']);
  }
});

const consoleMessages = [];

try {
  await page.goto('http://localhost:4180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  console.log('\n=== NETWORK RESPONSES FOR PROJ.DB ===');
  
} catch (error) {
  console.error('Error:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
