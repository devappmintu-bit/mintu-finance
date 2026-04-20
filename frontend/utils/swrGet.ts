/**
 * Stale-While-Revalidate wrapper around the shared axios instance.
 *
 * Usage:
 *   const { data, isStale } = await swrGet('/stats/overview', { ttlMs: 30_000 });
 *   // Renders instantly if cached. Also fires a background refresh that
 *   // resolves to the fresh copy via the optional onFresh callback.
 *
 * Backed by AsyncStorage so it survives cold-starts. In-memory Map is a
 * first-level fast path to avoid round-trips to storage for hot keys.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

type Cached<T> = { data: T; at: number };
const MEM = new Map<string, Cached<any>>();
const PREFIX = 'swr::';

export type SwrResult<T> = {
  data: T | null;
  isStale: boolean;   // true if served from cache (may still refresh)
  fresh: Promise<T | null>; // resolves when the network revalidation completes
};

async function readCache<T>(key: string): Promise<Cached<T> | null> {
  const hit = MEM.get(key);
  if (hit) return hit as Cached<T>;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    MEM.set(key, parsed);
    return parsed;
  } catch { return null; }
}

async function writeCache<T>(key: string, data: T) {
  const entry: Cached<T> = { data, at: Date.now() };
  MEM.set(key, entry);
  // Best-effort persistence — don't block the caller
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry)).catch(() => {});
}

/**
 * GET request with SWR semantics.
 *   ttlMs — how long cache is considered "fresh"; within this window we skip
 *           the network entirely. After it expires we still return the cache
 *           immediately AND fire a background revalidation.
 */
export async function swrGet<T = any>(url: string, opts: { ttlMs?: number; params?: any } = {}): Promise<SwrResult<T>> {
  const ttlMs = opts.ttlMs ?? 30_000;
  const cacheKey = url + (opts.params ? '?' + JSON.stringify(opts.params) : '');
  const cached = await readCache<T>(cacheKey);
  const now = Date.now();

  if (cached && now - cached.at < ttlMs) {
    // Fresh — skip network
    return { data: cached.data, isStale: false, fresh: Promise.resolve(cached.data) };
  }

  const fetchPromise = (async () => {
    try {
      const r = await api.get(url, { params: opts.params });
      await writeCache(cacheKey, r.data);
      return r.data as T;
    } catch {
      return cached?.data ?? null;
    }
  })();

  if (cached) {
    // Return cached immediately, revalidate in background
    return { data: cached.data, isStale: true, fresh: fetchPromise };
  }
  // No cache at all — must wait for network
  const data = await fetchPromise;
  return { data, isStale: false, fresh: Promise.resolve(data) };
}

export async function invalidate(prefix: string) {
  for (const k of Array.from(MEM.keys())) {
    if (k.startsWith(prefix)) MEM.delete(k);
  }
  // AsyncStorage sweep
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((k) => k.startsWith(PREFIX + prefix));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {}
}
