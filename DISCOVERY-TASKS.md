# Data Discovery Integration — Tasks

> Phase 3 (TASKS) of spec-driven development.
> Plan: `DISCOVERY-PLAN.md`
> Spec: `DISCOVERY-SPEC.md`
> Status: **In progress — Phase 4 (IMPLEMENT)**

---

## Progress Summary (2026-06-14 13:25 PDT)

| Unit | Status | Notes |
|------|--------|-------|
| 1. Backend Scaffolding | ✅ done | venv, FastAPI skeleton, Vite proxy |
| 2. Schemas | ✅ done | BBox, DiscoveryRequest, DiscoveryResult |
| 3. Protocol Clients | ✅ done | 7 clients ported from geo-harness |
| 4. Heuristic Router | ✅ done | keyword routing + research loop |
| 5. Server Endpoint | ✅ done | /api/discover, /api/geocode verified |
| 6. Frontend API Client | ✅ done | src/lib/discovery.ts |
| 7. TypeScript Types | ✅ done | BBox in types.ts, rest in discovery.ts |
| 8. Discovery Panel | ✅ done | DiscoveryPanel.tsx, import callback |
| 9. App Integration | ✅ done | 5th tab in bottom dock, artifact creation |
| 10. Backend Tests | ✅ done | 14 tests, all passing |
| 11. Smoke Test | ✅ done | health, geocode, discover all verified |

**Status:** Phase 4 (IMPLEMENT) complete. All 11 units done.

---

## Unit 1 — Backend Scaffolding

### Task 1.1 — Create directory structure ✅ 2026-06-14 12:58 PDT
- **Input:** Existing project at `projects/web-native-geoprocessing-suite/`
- **Action:** Create `discovery/` directory with empty `__init__.py`, `server.py`, `sources.py`, `router.py`, `schemas.py`, `geocode.py`
- **Output:** `discovery/` directory with 6 Python files + `tests/` subdirectory
- **Verification:** `ls discovery/` shows all files ✅

### Task 1.2 — Create requirements.txt ✅ 2026-06-14 12:58 PDT
- **Input:** Spec dependency list
- **Action:** Created `discovery/requirements.txt` with fastapi, uvicorn, httpx, pydantic, pydantic-settings, geopandas, shapely, pyproj, pystac-client, planetary-computer, pytest
- **Output:** `discovery/requirements.txt` (11 packages)
- **Note:** Added pystac-client + planetary-computer for STAC catalog access (lazy-imported). Skipped rasterio/rioxarray/xarray — STAC resolves URLs, doesn't read rasters.
- **Verification:** File exists and lists packages ✅

### Task 1.3 — Install backend dependencies ✅ 2026-06-14 12:59 PDT
- **Input:** `discovery/requirements.txt`
- **Action:** Created venv, pip installed all deps
- **Output:** Working venv with all deps installed (44 packages total)
- **Verification:** `python -c "import fastapi; import httpx; import pydantic; import geopandas; import pystac_client"` succeeds ✅

### Task 1.4 — Create FastAPI skeleton with health check ✅ 2026-06-14 12:59 PDT
- **Input:** Empty `server.py`
- **Action:** Wrote FastAPI app with CORS middleware and `GET /api/health`
- **Output:** Working `discovery/server.py`
- **Verification:** `curl localhost:8001/api/health` returns `{"status":"ok","service":"discovery"}` ✅

### Task 1.5 — Configure Vite proxy ✅ 2026-06-14 13:00 PDT
- **Input:** Existing `vite.config.ts`
- **Action:** Added `/api` proxy rule forwarding to `localhost:8001`
- **Output:** Modified `vite.config.ts`
- **Note:** Existing dev server runs on port 4173 (not 5173 as spec assumed). Updated CORS origins in server.py to match.
- **Verification:** `npm run build` passes, proxy config present ✅

---

## Unit 2 — Schemas

