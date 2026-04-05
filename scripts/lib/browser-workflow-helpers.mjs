import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

export async function createBrowserHarness({
  appUrl,
  outDir,
  viewport = { width: 1440, height: 1100 },
  headless = true,
}) {
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport });
  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleMessages.push(`[pageerror] ${err.message}`));

  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  };

  const bodyText = async () => page.locator('body').innerText();
  const artifactButton = (pattern) => page.locator('.artifact-list').first().getByRole('button', { name: pattern });

  async function gotoApp() {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible' });
  }

  async function importSample() {
    await page.getByRole('button', { name: /Load sample/i }).click();
    await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Import into workspace/i }).click();
    await artifactButton(/sample-parcels.*source/i).waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1200);
  }

  async function selectArtifact(pattern) {
    await artifactButton(pattern).click();
    await page.waitForTimeout(800);
  }

  async function runQuery(sql) {
    await page.getByRole('button', { name: /^SQL$/i }).click();
    await page.waitForTimeout(300);
    await page.locator('textarea').fill(sql);
    await page.getByRole('button', { name: /Run query/i }).click();
    await page.getByText(/Result preview/i).waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);
  }

  async function materializeCurrentResult(name) {
    await page.getByRole('button', { name: /Materialize result/i }).click();
    await page.getByText(/Name your derived artifact/i).waitFor({ state: 'visible' });
    await page.getByRole('textbox').fill(name);
    await page.getByRole('button', { name: /Confirm & Create/i }).click();
    await artifactButton(new RegExp(`${escapeRegex(name)}.*derived`, 'i')).waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1000);
  }

  async function saveProject(name) {
    await page.getByRole('button', { name: /Save Project/i }).click();
    await page.getByRole('heading', { name: /Save Project/i }).waitFor({ state: 'visible' });
    await page.locator('input[placeholder="Project name..."]').fill(name);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(/saved successfully/i).waitFor({ state: 'visible', timeout: 10000 });
  }

  async function resetWorkspaceWithNewProject() {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /^New$/i }).click();
    await page.getByText(/New project created/i).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(800);
  }

  async function openSavedProject() {
    await page.getByRole('button', { name: /Open Project/i }).click();
    await page.getByText(/loaded successfully/i).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1500);
  }

  async function expectDownload(action) {
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).then((download) => download.path());
    await action();
    return await downloadPromise;
  }

  async function openExportMenu() {
    await page.getByRole('button', { name: /Export/i }).click();
    await page.waitForTimeout(300);
  }

  return {
    browser,
    page,
    consoleMessages,
    shot,
    bodyText,
    artifactButton,
    gotoApp,
    importSample,
    selectArtifact,
    runQuery,
    materializeCurrentResult,
    saveProject,
    resetWorkspaceWithNewProject,
    openSavedProject,
    expectDownload,
    openExportMenu,
  };
}

export function extractDetailRowsFromText(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
