import axios from "axios";

export const ACCESS_TOKEN_KEY = "bridge4er_access_token";
export const REFRESH_TOKEN_KEY = "bridge4er_refresh_token";

const sanitizeEnvText = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const cleaned = value
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return cleaned.slice(1, -1).trim();
  }
  return cleaned;
};

const ensureTrailingSlash = (value) => {
  const cleaned = sanitizeEnvText(value);
  if (!cleaned) {
    return "";
  }
  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
};

const API_BASE_URL =
  ensureTrailingSlash(process.env.REACT_APP_API_BASE_URL) || "http://127.0.0.1:8000/api/";
const RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);

const parsePositiveInt = (value, fallback, minValue = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(minValue, parsed);
};

const API_TIMEOUT_MS = parsePositiveInt(process.env.REACT_APP_API_TIMEOUT_MS, 30000, 5000);
export const API_SYNC_TIMEOUT_MS = parsePositiveInt(
  process.env.REACT_APP_API_SYNC_TIMEOUT_MS,
  180000,
  API_TIMEOUT_MS
);
const API_COLD_START_TIMEOUT_MS = parsePositiveInt(
  process.env.REACT_APP_API_COLD_START_TIMEOUT_MS,
  120000,
  API_TIMEOUT_MS
);
const API_WAKEUP_RETRIES = parsePositiveInt(process.env.REACT_APP_API_WAKEUP_RETRIES, 5, 1);
const API_WAKEUP_INTERVAL_MS = parsePositiveInt(process.env.REACT_APP_API_WAKEUP_INTERVAL_MS, 4000, 500);
const API_HEARTBEAT_INTERVAL_MS = parsePositiveInt(
  process.env.REACT_APP_API_HEARTBEAT_INTERVAL_MS,
  10 * 60 * 1000,
  60000
);
const API_WARM_CACHE_MS = parsePositiveInt(process.env.REACT_APP_API_WARM_CACHE_MS, 120000, 30000);
const API_GET_CACHE_TTL_MS = parsePositiveInt(
  process.env.REACT_APP_API_GET_CACHE_TTL_MS,
  5 * 60 * 1000,
  1000
);
const API_GET_CACHE_STALE_TTL_MS = parsePositiveInt(
  process.env.REACT_APP_API_GET_CACHE_STALE_TTL_MS,
  60 * 60 * 1000,
  1000
);
const API_PERSIST_CACHE_TTL_MS = parsePositiveInt(
  process.env.REACT_APP_API_PERSIST_CACHE_TTL_MS,
  10 * 60 * 1000,
  1000
);
const API_PERSIST_CACHE_STALE_TTL_MS = parsePositiveInt(
  process.env.REACT_APP_API_PERSIST_CACHE_STALE_TTL_MS,
  24 * 60 * 60 * 1000,
  1000
);
const API_PERSIST_CACHE_MAX_CHARS = parsePositiveInt(
  process.env.REACT_APP_API_PERSIST_CACHE_MAX_CHARS,
  2_000_000,
  10000
);

const isBrowser = typeof window !== "undefined";
const getResponseCache = new Map();
const inFlightGetRequests = new Map();
const PERSISTED_CACHE_PREFIX = "bridge4er_get_cache_v1:";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeSearchParams = (params = {}) => {
  const search = new URLSearchParams();
  Object.keys(params || {})
    .sort()
    .forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((item) => search.append(key, String(item)));
        return;
      }
      search.append(key, String(value));
    });
  return search.toString();
};

const buildGetCacheKey = (url, params) => {
  const query = normalizeSearchParams(params || {});
  return query ? `${String(url || "")}?${query}` : String(url || "");
};

const readCachedGetResponse = (cacheKey) => {
  const row = getResponseCache.get(cacheKey);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    return null;
  }
  return row.response;
};

const readStaleGetResponse = (cacheKey) => {
  const row = getResponseCache.get(cacheKey);
  if (!row) return null;
  if (Date.now() >= row.staleUntil) {
    getResponseCache.delete(cacheKey);
    return null;
  }
  return row.response;
};

const writeCachedGetResponse = (cacheKey, response, ttlMs, staleTtlMs) => {
  const safeTtl = Math.max(1000, Number(ttlMs) || API_GET_CACHE_TTL_MS);
  const safeStaleTtl = Math.max(1000, Number(staleTtlMs) || API_GET_CACHE_STALE_TTL_MS);
  const expiresAt = Date.now() + safeTtl;
  getResponseCache.set(cacheKey, {
    expiresAt,
    staleUntil: expiresAt + safeStaleTtl,
    response: {
      data: response?.data,
      status: response?.status ?? 200,
      statusText: response?.statusText || "OK",
      headers: response?.headers || {},
      config: response?.config || {},
    },
  });
};

