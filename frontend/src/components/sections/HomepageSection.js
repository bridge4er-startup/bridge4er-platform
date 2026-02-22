import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { useBranch } from "../../context/BranchContext";
import FilePreviewModal from "../common/FilePreviewModal";

const FEATURE_CARDS = [
  {
    title: "Civil Engineering",
    icon: "fas fa-city",
    description: "Explore Syllabus, MCQs, Library and Exam Hall",
    descriptionClass: "",
  },
  {
    title: "Mechanical Engineering",
    icon: "fas fa-gears",
    description: "coming soon......",
    descriptionClass: "field-desc-mechanical",
  },
  {
    title: "Electrical Engineering",
    icon: "fas fa-bolt",
    description: "coming soon......",
    descriptionClass: "field-desc-electrical",
  },
  {
    title: "Electronics Engineering",
    icon: "fas fa-microchip",
    description: "coming soon......",
    descriptionClass: "field-desc-electronics",
  },
  {
    title: "Computer Engineering",
    icon: "fas fa-laptop-code",
    description: "coming soon......",
    descriptionClass: "field-desc-computer",
  },
];

const METRIC_CONFIG = [
  {
    key: "enrolled_students",
    label: "Students Enrolled",
    toneClass: "tone-a",
    icon: "fas fa-user-graduate",
  },
  {
    key: "objective_mcqs_available",
    label: "Objective MCQs",
    toneClass: "tone-b",
    icon: "fas fa-circle-question",
  },
  {
    key: "resource_files_available",
    label: "Library Materials",
    toneClass: "tone-c",
    icon: "fas fa-folder-tree",
  },
  {
    key: "exam_sets_available",
    label: "Exam Sets",
    toneClass: "tone-d",
    icon: "fas fa-file-signature",
  },
];

const INSTITUTIONS_COVERED = [
  "संघिय लोकसेवा आयोग",
  "IOE M.Sc. Entrance Exam",
  "प्रदेश  लोकसेवा आयोग",
  "नेपाल नागरिक उड्डयन प्राधिकरण (CAAN)",
  "नेपाल बिद्युत प्राधिकरण (NEA)",
  "काठमाडौँ उपत्यका खानेपानी लिमिटेड (KUKL)",
  "नेपाल दुरसंचार प्राधिकरण (NTC)",
  "Nepal Engineering Council (NEC) License Exam",
  "नेपाली सेना",
  "+ थप अन्य संस्थानहरु",
];

const NOTICE_PAGE_SIZE = 5;
const NOTICE_NEW_BADGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NEPAL_TIMEZONE = "Asia/Kathmandu";
const WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000;
const MYPATRO_SCRIPT_URL = "https://mypatro.com/resources/nepali_date/nepali_date.js";
const NEPALI_DATE_CACHE_KEY = "bridge4er:homepage:nepali-date:v1";
const NEPALI_DATE_POLL_INTERVAL_MS = 1200;
const NEPALI_DATE_MAX_WAIT_MS = 12000;
const NEPALI_DIGIT_TO_ARABIC = Object.freeze({
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
});
const WEATHER_CODE_LABELS = Object.freeze({
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Light rain",
  63: "Rainy",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snowy",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Moderate showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunder with hail",
  99: "Severe thunder with hail",
});

function slugify(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function fileType(path = "") {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".webp")
  ) {
    return "image";
  }
  return "other";
}

function inferPreviewType(contentType = "", path = "") {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.startsWith("image/")) return "image";
  return fileType(path);
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: NEPAL_TIMEZONE,
  });
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: NEPAL_TIMEZONE,
  });
}

function formatNepaliDateFallback(date) {
  try {
    const formatter = new Intl.DateTimeFormat("ne-NP-u-ca-bikram-sambat", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: NEPAL_TIMEZONE,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type) => parts.find((part) => part.type === type)?.value;
    const weekday = getPart("weekday");
    const month = getPart("month");
    const day = getPart("day");
    const year = getPart("year");
    const normalizedYear = Number(
      String(year || "")
        .split("")
        .map((char) => NEPALI_DIGIT_TO_ARABIC[char] || char)
        .join("")
    );

    if (weekday && month && day && year && Number.isFinite(normalizedYear) && normalizedYear >= 2070) {
      return `${weekday}, ${month} ${day} , ${year}`;
    }
    return "";
  } catch (_error) {
    return "";
  }
}

