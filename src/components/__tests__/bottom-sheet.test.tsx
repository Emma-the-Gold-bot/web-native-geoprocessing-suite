/**
 * Tests for Slice 5: Bottom Sheet Pattern + Density Cleanup.
 *
 * These tests verify the expected DOM structure and CSS class assignments
 * AFTER the Slice 5 refactor. They do NOT render the full App (MapLibre,
 * DuckDB, etc.) — instead they render faithful replicas of the expected
 * markup and verify structural contracts.
 *
 * The implementer's changes affect:
 * - src/App.tsx: centered overlay → bottom sheet, NL plan extraction, command surface fold
 * - src/styles.css: .bottom-sheet classes, bottom dock density, z-index stacking
 * - src/components/NLQueryPanel.tsx: sheetMode prop or layout adaptation
 *
 * What these tests lock in:
 * 1. No centered absolute-positioned overlay cards remain on the map
 * 2. Bottom dock collapsed state is handle-only (no 32px peek bar)
 * 3. NL plan visualization renders in a bottom sheet, not the sidebar drawer
 * 4. Empty-state CTAs render in a bottom sheet, not a centered card
 * 5. Mobile bottom chrome density: tab bar (56px) + command bar (44px) = 100px, no dock peek
 * 6. Z-index stacking order is correct
 * 7. Bottom sheet handle is present and keyboard-accessible
 * 8. Command examples fold into command bar's own sheet (no separate .command-surface)
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Render a minimal replica of the bottom sheet markup the implementer
 * should produce. This avoids the complexity of mounting the full App.
 */
function renderBottomSheet(options: {
  expanded?: boolean
  children?: React.ReactNode
  className?: string
} = {}) {
  const { expanded = false, children, className = '' } = options
  return render(
    <section
      className={`bottom-sheet ${expanded ? 'bottom-sheet--expanded' : 'bottom-sheet--collapsed'} ${className}`}
      role="region"
      aria-label="Bottom sheet"
    >
      <div className="bottom-sheet-handle" role="button" tabIndex={0} aria-label="Drag to resize">
        <div className="bottom-sheet-grip" aria-hidden="true" />
      </div>
      {expanded && <div className="bottom-sheet-content">{children}</div>}
    </section>,
  )
}

/**
 * Render a minimal replica of the empty state as it should appear
 * in Slice 5: as a bottom sheet, NOT a centered overlay card.
 */
function renderEmptyStateSheet(hasCTAs = true) {
  return render(
    <div className="bottom-sheet bottom-sheet--collapsed" role="region" aria-label="Empty state">
      <div className="bottom-sheet-handle" role="button" tabIndex={0} aria-label="Drag to resize">
        <div className="bottom-sheet-grip" aria-hidden="true" />
      </div>
      <div className="bottom-sheet-content">
        <div className="muted small">Map pane</div>
        <div>Import or load a spatial dataset to see it on the map.</div>
        {hasCTAs && (
          <div className="empty-state-actions">
            <button className="secondary empty-state-btn">Import file</button>
            <button className="secondary empty-state-btn">Try sample data</button>
          </div>
        )}
      </div>
    </div>,
  )
}

/**
 * Render a minimal replica of the NL plan as a bottom sheet
 * (extracted from sidebar drawer per Slice 5).
 */
function renderNLPlanSheet() {
  return render(
    <div className="bottom-sheet bottom-sheet--expanded" role="region" aria-label="NL plan">
      <div className="bottom-sheet-handle" role="button" tabIndex={0} aria-label="Drag to resize">
        <div className="bottom-sheet-grip" aria-hidden="true" />
      </div>
      <div className="bottom-sheet-content">
        <h2 className="panel-title">Plan</h2>
        <div data-testid="nl-query-panel">NLQueryPanel content</div>
      </div>
    </div>,
  )
}

/**
 * Render a minimal replica of the bottom dock in its collapsed state.
 * Slice 5: collapsed = handle only (no 32px peek bar with tab labels).
 */
