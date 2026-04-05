import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];

page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => pageErrors.push(String(err)));

try {
  const response = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  const result = {
    status: response?.status() ?? null,
    coop: response?.headers()['cross-origin-opener-policy'] ?? null,
    coep: response?.headers()['cross-origin-embedder-policy'] ?? null,
    crossOriginIsolated: await page.evaluate(() => self.crossOriginIsolated === true),
    sharedArrayBufferAvailable: await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined'),
    consoleMessages,
    pageErrors,
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