const buildPersistedKey = (cacheKey) => `${PERSISTED_CACHE_PREFIX}${cacheKey}`;

const readPersistedGetResponse = (cacheKey) => {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(buildPersistedKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() >= Number(parsed.expiresAt || 0)) {
      return null;
    }
    return parsed.response || null;
  } catch (_error) {
    return null;
  }
};

const readPersistedStaleGetResponse = (cacheKey) => {
  if (!isBrowser) return null;
  const key = buildPersistedKey(cacheKey);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() >= Number(parsed.staleUntil || 0)) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.response || null;
  } catch (_error) {
    return null;
  }
};

const writePersistedGetResponse = (cacheKey, response, ttlMs, staleTtlMs) => {
  if (!isBrowser) return;
  try {
    const safeTtl = Math.max(1000, Number(ttlMs) || API_PERSIST_CACHE_TTL_MS);
    const safeStaleTtl = Math.max(1000, Number(staleTtlMs) || API_PERSIST_CACHE_STALE_TTL_MS);
    const expiresAt = Date.now() + safeTtl;
    const payload = {
      expiresAt,
      staleUntil: expiresAt + safeStaleTtl,
      response: {
        data: response?.data,
        status: response?.status ?? 200,
        statusText: response?.statusText || "OK",
        headers: response?.headers || {},
        config: response?.config || {},
      },
    };
    const raw = JSON.stringify(payload);
    if (raw.length > API_PERSIST_CACHE_MAX_CHARS) {
      return;
    }
    window.localStorage.setItem(buildPersistedKey(cacheKey), raw);
  } catch (_error) {
    // Ignore storage errors (quota, privacy mode, etc.).
  }
};

export const clearPersistedGetCache = () => {
  if (!isBrowser) return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PERSISTED_CACHE_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch (_error) {
    // Ignore storage errors.
  }
};

export const clearGetResponseCache = () => {
  getResponseCache.clear();
  inFlightGetRequests.clear();
};

const resolveBackendOrigin = () => {
  try {
    if (isBrowser) {
      return new URL(API_BASE_URL, window.location.origin).origin;
    }
    return new URL(API_BASE_URL).origin;
  } catch {
    return "";
  }
};

const resolveHealthUrl = () => {
  const origin = resolveBackendOrigin();
  return origin ? `${origin}/` : "";
};

const wakeupClient = axios.create({
  timeout: Math.min(API_COLD_START_TIMEOUT_MS, 15000),
  validateStatus: (status) => status >= 200 && status < 500,
});

let backendWarmUntil = 0;
let backendWarmupPromise = null;

export const storeTokens = ({ access, refresh }) => {
  clearGetResponseCache();
  clearPersistedGetCache();
  if (access) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
  }
  if (refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
};

export const clearTokens = () => {
  clearGetResponseCache();
  clearPersistedGetCache();
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
});

const isIdempotentMethod = (method) => ["get", "head", "options"].includes(String(method || "").toLowerCase());

const isTransientBackendError = (error) => {
  const status = error?.response?.status;
  if (status && RETRIABLE_STATUS_CODES.has(status)) {
    return true;
  }
  return error?.code === "ECONNABORTED" || error?.code === "ERR_NETWORK" || !error?.response;
};

export const warmupBackendConnection = async (force = false) => {
  const healthUrl = resolveHealthUrl();
  if (!healthUrl) {
    return;
  }

  if (!force && Date.now() < backendWarmUntil) {
    return;
  }

  if (backendWarmupPromise) {
    return backendWarmupPromise;
  }

  backendWarmupPromise = (async () => {
    let lastError = null;

    for (let attempt = 0; attempt < API_WAKEUP_RETRIES; attempt += 1) {
      try {
        const response = await wakeupClient.get(healthUrl, {
          params: { wake: Date.now() },
        });
        if (response.status < 500) {
          backendWarmUntil = Date.now() + API_WARM_CACHE_MS;
          return;
        }
        lastError = new Error(`Backend wakeup returned status ${response.status}`);
      } catch (error) {
        lastError = error;
      }

      if (attempt < API_WAKEUP_RETRIES - 1) {
        await sleep(API_WAKEUP_INTERVAL_MS * (attempt + 1));
      }
    }

    throw lastError || new Error("Backend wakeup failed");
  })().finally(() => {
    backendWarmupPromise = null;
  });

  return backendWarmupPromise;
};

