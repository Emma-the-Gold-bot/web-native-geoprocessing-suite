"""Protocol routing — heuristic keyword matching + research loop.

Ported from geo-harness backend/app/discovery/subagent.py.
Heuristic mode only (no LLM dependency). Research loop chains
web_search → follow-up fetch.
"""
from __future__ import annotations

from typing import Any, Callable, Optional

from . import sources
from .schemas import BBox, DiscoveryRequest, DiscoveryResult


def route_query(
    query: str,
    params: Optional[dict[str, Any]] = None,
    observation: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Pick a protocol based on keyword matching.

    Returns {"source": "<name>", "params": {...}, "reason": "<short>"}.
    """
    params = params or {}
    q = query.lower()

    # If a previous web_search produced candidate links, follow the first usable one.
    if observation:
        for cand in observation:
            url = cand.get("url")
            if url and url.lower().startswith("http"):
                src = (
                    "arcgis"
                    if "featureserver" in url.lower() or "mapserver" in url.lower()
                    else "file"
                )
                return {
                    "source": src,
                    "params": {**params, "url": url},
                    "reason": f"following search result: {cand.get('title', '')[:60]}",
                }

    # If a URL was provided directly, route to arcgis or file.
    if params.get("url"):
        url = params["url"]
        src = (
            "arcgis"
            if "featureserver" in url.lower() or "mapserver" in url.lower()
            else "file"
        )
        return {"source": src, "params": params, "reason": "url provided"}

    # Sentinel imagery → STAC
    if any(k in q for k in ("sentinel", "imagery", "ndvi", "satellite", "raster")):
        bands = params.get("bands") or _infer_bands(query)
        return {
            "source": "stac",
            "params": {**params, "bands": bands},
            "reason": f"imagery request ({bands})",
        }

    # OSM-mappable features → Overpass
    if any(k in q for k in ("building", "road", "amenity", "poi", "osm", "footprint")):
        tags = params.get("tags") or _guess_osm_tags(q)
        return {
            "source": "overpass",
            "params": {**params, "tags": tags},
            "reason": "OSM-mappable features",
        }

    # Fallback → CKAN catalog search
    return {
        "source": "ckan",
        "params": {**params, "query": query},
        "reason": "fallback to open-data catalog search",
    }


def _infer_bands(query: str) -> str:
    """Pick Sentinel-2 band set from intent."""
    q = query.lower()
    if any(k in q for k in ("ndvi", "vegetation", "index", "nir", "near-infrared")):
        return "ndvi"
    return "rgb"


def _guess_osm_tags(q: str) -> dict[str, Any]:
    """Guess Overpass tags from query keywords."""
    if "road" in q or "highway" in q:
        return {"highway": True}
    if "cafe" in q:
        return {"amenity": "cafe"}
    if "restaurant" in q:
        return {"amenity": "restaurant"}
    if "park" in q:
        return {"leisure": "park"}
    return {"building": True}


def _dispatch(
    source: Optional[str],
    sparams: dict[str, Any],
    bbox: Optional[BBox],
    query: str = "",
) -> dict[str, Any]:
    """Call the appropriate protocol client."""
    if source == "web_search":
        return sources.web_search(query=sparams.get("query") or query)
    if source == "overpass":
        if bbox is None:
            raise ValueError(
                "Overpass requires a bounding box. "
                "Try including a place name in your query (e.g., 'buildings in San Francisco')."
            )
        return sources.overpass(
            bbox=bbox,
            tags=sparams.get("tags"),
            overpass_ql=sparams.get("overpass_ql"),
        )
    if source == "file":
        url = sparams.get("url")
        if not url:
            raise ValueError(
                "source 'file' requires a 'url' to a vector file. "
                "Use 'web_search' first to find one."
            )
        return sources.fetch_file(url=url)
    if source == "arcgis":
        url = sparams.get("url")
        if not url:
            raise ValueError(
                "source 'arcgis' requires a 'url' to a FeatureServer/MapServer layer. "
                "Use 'web_search' first to find one."
            )
        return sources.arcgis_feature_server(
            url=url, where=sparams.get("where", "1=1"), bbox=bbox
        )
    if source == "stac":
        if bbox is None:
            raise ValueError("STAC requires a bbox (area of interest).")
        bands = sparams.get("bands") or _infer_bands(query)
        return sources.stac_sentinel2(
            bbox=bbox,
            datetime_range=sparams.get("datetime_range"),
            max_cloud=float(sparams.get("max_cloud", 20)),
            bands=bands,
        )
    if source == "ckan":
        links = sources.ckan_search(
            query=sparams.get("query", ""),
            base_url=sparams.get("base_url", "https://catalog.data.gov"),
        )
        candidates = links.get("candidates", [])
        for cand in candidates:
            if (cand.get("format") in ("geojson", "zip", "gpkg")) and cand.get("url"):
                return sources.fetch_file(url=cand["url"])
        raise RuntimeError("CKAN search returned no fetchable geospatial resource.")
    raise ValueError(f"Unknown discovery source: '{source}'")


def discover(request: DiscoveryRequest) -> DiscoveryResult:
    """Run the discovery research loop.

    Picks a protocol, dispatches, and if the result is "links" (web_search/ckan),
    follows up by fetching a candidate. Max 3 attempts.
    """
    trace: list[str] = []
    params = request.params or {}
    last_error: Optional[str] = None
    observation: Optional[list[dict[str, Any]]] = None

    for attempt in range(1, 4):
        # On first attempt, honor explicit source hint
        explicit = request.source or params.get("source")
        if explicit and attempt == 1 and observation is None:
            choice = {"source": explicit, "params": params}
        else:
            choice = route_query(request.query, params, observation)

        source = choice.get("source")
        sparams = choice.get("params", {})
        reason = choice.get("reason", "")
        trace.append(f"attempt {attempt}: trying '{source}' ({reason})")

        try:
            result = _dispatch(source, sparams, request.bbox, request.query)

            if result.get("kind") == "links":
                # Not a final layer — record candidates and keep researching
                observation = (
                    result.get("results") or result.get("candidates") or []
                )
                trace.append(f"got {len(observation)} candidate link(s); continuing")
                last_error = None
                continue

            # Success — return as DiscoveryResult
            trace.append(f"success via {result.get('provenance', {}).get('source', source)}")
            return DiscoveryResult(
                kind=result["kind"],
                data=result.get("data"),  # GeoJSON FC for vector results
                data_url=result.get("data_url"),
                format=result.get("format"),
                provenance=result.get("provenance", {}),
                bbox=request.bbox,
                candidates=result.get("candidates"),
                trace=trace,
            )
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            trace.append(f"failed: {last_error}")

    raise RuntimeError(f"Discovery failed after 3 attempts. Last: {last_error}")
