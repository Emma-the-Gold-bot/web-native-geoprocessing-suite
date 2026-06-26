# Discovery Backend

Geospatial data discovery service for the web-native geoprocessing suite.

## Prerequisites

- Python 3.12+
- pip

## Setup

```bash
cd discovery
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn discovery.server:app --port 8001 --reload
```

> Port 8001 avoids conflicts with Vite (5173/4173).

## Health Check

```bash
curl http://localhost:8001/api/health
```

Expected response: `{"status": "ok", "service": "discovery"}`

## Available Data Sources

| Source | Type | Description |
|--------|------|-------------|
| **OSM (Overpass)** | Vector | OpenStreetMap buildings, roads, landuse via Overpass API |
| **ArcGIS FeatureServer** | Vector | ArcGIS REST feature services by URL |
| **CKAN** | Vector | CKAN data portals (data.gov, etc.) |
| **STAC (Sentinel-2)** | Raster | Sentinel-2 satellite imagery via STAC catalogs |
| **Web Search** | Links | DuckDuckGo-powered discovery of spatial datasets |

## API Endpoints

- `GET /api/health` — Health check
- `POST /api/discover` — Discover spatial data by query
- `POST /api/geocode` — Resolve place name to bounding box

## Architecture

The discovery service runs as a standalone FastAPI server. The frontend Vite dev server proxies `/api/*` requests to `localhost:8001` (configured in `vite.config.ts`).

When the backend is not running, the frontend shows an offline indicator with setup instructions. Discovery features degrade gracefully — the rest of the application continues to work.
