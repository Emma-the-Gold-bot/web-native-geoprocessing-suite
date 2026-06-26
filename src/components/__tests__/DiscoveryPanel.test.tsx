/**
 * Tests for DiscoveryPanel component (Slice 6 — workspace wiring).
 *
 * Locks in the contract for:
 * - 6a: onImport fires with vector DiscoveryResult when "Import to workspace" clicked
 * - 6b: onBboxPreview fires with BBox during confirm state, null on clear/skip
 * - 6c: source and initialQuery props for prefix routing
 *
 * These tests mock the discovery API client (`../lib/discovery`) so no network
 * calls are made. The geocode and discover functions return controlled fixtures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { DiscoveryPanel } from '../DiscoveryPanel'
import type { DiscoveryResult, GeocodeResult } from '../../lib/discovery'
import type { BBox } from '../../types'

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock('../../lib/discovery', () => ({
  discover: vi.fn(),
  geocode: vi.fn(),
  checkDiscoveryHealth: vi.fn().mockResolvedValue(false),
}))

// Import the mocked module to get typed handles
import { discover, geocode } from '../../lib/discovery'
const mockDiscover = vi.mocked(discover)
const mockGeocode = vi.mocked(geocode)

// ─── Fixtures ─────────────────────────────────────────────────────────────

const SF_BBOX: BBox = { west: -122.5, south: 37.7, east: -122.3, north: 37.8 }

const mockGeocodeResult: GeocodeResult = {
  bbox: SF_BBOX,
  display_name: 'San Francisco, California, USA',
  center: [-122.4194, 37.7749],
}

function makeVectorResult(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    kind: 'vector',
    data: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.4, 37.7] }, properties: { name: 'test' } },
      ],
    },
    provenance: { source: 'osm', license: 'ODbL' },
    bbox: SF_BBOX,
    trace: [],
    ...overrides,
  }
}

function makeLinksResult(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    kind: 'links',
    candidates: [
      { title: 'Dataset A', url: 'https://example.com/a', format: 'CSV' },
      { title: 'Dataset B', url: 'https://example.com/b', format: 'GeoJSON' },
    ],
    provenance: { source: 'ckan' },
    trace: [],
    ...overrides,
  }
}

function makeRasterResult(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    kind: 'raster',
    data_url: 'https://example.com/tile.tif',
    provenance: { source: 'stac', attribution: 'Sentinel-2' },
    trace: [],
    ...overrides,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Type into the query input and click the Discover button */
async function typeAndDiscover(query: string) {
  const input = screen.getByPlaceholderText(/What data do you need/)
  fireEvent.change(input, { target: { value: query } })
  const button = screen.getByText('Discover')
  fireEvent.click(button)
  // Wait for the async discover/geocode to settle
  await waitFor(() => {
    expect(mockDiscover).toHaveBeenCalled()
  })
}

