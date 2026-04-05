import fs from 'node:fs/promises';
import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4196';
const outDir = path.resolve('tmp/playwright-grouped-dissolve');
const fixturePath = path.resolve('test-data/grouped-dissolve-input.geojson');

const {
  browser,
  page,
  consoleMessages,
  shot,
  bodyText,
  artifactButton,
  gotoApp,
  selectArtifact,
  saveProject,
  resetWorkspaceWithNewProject,
  openSavedProject,
  expectDownload,
  openExportMenu,
} = await createBrowserHarness({ appUrl, outDir });

async function resetBrowserProjectState() {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Web-native Geoprocessing Suite').waitFor({ state: 'visible', timeout: 15000 });
}

async function importFixture(filePath, artifactPattern) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole('heading', { name: /Import review/i }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Import into workspace/i }).click();
  await artifactButton(artifactPattern).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function reprojectSelected(outputName) {
  await page.getByRole('button', { name: /^Reproject$/i }).click();
  await page.getByRole('heading', { name: /Reproject \/ Transform/i }).waitFor({ state: 'visible' });
  const selects = page.locator('.import-overlay select');
  await selects.nth(0).selectOption('EPSG:4326');
  await selects.nth(1).selectOption('EPSG:3857');
  await page.locator('.import-overlay input[type="text"]').last().fill(outputName);
  await page.getByRole('button', { name: /^Reproject$/i }).last().click();
  await artifactButton(new RegExp(`${regexEscape(outputName)}.*derived`, 'i')).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function openGroupedDissolveDialog() {
  await page.getByRole('button', { name: /^Grouped Dissolve$/i }).click();
  await page.getByRole('heading', { name: /^Grouped Dissolve Operation$/i }).waitFor({ state: 'visible' });
}

async function currentDialogState() {
  return page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    if (!overlay) return null;
    const selects = [...overlay.querySelectorAll('select')];
    const runButton = [...overlay.querySelectorAll('button')].find((btn) => /Run Grouped Dissolve/i.test(btn.textContent || ''));
    return {
      text: overlay.textContent?.replace(/\s+/g, ' ').trim() || '',
      selectValues: selects.map((select) => select.value),
      selectOptions: selects.map((select) => [...select.options].map((option) => option.textContent?.trim() || '')),
      runDisabled: Boolean(runButton?.hasAttribute('disabled')),
    };
  });
}

