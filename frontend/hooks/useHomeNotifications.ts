/**
 * useHomeNotifications — extracted from app/(tabs)/index.tsx (Wave R3).
 *
 * Encapsulates the bell-badge unread count + the 3 refresh triggers
 * (mount, AppState change, 60-second foreground poll) along with the
 * 5-second debounce that prevents thrashing the network when all 3
 * fire at once.
 *
 * Why a hook
 * ----------
 * Home was carrying ~40 lines of unrelated notification machinery. By
 * lifting it here we keep the home component focused on layout, and any
 * other screen that needs a live unread badge (settings, drawer, etc.)
 * can reuse the same hook without copying the debounce + offline-skip
 * logic.
 *
 * Returns: ``unread`` — the latest server-reported unread count.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const DEBOUNCE_MS = 5_000;
const POLL_INTERVAL_MS = 60_000;

export function useHomeNotifications(): { unread: number; refresh: () => void } {
  const [unread, setUnread] = useState(0);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < DEBOUNCE_MS) return;
    lastFetchRef.current = now;
    try {
      // Skip the call when we know the device is offline — saves a
      // wasted request that would just hit api.ts retry/toast.
      try {
        const { isCurrentlyOnline } = await import('./useIsOnline');
        if (!(await isCurrentlyOnline())) return;
      } catch {
        /* hook unavailable — proceed with the request */
      }
      const { fetchUnreadCount } = await import('../services/notifications');
      const n = await fetchUnreadCount();
      setUnread(n);
    } catch {
      /* silent — stale value retained */
    }
  }, []);

  // Initial fetch on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch when app comes back to foreground (notification may have
  // landed while we were backgrounded).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Foreground polling. Until real push delivery is wired, poll every
  // 60 s so the badge stays roughly in sync. Pauses when unmounted.
  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { unread, refresh };
}