/** Simulate the full geocode → confirm → search flow */
async function geocodeAndConfirm(query: string) {
  mockGeocode.mockResolvedValueOnce(mockGeocodeResult)
  mockDiscover.mockResolvedValueOnce(makeVectorResult())

  const input = screen.getByPlaceholderText(/What data do you need/)
  fireEvent.change(input, { target: { value: query } })
  const button = screen.getByText('Discover')
  fireEvent.click(button)

  // Wait for geocoding to complete and confirm state to appear
  await waitFor(() => {
    expect(screen.getByText(/Area of interest/)).toBeTruthy()
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DiscoveryPanel — initial render', () => {
  it('renders empty state with input and Discover button', () => {
    render(<DiscoveryPanel />)
    expect(screen.getByPlaceholderText(/What data do you need/)).toBeTruthy()
    expect(screen.getByText('Discover')).toBeTruthy()
  })

  it('Discover button is disabled when input is empty', () => {
    render(<DiscoveryPanel />)
    const button = screen.getByText('Discover') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('Discover button is enabled when input has text', () => {
    render(<DiscoveryPanel />)
    const input = screen.getByPlaceholderText(/What data do you need/)
    fireEvent.change(input, { target: { value: 'buildings' } })
    const button = screen.getByText('Discover') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})

describe('DiscoveryPanel — source prop (6c prefix routing)', () => {
  it('renders source badge when source prop is provided', () => {
    render(<DiscoveryPanel source="osm" />)
    // Source should be displayed somewhere — badge, label, or heading
    expect(screen.getByText(/osm/i)).toBeTruthy()
  })

  it('does not render source badge when source prop is omitted', () => {
    render(<DiscoveryPanel />)
    // No source-specific text should appear in idle state
    expect(screen.queryByText(/osm/i)).toBeNull()
    expect(screen.queryByText(/ckan/i)).toBeNull()
    expect(screen.queryByText(/stac/i)).toBeNull()
  })
})

describe('DiscoveryPanel — initialQuery prop (6c prefix routing)', () => {
  it('populates the input with initialQuery on mount', () => {
    render(<DiscoveryPanel initialQuery="buildings in San Francisco" />)
    const input = screen.getByPlaceholderText(/What data do you need/) as HTMLInputElement
    expect(input.value).toBe('buildings in San Francisco')
  })

  it('does NOT override user typing on subsequent re-renders', () => {
    const { rerender } = render(<DiscoveryPanel initialQuery="buildings in San Francisco" />)
    const input = screen.getByPlaceholderText(/What data do you need/) as HTMLInputElement
    expect(input.value).toBe('buildings in San Francisco')

    // User types something different
    fireEvent.change(input, { target: { value: 'roads in Oakland' } })
    expect(input.value).toBe('roads in Oakland')

    // Re-render with same initialQuery — should NOT reset to initialQuery
    rerender(<DiscoveryPanel initialQuery="buildings in San Francisco" />)
    expect(input.value).toBe('roads in Oakland')
  })

  it('empty initialQuery does not populate input', () => {
    render(<DiscoveryPanel initialQuery="" />)
    const input = screen.getByPlaceholderText(/What data do you need/) as HTMLInputElement
    expect(input.value).toBe('')
  })
})

describe('DiscoveryPanel — onBboxPreview (6b)', () => {
  it('fires onBboxPreview with bbox when geocode resolves and confirm state appears', async () => {
    const onBboxPreview = vi.fn()
    mockGeocode.mockResolvedValueOnce(mockGeocodeResult)

    render(<DiscoveryPanel onBboxPreview={onBboxPreview} />)

    const input = screen.getByPlaceholderText(/What data do you need/)
    fireEvent.change(input, { target: { value: 'buildings in San Francisco' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(onBboxPreview).toHaveBeenCalledWith(SF_BBOX)
    })
  })

  it('fires onBboxPreview(null) when user clicks Skip — search globally', async () => {
    const onBboxPreview = vi.fn()
    mockGeocode.mockResolvedValueOnce(mockGeocodeResult)
    mockDiscover.mockResolvedValueOnce(makeVectorResult())

    render(<DiscoveryPanel onBboxPreview={onBboxPreview} />)

    const input = screen.getByPlaceholderText(/What data do you need/)
    fireEvent.change(input, { target: { value: 'buildings in San Francisco' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText(/Skip.*search globally/)).toBeTruthy()
    })

    onBboxPreview.mockClear()
    fireEvent.click(screen.getByText(/Skip.*search globally/))

    await waitFor(() => {
      expect(onBboxPreview).toHaveBeenCalledWith(null)
    })
  })

  it('fires onBboxPreview(null) when user clicks the clear (✕) button', async () => {
    const onBboxPreview = vi.fn()
    mockGeocode.mockResolvedValueOnce(mockGeocodeResult)

    render(<DiscoveryPanel onBboxPreview={onBboxPreview} />)

    const input = screen.getByPlaceholderText(/What data do you need/)
    fireEvent.change(input, { target: { value: 'buildings in San Francisco' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('✕')).toBeTruthy()
    })

    onBboxPreview.mockClear()
    fireEvent.click(screen.getByText('✕'))

    await waitFor(() => {
      expect(onBboxPreview).toHaveBeenCalledWith(null)
    })
  })
})

describe('DiscoveryPanel — onImport (6a)', () => {
  it('fires onImport with the DiscoveryResult when Import to workspace clicked', async () => {
    const onImport = vi.fn()
    const vectorResult = makeVectorResult()
    mockDiscover.mockResolvedValueOnce(vectorResult)

    render(<DiscoveryPanel onImport={onImport} />)

    const input = screen.getByPlaceholderText(/What data do you need/)
    fireEvent.change(input, { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Import to workspace')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Import to workspace'))
    expect(onImport).toHaveBeenCalledWith(vectorResult)
  })

  it('fires onImport with vector result containing FeatureCollection data', async () => {
    const onImport = vi.fn()
    const vectorResult = makeVectorResult({
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }, properties: { id: 1 } },
        ],
      },
    })
    mockDiscover.mockResolvedValueOnce(vectorResult)

    render(<DiscoveryPanel onImport={onImport} />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'parcels' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Import to workspace')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Import to workspace'))
    expect(onImport).toHaveBeenCalledTimes(1)
    const calledWith = onImport.mock.calls[0][0]
    expect(calledWith.kind).toBe('vector')
    expect(calledWith.data).toBeDefined()
  })
})

describe('DiscoveryPanel — import button visibility by kind', () => {
  it('shows Import to workspace for vector kind', async () => {
    mockDiscover.mockResolvedValueOnce(makeVectorResult())
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Import to workspace')).toBeTruthy()
    })
  })

  it('hides Import to workspace for links kind', async () => {
    mockDiscover.mockResolvedValueOnce(makeLinksResult())
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'datasets' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText(/candidates? found/)).toBeTruthy()
    })

    expect(screen.queryByText('Import to workspace')).toBeNull()
  })

  it('hides Import to workspace for raster kind with data_url (links to external asset)', async () => {
    mockDiscover.mockResolvedValueOnce(makeRasterResult())
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'satellite imagery' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText(/Asset URL resolved/)).toBeTruthy()
    })

    // Per contract: raster with data_url should NOT show import — it links externally
    expect(screen.queryByText('Import to workspace')).toBeNull()
  })
})

