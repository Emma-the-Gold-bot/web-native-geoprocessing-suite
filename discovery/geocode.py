"""Nominatim geocoding — place name to bounding box.

Ported from geo-harness backend/app/discovery/sources.py.
"""
from __future__ import annotations

from typing import Any

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "discovery-service/0.1 (web-native-geoprocessing-suite)"


def geocode(*, place: str, timeout: float = 30.0) -> dict[str, Any]:
    """Resolve a place name to a bbox + center using OSM Nominatim.

    Returns {"bbox": {west,south,east,north}, "display_name", "center": [lon,lat]}.
    Raises RuntimeError when no match is found.
    """
    resp = httpx.get(
        NOMINATIM_URL,
        params={"q": place, "format": "jsonv2", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
        follow_redirects=True,
    )
    resp.raise_for_status()
    results = resp.json()
    if not results:
        raise RuntimeError(f"No geocoding match for '{place}'.")
    top = results[0]
    # Nominatim boundingbox is [south, north, west, east] as strings.
    south, north, west, east = (float(v) for v in top["boundingbox"])
    return {
        "bbox": {"west": west, "south": south, "east": east, "north": north},
        "display_name": top.get("display_name", place),
        "center": [float(top["lon"]), float(top["lat"])],
    }
