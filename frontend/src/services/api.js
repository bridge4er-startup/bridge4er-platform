import axios from "axios";

export const ACCESS_TOKEN_KEY = "bridge4er_access_token";
export const REFRESH_TOKEN_KEY = "bridge4er_refresh_token";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000/api/";
const RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);

const parsePositiveInt = (value, fallback, minValue = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(minValue, parsed);
};

const API_TIMEOUT_MS = parsePositiveInt(process.env.REACT_APP_API_TIMEOUT_MS, 30000, 5000);
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
  10000
);

const isBrowser = typeof window !== "undefined";
const getResponseCache = new Map();

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
    getResponseCache.delete(cacheKey);
    return null;
  }
  return row.response;
};

const writeCachedGetResponse = (cacheKey, response, ttlMs) => {
  const safeTtl = Math.max(1000, Number(ttlMs) || API_GET_CACHE_TTL_MS);
  getResponseCache.set(cacheKey, {
    expiresAt: Date.now() + safeTtl,
    response: {
      data: response?.data,
      status: response?.status ?? 200,
      statusText: response?.statusText || "OK",
      headers: response?.headers || {},
      config: response?.config || {},
    },
  });
};

export const clearGetResponseCache = () => {
  getResponseCache.clear();
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
  if (access) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
  }
  if (refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
};

export const clearTokens = () => {
  clearGetResponseCache();
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
          headers: { "Cache-Control": "no-cache" },
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
  const { params = {}, ttlMs = API_GET_CACHE_TTL_MS, forceRefresh = false, ...requestConfig } = options || {};
  const cacheKey = buildGetCacheKey(url, params);
  if (!forceRefresh) {
    const cached = readCachedGetResponse(cacheKey);
    if (cached) {
      return {
        ...cached,
        config: {
          ...(cached.config || {}),
          ...(requestConfig || {}),
          method: "get",
          url,
          params,
        },
      };
    }
  }

  const response = await API.get(url, {
    ...requestConfig,
    params,
  });
  if ((ttlMs || 0) > 0) {
    writeCachedGetResponse(cacheKey, response, ttlMs);
  }
  return response;
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
      originalRequest.url?.includes("accounts/auth/token/refresh/") ||
      originalRequest.url?.includes("accounts/auth/request-otp/");

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