describe('DiscoveryPanel — loading states', () => {
  it('shows Locating... during geocoding', async () => {
    // Never-resolving geocode to keep the loading state
    mockGeocode.mockReturnValueOnce(new Promise(() => {}))

    render(<DiscoveryPanel />)
    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings in SF' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Locating...')).toBeTruthy()
    })
  })

  it('shows Searching... during discovery search', async () => {
    // No geocode needed (no place pattern), never-resolving discover
    mockDiscover.mockReturnValueOnce(new Promise(() => {}))

    render(<DiscoveryPanel />)
    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeTruthy()
    })
  })

  it('shows Confirm & Search in confirming state', async () => {
    mockGeocode.mockResolvedValueOnce(mockGeocodeResult)

    render(<DiscoveryPanel />)
    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings in San Francisco' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Confirm & Search')).toBeTruthy()
    })
  })

  it('Discover button is disabled during geocoding', async () => {
    mockGeocode.mockReturnValueOnce(new Promise(() => {}))

    render(<DiscoveryPanel />)
    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings in SF' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      const button = screen.getByText('Locating...') as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })
  })
})

describe('DiscoveryPanel — result display', () => {
  it('shows kind badge in result', async () => {
    mockDiscover.mockResolvedValueOnce(makeVectorResult())
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('vector')).toBeTruthy()
    })
  })

  it('shows source in result provenance', async () => {
    mockDiscover.mockResolvedValueOnce(makeVectorResult({ provenance: { source: 'osm', license: 'ODbL' } }))
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText(/Source: osm/)).toBeTruthy()
    })
  })

  it('shows feature count for vector results', async () => {
    mockDiscover.mockResolvedValueOnce(makeVectorResult({
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: {} },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 2] }, properties: {} },
        ],
      },
    }))
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'points' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText(/3 features loaded/)).toBeTruthy()
    })
  })

  it('shows candidate list for links results', async () => {
    mockDiscover.mockResolvedValueOnce(makeLinksResult())
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'datasets' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Dataset A')).toBeTruthy()
      expect(screen.getByText('Dataset B')).toBeTruthy()
      expect(screen.getByText(/2 candidates found/)).toBeTruthy()
    })
  })

  it('shows discovery trace when trace entries exist', async () => {
    mockDiscover.mockResolvedValueOnce(makeVectorResult({ trace: ['Resolved query via OSM Overpass', 'Filtered to polygon features'] }))
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Discovery trace')).toBeTruthy()
    })
  })
})

describe('DiscoveryPanel — error handling', () => {
  it('shows error message when discover fails', async () => {
    mockDiscover.mockRejectedValueOnce(new Error('Service unavailable'))
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeTruthy()
    })
  })

  it('returns to idle state after error', async () => {
    mockDiscover.mockRejectedValueOnce(new Error('Network error'))
    render(<DiscoveryPanel />)

    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy()
    })

    // Button should be back to "Discover" (idle state)
    expect(screen.getByText('Discover')).toBeTruthy()
  })
})

describe('DiscoveryPanel — bbox confirm flow', () => {
  it('shows bbox fields in confirming state', async () => {
    mockGeocode.mockResolvedValueOnce(mockGeocodeResult)

    render(<DiscoveryPanel />)
    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings in San Francisco' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText('West')).toBeTruthy()
      expect(screen.getByText('East')).toBeTruthy()
      expect(screen.getByText('South')).toBeTruthy()
      expect(screen.getByText('North')).toBeTruthy()
    })
  })

  it('shows place name in area of interest header', async () => {
    mockGeocode.mockResolvedValueOnce(mockGeocodeResult)

    render(<DiscoveryPanel />)
    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings in San Francisco' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText(/San Francisco, California, USA/)).toBeTruthy()
    })
  })

  it('confirming bbox runs discovery with the bbox', async () => {
    mockGeocode.mockResolvedValueOnce(mockGeocodeResult)
    mockDiscover.mockResolvedValueOnce(makeVectorResult())

    render(<DiscoveryPanel />)
    fireEvent.change(screen.getByPlaceholderText(/What data do you need/), { target: { value: 'buildings in San Francisco' } })
    fireEvent.click(screen.getByText('Discover'))

    await waitFor(() => {
      expect(screen.getByText(/Search this area/)).toBeTruthy()
    })

    fireEvent.click(screen.getByText(/Search this area/))

    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalledWith(
        expect.objectContaining({ bbox: SF_BBOX }),
      )
    })
  })
})
