import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Retry on 429 (rate limit) with exponential backoff
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (error.response?.status === 429 && (!config._retryCount || config._retryCount < 2)) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = config._retryCount * 1500;
      await new Promise(r => setTimeout(r, delay));
      return api(config);
    }
    return Promise.reject(error);
  }
);

// Simple in-memory cache for GET requests (5s TTL)
const cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 5000;

export const cachedGet = async (url: string, ttl = CACHE_TTL) => {
  const key = url;
  const now = Date.now();
  if (cache[key] && now - cache[key].ts < ttl) {
    return cache[key].data;
  }
  const res = await api.get(url);
  cache[key] = { data: res, ts: now };
  return res;
};

export const clearCache = (url?: string) => {
  if (url) { delete cache[url]; }
  else { Object.keys(cache).forEach(k => delete cache[k]); }
};

export default api;