import fs from 'node:fs/promises';
import path from 'node:path';
import { createBrowserHarness } from './lib/browser-workflow-helpers.mjs';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4186';
const outDir = path.resolve('tmp/playwright-attribute-join');

const {
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
} = await createBrowserHarness({ appUrl, outDir });

async function openAttributeJoinDialog() {
  await page.getByRole('button', { name: /^Attribute Join$/i }).click();
  await page.getByRole('heading', { name: /^Attribute Join$/i }).waitFor({ state: 'visible' });
}

async function currentDialogState() {
  return page.evaluate(() => {
    const overlay = document.querySelector('.import-overlay');
    if (!overlay) return null;
    const selects = [...overlay.querySelectorAll('select')];
    const labels = [...overlay.querySelectorAll('label strong')].map((node) => node.textContent?.trim() || '');
    const runButton = [...overlay.querySelectorAll('button')].find((btn) => /Run Attribute Join/i.test(btn.textContent || ''));
    const checkboxes = [...overlay.querySelectorAll('input[type="checkbox"]')].map((input) => ({
      checked: input.checked,
      label: input.parentElement?.textContent?.replace(/\s+/g, ' ').trim() || '',
    }));
    const warnings = [...overlay.querySelectorAll('.card')]
      .map((card) => card.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter((text) => text.includes('Explicit field selection required'));
    return {
      labels,
      selectValues: selects.map((select) => select.value),
      selectOptions: selects.map((select) => [...select.options].map((option) => option.textContent?.trim() || '')),
      runDisabled: Boolean(runButton?.hasAttribute('disabled')),
      checkboxes,
      warnings,
      text: overlay.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
}

async function chooseAttributeJoinOptions({
  joinArtifactLabelPattern,
  leftKey,
  rightKey,
  outputName,
  fieldsToEnable = [],
  clearAllFields = false,
}) {
  const overlay = page.locator('.import-overlay');
  const selects = overlay.locator('select');

  const joinArtifactSelect = selects.nth(0);
  const joinArtifactTexts = await joinArtifactSelect.locator('option').allTextContents();
  const joinArtifactIndex = joinArtifactTexts.findIndex((text) => joinArtifactLabelPattern.test(text));
  if (joinArtifactIndex < 0) {
    throw new Error(`Could not find join artifact matching ${joinArtifactLabelPattern}`);
  }
  await joinArtifactSelect.selectOption({ index: joinArtifactIndex });
  await page.waitForTimeout(500);

  await selects.nth(1).selectOption(leftKey);
  await selects.nth(2).selectOption(rightKey);

  const checkboxes = overlay.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  if (clearAllFields) {
    for (let i = 0; i < checkboxCount; i += 1) {
      const checkbox = checkboxes.nth(i);
      if (await checkbox.isChecked()) {
        await checkbox.click();
      }
    }
  }

  for (const fieldLabel of fieldsToEnable) {
    const toggled = await page.evaluate((requestedLabel) => {
      const labels = [...document.querySelectorAll('.import-overlay label')];
      const match = labels.find((label) => {
        const text = (label.textContent || '').replace(/\s+/g, ' ').trim();
        return text.toLowerCase().startsWith(requestedLabel.toLowerCase());
      });
      if (!match) return false;
      const checkbox = match.querySelector('input[type="checkbox"]');
      if (!checkbox) return false;
      if (!checkbox.checked) {
        checkbox.click();
      }
      return checkbox.checked;
    }, fieldLabel);
    if (!toggled) {
      throw new Error(`Could not enable right-side field checkbox for ${fieldLabel}`);
    }
  }

  await overlay.locator('input[type="text"]').last().fill(outputName);
  await page.waitForTimeout(500);
}

try {
  await gotoApp();
  await importSample();

  await runQuery("SELECT category, name || ' lookup' AS name, area_acres * 10 AS area_acres FROM sample_parcels WHERE category <> 'industrial'");
  await materializeCurrentResult('attribute_join_lookup');
  await selectArtifact(/sample-parcels.*source/i);

  await openAttributeJoinDialog();
  const defaultDialogState = await currentDialogState();
  await shot('01-dialog-defaults');

  await chooseAttributeJoinOptions({
    joinArtifactLabelPattern: /attribute_join_lookup.*derived/i,
    leftKey: 'category',
    rightKey: 'category',
    outputName: 'attribute_join_no_fields',
    clearAllFields: true,
  });
  const explicitSelectionState = await currentDialogState();
  await shot('02-dialog-no-fields');

  await chooseAttributeJoinOptions({
    joinArtifactLabelPattern: /attribute_join_lookup.*derived/i,
    leftKey: 'category',
    rightKey: 'category',
    outputName: 'attribute_join_result',
    fieldsToEnable: ['name', 'area_acres'],
  });
  const readyState = await currentDialogState();
  await shot('03-dialog-ready');

  await page.getByRole('button', { name: /Run Attribute Join/i }).click();
  await artifactButton(/attribute_join_result.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
  const postJoinText = await bodyText();
  const createdStatus = postJoinText.includes('Attribute join created: attribute_join_result.');
  const createdStatusSemantics = postJoinText.includes('Left output kind and geometry semantics were preserved; selected right-side fields were added with nulls for unmatched left rows and join_ prefixes on collisions.');
  await shot('04-created');

  await selectArtifact(/attribute_join_result.*derived/i);
  const detailsText = await bodyText();
  const outputKindTruth = detailsText.includes('Output kind') && detailsText.toLowerCase().includes('spatial artifact');
  const lineageSummary = detailsText.includes('Attribute join sample-parcels with attribute_join_lookup → attribute_join_result');
  const explicitFieldHistory = detailsText.includes('selectedRightFields') || detailsText.includes('name→join_name') || detailsText.includes('area_acres→join_area_acres');
  const firstMatchLineage = detailsText.includes('first-match-only') || detailsText.includes('first-match-only duplicate-right-key behavior');
  const upstreamArtifactsShown = detailsText.includes('Upstream artifact(s): sample-parcels, attribute_join_lookup');
  await shot('05-details');

  await page.getByRole('button', { name: /^Table$/i }).click();
  await page.waitForTimeout(500);
  const tableHeaders = await page.locator('.table-wrap thead th').allTextContents();
  const firstRow = await page.locator('.table-wrap tbody tr').first().locator('td').allTextContents();
  const tableHasJoinPrefixes = tableHeaders.includes('join_name') && tableHeaders.includes('join_area_acres');
  const tableRetainsGeometryColumn = tableHeaders.includes('geometry');
  const firstRowHasJoinValues = firstRow.some((value) => value.includes('lookup')) && firstRow.some((value) => value.includes('42'));
  const unmatchedRowHasNull = await page.locator('.table-wrap tbody tr').nth(2).locator('td').allTextContents().then((cells) => cells.includes('null'));
  await shot('06-table');

  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.waitForTimeout(300);
  const sqlPaneText = await page.locator('.bottom-dock').innerText();
  const queryableTableMatches = [...sqlPaneText.matchAll(/(attribute_join_[a-z0-9_]+) \(derived\)/ig)].map((match) => match[1]);
  const attributeJoinTableName = queryableTableMatches.find((name) => name.includes('sample_parcels')) ?? queryableTableMatches.at(-1) ?? null;
  if (!attributeJoinTableName) {
    throw new Error('Could not find the persisted/queryable attribute join table name in the SQL pane');
  }
  await page.locator('textarea').fill(`SELECT category, join_name, join_area_acres FROM ${attributeJoinTableName}`);
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.waitForTimeout(1500);
  const resultsText = await bodyText();
  if (!resultsText.includes('Result preview')) {
    throw new Error(`Attribute join query preview did not appear. SQL pane text: ${sqlPaneText}`);
  }
  const resultReferencedTable = resultsText.includes(`Referenced tables: ${attributeJoinTableName}`);
  const resultSourceArtifacts = resultsText.includes('Source artifacts matched: attribute_join_result');
  const resultOutputKindTruth = resultsText.includes('If materialized now, output kind would be') && resultsText.toLowerCase().includes('tabular artifact');
  await shot('07-query-preview');

  const exportJsonPath = await expectDownload(async () => {
    await selectArtifact(/attribute_join_result.*derived/i);
    await openExportMenu();
    await page.getByRole('button', { name: /Export to JSON/i }).click();
  });
  const exportGeoJsonPath = await expectDownload(async () => {
    await selectArtifact(/attribute_join_result.*derived/i);
    await openExportMenu();
    await page.getByRole('button', { name: /Export to GeoJSON/i }).click();
  });
  const exportedJson = JSON.parse(await fs.readFile(exportJsonPath, 'utf8'));
  const exportedGeoJson = JSON.parse(await fs.readFile(exportGeoJsonPath, 'utf8'));
  const jsonExportKeepsJoinFields = Array.isArray(exportedJson) && exportedJson.some((row) => String(row.join_name || '').includes('lookup'));
  const geoJsonExportKeepsSpatialTruth = exportedGeoJson.type === 'FeatureCollection' && Array.isArray(exportedGeoJson.features) && exportedGeoJson.features.some((feature) => String(feature?.properties?.join_name || '').includes('lookup'));
  await shot('08-export');

  await saveProject('Attribute Join Validation');
  await resetWorkspaceWithNewProject();
  await openSavedProject();
  await artifactButton(/attribute_join_result.*derived/i).waitFor({ state: 'visible', timeout: 20000 });
  await selectArtifact(/attribute_join_result.*derived/i);
  await page.getByRole('button', { name: /^SQL$/i }).click();
  await page.waitForTimeout(300);
  const reloadedSqlPaneText = await page.locator('.bottom-dock').innerText();
  const reloadedTableMatches = [...reloadedSqlPaneText.matchAll(/(attribute_join_[a-z0-9_]+) \(derived\)/ig)].map((match) => match[1]);
  const reopenedTableName = reloadedTableMatches.find((name) => name.includes('sample_parcels')) ?? reloadedTableMatches.at(-1) ?? null;
  if (!reopenedTableName) {
    throw new Error('Could not find the restored attribute join table name after reopen');
  }
  await page.locator('textarea').fill(`SELECT join_name, join_area_acres FROM ${reopenedTableName} ORDER BY join_name NULLS LAST`);
  await page.getByRole('button', { name: /Run query/i }).click();
  await page.waitForTimeout(1500);
  const reloadedQueryText = await bodyText();
  if (!reloadedQueryText.includes('Result preview')) {
    throw new Error(`Reloaded attribute join query preview did not appear. SQL pane text: ${reloadedSqlPaneText}`);
  }
  const reopenedArtifactPresent = reloadedQueryText.includes('Source artifacts matched: attribute_join_result');
  const reopenedQueryable = reloadedQueryText.includes('join_area_acres');
  await shot('09-reloaded-query');

  const report = {
    verdict: [
      defaultDialogState?.text.includes('Attribute Join'),
      defaultDialogState?.labels.includes('Join artifact'),
      explicitSelectionState?.checkboxes.every((entry) => !entry.checked),
      !readyState?.runDisabled,
      createdStatus,
      createdStatusSemantics,
      outputKindTruth,
      lineageSummary,
      explicitFieldHistory,
      firstMatchLineage,
      upstreamArtifactsShown,
      tableHasJoinPrefixes,
      tableRetainsGeometryColumn,
      firstRowHasJoinValues,
      unmatchedRowHasNull,
      resultReferencedTable,
      resultSourceArtifacts,
      resultOutputKindTruth,
      jsonExportKeepsJoinFields,
      geoJsonExportKeepsSpatialTruth,
      reopenedArtifactPresent,
      reopenedQueryable,
    ].every(Boolean) ? 'PASS' : 'FAIL',
    appUrl,
    checks: {
      defaultDialogState,
      explicitSelectionState,
      readyState,
      createdStatus,
      createdStatusSemantics,
      outputKindTruth,
      lineageSummary,
      explicitFieldHistory,
      firstMatchLineage,
      upstreamArtifactsShown,
      tableHasJoinPrefixes,
      tableRetainsGeometryColumn,
      firstRowHasJoinValues,
      unmatchedRowHasNull,
      resultReferencedTable,
      resultSourceArtifacts,
      resultOutputKindTruth,
      jsonExportKeepsJoinFields,
      geoJsonExportKeepsSpatialTruth,
      reopenedArtifactPresent,
      reopenedQueryable,
    },
    screenshots: [
      path.join(outDir, '01-dialog-defaults.png'),
      path.join(outDir, '02-dialog-no-fields.png'),
      path.join(outDir, '03-dialog-ready.png'),
      path.join(outDir, '04-created.png'),
      path.join(outDir, '05-details.png'),
      path.join(outDir, '06-table.png'),
      path.join(outDir, '07-query-preview.png'),
      path.join(outDir, '08-export.png'),
      path.join(outDir, '09-reloaded-query.png'),
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
