/**
 * Round 40 — network status hook.
 *
 * Centralised so any screen can read `useIsOnline()` to gate submit buttons,
 * show "Showing cached data" banners on list headers, etc.
 *
 * Defaults to `online=true` (optimistic) so that on first boot before
 * NetInfo has reported we don't flash "offline" incorrectly. On web,
 * NetInfo maps to `navigator.onLine`.
 *
 * Round 51d — Real-device hardening.
 * Previously we treated `isInternetReachable === false` as offline, which
 * caused a steady stream of false positives on Starter-tier infra:
 *   • NetInfo runs an internal probe to clients3.google.com periodically
 *     and on slow / throttled networks that probe times out before the
 *     actual TCP layer is unhealthy. The result is a perfectly working
 *     network being flagged "offline" for 1-3 seconds every minute.
 *   • Our axios layer would also trigger a "You're offline" toast on
 *     ANY no-response error, conflating server-side timeouts with client
 *     connectivity loss.
 *
 * Hardened policy:
 *   - We trust ONLY `isConnected === false` as a true offline signal
 *     (the OS-level link check; correctly reflects airplane mode / Wi-Fi
 *     drop / cellular off).
 *   - We IGNORE `isInternetReachable` flips because they're noisy.
 *   - The `useNetworkProbeResult` API exposes the raw probe state for
 *     callers that *do* want to differentiate (e.g. error screens).
 */
import { useEffect, useRef, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  const prevRef = useRef(true);

  useEffect(() => {
    let mounted = true;
    // Seed with the most recent value. Don't wait for the first callback.
    NetInfo.fetch().then((s: NetInfoState) => {
      if (!mounted) return;
      // Only `isConnected === false` is treated as offline. The reachability
      // probe is too noisy on throttled CPU / slow networks.
      const ok = s.isConnected !== false;
      prevRef.current = ok;
      setOnline(ok);
    });
    const unsub = NetInfo.addEventListener((s: NetInfoState) => {
      const ok = s.isConnected !== false;
      if (ok !== prevRef.current) {
        prevRef.current = ok;
        setOnline(ok);
      }
    });
    return () => { mounted = false; unsub(); };
  }, []);

  return online;
}

/**
 * Snapshot the current connectivity state synchronously-ish.
 * Used by the axios error interceptor to decide whether a no-response
 * error is a real "offline" event or a server-side timeout.
 */
export async function isCurrentlyOnline(): Promise<boolean> {
  try {
    const s = await NetInfo.fetch();
    return s.isConnected !== false;
  } catch {
    return true;  // optimistic — don't block users on a NetInfo failure
  }
}