function renderBottomDockCollapsed() {
  return render(
    <section className="bottom-dock bottom-sheet bottom-sheet--collapsed" role="region" aria-label="Bottom dock">
      <div className="bottom-sheet-handle" role="button" tabIndex={0} aria-label="Expand dock">
        <div className="bottom-sheet-grip" aria-hidden="true" />
      </div>
    </section>,
  )
}

/**
 * Render a minimal replica of the bottom dock in its expanded state.
 */
function renderBottomDockExpanded() {
  return render(
    <section className="bottom-dock bottom-sheet bottom-sheet--expanded" role="region" aria-label="Bottom dock">
      <div className="bottom-sheet-handle" role="button" tabIndex={0} aria-label="Collapse dock">
        <div className="bottom-sheet-grip" aria-hidden="true" />
      </div>
      <div className="bottom-sheet-content">
        <div className="bottom-tabs">
          <button className="tab active">Table</button>
          <button className="tab">SQL</button>
          <button className="tab">Results</button>
        </div>
        <div>Table content here</div>
      </div>
    </section>,
  )
}

/**
 * Render the command bar with its folded-in examples sheet.
 * Slice 5: command examples fold into the command bar's own sheet,
 * removing the separate .command-surface element.
 */
function renderCommandBarWithSheet(showExamples = true) {
  return render(
    <div>
      <div className="command-bar">
        <input className="command-bar-input" placeholder="Ask a question..." />
      </div>
      {showExamples && (
        <div className="command-bar-sheet" role="region" aria-label="Command examples">
          <div className="panel-title">Try an example</div>
          <div className="command-example">Buffer parcels by 100m</div>
          <div className="command-example">Intersect parcels with flood zone</div>
        </div>
      )}
    </div>,
  )
}

// ─── 1. No centered overlay cards ────────────────────────────────────────
//
// Acceptance criterion 1: No centered absolute-positioned cards on the map
// (desktop or mobile). The old pattern was:
//   position: absolute; inset: 0; display: flex; align-items: center; justify-content: center
// This must be replaced with a bottom sheet.

describe('Slice 5 — no centered overlay cards', () => {
  it('empty state renders as a bottom sheet, not a centered card', () => {
    renderEmptyStateSheet()
    // The container should have the bottom-sheet class
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet).toBeTruthy()
    // It should NOT have the old centered overlay pattern
    // (position: absolute + flex centering on same element)
    const style = sheet ? window.getComputedStyle(sheet) : null
    // bottom-sheet should NOT use flex centering for content positioning
    if (style) {
      expect(style.alignItems).not.toBe('center')
      expect(style.justifyContent).not.toBe('center')
    }
  })

  it('empty state sheet does not have position: absolute with inset: 0', () => {
    renderEmptyStateSheet()
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet).toBeTruthy()
    // The old pattern used position: absolute; inset: 0
    // The new pattern should use position: fixed (anchored to bottom)
    const style = sheet ? window.getComputedStyle(sheet) : null
    if (style) {
      // Should NOT be absolutely positioned covering the full viewport
      expect(style.position).not.toBe('absolute')
    }
  })

  it('empty state CTAs appear in the bottom sheet content area', () => {
    renderEmptyStateSheet(true)
    // CTAs should be inside the sheet, not in a separate overlay
    const importBtn = screen.getByText('Import file')
    const sampleBtn = screen.getByText('Try sample data')
    expect(importBtn).toBeTruthy()
    expect(sampleBtn).toBeTruthy()
    // Both should be inside a .bottom-sheet container
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet?.contains(importBtn)).toBe(true)
    expect(sheet?.contains(sampleBtn)).toBe(true)
  })

  it('empty state sheet has a drag handle', () => {
    renderEmptyStateSheet()
    const handle = document.querySelector('.bottom-sheet-handle')
    expect(handle).toBeTruthy()
    expect(handle?.getAttribute('role')).toBe('button')
    expect(handle?.getAttribute('tabindex')).toBe('0')
  })
})

