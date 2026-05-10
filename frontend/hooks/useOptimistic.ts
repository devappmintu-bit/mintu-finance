/**
 * useOptimistic.ts — R115 Sprint-2 universal optimistic mutation hook.
 *
 * Pattern shaped for India-grade flaky networks:
 *   1. User taps “Save” → UI updates INSTANTLY (optimistic).
 *   2. Server call fires in background.
 *   3a. Success → swap optimistic value with the canonical server one.
 *   3b. Failure → roll back, surface a non-blocking toast with one-tap retry.
 *
 * Why a hook?
 * -----------
 * Every list (`transactions`, `budgets`, `goals`, `splits`) was hand-rolling
 * its own version of “write-through with rollback”, drifting apart over time.
 * This hook centralises:
 *   • Optimistic value generation
 *   • Rollback on failure
 *   • Single in-flight per key (no duplicate writes on rage taps)
 *   • Auto-retry on transient network failures (max 1 retry, 1.5 s back-off)
 *
 * Usage:
 * ------
 *   const optimistic = useOptimistic<Tx>();
 *   const onAdd = (draft) => optimistic.run({
 *     key:        `tx:${draft.id ?? Math.random()}`,
 *     optimistic: () => setItems(prev => [draft, ...prev]),
 *     rollback:   () => setItems(prev => prev.filter(t => t.id !== draft.id)),
 *     commit:     () => api.post('/transactions', draft).then(r => r.data),
 *     onSuccess:  (server) => setItems(prev => prev.map(t => t.id === draft.id ? server : t)),
 *     onError:    (e) => toast.error("Couldn't save — tap to retry"),
 *   });
 */
import { useCallback, useRef } from 'react';

type OptimisticTask<T> = {
  /** Unique key for this mutation. Same key = de-duped (later one wins). */
  key: string;
  /** Apply the change to your local state instantly. */
  optimistic: () => void;
  /** Undo the optimistic change if the commit fails. */
  rollback: () => void;
  /** Fire the actual mutation. Returns the server's canonical value. */
  commit: () => Promise<T>;
  /** Reconcile the optimistic placeholder with the server response. */
  onSuccess?: (value: T) => void;
  /** Called after rollback. Toast / log here. */
  onError?: (e: any) => void;
  /** Override default 1-shot retry on transient errors (timeouts, 5xx). */
  retries?: number;
};

function isTransient(e: any): boolean {
  const code = e?.code || e?.response?.status;
  if (code === 'ECONNABORTED') return true;
  if (typeof code === 'number') return code >= 500 || code === 0;
  if (e?.message?.toLowerCase?.().includes('network')) return true;
  return false;
}

export function useOptimistic<T = any>() {
  const inflight = useRef(new Map<string, AbortController>());

  const run = useCallback(async (task: OptimisticTask<T>) => {
    const { key, optimistic, rollback, commit, onSuccess, onError, retries = 1 } = task;

    // Cancel any earlier writer with the same key.
    const prev = inflight.current.get(key);
    if (prev) prev.abort();
    const controller = new AbortController();
    inflight.current.set(key, controller);

    optimistic();

    let attempt = 0;
    let lastErr: any = null;
    while (attempt <= retries) {
      if (controller.signal.aborted) return;
      try {
        const value = await commit();
        if (controller.signal.aborted) return;
        inflight.current.delete(key);
        onSuccess?.(value);
        return value;
      } catch (e) {
        lastErr = e;
        if (!isTransient(e) || attempt >= retries) break;
        attempt += 1;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    if (controller.signal.aborted) return;
    inflight.current.delete(key);
    rollback();
    onError?.(lastErr);
  }, []);

  const cancel = useCallback((key: string) => {
    inflight.current.get(key)?.abort();
    inflight.current.delete(key);
  }, []);

  return { run, cancel };
}

export default useOptimistic;
