import math
import time

import requests
from django.http import JsonResponse
from django.views.decorators.http import require_GET

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/reverse"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_SECONDS = 8
DEFAULT_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Bridge4ER/1.0 (+https://bridge4er-new-frontend.vercel.app)",
}
GEOCODE_CACHE_TTL_SECONDS = 24 * 60 * 60
WEATHER_CACHE_TTL_SECONDS = 10 * 60
_geocode_cache = {}
_weather_cache = {}


def _parse_float(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed):
        return None
    return parsed


def _validate_lat_lon(request):
    latitude = _parse_float(request.GET.get("latitude"))
    longitude = _parse_float(request.GET.get("longitude"))
    if latitude is None or longitude is None:
        return None, None, JsonResponse(
            {"error": "latitude and longitude are required numeric values."},
            status=400,
        )
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return None, None, JsonResponse(
            {"error": "latitude or longitude is out of range."},
            status=400,
        )
    return latitude, longitude, None


def _cache_get(cache, key, ttl_seconds):
    entry = cache.get(key)
    if not entry:
        return None
    if time.time() - entry["timestamp"] > ttl_seconds:
        return None
    return entry["value"]


def _cache_set(cache, key, value):
    cache[key] = {"timestamp": time.time(), "value": value}


def _fetch_json(url, params):
    last_error = None
    for _attempt in range(2):
        try:
            response = requests.get(
                url,
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS,
                headers=DEFAULT_HEADERS,
            )
            response.raise_for_status()
            return response.json(), None
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
    return None, last_error


@require_GET
def reverse_geocode(request):
    latitude, longitude, error_response = _validate_lat_lon(request)
    if error_response:
        return error_response

    language = (request.GET.get("language") or "en").strip() or "en"
    cache_key = f"{latitude:.4f}:{longitude:.4f}:{language}"
    cached = _cache_get(_geocode_cache, cache_key, GEOCODE_CACHE_TTL_SECONDS)
    if cached:
        return JsonResponse(cached)
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "language": language,
        "count": 1,
        "format": "json",
    }

    payload, _error = _fetch_json(GEOCODE_URL, params)
    if payload is None:
        fallback = {
            "label": "",
            "city": "",
            "region": "",
            "country": "",
            "fallback": True,
        }
        return JsonResponse(fallback)

    results = payload.get("results") or []
    place = results[0] if results else {}
    city = str(place.get("name") or "").strip()
    region = str(place.get("admin1") or "").strip()
    country = str(place.get("country") or "").strip()
    label = ", ".join([part for part in (city, region, country) if part])

    response_payload = {
        "label": label,
        "city": city,
        "region": region,
        "country": country,
    }
    _cache_set(_geocode_cache, cache_key, response_payload)
    return JsonResponse(response_payload)


@require_GET
def current_weather(request):
    latitude, longitude, error_response = _validate_lat_lon(request)
    if error_response:
        return error_response

    cache_key = f"{latitude:.4f}:{longitude:.4f}"
    cached = _cache_get(_weather_cache, cache_key, WEATHER_CACHE_TTL_SECONDS)
    if cached:
        return JsonResponse(cached)
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,weather_code",
        "timezone": "auto",
    }

    payload, _error = _fetch_json(WEATHER_URL, params)
    if payload is None:
        fallback = {"current": {}, "fallback": True}
        return JsonResponse(fallback)

    _cache_set(_weather_cache, cache_key, payload)
    return JsonResponse(payload)
