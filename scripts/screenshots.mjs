/**
 * Web-native geoprocessing suite — Desktop + Mobile screenshot tour
 *
 * Captures the key UI states in both desktop (1440x900) and mobile
 * (390x844 — iPhone 14) viewports, saves to ./screenshots/.
 *
 * Usage: server must be running at http://127.0.0.1:4173/
 *   npx vite preview --port 4173 --host 127.0.0.1 &
 *   node scripts/screenshots.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:4173/'
const OUT_DIR = './screenshots'
mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

async function captureState(page, vp, slug) {
  await page.waitForTimeout(600)
  const filename = `${vp.name}-${slug}.png`
  const path = join(OUT_DIR, filename)
  await page.screenshot({ path, fullPage: false })
  console.log(`  📸 ${filename}`)
  return path
}

async function closeAllDrawers(page) {
  // Click each sidebar icon to close any open drawer
  for (const title of ['Layers', 'Discover', 'Query']) {
    const icon = page.locator(`button[title="${title}"]`)
    if ((await icon.count()) > 0) {
      const isActive = await icon.first().evaluate((el) => el.classList.contains('active'))
      if (isActive) await icon.first().click()
    }
  }
  // History button toggles rightPanelOpen — leave it alone for now
  await page.waitForTimeout(300)
}

async function runViewport(browser, vp) {
  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`)
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  const page = await ctx.newPage()

  try {
    // 1. Initial load (empty state)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await captureState(page, vp, '01-initial-load')

    // 2. Layers panel open
    await page.locator('button[title="Layers"]').first().click()
    await captureState(page, vp, '02-layers-panel')

    // 3. Discover panel open (close Layers first)
    await closeAllDrawers(page)
    await page.locator('button[title="Discover"]').first().click()
    await captureState(page, vp, '03-discover-panel')

    // 4. Query panel open
    await closeAllDrawers(page)
    await page.locator('button[title="Query"]').first().click()
    await captureState(page, vp, '04-query-panel')

    // 5. NL query — "Buffer parcels by 500 feet"
    await closeAllDrawers(page)
    const cmd = page.locator('input.command-bar-input, input[placeholder*="SQL"], input[placeholder*="WHERE"]').first()
    if ((await cmd.count()) > 0) {
      await cmd.click()
      await cmd.fill('Buffer parcels by 500 feet')
      await page.waitForTimeout(500)
      await captureState(page, vp, '05-nl-query-buffer')
      await cmd.press('Enter')
      await page.waitForTimeout(1500)
      await captureState(page, vp, '06-nl-query-buffer-plan')

      // 7. Different query — chain (clip + area)
      await cmd.fill('')
      await cmd.fill('Clip parcels to Butte County and calculate area')
      await cmd.press('Enter')
      await page.waitForTimeout(1500)
      await captureState(page, vp, '07-nl-query-chain-clip-area')

      // 8. Ambiguous query — should ask for clarification
      await cmd.fill('')
      await cmd.fill("Show me what's near the rivers")
      await cmd.press('Enter')
      await page.waitForTimeout(1500)
      await captureState(page, vp, '08-nl-query-ambiguous-near')
    }

    // 9. Mobile-only: zoomed-out overview (mobile users need map discoverability)
    if (vp.name === 'mobile') {
      await closeAllDrawers(page)
      await captureState(page, vp, '09-mobile-overview')
    }
  } finally {
    await ctx.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const vp of VIEWPORTS) {
      await runViewport(browser, vp)
    }
  } finally {
    await browser.close()
  }
  console.log(`\n=== Screenshots written to ${OUT_DIR}/ ===`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})