# Data Discovery Integration — Specification

> Phase 1 (SPECIFY) of spec-driven development.
> Status: **Draft — awaiting human review.**

---

## A. Objective

**Primary goal:** Add a standalone data discovery capability to the web-native geoprocessing suite that lets users find and fetch spatial data by describing what they need in plain language, across multiple protocols (CKAN, ArcGIS REST, Overpass, STAC, direct files, web search).

**Secondary goals:**
- Establish a lightweight backend service pattern the suite can reuse for future server-side needs
- Results feed directly into the existing import pipeline (become source artifacts)
- Discovery lives outside the engine plugin ecosystem — no geospatial operations involved

**Out of scope:**
- Modifying existing operation contracts, registry, or execution substrate
- Replacing or modifying the existing NL resolver (discovery feeds *into* it)
- Executor replanning, metric buffering, sandbox isolation (evaluated later, not this integration)
- Raster analysis (STAC discovery is in scope; NDVI computation is not — that's an operation)
- Auth, rate limiting, caching (deferred to productionization phase)

---

## B. Commands & Environment

**Backend service (new):**
- Python 3.10+ with FastAPI + httpx (matches geo-harness's stack)
- Runs locally alongside the Vite dev server
- Single entry point: `python -m uvicorn discovery_server:app --port 8001`

**Frontend (existing):**
- `npm run dev` — no changes to existing dev workflow
- Discovery panel adds a new component, no changes to existing build pipeline

**Environment variables:**
- `OPENROUTER_API_KEY` — optional; enables LLM routing for protocol selection. Without it, discovery runs in heuristic mode (keyword matching, like geo-harness's mock mode)
- `DISCOVERY_PORT` — optional; defaults to 8001

**Dependencies to add:**
- Backend: `fastapi`, `uvicorn`, `httpx` (new `requirements.txt` in a `discovery/` directory)
- Frontend: none new — uses existing React/TypeScript/Vite stack

---

## C. Project Structure

**New files/directories:**

```
web-native-geoprocessing-suite/
├── discovery/                      # NEW — backend service
│   ├── requirements.txt
│   ├── server.py                   # FastAPI app: /api/discover endpoint
│   ├── sources.py                  # Protocol clients (ported from geo-harness)
│   │   ├── overpass()              # OSM via Overpass API
│   │   ├── arcgis_feature_server() # Esri ArcGIS REST
│   │   ├── ckan_search()           # CKAN/Socrata portals
│   │   ├── stac_sentinel2()        # Sentinel-2 via Planetary Computer
│   │   ├── fetch_file()            # Direct file fetch (geojson/gpkg/zip-shp)
│   │   └── web_search()            # DuckDuckGo HTML (keyless)
│   ├── router.py                   # Protocol routing (heuristic + optional LLM)
│   ├── schemas.py                  # DiscoveryRequest, DiscoveryResult, Provenance
│   └── geocode.py                  # Nominatim geocoding (place name → bbox)
├── src/
│   └── components/
│       └── DiscoveryPanel.tsx       # NEW — discovery UI in bottom dock
│   └── lib/
│       └── discovery.ts            # NEW — API client for discovery backend
```

**Modified files:**
- `src/App.tsx` — add Discovery tab in bottom dock alongside existing Ask/SQL/Results tabs
- `src/types.ts` — add DiscoveryResult, DiscoveryCandidate types
- `package.json` — no new npm deps; add script for discovery backend if desired

**Not modified:**
- `src/lib/operations/` — untouched
- `src/lib/nl/` — untouched (discovery feeds into import, not into NL resolver)
- `src/lib/spatial/` — untouched
- Engine plugin schema — untouched

---

## D. Code Style

- **Backend:** Follow geo-harness conventions — Python 3.10+ type hints, docstrings, `from __future__ import annotations`. Keep it lean — one function per protocol client.
- **Frontend:** Follow existing suite conventions — TypeScript strict, React functional components, existing UI patterns (bottom dock tabs, right panel details).
- **No new linting/formatting tools** — use whatever the suite already uses.

---

## E. Testing Strategy

**Backend tests (pytest):**
- Unit tests per protocol client (mocked HTTP responses — no live network calls in CI)
- Test heuristic router: "find buildings" → overpass, "sentinel imagery" → stac, "parcel data Butte County" → web_search → file
- Test search-chaining: web_search result → follow-up fetch
- Test geocoding: place name → bbox
- Test error handling: missing bbox, bad URLs, timeout, empty results

**Frontend tests:**
- Smoke test: Discovery panel renders, accepts input, displays results
- Integration test: discovery result → import pipeline → source artifact appears

**Manual QA:**
- End-to-end: type "building footprints in San Francisco" → discovery finds OSM data → import → map renders

**No end-to-end automation** in this phase — that comes after the seam is proven.

---

## F. Boundaries

### Always do (actions I take without asking)
- Port protocol clients from geo-harness, adapting to TypeScript where needed for browser-side components
- Keep discovery backend independent — no shared state with engine
- Follow existing patterns for UI integration (bottom dock tab)
- Run existing build (`npm run build`) after changes to verify no breakage
- Write tests for new backend code

### Ask first (actions requiring explicit approval)
- Adding new npm packages to the frontend
- Adding new Python packages beyond fastapi/uvicorn/httpx
- Changing the Vite config or proxy setup
- Modifying existing import pipeline code to accept discovery results
- Deploying the backend service anywhere (local dev only for now)

### Never do (actions I refuse)
- Modifying operation registry, contracts, or execution substrate for discovery
- Adding discovery as an operation in the engine plugin system
- Replacing or modifying the existing NL resolver
- Adding auth, rate limiting, or caching in this phase
- Committing API keys or secrets to the repo

---

## Key Design Decisions

### 1. Backend language: Python (not TypeScript)
Geo-harness's discovery clients are Python. The suite is TypeScript. Options:
- **Port to TypeScript** — clean, no Python dependency, but significant rewrite of protocol clients
- **Keep Python backend** — fastest path, battle-tested clients, but adds a second language/runtime

**Recommendation:** Python backend. Discovery is standalone anyway. The suite already has zero backend — adding Python FastAPI is no worse than adding Node Express, and the protocol clients are ready-made. A future port to TypeScript is possible once the integration is proven.

### 2. Communication: REST API (not WebSocket/SSE)
Discovery requests are request-response, not streaming. A simple `POST /api/discover` endpoint returning JSON results. If we want streaming discovery traces later (like geo-harness's SSE events), we can add SSE — but not in v1.

### 3. Heuristic routing first, LLM optional
Without an API key, discovery uses keyword matching to pick protocols ("buildings" → overpass, "imagery" → stac, "data" → ckan). This covers 80% of cases. LLM routing (like geo-harness) adds the ability to handle ambiguous queries and chain web_search → fetch. Both modes work; LLM is an upgrade.

### 4. Discovery → Import pipeline handoff
Discovery returns a `DiscoveryResult` containing:
- `kind`: "vector" | "raster" | "links" (candidates for further research)
- `data_url`: URL to fetch the actual data (or null for links)
- `format`: "geojson" | "gpkg" | "shapefile" | "stac" | etc.
- `provenance`: source, license, attribution
- `bbox`: spatial extent

The frontend's import pipeline receives this and either:
- Auto-fetches the data (for direct URLs: file, arcgis, overpass)
- Shows candidates for user selection (for web_search / ckan results)

---

## Risks

| Risk | Mitigation |
|------|-----------|
| CORS blocking browser → backend | Backend runs locally, frontend proxies through Vite dev server |
| Protocol APIs change/break | Each client is isolated; failures don't cascade |
| LLM routing cost | Heuristic mode works without API key; LLM is optional upgrade |
| Python runtime dependency | Discovery is standalone; can be containerized later |
| Suite's import pipeline doesn't accept discovery format | We'll need a thin adapter — worth the coupling |

---

## Resolved Questions

1. **Vite proxy** — ✅ Vite proxy. Backend runs on localhost:8001, frontend proxies `/api` routes through Vite dev server. No CORS headers needed on backend.
2. **STAC resolution** — TBD during implementation. Likely: backend resolves STAC asset references to direct download URLs before returning to frontend.
3. **Import pipeline adapter** — TBD during implementation. Likely minimal — existing import flow already accepts GeoJSON URLs.