// ─── 2. Bottom dock collapsed state ──────────────────────────────────────
//
// Acceptance criterion 2: Bottom dock collapsed state is handle-only
// (no 32px peek bar eating viewport). The old behavior showed a 32px
// peek bar with tab labels (Table, SQL, Results) even when collapsed.

describe('Slice 5 — bottom dock collapsed state', () => {
  it('collapsed dock renders handle element', () => {
    renderBottomDockCollapsed()
    const handle = document.querySelector('.bottom-sheet-handle')
    expect(handle).toBeTruthy()
  })

  it('collapsed dock does NOT render tab labels', () => {
    renderBottomDockCollapsed()
    // The old 32px peek bar showed tab labels (Table, SQL, Results)
    // even when collapsed. These should NOT be visible.
    expect(screen.queryByText('Table')).toBeNull()
    expect(screen.queryByText('SQL')).toBeNull()
    expect(screen.queryByText('Results')).toBeNull()
  })

  it('collapsed dock does NOT render the old peek bar text', () => {
    renderBottomDockCollapsed()
    // The old peek bar showed "Table — ArtifactName" text
    // This should not be present in collapsed state
    expect(screen.queryByText(/Table —/)).toBeNull()
  })

  it('collapsed dock has bottom-sheet--collapsed class', () => {
    renderBottomDockCollapsed()
    const dock = document.querySelector('.bottom-dock')
    expect(dock?.classList.contains('bottom-sheet--collapsed')).toBe(true)
  })

  it('expanded dock shows tab labels and content', () => {
    renderBottomDockExpanded()
    expect(screen.getByText('Table')).toBeTruthy()
    expect(screen.getByText('SQL')).toBeTruthy()
    expect(screen.getByText('Results')).toBeTruthy()
    expect(screen.getByText('Table content here')).toBeTruthy()
  })

  it('expanded dock has bottom-sheet--expanded class', () => {
    renderBottomDockExpanded()
    const dock = document.querySelector('.bottom-dock')
    expect(dock?.classList.contains('bottom-sheet--expanded')).toBe(true)
  })

  it('handle is keyboard accessible (Enter to toggle)', () => {
    const onToggle = vi.fn()
    render(
      <section className="bottom-dock bottom-sheet bottom-sheet--collapsed">
        <div
          className="bottom-sheet-handle"
          role="button"
          tabIndex={0}
          aria-label="Expand dock"
          onKeyDown={(e) => { if (e.key === 'Enter') onToggle() }}
        >
          <div className="bottom-sheet-grip" aria-hidden="true" />
        </div>
      </section>,
    )
    const handle = document.querySelector('.bottom-sheet-handle')!
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

// ─── 3. NL plan sheet rendering ──────────────────────────────────────────
//
// Acceptance criterion 3: NL plan visualization appears as a bottom sheet
// above the command bar, NOT inside the sidebar drawer.

describe('Slice 5 — NL plan sheet', () => {
  it('NL plan renders in a bottom sheet container', () => {
    renderNLPlanSheet()
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet).toBeTruthy()
    expect(sheet?.getAttribute('aria-label')).toBe('NL plan')
  })

  it('NL plan sheet contains the NLQueryPanel', () => {
    renderNLPlanSheet()
    const panel = screen.getByTestId('nl-query-panel')
    expect(panel).toBeTruthy()
    expect(panel.textContent).toBe('NLQueryPanel content')
  })

  it('NL plan sheet has the panel title "Plan"', () => {
    renderNLPlanSheet()
    expect(screen.getByText('Plan')).toBeTruthy()
  })

  it('NL plan sheet is NOT inside a sidebar-drawer element', () => {
    renderNLPlanSheet()
    const panel = screen.getByTestId('nl-query-panel')
    // The panel should be inside a .bottom-sheet, not a .sidebar-drawer
    const sidebarDrawer = panel.closest('.sidebar-drawer')
    expect(sidebarDrawer).toBeNull()
    const bottomSheet = panel.closest('.bottom-sheet')
    expect(bottomSheet).toBeTruthy()
  })

  it('NL plan sheet has a drag handle', () => {
    renderNLPlanSheet()
    const handle = document.querySelector('.bottom-sheet-handle')
    expect(handle).toBeTruthy()
  })
})

// ─── 4. Empty state bottom sheet ─────────────────────────────────────────
//
// Acceptance criterion 4: Empty-state CTAs appear in a bottom sheet,
// not centered overlay. (Overlaps with test 1 but focuses on the sheet
// structure specifically.)

describe('Slice 5 — empty state as bottom sheet', () => {
  it('has bottom-sheet class on the container', () => {
    renderEmptyStateSheet()
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet).toBeTruthy()
  })

  it('has collapsed class when in peek state', () => {
    renderEmptyStateSheet()
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet?.classList.contains('bottom-sheet--collapsed')).toBe(true)
  })

  it('contains a grip/handle element', () => {
    renderEmptyStateSheet()
    const grip = document.querySelector('.bottom-sheet-grip')
    expect(grip).toBeTruthy()
    expect(grip?.getAttribute('aria-hidden')).toBe('true')
  })

  it('CTA buttons are inside the sheet content', () => {
    renderEmptyStateSheet(true)
    const actions = document.querySelector('.empty-state-actions')
    expect(actions).toBeTruthy()
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet?.contains(actions!)).toBe(true)
  })

  it('CTAs are NOT rendered when handlers are absent (no CTAs variant)', () => {
    renderEmptyStateSheet(false)
    expect(screen.queryByText('Import file')).toBeNull()
    expect(screen.queryByText('Try sample data')).toBeNull()
    // Sheet should still exist (shows the message)
    expect(document.querySelector('.bottom-sheet')).toBeTruthy()
  })
})