async function chooseGroupingField(fieldName, outputName) {
  const overlay = page.locator('.import-overlay');
  await overlay.locator('select').first().selectOption(fieldName);
  await overlay.locator('input[type="text"]').last().fill(outputName);
  await page.waitForTimeout(500);
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

try {
  await gotoApp();
  await resetBrowserProjectState();
  await importFixture(fixturePath, /grouped-dissolve-input.*source/i);
  await selectArtifact(/grouped-dissolve-input.*source/i);
  await reprojectSelected('grouped_dissolve_input_3857');
  await selectArtifact(/grouped_dissolve_input_3857.*derived/i);

  await openGroupedDissolveDialog();
  const defaultDialogState = await currentDialogState();
  const dialogShowsContract = defaultDialogState?.text.includes('Grouped dissolve v1 is honestly supported only for Polygon or MultiPolygon source artifacts on the current path.')
    && defaultDialogState?.text.includes('This aggregation requires exactly one explicit grouping attribute field from the selected source artifact.')
    && defaultDialogState?.text.includes('This aggregation produces one derived output artifact containing one dissolved feature per group value.');
  const groupingRequiredVisible = defaultDialogState?.text.includes('Grouping field required');
  const zoneOptionVisible = defaultDialogState?.selectOptions?.[0]?.includes('zone');
  const defaultRunDisabled = Boolean(defaultDialogState?.runDisabled);
  await shot('01-dialog-default');

  await chooseGroupingField('zone', 'grouped_dissolve_result');
  const readyDialogState = await currentDialogState();
  const disclosureAligned = readyDialogState?.text.includes('Output rows, provenance, export, and DuckDB materialization stay aligned: one dissolved feature row per distinct grouping value, with only zone preserved on the current path.');
  const readyRunEnabled = readyDialogState?.runDisabled === false;
  await shot('02-dialog-ready');

  await page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    const runButton = [...(overlay?.querySelectorAll('button') ?? [])].find((button) => /Run Grouped Dissolve/i.test(button.textContent || ''));
    if (!(runButton instanceof HTMLButtonElement)) {
      throw new Error('Run Grouped Dissolve button not found in operation overlay');
    }
    setTimeout(() => runButton.click(), 0);
    return true;
  });
  await page.waitForTimeout(1800);
  console.log('POST_RUN_CONSOLE_TAIL', JSON.stringify(consoleMessages.slice(-20), null, 2));
  const artifactButtonsAfterRun = await page.locator('.artifact-list').first().getByRole('button').allTextContents();
  const groupedArtifactLabel = artifactButtonsAfterRun.find((text) => /grouped_dissolve_result/i.test(text));
  if (!groupedArtifactLabel) {
    throw new Error(`Grouped dissolve output artifact did not appear. Artifact buttons: ${artifactButtonsAfterRun.join(' | ')}`);
  }
  const groupedArtifactPattern = new RegExp(regexEscape(groupedArtifactLabel), 'i');
  await artifactButton(groupedArtifactPattern).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);

  await selectArtifact(groupedArtifactPattern);
  const postRunText = await bodyText();
  const createdStatus = postRunText.includes('Grouped dissolve created: grouped_dissolve_result.');
  const createdSemantics = postRunText.includes('one dissolved feature was written per group value, and only the selected grouping field is preserved in v1.');
  const derivedVisible = Boolean(groupedArtifactLabel);
  await shot('03-created');

  await selectArtifact(groupedArtifactPattern);
  const detailsText = await bodyText();
  const outputKindTruth = detailsText.includes('Output kind') && detailsText.toLowerCase().includes('spatial artifact');
  const groupedHistorySummary = detailsText.includes('Dissolve-grouped-v1 on grouped_dissolve_input_3857 → grouped_dissolve_result');
  const groupingFieldShown = detailsText.includes('groupingField') && detailsText.includes('zone');
  const outputAttributeSemanticsShown = detailsText.includes('outputAttributeSemantics') && detailsText.includes('grouping-field-only');
  const outputFeatureCountShown = detailsText.includes('outputFeatureCount') && detailsText.includes('2');
  await shot('04-details');

  await page.getByRole('button', { name: /^Table$/i }).click();
  await page.waitForTimeout(500);
  const tableHeaders = await page.locator('.table-wrap thead th').allTextContents();
  const tableRows = await page.locator('.table-wrap tbody tr').evaluateAll((rows) => rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim() || ''));
  const tableHasGroupedShape = tableHeaders.includes('zone') && tableHeaders.includes('geometry') && tableHeaders.length === 2;
  const tableHasTwoRows = tableRows.length === 2;
  const tableShowsExpectedGroups = ['north', 'south'].every((value) => tableRows.some((row) => row.includes(value)));
  await shot('05-table');

  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.waitForTimeout(300);
  const sqlPaneText = await page.locator('.bottom-dock').innerText();
  const queryableTableMatches = [...sqlPaneText.matchAll(/(dissolve_grouped_v1_[a-z0-9_]+) \(derived\)/ig)].map((match) => match[1]);
  const groupedTableName = queryableTableMatches.find((name) => name.includes('grouped_dissolve_input_3857')) ?? queryableTableMatches.at(-1) ?? null;
  if (!groupedTableName) {
    throw new Error('Could not find the persisted/queryable grouped dissolve table name in the SQL pane');
  }
  await page.locator('textarea').fill(`SELECT zone FROM ${groupedTableName} ORDER BY zone`);
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.waitForTimeout(1500);
  const resultsText = await bodyText();
  const queryPreviewVisible = resultsText.includes('Result preview');
  const resultReferencedTable = resultsText.includes(`Referenced tables: ${groupedTableName}`);
  const resultSourceArtifacts = resultsText.includes('Source artifacts matched: grouped_dissolve_result');
  await shot('06-query-preview');

  const exportJsonPath = await expectDownload(async () => {
    await selectArtifact(groupedArtifactPattern);
    await openExportMenu();
    await page.getByRole('button', { name: /Export to JSON/i }).click();
  });
  const exportGeoJsonPath = await expectDownload(async () => {
    await selectArtifact(groupedArtifactPattern);
    await openExportMenu();
    await page.getByRole('button', { name: /Export to GeoJSON/i }).click();
  });
  const exportedJson = JSON.parse(await fs.readFile(exportJsonPath, 'utf8'));
  const exportedGeoJson = JSON.parse(await fs.readFile(exportGeoJsonPath, 'utf8'));
  const jsonExportGroupedShape = Array.isArray(exportedJson)
    && exportedJson.length === 2
    && exportedJson.every((row) => Object.keys(row).sort().join(',') === 'geometry,zone');
  const geoJsonExportGroupedShape = exportedGeoJson.type === 'FeatureCollection'
    && Array.isArray(exportedGeoJson.features)
    && exportedGeoJson.features.length === 2
    && exportedGeoJson.features.every((feature) => Object.keys(feature?.properties || {}).length === 1 && Object.prototype.hasOwnProperty.call(feature?.properties || {}, 'zone'));
  await shot('07-export');

  await saveProject('Grouped Dissolve Validation');
  await resetWorkspaceWithNewProject();
  await openSavedProject();
  await artifactButton(groupedArtifactPattern).waitFor({ state: 'visible', timeout: 20000 });
  await selectArtifact(groupedArtifactPattern);
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.waitForTimeout(300);
  const reloadedSqlPaneText = await page.locator('.bottom-dock').innerText();
  const reloadedTableMatches = [...reloadedSqlPaneText.matchAll(/(dissolve_grouped_v1_[a-z0-9_]+) \(derived\)/ig)].map((match) => match[1]);
  const reopenedTableName = reloadedTableMatches.find((name) => name.includes('grouped_dissolve_input_3857')) ?? reloadedTableMatches.at(-1) ?? null;
  if (!reopenedTableName) {
    throw new Error('Could not find the restored grouped dissolve table name after reopen');
  }
  await page.locator('textarea').fill(`SELECT zone FROM ${reopenedTableName} ORDER BY zone`);
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.waitForTimeout(1500);
  const reopenedQueryText = await bodyText();
  const reopenedPreviewVisible = reopenedQueryText.includes('Result preview');
  const reopenedArtifactPresent = reopenedQueryText.includes('Source artifacts matched: grouped_dissolve_result');
  const reopenedQueryable = ['north', 'south'].every((value) => reopenedQueryText.includes(value));
  await shot('08-reopened-query');

  const report = {
    verdict: [
      dialogShowsContract,
      groupingRequiredVisible,
      zoneOptionVisible,
      defaultRunDisabled,
      disclosureAligned,
      readyRunEnabled,
      createdStatus,
      createdSemantics,
      derivedVisible,
      outputKindTruth,
      groupedHistorySummary,
      groupingFieldShown,
      outputAttributeSemanticsShown,
      outputFeatureCountShown,
      tableHasGroupedShape,
      tableHasTwoRows,
      tableShowsExpectedGroups,
      queryPreviewVisible,
      resultReferencedTable,
      resultSourceArtifacts,
      jsonExportGroupedShape,
      geoJsonExportGroupedShape,
      reopenedPreviewVisible,
      reopenedArtifactPresent,
      reopenedQueryable,
    ].every(Boolean) ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      dialogShowsContract,
      groupingRequiredVisible,
      zoneOptionVisible,
      defaultRunDisabled,
      disclosureAligned,
      readyRunEnabled,
      createdStatus,
      createdSemantics,
      derivedVisible,
      outputKindTruth,
      groupedHistorySummary,
      groupingFieldShown,
      outputAttributeSemanticsShown,
      outputFeatureCountShown,
      tableHasGroupedShape,
      tableHasTwoRows,
      tableShowsExpectedGroups,
      queryPreviewVisible,
      resultReferencedTable,
      resultSourceArtifacts,
      jsonExportGroupedShape,
      geoJsonExportGroupedShape,
      reopenedPreviewVisible,
      reopenedArtifactPresent,
      reopenedQueryable,
    },
    screenshots: [
      path.join(outDir, '01-dialog-default.png'),
      path.join(outDir, '02-dialog-ready.png'),
      path.join(outDir, '03-created.png'),
      path.join(outDir, '04-details.png'),
      path.join(outDir, '05-table.png'),
      path.join(outDir, '06-query-preview.png'),
      path.join(outDir, '07-export.png'),
      path.join(outDir, '08-reopened-query.png'),
    ],
    consoleTail: consoleMessages.slice(-30),
  };

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 1;
} catch (error) {
  await shot('failure').catch(() => {});
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
