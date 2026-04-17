import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Retry on 429/5xx with exponential backoff + request dedup
const pendingRequests = new Map<string, Promise<any>>();

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;

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
