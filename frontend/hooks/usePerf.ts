/**
 * usePerf — small toolkit of hooks/helpers for first-paint speed.
 *
 * The pattern
 * -----------
 * Mobile screens routinely fire 4-8 network calls in `useEffect` on
 * mount. Each one parsed off the JS thread blocks first paint, even
 * when the call returns ms later. Wrapping non-critical work in
 * `runWhenIdle` defers it until after the first interactive frame
 * → users see content sooner; no UX trade-off.
 *
 * Round 58 — Performance Pass.
 */
import { useCallback, useEffect, useRef } from 'react';
import { InteractionManager, Platform } from 'react-native';

/**
 * `runWhenIdle(work)` — fire `work()` after the next interactive
 * frame. Falls back to `requestIdleCallback` on web (better than
 * setTimeout(0) — only runs when the main thread is free).
 *
 * Returns a `cancel()` so callers can abort in cleanup. The cancel
 * is best-effort on iOS/Android (InteractionManager doesn't expose
 * a real handle for some versions).
 */
export function runWhenIdle(work: () => void | Promise<void>): () => void {
  let cancelled = false;

  if (Platform.OS === 'web' && typeof (globalThis as any).requestIdleCallback === 'function') {
    const handle = (globalThis as any).requestIdleCallback(() => {
      if (!cancelled) work();
    });
    return () => {
      cancelled = true;
      try {
        (globalThis as any).cancelIdleCallback?.(handle);
      } catch {
        /* noop */
      }
    };
  }

  // Native (and web fallback): defer until interactions/animations end.
  const handle = InteractionManager.runAfterInteractions(() => {
    if (!cancelled) work();
  });

  return () => {
    cancelled = true;
    try {
      (handle as any)?.cancel?.();
    } catch {
      /* noop */
    }
  };
}

/**
 * `useDeferredEffect(work, deps)` — same shape as `useEffect` but the
 * effect body fires AFTER the first interactive frame. Ideal for:
 *   - news feeds, leaderboard refreshes, AI-coach prefetch
 *   - analytics flushes, Sentry breadcrumbs
 *   - any "nice-to-have" work that shouldn't gate first paint
 *
 *     useDeferredEffect(() => { fetchSecondaryData(); }, [userId]);
 */
export function useDeferredEffect(
  effect: () => void | Promise<void> | (() => void),
  deps: React.DependencyList = [],
): void {
  // Stash the cleanup fn from `effect`'s sync return so React can
  // invoke it on unmount, even though we deferred the body.
  const cleanupRef = useRef<(() => void) | void>(undefined);

  useEffect(() => {
    let cancelled = false;
    const cancelDefer = runWhenIdle(async () => {
      if (cancelled) return;
      const ret = await effect();
      if (typeof ret === 'function') {
        cleanupRef.current = ret;
      }
    });

    return () => {
      cancelled = true;
      cancelDefer();
      try {
        const fn = cleanupRef.current;
        if (typeof fn === 'function') fn();
      } catch {
        /* noop */
      }
      cleanupRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * `useAfterFirstPaint(callback)` — fire `callback` exactly once after
 * the very first interactive frame. Useful for one-shot init like
 * Sentry capture, analytics page-view, or warming a route prefetch
 * that doesn't need to gate the user's first interaction.
 */
export function useAfterFirstPaint(callback: () => void | Promise<void>): void {
  const firedRef = useRef(false);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const cancel = runWhenIdle(() => {
      cbRef.current();
    });
    return cancel;
  }, []);
}

/**
 * `prefetchRoute(routeImporter)` — eager `import()` a route's module
 * during idle time so when the user actually navigates there, it's
 * already in the JS bundle cache. Used by Home to prefetch
 * Transactions / Budget / AI Coach in the background.
 *
 *     // In Home's useAfterFirstPaint:
 *     prefetchRoute(() => import('../app/(tabs)/transactions'));
 */
export function prefetchRoute(routeImporter: () => Promise<unknown>): () => void {
  return runWhenIdle(() => {
    routeImporter().catch(() => {
      /* prefetch is best-effort; swallow network errors */
    });
  });
}

/**
 * Memo-stable callback that defers its body until idle. Useful for
 * onScroll handlers or other high-frequency events where the work
 * itself is non-critical (analytics, prefetch).
 */
export function useDeferredCallback<T extends (...args: any[]) => void>(fn: T): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback(((...args: any[]) => {
    runWhenIdle(() => fnRef.current(...args));
  }) as T, []);
}
