/**
 * useSwr — declarative React hook around the existing `swrGet` utility.
 *
 * Features:
 *   • Returns { data, isLoading, isStale, error, refetch, mutate }
 *   • Serves cache instantly, revalidates in the background (SWR semantics)
 *   • Auto-refetches on focus (expo-router `useFocusEffect`)
 *   • Supports optimistic updates via `mutate(updater)`
 *   • Conditional fetching — pass `null` as url to skip
 *
 * Usage:
 *   const { data, isLoading, refetch } = useSwr<Txn[]>('/transactions', { ttlMs: 10_000 });
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { swrGet } from '../utils/swrGet';

type Options = {
  ttlMs?: number;
  params?: any;
  /** Re-fetch every time the screen comes into focus. Default true. */
  refetchOnFocus?: boolean;
  /** Disable fetching (e.g., waiting on auth). */
  paused?: boolean;
};

type Result<T> = {
  data: T | null;
  isLoading: boolean;
  isStale: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  mutate: (updater: T | ((prev: T | null) => T)) => void;
};

export default function useSwr<T = any>(url: string | null, opts: Options = {}): Result<T> {
  const { ttlMs = 30_000, params, refetchOnFocus = true, paused = false } = opts;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!url && !paused);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!url || paused) {
      setIsLoading(false);
      return;
    }
    try {
      const { data: cached, isStale: wasStale, fresh } = await swrGet<T>(url, { ttlMs, params });
      if (!mountedRef.current) return;
      if (cached != null) {
        setData(cached);
        setIsStale(wasStale);
        setIsLoading(false);
      }
      const freshData = await fresh;
      if (!mountedRef.current) return;
      if (freshData != null) {
        setData(freshData);
        setIsStale(false);
      }
      setIsLoading(false);
      setError(null);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setIsLoading(false);
    }
  }, [url, ttlMs, JSON.stringify(params || {}), paused]);

  // Initial load + on dep change
  useEffect(() => { load(); }, [load]);

  // Re-validate on focus (with safety check — noop if pre-mount)
  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus && url && !paused) load();
    }, [refetchOnFocus, url, paused, load])
  );

  const mutate = useCallback((updater: T | ((prev: T | null) => T)) => {
    setData((prev) => (typeof updater === 'function' ? (updater as any)(prev) : updater));
    // Mark as stale so the next load returns the latest server state
    setIsStale(true);
  }, []);

  return { data, isLoading, isStale, error, refetch: load, mutate };
}