function normalizeMypatroDate(raw = "") {
  const source = String(raw || "").trim();
  if (!source) return "";
  const pattern = /^([^,]+),\s*([०१२३४५६७८९]+)\s+(.+?)\s+([०१२३४५६७८९]+)$/;
  const match = source.match(pattern);
  if (!match) return source;
  const [, weekday, day, month, year] = match;
  return `${weekday.trim()}, ${month.trim()} ${day.trim()} , ${year.trim()}`;
}

function getNepalDayCacheKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: NEPAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  return `${year}-${month}-${day}`;
}

function readCachedNepaliDate(dayKey) {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(NEPALI_DATE_CACHE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (String(parsed?.dayKey || "") !== String(dayKey || "")) return "";
    return normalizeMypatroDate(parsed?.value || "");
  } catch (_error) {
    return "";
  }
}

function persistCachedNepaliDate(dayKey, value) {
  if (typeof window === "undefined") return;
  const normalized = normalizeMypatroDate(value);
  if (!normalized) return;
  try {
    window.localStorage.setItem(
      NEPALI_DATE_CACHE_KEY,
      JSON.stringify({
        dayKey,
        value: normalized,
        updatedAt: Date.now(),
      })
    );
  } catch (_error) {
    // Ignore storage write failures.
  }
}

async function reverseGeocode(latitude, longitude) {
  try {
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
    geocodeUrl.searchParams.set("latitude", String(latitude));
    geocodeUrl.searchParams.set("longitude", String(longitude));
    geocodeUrl.searchParams.set("language", "en");
    geocodeUrl.searchParams.set("count", "1");
    geocodeUrl.searchParams.set("format", "json");

    const response = await fetch(geocodeUrl.toString());
    if (!response.ok) return "";
    const payload = await response.json();
    const place = payload?.results?.[0];
    if (!place) return "";
    const city = String(place?.name || "").trim();
    const region = String(place?.admin1 || "").trim();
    const country = String(place?.country || "").trim();
    const full = [city, region, country].filter(Boolean).join(", ");
    return full || "";
  } catch (_error) {
    return "";
  }
}

function describeWeatherCode(code) {
  return WEATHER_CODE_LABELS[code] || "Weather update unavailable";
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
}

function formatMetric(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return new Intl.NumberFormat("en-US").format(parsed);
}