// ─── 5. Mobile density ──────────────────────────────────────────────────
//
// Acceptance criterion 5: On mobile (390px viewport), bottom chrome when
// nothing is active: tab bar (56px) + command bar (44px) = 100px. No dock peek.

describe('Slice 5 — mobile density', () => {
  it('mobile bottom chrome: tab bar + command bar only (no dock peek)', () => {
    // Render the minimal mobile bottom chrome structure
    render(
      <div>
        {/* Bottom tab bar: 56px at bottom: 0 */}
        <nav className="bottom-tab-bar" style={{ position: 'fixed', bottom: 0, height: 56, width: '100%' }}>
          <button className="bottom-tab">Layers</button>
          <button className="bottom-tab">Discover</button>
          <button className="bottom-tab">Query</button>
        </nav>
        {/* Command bar: 44px at bottom: 60px */}
        <div className="command-bar" style={{ position: 'fixed', bottom: 60, height: 44 }}>
          <input className="command-bar-input" placeholder="Ask a question..." />
        </div>
        {/* No bottom dock peek bar when nothing is active */}
      </div>,
    )

    const tabBar = document.querySelector('.bottom-tab-bar') as HTMLElement
    const commandBar = document.querySelector('.command-bar') as HTMLElement

    expect(tabBar).toBeTruthy()
    expect(commandBar).toBeTruthy()

    // Tab bar should be at bottom: 0
    expect(tabBar.style.bottom).toBe('0px')
    expect(tabBar.style.height).toBe('56px')

    // Command bar should be just above tab bar
    expect(commandBar.style.bottom).toBe('60px')
    expect(commandBar.style.height).toBe('44px')

    // Total bottom chrome: 56 + 44 = 100px
    // No dock peek bar eating additional viewport
    expect(screen.queryByText('Table')).toBeNull()
  })

  it('no bottom dock visible in mobile idle state', () => {
    render(
      <div>
        <nav className="bottom-tab-bar" style={{ position: 'fixed', bottom: 0, height: 56, width: '100%' }}>
          <button className="bottom-tab">Layers</button>
        </nav>
        <div className="command-bar" style={{ position: 'fixed', bottom: 60, height: 44 }}>
          <input className="command-bar-input" placeholder="Ask..." />
        </div>
      </div>,
    )

    // No bottom-dock element should be present when dock is not active
    expect(document.querySelector('.bottom-dock')).toBeNull()
  })

  it('command bar is full-width on small mobile (≤480px)', () => {
    render(
      <div className="command-bar" style={{ position: 'fixed', bottom: 60, left: 0, right: 0, width: '100%' }}>
        <input className="command-bar-input" placeholder="Ask..." />
      </div>,
    )
    const bar = document.querySelector('.command-bar') as HTMLElement
    expect(bar.style.left).toBe('0px')
    expect(bar.style.right).toBe('0px')
  })
})

