/**
 * Round 40 — network status hook.
 *
 * Centralised so any screen can read `useIsOnline()` to gate submit buttons,
 * show "Showing cached data" banners on list headers, etc.
 *
 * Defaults to `online=true` (optimistic) so that on first boot before
 * NetInfo has reported we don't flash "offline" incorrectly. On web,
 * NetInfo maps to `navigator.onLine`.
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
      const ok = s.isConnected !== false && s.isInternetReachable !== false;
      prevRef.current = ok;
      setOnline(ok);
    });
    const unsub = NetInfo.addEventListener((s: NetInfoState) => {
      // Treat `isInternetReachable=null` as still-online (probe hasn't run yet).
      const ok = s.isConnected !== false && s.isInternetReachable !== false;
      if (ok !== prevRef.current) {
        prevRef.current = ok;
        setOnline(ok);
      }
    });
    return () => { mounted = false; unsub(); };
  }, []);

  return online;
}
