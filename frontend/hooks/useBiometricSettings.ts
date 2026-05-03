/**
 * useBiometricSettings.ts — Round 69 R4 follow-up extraction.
 *
 * Encapsulates the biometric / PIN / app-lock settings state for
 * the Profile screen. Previously these ~70 lines lived inline in
 * /app/(tabs)/profile.tsx alongside data-fetching, mutations, and
 * presentation, making the orchestrator hard to scan.
 *
 * Owns:
 *   • Mount-time check of hardware availability + saved preferences
 *   • `bioHwAvail`, `bioOn`, `bioLabel` (Face ID / Fingerprint / Biometric)
 *   • `appLockOn` (SecureStore-backed boolean)
 *   • `hasPinSet` (whether the user has configured a PIN)
 *   • `pinModalVisible` (open/close state for the PIN setup sheet)
 *   • `onToggleBio` — verifies with biometric before enabling
 *   • `onToggleAppLock` — persists to SecureStore
 *   • `onChangePin` — gates PIN change behind biometric verification
 *
 * The PIN modal itself stays in the Profile screen because it
 * carries onSuccess closures that touch local state. The HOOK only
 * owns the boolean visibility flag + the onChangePin gate.
 */
import { useCallback, useEffect, useState } from 'react';
import Toast from 'react-native-toast-message';
import { biometricAvailable, isBiometricEnabled, setBiometricEnabled, supportedBiometricLabel, tryBiometric, hasPin } from '../utils/lockManager';
import { STORAGE } from '../constants/storageKeys';

export type BiometricSettings = {
  bioHwAvail: boolean;
  bioOn: boolean;
  bioLabel: 'Face ID' | 'Fingerprint' | 'Biometric';
  appLockOn: boolean;
  hasPinSet: boolean;
  pinModalVisible: boolean;

  // Setters used by the orchestrator after successful PIN setup.
  setHasPinSet: (v: boolean) => void;
  setPinModalVisible: (v: boolean) => void;

  // Handlers
  onToggleBio: () => Promise<void>;
  onToggleAppLock: () => Promise<void>;
  onChangePin: () => Promise<void>;
};

export function useBiometricSettings(): BiometricSettings {
  const [bioHwAvail, setBioHwAvail] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioLabel, setBioLabel] = useState<'Face ID' | 'Fingerprint' | 'Biometric'>('Biometric');
  const [appLockOn, setAppLockOn] = useState(true);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [hasPinSet, setHasPinSet] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [hw, on, lbl, pinSet] = await Promise.all([
          biometricAvailable(),
          isBiometricEnabled(),
          supportedBiometricLabel(),
          hasPin(),
        ]);
        setBioHwAvail(hw);
        setBioOn(hw && on);
        setBioLabel(lbl);
        setHasPinSet(pinSet);
        // App-lock pref via SecureStore (web-safe via try/catch)
        try {
          const SecureStore = require('expo-secure-store');
          const v = await SecureStore.getItemAsync(STORAGE.APP_LOCK_ENABLED);
          if (v === '0') setAppLockOn(false);
        } catch { /* web — default ON */ }
      } catch { /* non-blocking */ }
    })();
  }, []);

  const onToggleBio = useCallback(async () => {
    if (!bioHwAvail) return;
    const next = !bioOn;
    if (next) {
      // Verify with biometric BEFORE flipping pref ON so we never
      // leave a "biometric enabled" state without proof of consent.
      const ok = await tryBiometric(`Confirm to enable ${bioLabel}`);
      if (!ok) {
        Toast.show({
          type: 'info',
          text1: `${bioLabel} not confirmed`,
          text2: 'Try again to enable',
          position: 'bottom',
        });
        return;
      }
    }
    await setBiometricEnabled(next);
    setBioOn(next);
    Toast.show({
      type: 'success',
      text1: next ? `${bioLabel} enabled` : `${bioLabel} disabled`,
      text2: next ? `Use ${bioLabel} to unlock MintU` : 'Use mPIN to unlock',
      position: 'bottom',
    });
  }, [bioHwAvail, bioOn, bioLabel]);

  const onToggleAppLock = useCallback(async () => {
    const next = !appLockOn;
    setAppLockOn(next);
    try {
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync(STORAGE.APP_LOCK_ENABLED, next ? '1' : '0');
    } catch { /* web fallback — ignored */ }
    Toast.show({
      type: 'success',
      text1: next ? 'App lock ON' : 'App lock OFF',
      text2: next ? 'MintU will lock when sent to background' : 'MintU stays unlocked in background',
      position: 'bottom',
    });
  }, [appLockOn]);

  const onChangePin = useCallback(async () => {
    // Require current credential before allowing PIN change.
    if (bioHwAvail && bioOn) {
      const ok = await tryBiometric(`Confirm to change mPIN`);
      if (!ok) {
        Toast.show({
          type: 'info',
          text1: 'Verification needed',
          text2: 'Confirm to change PIN',
          position: 'bottom',
        });
        return;
      }
    }
    setPinModalVisible(true);
  }, [bioHwAvail, bioOn]);

  return {
    bioHwAvail, bioOn, bioLabel, appLockOn, hasPinSet, pinModalVisible,
    setHasPinSet, setPinModalVisible,
    onToggleBio, onToggleAppLock, onChangePin,
  };
}
