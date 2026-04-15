// Offline-First Manager for MintU
// Caches API data, queues offline actions, syncs when back online
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';

const CACHE_PREFIX = 'mintu_cache_';
const QUEUE_KEY = 'mintu_offline_queue';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry {
  data: any;
  timestamp: number;
}

interface QueuedAction {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  data?: any;
  createdAt: number;
}

// ── CACHE ──
export async function getCached(key: string): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch { return null; }
}

export async function setCache(key: string, data: any): Promise<void> {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {}
}

export async function clearCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
  if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
}

// ── OFFLINE QUEUE ──
async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function queueAction(method: 'POST' | 'PUT' | 'DELETE', url: string, data?: any): Promise<void> {
  const queue = await getQueue();
  queue.push({
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    method, url, data,
    createdAt: Date.now(),
  });
  await saveQueue(queue);
}

export async function getQueueSize(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

// ── SYNC ──
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      if (action.method === 'POST') await api.post(action.url, action.data);
      else if (action.method === 'PUT') await api.put(action.url, action.data);
      else if (action.method === 'DELETE') await api.delete(action.url);
      synced++;
    } catch {
      // Keep failed actions if less than 24h old
      if (Date.now() - action.createdAt < 24 * 60 * 60 * 1000) {
        remaining.push(action);
      }
      failed++;
    }
  }

  await saveQueue(remaining);
  return { synced, failed };
}

// ── CONNECTIVITY ──
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true;
  } catch { return true; } // Assume online if check fails
}

// ── SMART FETCH: Cache-first, network-fallback ──
export async function smartFetch(endpoint: string, cacheKey?: string): Promise<any> {
  const key = cacheKey || endpoint.replace(/\//g, '_');
  const online = await isOnline();

  if (online) {
    try {
      const res = await api.get(endpoint);
      await setCache(key, res.data);
      return res.data;
    } catch {
      // Network failed, try cache
      const cached = await getCached(key);
      if (cached) return cached;
      throw new Error('Network error and no cached data');
    }
  } else {
    // Offline: return cache
    const cached = await getCached(key);
    if (cached) return cached;
    throw new Error('Offline and no cached data');
  }
}

// ── AUTO-SYNC LISTENER ──
let syncInProgress = false;

export function startAutoSync() {
  return NetInfo.addEventListener(async (state) => {
    if (state.isConnected && !syncInProgress) {
      syncInProgress = true;
      try {
        const result = await syncOfflineQueue();
        if (result.synced > 0) {
          console.log(`[OfflineSync] Synced ${result.synced} actions`);
        }
      } catch {}
      finally { syncInProgress = false; }
    }
  });
}
