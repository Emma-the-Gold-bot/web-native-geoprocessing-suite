"""Protocol clients for data discovery.

Each function returns a JSON-serializable dict with kind, data_url/data,
provenance, and optionally bbox/candidates.

Ported from geo-harness backend/app/discovery/sources.py.
Key adaptation: returns JSON dicts, not GeoDataFrames/xarray.
"""
from __future__ import annotations

import html
import re
import urllib.parse
from typing import Any, Optional

import httpx

from .schemas import BBox

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DUCKDUCKGO_HTML = "https://html.duckduckgo.com/html/"
USER_AGENT = "discovery-service/0.1 (web-native-geoprocessing-suite)"


# --------------------------------------------------------------------------
# OpenStreetMap via Overpass  (global vector layer)
# --------------------------------------------------------------------------
def overpass(
    *,
    bbox: BBox,
    tags: Optional[dict[str, Any]] = None,
    overpass_ql: Optional[str] = None,
    timeout: float = 90.0,
) -> dict[str, Any]:
    """Fetch OSM features via Overpass API. Returns GeoJSON FeatureCollection."""
    if overpass_ql:
        query = overpass_ql
    else:
        tags = tags or {"building": True}
        selectors = "".join(_osm_selector(k, v) for k, v in tags.items())
        bb = f"{bbox.south},{bbox.west},{bbox.north},{bbox.east}"
        query = (
            f"[out:json][timeout:{int(timeout)}];"
            f"(node{selectors}({bb});way{selectors}({bb});"
            f"relation{selectors}({bb}););out geom;"
        )

    resp = httpx.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    resp.raise_for_status()
    elements = resp.json().get("elements", [])

    features: list[dict[str, Any]] = []
    for el in elements:
        geom = None
        if el["type"] == "node" and "lat" in el:
            geom = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
        elif el["type"] == "way" and el.get("geometry"):
            coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
            if len(coords) >= 2:
                if coords[0] == coords[-1] and len(coords) >= 4:
                    geom = {"type": "Polygon", "coordinates": [coords]}
                else:
                    geom = {"type": "LineString", "coordinates": coords}
        if geom is None:
            continue
        attrs = dict(el.get("tags", {}))
        attrs["osm_id"] = el.get("id")
        attrs["osm_type"] = el.get("type")
        features.append({"type": "Feature", "geometry": geom, "properties": attrs})

    return {
        "kind": "vector",
        "data": {"type": "FeatureCollection", "features": features},
        "crs": "EPSG:4326",
        "provenance": {
            "source": "OpenStreetMap via Overpass",
            "license": "ODbL 1.0",
            "attribution": "© OpenStreetMap contributors",
            "endpoint": OVERPASS_URL,
        },
    }


def _osm_selector(key: str, value: Any) -> str:
    if value is True:
        return f"[{key!r}]".replace("'", '"')
    return f'["{key}"="{value}"]'


# --------------------------------------------------------------------------
# Direct file fetch  (the long tail: geojson / gpkg / zip-shp / etc.)
# --------------------------------------------------------------------------
def fetch_file(*, url: str, timeout: float = 120.0) -> dict[str, Any]:
    """Fetch a remote vector file. Returns GeoJSON FeatureCollection."""
    import geopandas as gpd

    read_target = f"zip+{url}" if url.lower().endswith(".zip") else url
    gdf = gpd.read_file(read_target)
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    geojson = gdf.to_json()
    import json

    return {
        "kind": "vector",
        "data": json.loads(geojson),
        "crs": str(gdf.crs),
        "provenance": {
            "source": "Direct file",
            "license": "unknown (verify at source)",
            "attribution": url,
            "endpoint": url,
        },
    }


# --------------------------------------------------------------------------
# Esri ArcGIS REST FeatureServer
# --------------------------------------------------------------------------
def arcgis_feature_server(
    *,
    url: str,
    where: str = "1=1",
    bbox: Optional[BBox] = None,
    timeout: float = 90.0,
) -> dict[str, Any]:
    """Query an ArcGIS REST FeatureServer layer. Returns GeoJSON FeatureCollection."""
    import geopandas as gpd

    params: dict[str, Any] = {
        "where": where,
        "outFields": "*",
        "f": "geojson",
        "outSR": 4326,
    }
    if bbox is not None:
        params.update(
            geometry=",".join(map(str, bbox.as_list())),
            geometryType="esriGeometryEnvelope",
            inSR=4326,
            spatialRel="esriSpatialRelIntersects",
        )
    query_url = url.rstrip("/") + "/query"
    resp = httpx.get(
        query_url, params=params, headers={"User-Agent": USER_AGENT}, timeout=timeout
    )
    resp.raise_for_status()
    gdf = gpd.GeoDataFrame.from_features(resp.json().get("features", []), crs="EPSG:4326")
    import json

    return {
        "kind": "vector",
        "data": json.loads(gdf.to_json()),
        "crs": "EPSG:4326",
        "provenance": {
            "source": "Esri ArcGIS REST FeatureServer",
            "license": "unknown (verify at source)",
            "attribution": url,
            "endpoint": query_url,
        },
    }


