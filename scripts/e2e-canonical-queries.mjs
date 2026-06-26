/**
 * E2E Canonical Queries Test Suite
 *
 * Exercises 5 canonical NL queries through the full pipeline:
 *   import → NL query → plan → execute → result on map
 *
 * Each query is tested sequentially. Screenshots are saved to e2e-screenshots/.
 * Results are saved to e2e-screenshots/canonical-results.json.
 *
 * NOTE: This script may have failures — it tests real execution which may have bugs.
 *       Document findings below.
 *
 * Prerequisites:
 *   - Build with `npm run build`
 *   - Start preview server: `npx vite preview --port 4173` (or http://localhost:4173)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4173';
const OUT_DIR = resolve(__dirname, '..', 'e2e-screenshots');
const DATA_DIR = resolve(__dirname, '..', 'data', 'test-datasets');

const PARCELS_PATH = join(DATA_DIR, 'parcels.geojson');
const FLOODZONE_PATH = join(DATA_DIR, 'floodzone.geojson');
const OWNERSHIP_PATH = join(DATA_DIR, 'ownership.csv');

mkdirSync(OUT_DIR, { recursive: true });

const results = [];

function record(query, pass, detail = '') {
  results.push({ query, pass, detail });
  console.log(`${pass ? '✅' : '❌'} [${query}] ${detail || (pass ? 'OK' : 'FAIL')}`);
}

async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function importFile(page, filePath, expectPattern) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);
  // Wait for import review dialog
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  // Click Import into workspace
  const importBtn = page.getByRole('button', { name: /Import into workspace/i });
  await importBtn.click().catch(() => {});
  await sleep(2000);
}

async function typeNLQuery(page, query) {
  const cmdInput = page.locator('input.command-bar-input, input[placeholder*="SQL"], input[placeholder*="WHERE"]').first();
  await cmdInput.click();
  await cmdInput.fill(query);
  await cmdInput.press('Enter');
  await sleep(2000);
}

async function getPlanContent(page) {
  // Look for plan text in bottom sheet or panel
  const possiblePlanSelectors = [
    '.plan-panel',
    '.bottom-sheet',
    '.nl-plan',
    '.plan-preview',
    '[class*="plan"]',
  ];
  for (const sel of possiblePlanSelectors) {
    const el = page.locator(sel).first();
    const count = await el.count();
    if (count > 0) {
      const text = await el.textContent().catch(() => '');
      if (text && text.length > 5) return text;
    }
  }
  // Fallback: get body text and search for plan-like content
  const bodyText = await page.locator('body').textContent();
  return bodyText || '';
}

async function findAndClickExecute(page) {
  // Look for Execute/Confirm/Run button in plan area
  const execBtns = [
    page.getByRole('button', { name: /Execute/i }),
    page.getByRole('button', { name: /^Run$/i }),
    page.getByRole('button', { name: /Confirm/i }),
  ];
  for (const btn of execBtns) {
    const count = await btn.count();
    if (count > 0) {
      await btn.first().click().catch(() => {});
      await sleep(2500);
      return true;
    }
  }
  return false;
}

async function getArtifactCount(page) {
  try {
    return await page.locator('.artifact-list .card, .artifact-list button').count();
  } catch {
    return 0;
  }
}

async function getSelectedArtifactDetails(page) {
  try {
    return await page.locator('.right-panel, .artifact-details').first().textContent().catch(() => '');
  } catch {
    return '';
  }
}

const QUERIES = [
  {
    name: 'buffer-parcels-500ft',
    description: 'buffer parcels 500 feet',
    datasets: ['parcels'],
    expected: {
      operation: 'buffer',
      params: { distance: 500, distance_unit: 'feet' }
    }
  },
  {
    name: 'intersect-parcels-floodzone',
    description: 'intersect parcels with floodzone',
    datasets: ['parcels', 'floodzone'],
    expected: {
      operation: 'intersect'
    }
  },
  {
    name: 'dissolve-parcels-by-zone',
    description: 'dissolve parcels by zone',
    datasets: ['parcels'],
    expected: {
      operation: 'dissolve-grouped',
      params: { grouping_field: 'zone' }
    }
  },
  {
    name: 'join-ownership-to-parcels',
    description: 'join ownership to parcels by APN',
    datasets: ['parcels', 'ownership'],
    expected: {
      operation: 'attribute-join'
    }
  },
  {
    name: 'reproject-parcels-to-epsg32610',
    description: 'reproject parcels to EPSG 32610',
    datasets: ['parcels'],
    expected: {
      operation: 'reproject',
      params: { target_crs: 'EPSG:32610' }
    }
  }
];

async function main() {
  console.log('🚀 Starting E2E Canonical Queries Test Suite\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  try {
    // Navigate to app
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    await shot(page, '00-initial-load');

    for (const query of QUERIES) {
      console.log(`\n--- Query: "${query.description}" ---`);

      // Clear state for each query by reloading
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(1500);

      let importSucceeded = true;

      // Import required datasets
      for (const ds of query.datasets) {
        let filePath;
        if (ds === 'parcels') filePath = PARCELS_PATH;
        else if (ds === 'floodzone') filePath = FLOODZONE_PATH;
        else if (ds === 'ownership') filePath = OWNERSHIP_PATH;
        else {
          console.log(`  SKIP unknown dataset: ${ds}`);
          continue;
        }

        try {
          await importFile(page, filePath);
          console.log(`  Imported: ${ds} (${filePath})`);
        } catch (err) {
          console.log(`  FAIL import ${ds}: ${err.message}`);
          importSucceeded = false;
        }
      }

      await shot(page, `01-${query.name}-after-import`);

      if (!importSucceeded) {
        record(query.description, false, 'Import failed');
        continue;
      }

      const artifactCountBefore = await getArtifactCount(page);

      // Type NL query
      try {
        await typeNLQuery(page, query.description);
        console.log(`  Typed query: "${query.description}"`);
      } catch (err) {
        record(query.description, false, `Failed to type query: ${err.message}`);
        continue;
      }

      await shot(page, `02-${query.name}-after-query`);

      // Get plan content
      const planText = await getPlanContent(page);
      const planLower = planText.toLowerCase();

      // Check for expected operation in plan
      const hasOperation = planLower.includes(query.expected.operation.toLowerCase());
      record(query.description, hasOperation,
        hasOperation
          ? `Plan contains operation "${query.expected.operation}"`
          : `Plan missing operation "${query.expected.operation}" — plan text: "${planText.slice(0, 200).trim()}"`
      );

      // Check expected parameters if specified
      if (query.expected.params) {
        for (const [key, value] of Object.entries(query.expected.params)) {
          const hasParam = planLower.includes(String(key).toLowerCase()) &&
            planLower.includes(String(value).toLowerCase());
          if (!hasParam) {
            record(query.description, false, `Plan missing param ${key}=${value}`);
          }
        }
      }

      await shot(page, `03-${query.name}-plan`);

      // Try to execute
      let executed = false;
      try {
        executed = await findAndClickExecute(page);
        if (executed) {
          console.log(`  Clicked Execute`);
        } else {
          console.log(`  No Execute button found (may auto-execute)`);
        }
      } catch (err) {
        console.log(`  FAIL execute: ${err.message}`);
      }

      await sleep(2000);
      await shot(page, `04-${query.name}-after-execute`);

      // Check for result on map or in artifacts
      const artifactCountAfter = await getArtifactCount(page);
      const detailsText = await getSelectedArtifactDetails(page);
      const hasNewArtifact = artifactCountAfter >= artifactCountBefore + 1;

      if (hasNewArtifact) {
        record(query.description, true, `New artifact created (${artifactCountBefore} → ${artifactCountAfter})`);
      } else {
        record(query.description, false, `No new artifact (before: ${artifactCountBefore}, after: ${artifactCountAfter})`);
      }

      await shot(page, `05-${query.name}-final`);
    }

    // Final summary
    await shot(page, '99-final-state');
    writeFileSync(join(OUT_DIR, 'console-errors.txt'), consoleErrors.join('\n'));

  } catch (err) {
    console.error('Fatal error:', err.message);
    record('SUITE', false, `Fatal: ${err.message}`);
    await shot(page, '99-fatal-error').catch(() => {});
  } finally {
    await browser.close();
  }

  // Write results
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`E2E CANONICAL QUERIES: ${passed}/${total} passed, ${failed}/${total} failed`);
  console.log(`${'='.repeat(60)}`);

  const resultsObj = {
    timestamp: new Date().toISOString(),
    appUrl: BASE,
    passed,
    failed,
    total,
    results,
    consoleErrorCount: consoleErrors.length
  };
  writeFileSync(join(OUT_DIR, 'canonical-results.json'), JSON.stringify(resultsObj, null, 2));

  // Don't exit with error code — failures are expected, document them
  console.log('\n📸 Screenshots saved to e2e-screenshots/');
  console.log('📋 Results saved to e2e-screenshots/canonical-results.json');
}

main().catch(err => {
  console.error('Unhandled:', err);
  process.exit(2);
});
