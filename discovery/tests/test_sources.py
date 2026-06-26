"""Protocol client tests — ported from geo-harness with JSON-serializable adaptations.

All HTTP calls are monkeypatched. No live network requests.
"""
from __future__ import annotations

import json

import pytest

from discovery.schemas import BBox
from discovery import sources


# ---------------------------------------------------------------------------
# Overpass
# ---------------------------------------------------------------------------

_OSM_PAYLOAD = {
    "elements": [
        {"type": "node", "id": 1, "lat": 37.77, "lon": -122.42, "tags": {"amenity": "cafe"}},
        {
            "type": "way",
            "id": 2,
            "tags": {"building": "yes"},
            "geometry": [
                {"lat": 37.77, "lon": -122.42},
                {"lat": 37.77, "lon": -122.41},
                {"lat": 37.78, "lon": -122.41},
                {"lat": 37.77, "lon": -122.42},
            ],
        },
        {
            "type": "way",
            "id": 3,
            "tags": {"highway": "residential"},
            "geometry": [
                {"lat": 37.77, "lon": -122.42},
                {"lat": 37.78, "lon": -122.40},
            ],
        },
    ]
}


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_overpass_parses_points_polygons_and_lines(monkeypatch):
    monkeypatch.setattr(
        sources.httpx, "post", lambda *a, **k: _FakeResp(_OSM_PAYLOAD)
    )
    bbox = BBox(west=-122.45, south=37.74, east=-122.39, north=37.81)
    result = sources.overpass(bbox=bbox, tags={"building": True})

    assert result["kind"] == "vector"
    assert result["crs"] == "EPSG:4326"
    fc = result["data"]
    assert fc["type"] == "FeatureCollection"
    features = fc["features"]
    assert len(features) == 3
    geom_types = {f["geometry"]["type"] for f in features}
    assert {"Point", "Polygon", "LineString"} == geom_types
    assert result["provenance"]["license"] == "ODbL 1.0"


def test_overpass_empty_result_is_empty_gdf(monkeypatch):
    monkeypatch.setattr(
        sources.httpx, "post", lambda *a, **k: _FakeResp({"elements": []})
    )
    bbox = BBox(west=-122.45, south=37.74, east=-122.39, north=37.81)
    result = sources.overpass(bbox=bbox, tags={"building": True})
    assert result["data"]["features"] == []


# ---------------------------------------------------------------------------
# DuckDuckGo HTML parsing
# ---------------------------------------------------------------------------

_DDG_HTML = """
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Froads.geojson">
    Roads Example City (GeoJSON)
  </a>
</div>
<div class="result">
  <a class="result__a" href="https://data.example.gov/transport">Transport portal</a>
</div>
"""


def test_parse_ddg_decodes_redirect_urls():
    results = sources._parse_ddg_html(_DDG_HTML)
    assert results[0]["url"] == "https://example.org/roads.geojson"
    assert "Roads Example City" in results[0]["title"]
    assert results[1]["url"] == "https://data.example.gov/transport"


# ---------------------------------------------------------------------------
# Research loop (web_search → file chain)
# ---------------------------------------------------------------------------

def test_research_loop_chains_search_then_fetch(monkeypatch):
    import geopandas as gpd
    from shapely.geometry import Point

    def fake_web_search(*, query, **kwargs):
        return {
            "kind": "links",
            "results": [{"title": "Roads", "url": "https://example.org/roads.geojson"}],
            "provenance": {"source": "stub-search"},
        }

    fetched = {}

    def fake_fetch_file(*, url, **kwargs):
        fetched["url"] = url
        gdf = gpd.GeoDataFrame({"k": [1]}, geometry=[Point(0, 0)], crs="EPSG:4326")
        return {"kind": "vector", "data": json.loads(gdf.to_json()), "crs": "EPSG:4326", "provenance": {"source": "Direct file"}}

    # Patch web_search and fetch_file, but also patch route_query so the first
    # call returns web_search (simulating a query that doesn't match OSM keywords)
    from discovery import router

    original_route = router.route_query
    call_count = [0]

    def patched_route(query, params=None, observation=None):
        call_count[0] += 1
        if call_count[0] == 1:
            # First call: route to web_search
            return {"source": "web_search", "params": {}, "reason": "test: force web search"}
        # Second call: follow the observation
        return original_route(query, params, observation)

    monkeypatch.setattr(sources, "web_search", fake_web_search)
    monkeypatch.setattr(sources, "fetch_file", fake_fetch_file)
    monkeypatch.setattr(router, "route_query", patched_route)

    from discovery.router import discover
    from discovery.schemas import DiscoveryRequest

    result = discover(DiscoveryRequest(query="road network example city"))
    assert result.kind == "vector"
    assert fetched["url"] == "https://example.org/roads.geojson"
