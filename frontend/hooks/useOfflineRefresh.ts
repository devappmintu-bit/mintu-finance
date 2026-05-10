/**
 * useOfflineRefresh — R114 Tier-A4 fix.
 *
 * A pull-to-refresh wrapper that:
 *   1. Short-circuits when the device is offline → toast hint, no spin.
 *   2. Auto-resets `refreshing` so it can never get wedged on.
 *   3. Optionally dedupes rapid double-pulls inside `lockoutMs`.
 *
 * Usage:
 * ------
 *   const { refreshing, onRefresh } = useOfflineRefresh(load);
 *   <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
 *
 * `load` MAY be sync or async. Errors are swallowed so the spinner
 * always clears — call sites are expected to surface their own toasts
 * inside the loader if they want to differentiate.
 */
import { useCallback, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import { useIsOnline } from './useIsOnline';

interface OfflineRefreshOptions {
  /** ms during which a second pull is ignored (default 800). */
  lockoutMs?: number;
  /** Custom offline toast text. */
  offlineMessage?: string;
}

export function useOfflineRefresh(
  load: () => Promise<any> | any,
  options: OfflineRefreshOptions = {}
) {
  const { lockoutMs = 800, offlineMessage = "You're offline · pull again later" } = options;
  const isOnline = useIsOnline();
  const [refreshing, setRefreshing] = useState(false);
  const lastFiredAt = useRef(0);

  const onRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastFiredAt.current < lockoutMs) return; // dedupe
    lastFiredAt.current = now;

    if (!isOnline) {
      Toast.show({
        type: 'info',
        text1: offlineMessage,
        visibilityTime: 1800,
      });
      return;
    }

    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      if (__DEV__) console.warn('[useOfflineRefresh] load failed:', e);
    } finally {
      setRefreshing(false);
    }
  }, [isOnline, load, lockoutMs, offlineMessage]);

  return { refreshing, onRefresh, isOnline };
}
