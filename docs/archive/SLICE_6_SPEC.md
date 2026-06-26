# Slice 6: Discovery Backend Wiring

## Goal

Connect the existing discovery frontend (fully built `DiscoveryPanel.tsx` + `discovery.ts`) to the existing discovery backend (FastAPI in `discovery/`) via Vite proxy config. Add graceful degradation when backend isn't running. Document setup.

## Current State

- **Frontend:** `DiscoveryPanel.tsx` (fully built — search form, geocode flow, bbox confirmation, result rendering, import handler). Calls `fetch('/api/discover')` and `fetch('/api/geocode')` via `src/lib/discovery.ts`.
- **Backend:** `discovery/server.py` (FastAPI app, CORS configured). Routes: `POST /api/discover`, `POST /api/geocode`, `GET /api/health`. Sources: Overpass (OSM), ArcGIS FeatureServer, CKAN, STAC (Sentinel-2), DuckDuckGo web search. 677 lines Python across 5 files + 3 test files.
- **Gap:** No Vite proxy. Frontend calls `/api/*` which hits Vite dev server (404). No graceful error when backend is down. No docs for running backend.

## Work

### 1. Vite proxy config (`vite.config.ts`)

Add `server.proxy` to route `/api/*` → `http://localhost:8001`:

```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8001',
      changeOrigin: true,
    },
  },
},
```

This makes `fetch('/api/discover')` work in dev when backend is running on port 8001.

### 2. Graceful degradation (`src/lib/discovery.ts`)

- Add `checkDiscoveryHealth(): Promise<boolean>` — pings `/api/health`, returns true/false
- Improve error messages in `discover()` and `geocode()` — when fetch fails (network error), return a clear message: "Discovery backend not running. Start it with: cd discovery && uvicorn discovery.server:app --port 8001"
- Don't throw on network errors — throw a typed error the UI can distinguish from backend errors

### 3. Backend status indicator (`src/components/DiscoveryPanel.tsx`)

- On mount, call `checkDiscoveryHealth()`. Store `backendOnline: boolean | null`
- Show status badge in panel header: green dot + "Connected" or amber dot + "Backend offline — run discovery server"
- When offline, disable search button, show setup instructions (one-liner + link to docs)
- Re-check health when panel gains focus (user clicks back into it)

### 4. Documentation (`discovery/README.md`)

Short setup guide:
- Prerequisites: Python 3.12+, pip
- Setup: `cd discovery && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- Run: `uvicorn discovery.server:app --port 8001 --reload`
- Health check: `curl http://localhost:8001/api/health`
- Available sources: OSM (Overpass), ArcGIS, CKAN, STAC (Sentinel-2), web search
- Port 8001 chosen to avoid conflicts with Vite (5173/4173)

## Files to modify

| File | Change |
|------|--------|
| `vite.config.ts` | Add `server.proxy` for `/api` → `localhost:8001` |
| `src/lib/discovery.ts` | Add `checkDiscoveryHealth()`, improve error messages |
| `src/components/DiscoveryPanel.tsx` | Backend status badge, offline state UI |
| `discovery/README.md` | Setup + run documentation (new file) |

## Files NOT touched

- `src/App.tsx` — no changes needed (DiscoveryPanel already wired)
- `src/lib/**` (other than discovery.ts) — engine code
- `src/styles.css` — minimal CSS only if needed for status badge (prefer inline styles matching existing pattern)
- `discovery/*.py` — backend code is done
- Test files

## Acceptance Criteria

1. `npm run dev` with backend running → discovery search works end-to-end (geocode → confirm bbox → search → import to map)
2. `npm run dev` without backend → DiscoveryPanel shows "Backend offline" status, search disabled, setup hint visible
3. `npm run build` clean (exit 0)
4. All existing tests pass (195/195)
5. `discovery/README.md` exists with setup instructions
6. Smoke test still passes (9/9) — discovery panel not part of smoke test, so no regression

## Out of scope

- Command bar prefixes `@osm`, `@ckan`, `@stac` (Slice 7)
- Actually running the backend (that's deployment, not code)
- Backend tests or backend code changes
- Undo/redo (Slice 8)
- Export menu (Slice 9)
