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
      // Round 53n — pass `silent: true` whenever we already have a
      // cached value on screen. The interceptor honours this flag and
      // suppresses the global "Couldn't reach MintU" toast, which would
      // otherwise create a confusing "data visible + error visible"
      // state during background revalidation hiccups. First-load
      // (cached === null) still toasts so users know the screen is
      // genuinely empty.
      const r = await api.get(url, {
        params: opts.params,
        ...(cached ? { silent: true } : {}),
      } as any);
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
  // Notify any mounted useSwr hooks whose URL matches this prefix so they
  // refetch immediately — this is what turns a passive cache into a
  // reactive data graph. Subscribers are keyed by URL prefix.
  fireInvalidation(prefix);
}

// ─── Pub/Sub for invalidation events ──────────────────────────────────
// Mounted useSwr hooks subscribe to URL prefixes. When `invalidate(p)`
// is called, every subscriber whose prefix overlaps with `p` fires a
// refetch. Enables real-time UI updates across tabs on any mutation.

type InvalidationListener = () => void;
const subscribers = new Map<string, Set<InvalidationListener>>();

export function subscribeInvalidation(prefix: string, listener: InvalidationListener): () => void {
  if (!subscribers.has(prefix)) subscribers.set(prefix, new Set());
  subscribers.get(prefix)!.add(listener);
  return () => {
    const set = subscribers.get(prefix);
    if (set) {
      set.delete(listener);
      if (set.size === 0) subscribers.delete(prefix);
    }
  };
}

function fireInvalidation(firedPrefix: string) {
  // Notify listeners whose prefix is a prefix of the fired one OR vice versa.
  // Example: firing `/split/balances` wakes a hook subscribed to `/split/`.
  for (const [subPrefix, listeners] of subscribers) {
    if (firedPrefix.startsWith(subPrefix) || subPrefix.startsWith(firedPrefix)) {
      for (const fn of listeners) {
        try { fn(); } catch { /* swallow — bad listener shouldn't kill others */ }
      }
    }
  }
}

/** Nuke the entire SWR cache — in-memory + AsyncStorage. Used by the
 *  account-deletion flow so stale data from the previous session never
 *  leaks into a new login. */
export async function clearSwrCache(): Promise<void> {
  MEM.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((k) => k.startsWith(PREFIX));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {}
}