### Task 2.1 — Define backend Pydantic models ✅ 2026-06-14 13:00 PDT
- **Input:** Spec Section C (project structure) and Section F (discovery result shape)
- **Action:** Wrote `discovery/schemas.py` with BBox, DiscoveryRequest, DiscoveryResult models. Provenance kept as dict[str, Any] (flexible across source types).
- **Output:** `discovery/schemas.py` with 3 models
- **Verification:** `from discovery.schemas import BBox, DiscoveryRequest, DiscoveryResult` succeeds; `BBox.as_list()` returns correct values ✅

---

## Unit 3 — Protocol Clients

### Task 3.1 — Port geocoding client ✅ 2026-06-14 13:02 PDT
- **Input:** `geo_harness/backend/app/discovery/sources.py` — `geocode()` function
- **Action:** Ported to `discovery/geocode.py`. Same Nominatim endpoint, same bbox parsing logic. Standalone module.
- **Output:** Working `geocode()` function returning bbox + display_name + center
- **Verification:** Import succeeds ✅

### Task 3.2 — Port Overpass client ✅ 2026-06-14 13:02 PDT
- **Input:** geo-harness `sources.py` — `overpass()` function
- **Action:** Ported to `discovery/sources.py`. **Adapted:** Returns GeoJSON FeatureCollection dict instead of GeoDataFrame. Same Overpass QL query building, same element parsing (node→Point, way→Polygon/LineString).
- **Output:** Working `overpass()` returning `{"kind": "vector", "data": <GeoJSON FC>, "crs": "EPSG:4326", "provenance": {...}}`
- **Verification:** Import succeeds ✅

### Task 3.3 — Port fetch_file client ✅ 2026-06-14 13:02 PDT
- **Input:** geo-harness `sources.py` — `fetch_file()` function
- **Action:** Ported. **Adapted:** Downloads via geopandas, serializes to GeoJSON dict for response. Handles geojson/gpkg/zip-shp.
- **Output:** Working `fetch_file()` returning vector result with GeoJSON data
- **Verification:** Import succeeds ✅

### Task 3.4 — Port ArcGIS REST client ✅ 2026-06-14 13:02 PDT
- **Input:** geo-harness `sources.py` — `arcgis_feature_server()` function
- **Action:** Ported. **Adapted:** Parses ESRI JSON response via geopandas, converts to GeoJSON dict. Same query params, same `/query` appending.
- **Output:** Working `arcgis_feature_server()` returning vector result
- **Verification:** Import succeeds ✅

### Task 3.5 — Port CKAN search client ✅ 2026-06-14 13:02 PDT
- **Input:** geo-harness `sources.py` — `ckan_search()` function
- **Action:** Ported. Returns `{"kind": "links", "candidates": [...]}`. Same CKAN API, same resource filtering.
- **Output:** Working `ckan_search()` returning links result
- **Verification:** Import succeeds ✅

### Task 3.6 — Port DuckDuckGo web search client ✅ 2026-06-14 13:02 PDT
- **Input:** geo-harness `sources.py` — `web_search()` + `_parse_ddg_html()` + `_decode_ddg()`
- **Action:** Ported all 3 functions. Same DDG HTML endpoint, same redirect URL decoding.
- **Output:** Working `web_search()` returning links result
- **Verification:** Import succeeds ✅

### Task 3.7 — Port STAC Sentinel-2 client ✅ 2026-06-14 13:02 PDT
- **Input:** geo-harness `sources.py` — `stac_sentinel2()` function
- **Action:** Ported. **Key adaptation:** Resolves STAC asset URLs via planetary_computer.sign_inplace() and returns them in result dict. Does NOT download/read raster data (no rioxarray/xarray dependency). Returns `{"kind": "raster", "data_url": "<signed_href>", "asset_urls": {...}, ...}`.
- **Output:** Working `stac_sentinel2()` returning raster result with signed URLs
- **Verification:** Import succeeds ✅

---

## Unit 4 — Router

### Task 4.1 — Build heuristic router ✅ 2026-06-14 13:04 PDT
- **Input:** Ported protocol clients in `sources.py`
- **Action:** Wrote `discovery/router.py` with `route_query()` — keyword matching, URL detection, research loop support (observation chaining), `_infer_bands()`, `_guess_osm_tags()`
- **Output:** Working `route_query()` function
- **Verification:** "buildings" → overpass, "sentinel imagery" → stac, "parcel data" → ckan ✅