export default function HomepageSection({ branch = "Civil Engineering", isActive = false }) {
  const { setBranch } = useBranch();
  const metricCardRef = useRef(null);

  const [clock, setClock] = useState(new Date());
  const [metrics, setMetrics] = useState(null);
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [noticePage, setNoticePage] = useState(1);
  const [syncedClockHeight, setSyncedClockHeight] = useState(null);
  const [locationData, setLocationData] = useState({
    loading: true,
    label: "Detecting location...",
    latitude: null,
    longitude: null,
  });
  const [weather, setWeather] = useState({
    loading: true,
    temperatureC: null,
    description: "",
  });
  const [nepaliDateText, setNepaliDateText] = useState("");

  const closePreview = () => {
    setPreview((current) => {
      if (current?.url && current.url.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isActive || typeof document === "undefined" || typeof window === "undefined") return undefined;
    let isCancelled = false;
    const dayKey = getNepalDayCacheKey(new Date());
    const cachedValue = readCachedNepaliDate(dayKey);
    if (cachedValue) {
      setNepaliDateText(cachedValue);
      return undefined;
    }

    const scriptId = "bridge4er-mypatro-date-script";
    const targetId = "mypatro_nepali_date";
    let poller = null;
    let timeout = null;
    let observer = null;

    const stopWatching = () => {
      if (poller) {
        window.clearInterval(poller);
        poller = null;
      }
      if (timeout) {
        window.clearTimeout(timeout);
        timeout = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };

    const syncDateFromDom = () => {
      const node = document.getElementById(targetId);
      const normalized = normalizeMypatroDate(node?.textContent || "");
      if (!isCancelled && normalized) {
        setNepaliDateText(normalized);
        persistCachedNepaliDate(dayKey, normalized);
        stopWatching();
      }
    };

    window._mypatroDateFormat = 1;
    window._mypatroResponseType = "html";

    let script = document.getElementById(scriptId);
    const handleScriptLoad = () => {
      window.setTimeout(syncDateFromDom, 0);
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = MYPATRO_SCRIPT_URL;
      script.async = true;
      script.addEventListener("load", handleScriptLoad);
      document.body.appendChild(script);
    } else {
      handleScriptLoad();
    }

    const target = document.getElementById(targetId);
    if (typeof MutationObserver !== "undefined" && target) {
      observer = new MutationObserver(() => syncDateFromDom());
      observer.observe(target, { childList: true, subtree: true, characterData: true });
    }

    poller = window.setInterval(syncDateFromDom, NEPALI_DATE_POLL_INTERVAL_MS);
    timeout = window.setTimeout(stopWatching, NEPALI_DATE_MAX_WAIT_MS);

    return () => {
      isCancelled = true;
      stopWatching();
      if (script) {
        script.removeEventListener("load", handleScriptLoad);
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationData({
        loading: false,
        label: "Location unavailable",
        latitude: null,
        longitude: null,
      });
      return undefined;
    }

    let isCancelled = false;
    const setErrorState = () => {
      if (isCancelled) return;
      setLocationData({
        loading: false,
        label: "Location unavailable",
        latitude: null,
        longitude: null,
      });
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position?.coords?.latitude);
        const longitude = Number(position?.coords?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setErrorState();
          return;
        }

        const fallback = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        const resolvedLabel = (await reverseGeocode(latitude, longitude)) || fallback;
        if (isCancelled) return;
        setLocationData({
          loading: false,
          label: resolvedLabel,
          latitude,
          longitude,
        });
      },
      () => {
        setErrorState();
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return undefined;
    const latitude = Number(locationData.latitude);
    const longitude = Number(locationData.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      if (!locationData.loading) {
        setWeather({
          loading: false,
          temperatureC: null,
          description: "Weather unavailable",
        });
      }
      return undefined;
    }

    let isCancelled = false;
    const loadWeather = async () => {
      try {
        const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
        weatherUrl.searchParams.set("latitude", String(latitude));
        weatherUrl.searchParams.set("longitude", String(longitude));
        weatherUrl.searchParams.set("current", "temperature_2m,weather_code");
        weatherUrl.searchParams.set("timezone", "auto");

        const response = await fetch(weatherUrl.toString());
        if (!response.ok) {
          throw new Error("Weather API request failed");
        }

        const payload = await response.json();
        const temperature = Number(payload?.current?.temperature_2m);
        const weatherCode = Number(payload?.current?.weather_code);

        if (isCancelled) return;
        setWeather({
          loading: false,
          temperatureC: Number.isFinite(temperature) ? Math.round(temperature) : null,
          description: Number.isFinite(weatherCode) ? describeWeatherCode(weatherCode) : "Weather update unavailable",
        });
      } catch (_error) {
        if (isCancelled) return;
        setWeather((current) => ({
          loading: false,
          temperatureC: current.temperatureC,
          description: current.description || "Weather update unavailable",
        }));
      }
    };

    loadWeather();
    const timer = window.setInterval(loadWeather, WEATHER_REFRESH_INTERVAL_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [isActive, locationData.latitude, locationData.longitude, locationData.loading]);

  useEffect(() => {
    return () => {
      if (preview?.url && preview.url.startsWith("blob:")) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  useEffect(() => {
    if (!preview) return undefined;
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [preview]);

  useLayoutEffect(() => {
    if (!isActive) {
      setSyncedClockHeight(null);
      return undefined;
    }

    const updateSyncHeight = () => {
      if (typeof window !== "undefined" && window.innerWidth <= 960) {
        setSyncedClockHeight(null);
        return;
      }
      const measuredHeight = metricCardRef.current?.offsetHeight || 0;
      setSyncedClockHeight(measuredHeight > 0 ? measuredHeight : null);
    };

    updateSyncHeight();

    let observer = null;
    if (typeof ResizeObserver !== "undefined" && metricCardRef.current) {
      observer = new ResizeObserver(() => updateSyncHeight());
      observer.observe(metricCardRef.current);
    }

    window.addEventListener("resize", updateSyncHeight);
    return () => {
      window.removeEventListener("resize", updateSyncHeight);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [isActive, metrics]);

  useEffect(() => {
    if (!isActive) return;
    const load = async () => {
      try {
        setLoading(true);
        const [metricsRes, filesRes] = await Promise.allSettled([
          API.get("storage/homepage/stats/"),
          API.get("storage/files/list/", {
            params: {
              content_type: "notice",
              branch,
            },
          }),
        ]);

        if (metricsRes.status === "fulfilled") {
          setMetrics(metricsRes.value.data);
        }
        if (filesRes.status === "fulfilled") {
          setFiles(filesRes.value.data || []);
        }
        if (metricsRes.status !== "fulfilled" && filesRes.status !== "fulfilled") {
          toast.error("Failed to load homepage content.");
        }
        setNoticePage(1);
      } catch (_error) {
        toast.error("Failed to load homepage content.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [branch, isActive]);

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return files;
    return files.filter((item) => item.name.toLowerCase().includes(query));
  }, [files, searchQuery]);

  const totalNoticePages = Math.max(1, Math.ceil(filteredFiles.length / NOTICE_PAGE_SIZE));

  useEffect(() => {
    setNoticePage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (noticePage > totalNoticePages) {
      setNoticePage(totalNoticePages);
    }
  }, [noticePage, totalNoticePages]);

  const paginatedFiles = useMemo(() => {
    const start = (noticePage - 1) * NOTICE_PAGE_SIZE;
    return filteredFiles.slice(start, start + NOTICE_PAGE_SIZE);
  }, [filteredFiles, noticePage]);

  const motivationalQuote = String(metrics?.motivational_quote || "").trim();
  const motivationalImageUrl = String(metrics?.motivational_image_url || "").trim();
  const hasLocationCoordinates =
    Number.isFinite(Number(locationData.latitude)) && Number.isFinite(Number(locationData.longitude));
  const locationLabel = locationData.loading ? "Detecting location..." : locationData.label || "Location unavailable";
  const weatherSummary =
    locationData.loading || (weather.loading && weather.temperatureC === null)
      ? "Loading weather..."
      : !hasLocationCoordinates
      ? "Weather unavailable"
      : weather.temperatureC === null
      ? weather.description || "Weather update unavailable"
      : `${weather.temperatureC} \u00B0C, ${weather.description || "Weather update unavailable"}`;
  const nepaliDateDisplay = nepaliDateText || formatNepaliDateFallback(clock) || "नेपाली मिति लोड हुँदैछ...";

  const shouldShowNewBadge = (file) => {
    const modifiedAt = new Date(file?.modified || "").getTime();
    if (!Number.isFinite(modifiedAt)) return false;
    return Date.now() - modifiedAt < NOTICE_NEW_BADGE_MAX_AGE_MS;
  };

  const openPreview = async (file) => {
    const targetType = fileType(file.path);
    if (targetType === "other") {
      toast.error("This file type cannot be previewed inline. Use download.");
      return;
    }

    try {
      const res = await API.get("storage/files/preview/", {
        params: { path: file.path },
        responseType: "blob",
      });
      const contentType = res?.headers?.["content-type"] || "";
      const blob = new Blob([res.data], { type: contentType || undefined });
      const objectUrl = URL.createObjectURL(blob);
      const nextPreview = {
        ...file,
        type: inferPreviewType(contentType, file.path),
        url: objectUrl,
      };
      setPreview((current) => {
        if (current?.url && current.url.startsWith("blob:")) {
          URL.revokeObjectURL(current.url);
        }
        return nextPreview;
      });
    } catch (error) {
      const message = error?.response?.data?.error || "Unable to preview this file.";
      toast.error(message);
    }
  };

  const downloadNotice = async (file) => {
    try {
      const res = await API.get("storage/files/download/", {
        params: { path: file.path },
        responseType: "blob",
      });
      const objectUrl = URL.createObjectURL(new Blob([res.data]));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (_error) {
      toast.error("Unable to download file.");
    }
  };

  const handleFieldClick = (fieldName) => {
    setBranch(fieldName);
    window.location.hash = "homepage";
  };

  return (
    <section id="homepage" className={`section homepage-section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-house"></i> Homepage
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>

      <div className="homepage-grid">
        <div className="homepage-left">
          <div ref={metricCardRef} className="home-info-card metric-spotlight-card">
            <div className="metric-grid artistic-metric-grid metric-spotlight-grid">
              {METRIC_CONFIG.map((metric) => (
                <article key={metric.key} className={`metric-card metric-float metric-spotlight-item ${metric.toneClass}`}>
                  <span className="metric-spotlight-label">
                    <i className={metric.icon}></i> {metric.label}
                  </span>
                  <strong>{formatMetric(metrics?.[metric.key])}</strong>
                </article>
              ))}
            </div>
          </div>

          <div className="home-info-card home-explore-card">
            <h3 className="homepage-info-heading">Explore By Field</h3>
            <div className="feature-grid field-feature-grid">
              {FEATURE_CARDS.map((card) => (
                <button
                  key={card.title}
                  type="button"
                  className={`feature-card feature-card-action theme-${slugify(card.title)} ${
                    card.title === branch ? "active" : ""
                  }`}
                  onClick={() => handleFieldClick(card.title)}
                  aria-label={`Open ${card.title} homepage`}
                >
                  <i className={card.icon}></i>
                  <h4>{card.title}</h4>
                  <p className={card.descriptionClass}>{card.description}</p>
                  <span className="feature-action-text">
                    {card.title === branch ? "Active Field" : "Open Field Homepage"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <h3 className="homepage-info-heading homepage-info-heading-outside">Institutions Covered</h3>
          <div className="home-info-card institutions-covered-card">
            <div className="institutions-note-panel">
              {INSTITUTIONS_COVERED.map((institution) => (
                <p key={institution} className="institution-note-item">
                  <strong>{institution}</strong>
                </p>
              ))}
            </div>
          </div>

          <div className="home-info-card homepage-motivation-wrap">
            {(motivationalQuote || motivationalImageUrl) ? (
              <div className="homepage-motivation-card">
                {motivationalImageUrl ? (
                  <img
                    src={motivationalImageUrl}
                    alt="Motivational visual"
                    className="homepage-motivation-image"
                  />
                ) : null}
                {motivationalQuote ? (
                  <p className="homepage-motivation-quote">"{motivationalQuote}"</p>
                ) : null}
              </div>
            ) : (
              <div className="motivation-empty-slot">Motivational content will appear here.</div>
            )}
          </div>
        </div>

        <div className="homepage-right">
          <div
            className="clock-card"
            style={syncedClockHeight ? { minHeight: `${syncedClockHeight}px` } : undefined}
          >
            <div className="clock-title-row">
              <div className="clock-now-row">
                <span className="clock-now-label">TODAY :</span>
                <strong className="clock-time">{formatTime(clock)}</strong>
              </div>
              <div className="clock-location-stack">
                <span className="clock-location">Location: {locationLabel}</span>
                <span className="clock-weather">{weatherSummary}</span>
              </div>
            </div>
            <p className="clock-date-gregorian">{formatDate(clock)}</p>
            <p id="mypatro_nepali_date" className="clock-date-nepali">
              {nepaliDateDisplay}
            </p>
          </div>

          <div className="home-info-card noticeboard">
            <h3>Noticeboard</h3>
            <div className="search-box">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search notices..."
              />
              <i className="fas fa-search"></i>
            </div>
            {loading ? (
              <div className="loading">
                <p>Loading notice files...</p>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="empty-state">
                <h4>No notice files found.</h4>
              </div>
            ) : (
              <>
                <ul className="file-list compact-list">
                  {paginatedFiles.map((file) => (
                    <li key={file.path} className="file-item">
                      <div className="file-info">
                        <div className="file-icon">
                          <i className="fas fa-file"></i>
                        </div>
                        <div className="file-details">
                          <h4>
                            {shouldShowNewBadge(file) ? <span className="notice-new-badge">New</span> : null}
                            {file.name}
                          </h4>
                          <p>
                            {formatFileSize(file.size)} | {new Date(file.modified).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="file-actions">
                        <button
                          className="btn btn-secondary btn-soft-blue-action noticeboard-action-btn"
                          onClick={() => openPreview(file)}
                          title="View file"
                        >
                          <i className="fas fa-eye"></i> View
                        </button>
                        <button
                          className="btn btn-primary btn-soft-blue-action noticeboard-action-btn"
                          onClick={() => downloadNotice(file)}
                          title="Download file"
                        >
                          <i className="fas fa-download"></i> Download
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {totalNoticePages > 1 ? (
                  <div className="notice-pagination-wrap">
                    <button
                      type="button"
                      className="btn btn-secondary btn-soft-blue-action"
                      disabled={noticePage <= 1}
                      onClick={() => setNoticePage((prev) => Math.max(1, prev - 1))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {noticePage} of {totalNoticePages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-soft-blue-action"
                      disabled={noticePage >= totalNoticePages}
                      onClick={() => setNoticePage((prev) => Math.min(totalNoticePages, prev + 1))}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <FilePreviewModal preview={preview} onClose={closePreview} />
    </section>
  );
}
