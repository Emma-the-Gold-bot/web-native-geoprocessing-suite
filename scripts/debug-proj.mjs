import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

try {
  await page.goto('http://localhost:4180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  // Check what's in the console
  console.log('=== CONSOLE MESSAGES ===');
  for (const msg of consoleMessages) {
    console.log(msg);
  }
  
  // Get page title and content
  const title = await page.title();
  console.log('=== PAGE INFO ===');
  console.log('Title:', title);
  
  // Check if app loaded
  const rootContent = await page.evaluate(() => document.getElementById('root')?.innerHTML?.substring(0, 500));
  console.log('Root content preview:', rootContent?.substring(0, 500));
  
} catch (error) {
  console.error('Error:', error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
