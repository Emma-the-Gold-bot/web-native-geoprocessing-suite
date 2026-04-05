import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4175/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];

page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => pageErrors.push(String(err)));

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(7000);

  const timeoutWarnings = consoleMessages.filter((m) => m.includes('CRS engine init timed out'));
  const workerReady = consoleMessages.filter((m) => m.includes('Worker ') && m.includes('initialized: {status: ready}')).length;
  const projReady = consoleMessages.some((m) => m.includes('CRS engine ready (PROJ-WASM)'));
  const pthreads = consoleMessages.some((m) => m.includes('Worker mode: pthreads'));

  const result = {
    url,
    status: response?.status() ?? null,
    headers: {
      coop: response?.headers()['cross-origin-opener-policy'] ?? null,
      coep: response?.headers()['cross-origin-embedder-policy'] ?? null,
    },
    crossOriginIsolated: await page.evaluate(() => self.crossOriginIsolated === true),
    sharedArrayBufferAvailable: await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined'),
    workerReadyCount: workerReady,
    projReady,
    pthreads,
    timeoutWarnings,
    consoleMessages,
    pageErrors,
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
