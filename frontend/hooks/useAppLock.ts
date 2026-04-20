/**
 * useAppLock — locks the app on every resume from background.
 *
 * Mounted once in root `_layout.tsx`. Watches AppState; when the app returns
 * to the foreground after >= GRACE_MS of being away AND the user is authed
 * AND has either a PIN or biometric set, it flips `authStore.locked = true`
 * which causes _layout to redirect to /unlock.
 *
 * Grace period (default 5s) prevents locking on transient overlays like the
 * share sheet, push-permission dialog, or Razorpay/Gmail OAuth popups.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { hasPin, biometricAvailable, isBiometricEnabled } from '../utils/lockManager';

const GRACE_MS = 5_000;

export function useAppLock() {
  const lock = useAuthStore((st) => st.lock);
  const backgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    // No-op on web — there's no background/foreground cycle to re-lock on.
    if (Platform.OS === 'web') return;

    const onChange = async (next: AppStateStatus) => {
      const { token, locked } = useAuthStore.getState();
      if (next === 'background' || next === 'inactive') {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next !== 'active') return;
      const since = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (!token) return;          // not logged in → nothing to lock
      if (locked) return;          // already locked — don't double-fire
      if (since && Date.now() - since < GRACE_MS) return;  // within grace period

      // Only lock if the user has a credential set to unlock with.
      const [pin, bioHw, bioOn] = await Promise.all([
        hasPin(),
        biometricAvailable(),
        isBiometricEnabled(),
      ]);
      if (!pin && !(bioHw && bioOn)) return;  // nothing to unlock against
      await lock();
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [lock]);
}
