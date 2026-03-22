import math

import requests
from django.http import JsonResponse
from django.views.decorators.http import require_GET

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/reverse"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_SECONDS = 8


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


@require_GET
def reverse_geocode(request):
    latitude, longitude, error_response = _validate_lat_lon(request)
    if error_response:
        return error_response

    language = (request.GET.get("language") or "en").strip() or "en"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "language": language,
        "count": 1,
        "format": "json",
    }

    try:
        response = requests.get(GEOCODE_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
    except requests.RequestException:
        return JsonResponse({"error": "Geocoding service unavailable."}, status=502)

    try:
        payload = response.json()
    except ValueError:
        return JsonResponse({"error": "Invalid response from geocoding service."}, status=502)

    results = payload.get("results") or []
    place = results[0] if results else {}
    city = str(place.get("name") or "").strip()
    region = str(place.get("admin1") or "").strip()
    country = str(place.get("country") or "").strip()
    label = ", ".join([part for part in (city, region, country) if part])

    return JsonResponse(
        {
            "label": label,
            "city": city,
            "region": region,
            "country": country,
        }
    )


@require_GET
def current_weather(request):
    latitude, longitude, error_response = _validate_lat_lon(request)
    if error_response:
        return error_response

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,weather_code",
        "timezone": "auto",
    }

    try:
        response = requests.get(WEATHER_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
    except requests.RequestException:
        return JsonResponse({"error": "Weather service unavailable."}, status=502)

    try:
        payload = response.json()
    except ValueError:
        return JsonResponse({"error": "Invalid response from weather service."}, status=502)

    return JsonResponse(payload)
