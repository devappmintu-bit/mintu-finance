import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 25000,
});

// Auth token interceptor
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
  const now = Date.now();
  if (now - lastAuthToastAt < 10000) return;      // throttle to 1 toast / 10s
  lastAuthToastAt = now;
  authExpiredHandled = true;
  try {
    await AsyncStorage.removeItem('token');
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

// Retry on 429/5xx with exponential backoff + request dedup
const pendingRequests = new Map<string, Promise<any>>();

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;

    // Auth expired — clear token + soft-lock
    if (status === 401) {
      const sentToken = !!config?.headers?.Authorization;
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

export default api;
