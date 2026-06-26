"""Geocoding tests — mocked Nominatim responses."""
from __future__ import annotations

import pytest

from discovery import geocode


class _FakeNominatimResp:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


def test_geocode_returns_bbox_and_center(monkeypatch):
    fake_data = [
        {
            "boundingbox": ["37.64", "37.93", "-123.17", "-122.28"],
            "display_name": "San Francisco, California, United States",
            "lon": "-122.4075",
            "lat": "37.7879",
        }
    ]
    monkeypatch.setattr(
        geocode.httpx, "get", lambda *a, **k: _FakeNominatimResp(fake_data)
    )
    result = geocode.geocode(place="San Francisco")
    assert result["bbox"]["west"] == -123.17
    assert result["bbox"]["east"] == -122.28
    assert result["bbox"]["south"] == 37.64
    assert result["bbox"]["north"] == 37.93
    assert result["display_name"] == "San Francisco, California, United States"
    assert result["center"][0] == -122.4075
    assert result["center"][1] == 37.7879


def test_geocode_raises_on_no_match(monkeypatch):
    monkeypatch.setattr(
        geocode.httpx, "get", lambda *a, **k: _FakeNominatimResp([])
    )
    with pytest.raises(RuntimeError, match="No geocoding match"):
        geocode.geocode(place="NonexistentPlace12345")
