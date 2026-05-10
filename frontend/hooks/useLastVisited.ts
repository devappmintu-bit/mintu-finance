/**
 * useLastVisited.ts — R115 Sprint-2 cross-launch nav memory.
 *
 * Persists tiny breadcrumbs (last route + last sub-tab + last filter
 * snapshot) to AsyncStorage so a user re-opening the app lands EXACTLY
 * where they were. Companion to the in-memory `useNavigationMemory`
 * which only survives a single app session.
 *
 *   Memory layer        Lifetime               Used for
 *   ------------------  ---------------------  ------------------------
 *   useNavigationMemory module-eval (session)  scroll, filter snapshots
 *   useLastVisited      AsyncStorage (persist) last route, last sub-tab,
 *                                              last Pulse category, etc.
 *
 * Implementation notes:
 *   • Throttled writes (2 s window) so high-frequency tab-switches don't
 *     hit AsyncStorage on every tap.
 *   • Single keyspace under `mintu:lastVisited:*` so it's clearable in one
 *     pass on logout.
 *   • No PII / no values — just route + tab key + filter strings. Safe by
 *     construction.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useRef } from 'react';

const PREFIX = 'mintu:lastVisited:';
const WRITE_THROTTLE_MS = 2000;

const pending = new Map<string, { value: string; timer: any }>();

function queueWrite(key: string, value: string) {
  const slot = pending.get(key);
  if (slot) {
    slot.value = value;
    return;
  }
  const timer = setTimeout(async () => {
    const final = pending.get(key);
    pending.delete(key);
    if (final) {
      try { await AsyncStorage.setItem(PREFIX + key, final.value); } catch { /* noop */ }
    }
  }, WRITE_THROTTLE_MS);
  pending.set(key, { value, timer });
}

export async function setLastVisited(key: string, value: string) {
  queueWrite(key, value);
}

export async function getLastVisited(key: string): Promise<string | null> {
  // Drain any pending in-flight write for this key first.
  const slot = pending.get(key);
  if (slot) return slot.value;
  try {
    return await AsyncStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function clearAllLastVisited() {
  pending.forEach((slot) => clearTimeout(slot.timer));
  pending.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch { /* noop */ }
}

/**
 * Hook helper for components that want to read + write the same key.
 */
export function useLastVisited(key: string) {
  const cache = useRef<string | null>(null);

  const remember = useCallback((value: string) => {
    cache.current = value;
    queueWrite(key, value);
  }, [key]);

  const recall = useCallback(async (): Promise<string | null> => {
    if (cache.current !== null) return cache.current;
    const v = await getLastVisited(key);
    cache.current = v;
    return v;
  }, [key]);

  return { remember, recall };
}

export default useLastVisited;
