import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];

page.on('console', (msg) => {
  consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  pageErrors.push(String(err));
});

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const coop = response?.headers()['cross-origin-opener-policy'] ?? null;
  const coep = response?.headers()['cross-origin-embedder-policy'] ?? null;
  const sab = await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined');
  const isolated = await page.evaluate(() => self.crossOriginIsolated === true);
  const bodyText = await page.locator('body').innerText();

  const out = {
    url,
    status: response?.status() ?? null,
    headers: { coop, coep },
    sharedArrayBufferAvailable: sab,
    crossOriginIsolated: isolated,
    bodySnippet: bodyText.slice(0, 500),
    consoleMessages,
    pageErrors,
  };

  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  await page.screenshot({ path: '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/tmp/proj-runtime-failure.png', fullPage: true });
  throw err;
} finally {
  await browser.close();
}
