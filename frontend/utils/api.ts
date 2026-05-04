import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { STORAGE } from '../constants/storage';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  // Round 43 perf — was 25s. Anything that takes >12s on this app is
  // effectively a hang from the user's perspective; failing fast lets the
  // UI surface a retry banner instead of leaving spinners spinning.
  timeout: 12000,
});

// Auth token + device id interceptor
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE.TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Round 53g — attach a stable per-install UUID so the backend can
  // apply device-scoped rate limits in addition to per-user limits.
  // Multi-account abuse from a single device hits the device ceiling
  // before draining the per-user quota.
  try {
    const { getDeviceId } = await import('./deviceId');
    const did = await getDeviceId();
    if (did) config.headers['X-Device-ID'] = did;
  } catch { /* never fail a request because of device-id resolution */ }
  return config;
});

/**
 * Auth-expired handling.
 *
 * When the backend rejects a request with 401 while we *had* a token, the
 * session is truly expired (or revoked). We:
 *   1. Clear the local token + caches.
 *   2. Soft-lock the app so `_layout` redirects to /unlock (PIN/biometric).
 *   3. Show a single throttled toast so parallel failures don't spam.
 *
 * Missing-token 401/422 (user never logged in) stays silent — no spam.
 */
let lastAuthToastAt = 0;
let authExpiredHandled = false;
const notifyAuthExpired = async (hadToken: boolean) => {
  if (!hadToken) return;                          // never logged in → silent
  if (authExpiredHandled) return;                 // avoid re-entry within same tick
  // If the store has already been cleared (e.g., user just deleted their
  // account or hit "Log out"), do NOT re-lock — it would race with the
  // explicit navigation to /auth and hijack the user into /unlock.
  try {
    const { useAuthStore } = await import('../store/authStore');
    const st = useAuthStore.getState();
    if (!st.token && !st.user) return;
  } catch { /* noop */ }
  const now = Date.now();
  if (now - lastAuthToastAt < 10000) return;      // throttle to 1 toast / 10s
  lastAuthToastAt = now;
  authExpiredHandled = true;
  try {
    await AsyncStorage.removeItem(STORAGE.TOKEN);
    Toast.show({
      type: 'info',
      text1: 'Session expired',
      text2: 'Unlock to continue where you left off.',
    });
    // Dynamic import avoids a cycle at module-init time (store imports api).
    const { useAuthStore } = await import('../store/authStore');
    await useAuthStore.getState().lock();
  } catch { /* noop */ } finally {
    // Allow another toast after the throttle window
    setTimeout(() => { authExpiredHandled = false; }, 10000);
  }
};

// ── Round 88 — Silent refresh-token coordinator ──────────────────────
//
// On 401 from any /api/* endpoint:
//   1. If we have a refresh_token in SecureStore, swap it for a fresh
//      access_token via /api/auth/refresh and replay the original request.
//   2. If refresh succeeds → no user-visible interruption.
//   3. If refresh fails → fall through to the existing notifyAuthExpired
//      path (clear token, soft-lock, route to /unlock).
//
// A single in-flight refresh promise serialises concurrent 401s so we
// never fire the rotation endpoint twice (which would invoke the
// reuse-detection path on the backend and revoke the whole token family).
let _refreshInFlight: Promise<string | null> | null = null;
async function _doRefresh(): Promise<string | null> {
  try {
    const { getRefreshToken, saveTokens, clearTokens } = await import('./tokenStore');
    const { getDeviceContext } = await import('./deviceContext');
    const refresh = await getRefreshToken();
    if (!refresh) return null;
    const device = await getDeviceContext().catch(() => null);
    // Use a bare axios call so we don't loop through this same interceptor.
    const resp = await axios.post(
      `${API_URL}/api/auth/refresh`,
      { refresh_token: refresh, ...(device || {}) },
      { timeout: 8000 },
    );
    const access = resp?.data?.access_token as string | undefined;
    const newRefresh = resp?.data?.refresh_token as string | undefined;
    if (!access) {
      await clearTokens();
      return null;
    }
    await saveTokens({ access, refresh: newRefresh || refresh });
    return access;
  } catch {
    try {
      const { clearTokens } = await import('./tokenStore');
      await clearTokens();
    } catch { /* noop */ }
    return null;
  }
}
async function refreshAccessTokenOnce(): Promise<string | null> {
  if (!_refreshInFlight) {
    _refreshInFlight = _doRefresh().finally(() => {
      // Allow the next 401 burst to trigger a fresh attempt.
      setTimeout(() => { _refreshInFlight = null; }, 0);
    });
  }
  return _refreshInFlight;
}