export const startBackendHeartbeat = () => {
  if (!isBrowser) {
    return () => {};
  }

  const run = () => {
    if (document.visibilityState === "visible") {
      warmupBackendConnection().catch(() => {});
    }
  };

  run();
  const intervalId = window.setInterval(run, API_HEARTBEAT_INTERVAL_MS);
  const onVisibilityChange = () => run();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};

export const cachedGet = async (url, options = {}) => {
  const {
    params = {},
    ttlMs = API_GET_CACHE_TTL_MS,
    staleTtlMs = API_GET_CACHE_STALE_TTL_MS,
    forceRefresh = false,
    allowStaleOnError = true,
    persistCache = false,
    persistTtlMs = API_PERSIST_CACHE_TTL_MS,
    persistStaleTtlMs = API_PERSIST_CACHE_STALE_TTL_MS,
    ...requestConfig
  } = options || {};
  const cacheKey = buildGetCacheKey(url, params);
  const applyRequestConfig = (response) => ({
    ...(response || {}),
    config: {
      ...((response || {}).config || {}),
      ...(requestConfig || {}),
      method: "get",
      url,
      params,
    },
  });

  if (!forceRefresh) {
    const cached = readCachedGetResponse(cacheKey);
    if (cached) {
      return applyRequestConfig(cached);
    }
    if (persistCache) {
      const persisted = readPersistedGetResponse(cacheKey);
      if (persisted) {
        if ((ttlMs || 0) > 0) {
          writeCachedGetResponse(cacheKey, persisted, ttlMs, staleTtlMs);
        }
        return applyRequestConfig(persisted);
      }
    }
    const inFlight = inFlightGetRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const staleFallback = allowStaleOnError ? readStaleGetResponse(cacheKey) : null;
  const persistedStaleFallback =
    allowStaleOnError && persistCache ? readPersistedStaleGetResponse(cacheKey) : null;
  const requestPromise = API.get(url, {
    ...requestConfig,
    params,
  })
    .then((response) => {
      if ((ttlMs || 0) > 0) {
        writeCachedGetResponse(cacheKey, response, ttlMs, staleTtlMs);
      }
      if (persistCache) {
        writePersistedGetResponse(cacheKey, response, persistTtlMs, persistStaleTtlMs);
      }
      return response;
    })
    .catch((error) => {
      if (isTransientBackendError(error)) {
        if (staleFallback) {
          return applyRequestConfig(staleFallback);
        }
        if (persistedStaleFallback) {
          return applyRequestConfig(persistedStaleFallback);
        }
      }
      throw error;
    })
    .finally(() => {
      inFlightGetRequests.delete(cacheKey);
    });

  if (!forceRefresh) {
    inFlightGetRequests.set(cacheKey, requestPromise);
  }

  return requestPromise;
};

export const prefetchGet = async (url, options = {}) => {
  try {
    await cachedGet(url, options);
  } catch (_error) {
    // Prefetch failures should never block regular app use.
  }
};

API.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let pendingRequests = [];

const resolvePendingRequests = (token) => {
  pendingRequests.forEach((callback) => callback(token));
  pendingRequests = [];
};

API.interceptors.response.use(
  (response) => {
    const method = String(response?.config?.method || "").toLowerCase();
    if (method && !isIdempotentMethod(method)) {
      clearGetResponseCache();
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const method = String(originalRequest.method || "get").toLowerCase();

    if (
      isIdempotentMethod(method) &&
      !originalRequest._wakeRetry &&
      isTransientBackendError(error)
    ) {
      originalRequest._wakeRetry = true;
      try {
        await warmupBackendConnection(true);
        originalRequest.timeout = Math.max(
          Number(originalRequest.timeout) || API_TIMEOUT_MS,
          API_COLD_START_TIMEOUT_MS
        );
        return API(originalRequest);
      } catch (_warmupError) {
        // Fall through to the default error handling below.
      }
    }

    const isAuthEndpoint =
      originalRequest.url?.includes("accounts/auth/login/") ||
      originalRequest.url?.includes("accounts/auth/register/") ||
      originalRequest.url?.includes("accounts/auth/token/refresh/");

    if (status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      clearTokens();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        pendingRequests.push((newToken) => {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(API(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshResponse = await axios.post(`${API_BASE_URL}accounts/auth/token/refresh/`, {
        refresh: refreshToken,
      });
      const newAccessToken = refreshResponse.data?.access;
      if (!newAccessToken) {
        clearTokens();
        return Promise.reject(error);
      }

      storeTokens({ access: newAccessToken, refresh: refreshToken });
      resolvePendingRequests(newAccessToken);
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return API(originalRequest);
    } catch (refreshError) {
      clearTokens();
      pendingRequests = [];
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default API;
