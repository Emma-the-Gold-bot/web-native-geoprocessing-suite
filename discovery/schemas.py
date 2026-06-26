"""Pydantic schemas for discovery request/response."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class BBox(BaseModel):
    """West, south, east, north in EPSG:4326."""

    west: float
    south: float
    east: float
    north: float

    def as_list(self) -> list[float]:
        return [self.west, self.south, self.east, self.north]


class DiscoveryRequest(BaseModel):
    query: str
    bbox: Optional[BBox] = None
    source: Optional[str] = None
    params: Optional[dict[str, Any]] = None


class DiscoveryResult(BaseModel):
    kind: str  # "vector" | "raster" | "links"
    data: Optional[Any] = None  # GeoJSON FeatureCollection for vector, or None
    data_url: Optional[str] = None  # URL for raster assets or remote files
    format: Optional[str] = None
    provenance: dict[str, Any] = {}
    bbox: Optional[BBox] = None
    candidates: Optional[list[dict[str, Any]]] = None
    trace: list[str] = []