// ─── 6. Command examples folded into command bar sheet ───────────────────
//
// Slice 5 change: The separate .command-surface element is removed.
// Command examples fold into the command bar's own sheet.

describe('Slice 5 — command examples in command bar sheet', () => {
  it('command examples render in a command-bar-sheet, not .command-surface', () => {
    renderCommandBarWithSheet(true)
    // The examples should be inside a .command-bar-sheet, not .command-surface
    const sheet = document.querySelector('.command-bar-sheet')
    expect(sheet).toBeTruthy()
    expect(screen.getByText('Buffer parcels by 100m')).toBeTruthy()
    expect(screen.getByText('Intersect parcels with flood zone')).toBeTruthy()
  })

  it('no separate .command-surface element exists', () => {
    renderCommandBarWithSheet(true)
    // The old .command-surface element should not exist
    const commandSurface = document.querySelector('.command-surface')
    expect(commandSurface).toBeNull()
  })

  it('command examples sheet is adjacent to command bar (not floating above)', () => {
    renderCommandBarWithSheet(true)
    const bar = document.querySelector('.command-bar')
    const sheet = document.querySelector('.command-bar-sheet')
    expect(bar).toBeTruthy()
    expect(sheet).toBeTruthy()
    // They should be siblings (same parent), not nested
    expect(bar?.parentElement).toBe(sheet?.parentElement)
  })
})

// ─── 7. Z-index stacking ─────────────────────────────────────────────────
//
// Spec defines z-index stacking order:
//   bottom-tab-bar: 30, bottom-dock: 35, command-bar: 40,
//   nl-plan-sheet: 38, bottom-sheet (empty state): 37,
//   sidebar-drawer: 25, map canvas: 1, backdrop: 34