# --------------------------------------------------------------------------
# CKAN catalog search
# --------------------------------------------------------------------------
def ckan_search(
    *,
    base_url: str = "https://catalog.data.gov",
    query: str,
    rows: int = 5,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """Search a CKAN portal for geospatial datasets.

    Returns a 'links' payload with candidate resource URLs.
    """
    api = base_url.rstrip("/") + "/api/3/action/package_search"
    resp = httpx.get(
        api,
        params={"q": query, "rows": rows},
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    resp.raise_for_status()
    results = resp.json().get("result", {}).get("results", [])
    candidates: list[dict[str, Any]] = []
    for ds in results:
        for res in ds.get("resources", []):
            fmt = (res.get("format") or "").lower()
            if fmt in ("geojson", "shp", "kml", "gpkg", "zip", "csv"):
                candidates.append(
                    {
                        "dataset": ds.get("title"),
                        "format": fmt,
                        "url": res.get("url"),
                        "license": ds.get("license_title"),
                    }
                )
    return {
        "kind": "links",
        "candidates": candidates,
        "provenance": {"source": f"CKAN: {base_url}"},
    }


# --------------------------------------------------------------------------
# Web search  (DuckDuckGo HTML — keyless)
# --------------------------------------------------------------------------
def web_search(*, query: str, max_results: int = 6, timeout: float = 30.0) -> dict[str, Any]:
    """Free, keyless web search via DuckDuckGo HTML endpoint.

    Returns a 'links' payload with candidate result URLs.
    """
    resp = httpx.post(
        DUCKDUCKGO_HTML,
        data={"q": query},
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
        follow_redirects=True,
    )
    resp.raise_for_status()
    results = _parse_ddg_html(resp.text)[:max_results]
    return {
        "kind": "links",
        "results": results,
        "provenance": {"source": "Web search (DuckDuckGo HTML)", "query": query},
    }


def _parse_ddg_html(text: str) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    for m in re.finditer(
        r'<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        text,
        re.DOTALL,
    ):
        href = _decode_ddg(m.group(1))
        title = html.unescape(re.sub(r"<[^>]+>", "", m.group(2)).strip())
        if href:
            results.append({"title": title, "url": href})
    return results


def _decode_ddg(href: str) -> str:
    """DuckDuckGo wraps result URLs as //duckduckgo.com/l/?uddg=<encoded>."""
    href = html.unescape(href)
    if "uddg=" in href:
        full = href if href.startswith("http") else "https:" + href
        params = urllib.parse.parse_qs(urllib.parse.urlparse(full).query)
        if "uddg" in params:
            return params["uddg"][0]
    return href


# --------------------------------------------------------------------------
# STAC imagery  (Sentinel-2 — resolves asset URLs, doesn't read rasters)
# --------------------------------------------------------------------------
def stac_sentinel2(
    *,
    bbox: BBox,
    datetime_range: Optional[str] = None,
    max_cloud: float = 20.0,
    bands: str = "ndvi",
    timeout: float = 120.0,
) -> dict[str, Any]:
    """Search Sentinel-2 catalog and resolve asset download URLs.

    Returns a 'raster' result with data_url pointing to the actual COG asset.
    Does NOT download or read raster data — just resolves the URL.
    """
    import planetary_computer as pc
    from pystac_client import Client

    catalog = Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=pc.sign_inplace,
    )
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox.as_list(),
        datetime=datetime_range,
        query={"eo:cloud_cover": {"lt": max_cloud}},
        sortby=[{"field": "properties.eo:cloud_cover", "direction": "asc"}],
        max_items=1,
    )
    items = list(search.items())
    if not items:
        raise RuntimeError(
            "No Sentinel-2 scenes matched bbox/time/cloud filters. Try a wider "
            "datetime_range or a higher max_cloud."
        )
    item = items[0]

    mode = (bands or "ndvi").lower()
    if mode in ("rgb", "truecolor", "true_color", "visual"):
        asset_keys = ("B04", "B03", "B02")
        kind_note = "true-color RGB (B04/B03/B02)"
    else:
        asset_keys = ("B04", "B08")
        kind_note = "red+nir (B04/B08) for NDVI"

    # Resolve asset hrefs (planetary_computer signs them)
    asset_urls: dict[str, str] = {}
    for key in ("B04", "B03", "B02", "B08"):
        if key in item.assets:
            asset_urls[key] = item.assets[key].href

    # Return the primary asset URL (first band) as data_url
    primary_key = asset_keys[0]
    data_url = asset_urls.get(primary_key)

    return {
        "kind": "raster",
        "data_url": data_url,
        "asset_urls": asset_urls,
        "bands": kind_note,
        "crs": "EPSG:32610",  # Sentinel-2 UTM zone; actual CRS varies by scene
        "item_id": item.id,
        "bbox": bbox.as_list(),
        "provenance": {
            "source": "Sentinel-2 L2A via Microsoft Planetary Computer",
            "license": "CC-BY-4.0 (Copernicus)",
            "attribution": "Contains modified Copernicus Sentinel data",
            "item_id": item.id,
            "cloud_cover": item.properties.get("eo:cloud_cover"),
        },
    }