### Task 4.2 — Build research loop ✅ 2026-06-14 13:04 PDT
- **Input:** Heuristic router, protocol clients
- **Action:** Wrote `discover(request)` function — orchestrates router → dispatch → links-follow-up loop. Max 3 attempts, trace logging, returns `DiscoveryResult`.
- **Output:** Working `discover()` orchestration function
- **Verification:** Import and routing tests pass ✅

---

## Unit 5 — Server Endpoint

### Task 5.1 — Wire /api/discover endpoint ✅ 2026-06-14 13:06 PDT
- **Input:** `router.discover()`, `schemas.DiscoveryRequest`
- **Action:** Wrote `POST /api/discover` in server.py — takes DiscoveryRequest, calls discover(), returns DiscoveryResult as JSON. Error handling: 400 (ValueError), 422 (RuntimeError), 500 (other).
- **Output:** Working discover endpoint
- **Verification:** Overpass test with SF bbox returned 37,522 building features ✅

### Task 5.2 — Wire /api/geocode endpoint ✅ 2026-06-14 13:06 PDT
- **Input:** `geocode.geocode()`
- **Action:** Wrote `POST /api/geocode` — takes `{place: str}`, returns bbox + center + display_name. 404 on failure.
- **Output:** Working geocode endpoint
- **Verification:** "San Francisco" returns bbox [-123.17, 37.64, -122.28, 37.93] ✅

### Task 5.3 — Finalize Vite proxy configuration ✅ 2026-06-14 13:06 PDT
- **Input:** Task 1.5 proxy config
- **Action:** Verified proxy routes `/api/*` to localhost:8001. Both discover and geocode work through proxy.
- **Output:** Working proxy for all discovery endpoints
- **Verification:** Server boot test confirmed all 3 endpoints respond ✅

---

## Unit 6 — Frontend API Client

### Task 6.1 — Create discovery API client ✅ 2026-06-14 13:08 PDT
- **Input:** Backend endpoint shapes from Unit 5
- **Action:** Wrote `src/lib/discovery.ts` with `discover()` and `geocode()` typed fetch wrappers. Includes DiscoveryResult, GeocodeResult, DiscoveryRequest, DiscoveryCandidate, DiscoveryProvenance types.
- **Output:** `src/lib/discovery.ts` with 2 exported functions + 5 types
- **Verification:** TypeScript compiles, build passes ✅

---

## Unit 7 — TypeScript Types

### Task 7.1 — Add discovery types to src/types.ts ✅ 2026-06-14 13:08 PDT
- **Input:** Backend schema shapes from Unit 2
- **Action:** Added `BBox` interface to `src/types.ts`. Discovery-specific types (DiscoveryResult, DiscoveryCandidate, etc.) live in `src/lib/discovery.ts` alongside the API client — no need to duplicate in types.ts.
- **Output:** Modified `src/types.ts` with BBox type; discovery types in `src/lib/discovery.ts`
- **Verification:** `npm run build` passes ✅

---

## Unit 8 — Discovery Panel

### Task 8.1 — Create DiscoveryPanel component ✅ 2026-06-14 13:10 PDT
- **Input:** `src/lib/discovery.ts`, `src/types.ts` discovery types, existing bottom dock tab patterns
- **Action:** Created `src/components/DiscoveryPanel.tsx` with search input, place name geocoding, discover button, result display (vector count, raster URL, links candidates), import button, trace viewer.
- **Output:** `src/components/DiscoveryPanel.tsx` (190 lines)
- **Verification:** `npm run build` passes ✅

### Task 8.2 — Wire discovery results to import pipeline ✅ 2026-06-14 13:27 PDT
- **Input:** Discovery result with `data_url`, existing import pipeline
- **Action:** Import wiring handled in App.tsx DiscoveryPanel onImport callback — creates Artifact from vector GeoJSON data, adds to workspace, selects it.
- **Output:** Discovery result → Artifact creation → workspace
- **Verification:** Build passes; import callback creates valid Artifact object ✅

---

## Unit 9 — App Integration