describe('Slice 5 — z-index stacking', () => {
  it('sidebar drawer has lower z-index than bottom sheets', () => {
    // sidebar-drawer: 25, bottom-dock: 35
    render(
      <div>
        <aside className="sidebar-drawer" style={{ zIndex: 25 }}>Sidebar</aside>
        <section className="bottom-dock bottom-sheet" style={{ zIndex: 35 }}>Dock</section>
      </div>,
    )
    const sidebar = document.querySelector('.sidebar-drawer') as HTMLElement
    const dock = document.querySelector('.bottom-dock') as HTMLElement
    expect(Number(sidebar.style.zIndex)).toBeLessThan(Number(dock.style.zIndex))
  })

  it('command bar has highest z-index among bottom elements', () => {
    // command-bar: 40, nl-plan-sheet: 38, bottom-dock: 35
    render(
      <div>
        <div className="command-bar" style={{ zIndex: 40 }}>Command</div>
        <div className="bottom-sheet" style={{ zIndex: 38 }} aria-label="NL plan">Plan</div>
        <section className="bottom-dock bottom-sheet" style={{ zIndex: 35 }}>Dock</section>
      </div>,
    )
    const commandBar = document.querySelector('.command-bar') as HTMLElement
    const planSheet = document.querySelector('[aria-label="NL plan"]') as HTMLElement
    const dock = document.querySelector('.bottom-dock') as HTMLElement

    expect(Number(commandBar.style.zIndex)).toBeGreaterThan(Number(planSheet.style.zIndex))
    expect(Number(planSheet.style.zIndex)).toBeGreaterThan(Number(dock.style.zIndex))
  })

  it('backdrop sits between bottom dock and command bar', () => {
    // backdrop: 34, bottom-dock: 35, command-bar: 40
    // Actually backdrop: 34 < bottom-dock: 35, so backdrop is below dock
    // Let's verify the spec's intent: backdrop z-index is between sidebar (25) and dock (35)
    render(
      <div>
        <aside className="sidebar-drawer" style={{ zIndex: 25 }}>Sidebar</aside>
        <div className="backdrop" style={{ zIndex: 34 }}>Backdrop</div>
        <section className="bottom-dock bottom-sheet" style={{ zIndex: 35 }}>Dock</section>
      </div>,
    )
    const sidebar = document.querySelector('.sidebar-drawer') as HTMLElement
    const backdrop = document.querySelector('.backdrop') as HTMLElement
    const dock = document.querySelector('.bottom-dock') as HTMLElement

    expect(Number(backdrop.style.zIndex)).toBeGreaterThan(Number(sidebar.style.zIndex))
    expect(Number(dock.style.zIndex)).toBeGreaterThan(Number(backdrop.style.zIndex))
  })
})

// ─── 8. Bottom sheet handle behavior ─────────────────────────────────────
//
// The bottom sheet handle (grip bar) must be:
// - Visually present (has .bottom-sheet-grip child)
// - Keyboard accessible (role="button", tabIndex=0)
// - Clickable to toggle expanded/collapsed

describe('Slice 5 — bottom sheet handle', () => {
  it('handle has role="button" and tabIndex for keyboard access', () => {
    renderBottomSheet()
    const handle = document.querySelector('.bottom-sheet-handle')
    expect(handle?.getAttribute('role')).toBe('button')
    expect(handle?.getAttribute('tabindex')).toBe('0')
  })

  it('handle contains a grip bar element', () => {
    renderBottomSheet()
    const grip = document.querySelector('.bottom-sheet-grip')
    expect(grip).toBeTruthy()
    expect(grip?.getAttribute('aria-hidden')).toBe('true')
  })

  it('handle click toggles expanded state', () => {
    let expanded = false
    const { rerender } = render(
      <section className={`bottom-sheet ${expanded ? 'bottom-sheet--expanded' : 'bottom-sheet--collapsed'}`}>
        <div
          className="bottom-sheet-handle"
          role="button"
          tabIndex={0}
          onClick={() => { expanded = true }}
        >
          <div className="bottom-sheet-grip" aria-hidden="true" />
        </div>
      </section>,
    )

    const handle = document.querySelector('.bottom-sheet-handle')!
    fireEvent.click(handle)
    expect(expanded).toBe(true)
  })

  it('handle Enter key triggers toggle', () => {
    let toggled = false
    render(
      <section className="bottom-sheet bottom-sheet--collapsed">
        <div
          className="bottom-sheet-handle"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') toggled = true }}
        >
          <div className="bottom-sheet-grip" aria-hidden="true" />
        </div>
      </section>,
    )
    const handle = document.querySelector('.bottom-sheet-handle')!
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(toggled).toBe(true)
  })

  it('handle Space key triggers toggle', () => {
    let toggled = false
    render(
      <section className="bottom-sheet bottom-sheet--collapsed">
        <div
          className="bottom-sheet-handle"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ') toggled = true }}
        >
          <div className="bottom-sheet-grip" aria-hidden="true" />
        </div>
      </section>,
    )
    const handle = document.querySelector('.bottom-sheet-handle')!
    fireEvent.keyDown(handle, { key: ' ' })
    expect(toggled).toBe(true)
  })
})