// Retry on 429/5xx with exponential backoff + request dedup
const pendingRequests = new Map<string, Promise<any>>();

// Network-down vs Server-slow toast. Throttled so parallel failures don't spam.
//
// Round 51d — Real-device testing on Starter-tier infra exposed two flaws:
//  1. We were showing "You're offline" on every API timeout, even when the
//     device was clearly online (NetInfo says yes, the user can browse, etc).
//     The actual issue was server CPU throttling causing >12s response times.
//  2. AI / lesson generation calls genuinely need >12s on cold-CPU. We now
//     expose `apiSlow` with a 30s timeout for those endpoints.
//
// The fix: when a request fails with NO response, we ask NetInfo whether
// the device is *actually* offline:
//   • offline   → "You're offline" toast (real connectivity loss)
//   • online    → "Server is slow…" toast (request timed out / unreachable)
let lastNetworkToastAt = 0;
const notifyTransportError = async (err: any) => {
  const now = Date.now();
  if (now - lastNetworkToastAt < 15000) return;   // one toast / 15s max
  lastNetworkToastAt = now;
  // Differentiate via NetInfo + the error code.
  const isTimeout = err?.code === 'ECONNABORTED'
    || /timeout/i.test(err?.message || '')
    || err?.name === 'CanceledError';
  let trulyOffline = false;
  try {
    const { isCurrentlyOnline } = await import('../hooks/useIsOnline');
    trulyOffline = !(await isCurrentlyOnline());
  } catch { /* noop */ }
  try {
    if (trulyOffline) {
      Toast.show({
        type: 'error',
        text1: "You're offline",
        text2: 'Check your connection and try again.',
        position: 'bottom',
      });
    } else if (isTimeout) {
      Toast.show({
        type: 'info',
        text1: 'Taking longer than usual…',
        text2: 'Server is busy. Please try again in a moment.',
        position: 'bottom',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: "Couldn't reach MintU",
        text2: 'Please try again in a moment.',
        position: 'bottom',
      });
    }
  } catch { /* noop */ }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    // Round 53e — observability breadcrumb. Captures URL, status, and
    // request_id for correlation with backend Sentry events. NEVER
    // emits the request body / auth header.
    try {
      const { breadcrumb } = require('./observability');
      breadcrumb('api', `${config?.method?.toUpperCase() || 'REQ'} ${config?.url || '?'} → ${status ?? 'no-response'}`, {
        status,
        request_id: error.response?.headers?.['x-request-id'],
      });
    } catch { /* noop */ }

    // Auth expired — Round 88 silent refresh first; fall back to soft-lock.
    if (status === 401) {
      const sentToken = !!config?.headers?.Authorization;
      // If we never had a token, treat as a normal not-logged-in 401 (silent).
      if (!sentToken) {
        notifyAuthExpired(false);
        return Promise.reject(error);
      }
      // Skip silent refresh on the auth endpoints themselves to avoid loops.
      const url = (config?.url || '').toString();
      const isAuthEndpoint =
        url.includes('/auth/refresh') ||
        url.includes('/auth/logout') ||
        url.includes('/auth/verify-otp') ||
        url.includes('/auth/send-otp');
      // Per-request guard so a refreshed retry that ALSO 401s doesn't loop.
      if (!isAuthEndpoint && !config?._refreshTried) {
        config._refreshTried = true;
        const newAccess = await refreshAccessTokenOnce();
        if (newAccess) {
          // Replay original request with the rotated bearer.
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${newAccess}`;
          return api(config);
        }
      }
      // Refresh exhausted or unavailable → soft-lock the app.
      notifyAuthExpired(sentToken);
      return Promise.reject(error);
    }

    // Retry on 429 or 5xx (up to 2 times)
    if ((status === 429 || (status >= 500 && status < 600)) && (!config._retryCount || config._retryCount < 2)) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = config._retryCount * 1200;
      await new Promise(r => setTimeout(r, delay));
      return api(config);
    }

    // Network-down (no response) — retry twice, then toast.
    if (!error.response && (!config?._netRetry || config._netRetry < 2)) {
      config._netRetry = (config._netRetry || 0) + 1;
      await new Promise(r => setTimeout(r, config._netRetry * 800));
      return api(config);
    }
    if (!error.response) {
      // Retries exhausted — surface the right toast for the situation,
      // unless the caller opted into silent mode (e.g. SWR background
      // revalidations where cached data is already on screen — toasting
      // there would create the "data visible + error visible" conflict
      // that breaks user trust).
      if (!config?.silent) {
        notifyTransportError(error);
      }
    }
    return Promise.reject(error);
  }
);

// Deduplicated GET - prevents duplicate parallel requests to same endpoint
export const deduplicatedGet = async (url: string) => {
  if (pendingRequests.has(url)) return pendingRequests.get(url)!;
  const promise = api.get(url).finally(() => pendingRequests.delete(url));
  pendingRequests.set(url, promise);
  return promise;
};

// Simple cache for GET (5s TTL)
const cache: Record<string, { data: any; ts: number }> = {};
export const cachedGet = async (url: string, ttl = 5000) => {
  const now = Date.now();
  if (cache[url] && now - cache[url].ts < ttl) return cache[url].data;
  const res = await api.get(url);
  cache[url] = { data: res, ts: now };
  return res;
};

export const clearCache = (url?: string) => {
  if (url) delete cache[url];
  else Object.keys(cache).forEach(k => delete cache[k]);
};

// Round 51d — slow-path axios instance for AI & lesson generation.
//
// Cold-CPU AI generations (Money School lesson, agent-chat, waste detector)
// can legitimately take 15-25 seconds on Starter-tier infra. Using the
// default 12s timeout caused them to abort and surface as "offline" toasts.
// `apiSlow` shares all interceptors (auth, retry, transport-error toast)
// but ups the timeout to 30s. Use it only for endpoints we know are slow.
export const apiSlow = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30_000,
});
// Round 51 — apiSlow gets its own explicit auth interceptor.
// (The script's attempt to reuse `api.interceptors.request.handlers[0]`
// referenced an axios internal that TypeScript correctly flags as
// possibly-undefined. The duplication here is 4 lines and not worth a
// type-system fight.)
apiSlow.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE.TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
apiSlow.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    if (status === 401) {
      const sentToken = !!config?.headers?.Authorization;
      // Round 88 — apiSlow also benefits from silent refresh.
      const url = (config?.url || '').toString();
      const isAuthEndpoint = url.includes('/auth/');
      if (sentToken && !isAuthEndpoint && !config?._refreshTried) {
        config._refreshTried = true;
        const newAccess = await refreshAccessTokenOnce();
        if (newAccess) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${newAccess}`;
          return apiSlow(config);
        }
      }
      notifyAuthExpired(sentToken);
      return Promise.reject(error);
    }
    // Retry slow requests once on 5xx/429.
    if ((status === 429 || (status >= 500 && status < 600)) && (!config._retryCount || config._retryCount < 1)) {
      config._retryCount = (config._retryCount || 0) + 1;
      await new Promise(r => setTimeout(r, 1500));
      return apiSlow(config);
    }
    if (!error.response) {
      notifyTransportError(error);
    }
    return Promise.reject(error);
  }
);

export default api;