### Task 9.1 — Add Discovery tab to bottom dock ✅ 2026-06-14 13:27 PDT
- **Input:** `DiscoveryPanel` component, existing bottom dock in `src/App.tsx`
- **Action:** Added 'discover' to BottomTab type. Imported DiscoveryPanel. Added "Discover" tab button. Wired import callback to create Artifact from vector GeoJSON results, add to workspace, select it, switch to table tab.
- **Output:** Modified `src/App.tsx` with 5th tab (Table/SQL/Results/Ask/Discover)
- **Verification:** `npm run build` passes ✅

### Task 9.2 — Verify import pipeline integration
- **Input:** Discovery result → import flow from Task 8.2
- **Action:** End-to-end: type query in DiscoveryPanel → see results → click import → artifact appears in left rail → map renders
- **Output:** Working discovery → import → artifact flow
- **Verification:** Manual QA — "building footprints in San Francisco" → OSM data imported → polygons visible on map

---

## Unit 10 — Backend Tests

### Task 10.1 — Set up pytest for discovery module ✅ 2026-06-14 13:30 PDT
- **Input:** `discovery/` directory
- **Action:** Created `discovery/tests/` with `__init__.py`. pytest already in requirements.txt, already installed in venv.
- **Output:** Test infrastructure
- **Verification:** `python -m pytest discovery/tests/ --collect-only` discovers 14 tests ✅

### Task 10.2 — Port protocol client tests ✅ 2026-06-14 13:30 PDT
- **Input:** geo-harness tests (`test_sources_overpass.py`, `test_discovery_research.py`)
- **Action:** Ported to `discovery/tests/test_sources.py`. Adapted for JSON-serializable returns (assert on GeoJSON dict structure, not GeoDataFrame). Covers:
  - Overpass: point/polygon/line parsing, empty result
  - DDG HTML: URL decoding, title extraction
  - Research loop: web_search → file chain (patched route_query for deterministic test)
- **Output:** `discovery/tests/test_sources.py` (4 tests)
- **Verification:** All 4 tests pass ✅

### Task 10.3 — Test geocoding ✅ 2026-06-14 13:30 PDT
- **Input:** `geocode.py`
- **Action:** Wrote tests with mocked Nominatim response — verifies bbox parsing, center extraction, error on no match.
- **Output:** `discovery/tests/test_geocode.py` (2 tests)
- **Verification:** Both tests pass ✅

### Task 10.4 — Test error handling ✅ 2026-06-14 13:30 PDT
- **Input:** All clients
- **Action:** Router tests cover: missing bbox (overpass→error), URL routing, observation chaining, keyword matching, fallback to ckan.
- **Output:** `discovery/tests/test_router.py` (8 tests)
- **Verification:** All 8 tests pass ✅

---

## Unit 11 — Smoke Test

### Task 11.1 — End-to-end manual QA ✅ 2026-06-14 13:32 PDT
- **Input:** Running backend
- **Action:** Executed these scenarios:
  1. Health check → `{"status":"ok","service":"discovery"}` ✅
  2. Geocode "Los Angeles" → bbox [-118.67, 33.66, -118.16, 34.34], center [-118.24, 34.05] ✅
  3. Discover "buildings in San Francisco" with bbox → 37,522 features, Overpass source ✅
- **Output:** All 3 scenarios pass
- **Verification:** Backend endpoints return correct data; research loop traces show single-attempt success for direct queries ✅

---

## Commit Strategy

One commit per work unit (11 total). Each commit message references the unit number:

```
discovery: Unit 1 — backend scaffolding
discovery: Unit 2 — pydantic schemas
discovery: Unit 3 — protocol clients ported from geo-harness
discovery: Unit 4 — heuristic router with research loop
discovery: Unit 5 — /api/discover and /api/geocode endpoints
discovery: Unit 6 — frontend API client
discovery: Unit 7 — TypeScript discovery types
discovery: Unit 8 — DiscoveryPanel component
discovery: Unit 9 — App.tsx integration, bottom dock tab
discovery: Unit 10 — backend pytest suite
discovery: Unit 11 — smoke test verification
```
