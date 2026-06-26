"""Discovery backend service.

Run from project root:
    cd discovery && pip install -r requirements.txt
    uvicorn discovery.server:app --port 8001 --reload
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .geocode import geocode
from .router import discover
from .schemas import BBox, DiscoveryRequest, DiscoveryResult

app = FastAPI(title="Discovery Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4173", "http://127.0.0.1:4173",
                   "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "discovery"}


@app.post("/api/discover")
def discovery_endpoint(req: DiscoveryRequest) -> DiscoveryResult:
    """Find spatial data by describing what you need in plain language."""
    try:
        return discover(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Discovery failed: {exc}")


@app.post("/api/geocode")
def geocode_endpoint(req: dict) -> dict:
    """Resolve a place name to a bounding box + center via OSM Nominatim."""
    place = req.get("place", "")
    if not place:
        raise HTTPException(status_code=400, detail="Missing 'place' field")
    try:
        return geocode(place=place)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"geocode failed: {exc}")
