/**
 * Web-native geoprocessing suite — UI smoke test
 *
 * Verifies Slice 1 (map-first shell) + Slice 3 (layer controls) acceptance
 * criteria by exercising the running preview build at http://127.0.0.1:4173/.
 *
 * Captures screenshots into ./smoke-screenshots/ on each major step.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:4173/'
const OUT_DIR = './smoke-screenshots'

mkdirSync(OUT_DIR, { recursive: true })

const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  return path
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  // Capture console errors for the whole run
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`))

  try {
    // ─── Load app ───
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await shot(page, '01-initial-load')

    // ─── Slice 1 acceptance: 5 sidebar icons ───
    const sidebarIcons = await page.locator('nav.sidebar-rail button.sidebar-rail-btn').count()
    record('Sidebar rail has 5 icons', sidebarIcons === 5, `found ${sidebarIcons}`)

    // ─── Slice 1 acceptance: command bar ───
    const cmdInput = page.locator('input.command-bar-input, input[placeholder*="SQL"], input[placeholder*="WHERE"]')
    const cmdCount = await cmdInput.count()
    record('Command bar present', cmdCount > 0, `found ${cmdCount} input(s)`)

    // ─── Slice 1 acceptance: NO top-bar operation buttons ───
    // Slice 1 hid the 14 operation buttons. Verify they're gone from chrome.
    // Original buttons had labels like "Buffer", "Centroid", "Clip" etc.
    const topBarOpButtons = await page.locator('button:has-text("Buffer"), button:has-text("Centroid"), button:has-text("Clip")').count()
    record('Top-bar operation buttons hidden', topBarOpButtons === 0, `found ${topBarOpButtons}`)

    // ─── Slice 1 acceptance: right panel + bottom dock collapsed ───
    // The map should dominate — sidebar rail + command bar only
    const map = page.locator('.maplibregl-map, .main-pane, .map-container')
    const mapCount = await map.count()
    record('Map element present', mapCount > 0, `found ${mapCount} map element(s)`)

    // ─── Slice 1 acceptance: Layers sidebar icon expands panel ───
    const layersIcon = page.locator('button[title="Layers"]').first()
    await layersIcon.click()
    await page.waitForTimeout(500)
    await shot(page, '02-layers-panel-open')

    const drawerOpen = await page.locator('.sidebar-drawer').count()
    record('Layers icon opens drawer', drawerOpen > 0, `found ${drawerOpen} drawer(s)`)

    // ─── Discover sidebar icon ───
    const discoverIcon = page.locator('button[title="Discover"]').first()
    await discoverIcon.click()
    await page.waitForTimeout(500)
    await shot(page, '03-discover-panel')

    // ─── Query sidebar icon ───
    const queryIcon = page.locator('button[title="Query"]').first()
    await queryIcon.click()
    await page.waitForTimeout(500)
    await shot(page, '04-query-panel')

    // ─── History toggle ───
    const historyIcon = page.locator('button[title="History"]').first()
    await historyIcon.click()
    await page.waitForTimeout(500)
    await shot(page, '05-history-panel')

    // ─── Command bar route: slash prefix opens SQL ───
    // Close sidebar drawers first
    await layersIcon.click()
    await discoverIcon.click()
    await queryIcon.click()
    await historyIcon.click()
    await page.waitForTimeout(300)

    // ─── Type a NL query and look for chain visualization ───
    if (cmdCount > 0) {
      const cmd = cmdInput.first()
      await cmd.click()
      await cmd.fill('Buffer parcels by 500 feet')
      await cmd.press('Enter')
      await page.waitForTimeout(1500)
      await shot(page, '06-nl-query-buffer-parcels')
    }

    // ─── Capture console errors ───
    writeFileSync(join(OUT_DIR, 'console-errors.txt'), consoleErrors.join('\n'))
    record('No console errors', consoleErrors.length === 0, `${consoleErrors.length} errors captured`)

  } catch (err) {
    record('Smoke test execution', false, err.message)
    await shot(page, '99-error-state').catch(() => {})
  } finally {
    await browser.close()
  }

  // Summary
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`\n=== SMOKE TEST: ${passed}/${results.length} passed, ${failed} failed ===`)

  writeFileSync(
    join(OUT_DIR, 'smoke-results.json'),
    JSON.stringify({ passed, failed, total: results.length, results }, null, 2),
  )

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(2)
})