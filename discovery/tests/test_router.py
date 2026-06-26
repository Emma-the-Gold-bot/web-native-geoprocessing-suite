"""Router tests — heuristic routing + research loop."""
from __future__ import annotations

import pytest

from discovery.router import route_query


def test_buildings_route_to_overpass():
    r = route_query("find buildings in San Francisco")
    assert r["source"] == "overpass"
    assert "OSM" in r["reason"]


def test_overpass_requires_bbox_error_message():
    """Overpass without bbox gives a helpful error mentioning place names."""
    from discovery.router import _dispatch
    with pytest.raises(ValueError, match="bounding box"):
        _dispatch("overpass", {"tags": {"building": True}}, None)


def test_sentinel_imagery_routes_to_stac():
    r = route_query("sentinel-2 imagery near Sacramento")
    assert r["source"] == "stac"
    assert "imagery" in r["reason"]


def test_ndvi_routes_to_stac_with_ndvi_bands():
    r = route_query("NDVI vegetation index for Butte County")
    assert r["source"] == "stac"
    assert r["params"]["bands"] == "ndvi"


def test_parcels_route_to_ckan_fallback():
    r = route_query("parcel data Butte County")
    assert r["source"] == "ckan"


def test_url_provided_routes_to_file():
    r = route_query("get this data", params={"url": "https://example.org/data.geojson"})
    assert r["source"] == "file"


def test_featureserver_url_routes_to_arcgis():
    r = route_query(
        "get layer",
        params={"url": "https://example.com/arcgis/rest/services/Test/FeatureServer/0"},
    )
    assert r["source"] == "arcgis"


def test_observation_follows_first_usable_link():
    observation = [{"title": "Data", "url": "https://example.org/data.geojson"}]
    r = route_query("parcel data", observation=observation)
    assert r["source"] == "file"
    assert r["params"]["url"] == "https://example.org/data.geojson"


def test_observation_detects_featureserver():
    observation = [{"title": "Layer", "url": "https://gis.example.com/arcgis/rest/services/Foo/MapServer/0"}]
    r = route_query("layer", observation=observation)
    assert r["source"] == "arcgis"
