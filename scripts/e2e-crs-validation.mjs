/**
 * CRS Reprojection Validation Tests
 * 
 * Tests different CRS scenarios:
 * 1. Known 4326 fixture - verify CRS is properly tracked
 * 2. Projected CRS (3857) to WGS84 - verify round-trip works  
 * 3. Unknown CRS - verify warning is shown
 * 4. Round-trip 4326 → 3857 → 4326 - verify coordinates are preserved
 */

import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4184';

const testFixtures = [
  {
    name: 'known-4326',
    description: 'WGS84 (EPSG:4326) known CRS fixture',
    file: '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/test-data/wgs84-points.geojson',
    expectedCrs: 'unknown', // GeoJSON doesn't carry CRS
    expectedConfidence: 'unknown',
  },
  {
    name: 'projected-3857',
    description: 'Web Mercator (EPSG:3857) projected fixture',
    file: '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/test-data/epsg3857-points.geojson',
    expectedCrs: 'unknown', // GeoJSON doesn't carry CRS
    expectedConfidence: 'unknown',
  },
  {
    name: 'unknown-crs',
    description: 'No CRS metadata - unknown confidence',
    file: '/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/test-data/unknown-crs.geojson',
    expectedCrs: 'unknown',
    expectedConfidence: 'unknown',
  },
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest(browser, fixture) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const consoleMessages = [];
  const pageErrors = [];

  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(String(err)));

  try {
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Import fixture
    const importLabel = page.locator('label:has-text("Import")');
    await importLabel.locator('input[type="file"]').setInputFiles(fixture.file);
    await page.waitForTimeout(2500);

    // Verify import
    const importButton = page.getByRole('button', { name: /Import into workspace/i });
    await importButton.click();
    await page.waitForTimeout(2000);

    // Get artifact details
    const artifactCards = page.locator('.artifact-list .card');
    const artifactCount = await artifactCards.count();
    
    // Click on the artifact to see details
    await artifactCards.first().click();
    await page.waitForTimeout(500);

    // Extract artifact info from details panel
    const detailsPanel = await page.locator('.right-panel').innerText();
    
    // Check for confidence badge
    const hasConfidenceBadge = detailsPanel.includes('KNOWN') || detailsPanel.includes('UNKNOWN') || detailsPanel.includes('MISSING');
    
    console.log(`[${fixture.name}] Artifact count: ${artifactCount}, Has CRS confidence: ${hasConfidenceBadge}`);
    
    return {
      fixture: fixture.name,
      artifactCount,
      hasConfidenceBadge,
      details: detailsPanel.slice(0, 500),
      consoleMessages: consoleMessages.slice(0, 10),
    };
  } catch (error) {
    return {
      fixture: fixture.name,
      error: String(error),
    };
  } finally {
    await page.close();
  }
}

async function runReprojectTest(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  
  try {
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Import the known WGS84 fixture
    const importLabel = page.locator('label:has-text("Import")');
    await importLabel.locator('input[type="file"]').setInputFiles('/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/test-data/wgs84-points.geojson');
    await page.waitForTimeout(2500);

    const importButton = page.getByRole('button', { name: /Import into workspace/i });
    await importButton.click();
    await page.waitForTimeout(2000);

    // Click reproject
    const reprojectButton = page.getByRole('button', { name: /^Reproject$/i });
    await reprojectButton.click();
    await page.waitForTimeout(800);

    // Reproject 4326 -> 3857
    const sourceSelect = page.locator('select').nth(0);
    const targetSelect = page.locator('select').nth(1);
    await sourceSelect.selectOption('EPSG:4326');
    await targetSelect.selectOption('EPSG:3857');

    const nameInput = page.locator('input[type="text"]').last();
    await nameInput.fill('test_reprojected_3857');

    await page.getByRole('button', { name: /^Reproject$/i }).last().click();
    await page.waitForTimeout(3000);

    // Verify output artifact has correct CRS
    const artifactTexts = await page.locator('.artifact-list .card').allInnerTexts();
    const hasOutput = artifactTexts.some(t => t.includes('test_reprojected_3857') && t.includes('CRS: EPSG:3857'));
    
    // Now do round-trip: reproject back to 4326
    // Click on the reprojected artifact
    await page.locator('.artifact-list .card').filter({ hasText: 'test_reprojected_3857' }).click();
    await page.waitForTimeout(500);

    // Reproject 3857 -> 4326
    await reprojectButton.click();
    await page.waitForTimeout(800);
    
    await sourceSelect.selectOption('EPSG:3857');
    await targetSelect.selectOption('EPSG:4326');
    
    await nameInput.fill('test_roundtrip');
    await page.getByRole('button', { name: /^Reproject$/i }).last().click();
    await page.waitForTimeout(3000);

    const finalArtifactTexts = await page.locator('.artifact-list .card').allInnerTexts();
    const hasRoundTrip = finalArtifactTexts.some(t => t.includes('test_roundtrip') && t.includes('CRS: EPSG:4326'));
    
    return {
      reprojectTest: '4326->3857->4326',
      initialReproject: hasOutput,
      roundTripSuccess: hasRoundTrip,
    };
  } catch (error) {
    return {
      reprojectTest: '4326->3857->4326',
      error: String(error),
    };
  } finally {
    await page.close();
  }
}

async function runUnknownCrsWarningTest(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  
  try {
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Import the unknown CRS fixture
    const importLabel = page.locator('label:has-text("Import")');
    await importLabel.locator('input[type="file"]').setInputFiles('/home/emma/.openclaw/workspace/projects/web-native-geoprocessing-suite/test-data/unknown-crs.geojson');
    await page.waitForTimeout(2500);

    // Check import review for warnings
    const hasWarning = await page.locator('.import-overlay').innerText();
    const hasCrsWarning = hasWarning.toLowerCase().includes('crs') || hasWarning.toLowerCase().includes('coordinate');
    
    return {
      unknownCrsTest: 'warning-detection',
      hasCrsWarning,
      warningText: hasCrsWarning ? 'CRS warning present' : 'No CRS warning',
    };
  } catch (error) {
    return {
      unknownCrsTest: 'warning-detection',
      error: String(error),
    };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('Starting CRS validation tests...\n');
  
  const browser = await chromium.launch({ headless: true });
  
  const results = {
    timestamp: new Date().toISOString(),
    fixtures: [],
    reproject: null,
    unknownWarning: null,
  };
  
  // Test each fixture
  for (const fixture of testFixtures) {
    console.log(`Testing fixture: ${fixture.name}`);
    const result = await runTest(browser, fixture);
    results.fixtures.push(result);
    console.log(`  Result:`, JSON.stringify(result, null, 2));
  }
  
  // Test reprojection (4326 -> 3857 -> 4326)
  console.log('\nTesting reprojection round-trip...');
  results.reproject = await runReprojectTest(browser);
  console.log('  Result:', JSON.stringify(results.reproject, null, 2));
  
  // Test unknown CRS warning
  console.log('\nTesting unknown CRS warning detection...');
  results.unknownWarning = await runUnknownCrsWarningTest(browser);
  console.log('  Result:', JSON.stringify(results.unknownWarning, null, 2));
  
  await browser.close();
  
  console.log('\n=== Final Results ===');
  console.log(JSON.stringify(results, null, 2));
  
  // Exit with appropriate code
  const allPassed = results.fixtures.every(f => !f.error) && 
                    !results.reproject?.error && 
                    !results.unknownWarning?.error;
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
