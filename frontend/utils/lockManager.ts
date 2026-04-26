// Secure lock manager — 4-digit PIN stored hashed in SecureStore, with an
// optional biometric unlock that falls back to the PIN when unavailable.
// Public API:
//   hasPin()                       → boolean
//   setPin(pin)                    → store new PIN
//   verifyPin(pin)                 → boolean
//   clearPin()                     → remove PIN (on logout)
//   biometricAvailable()           → boolean (Face ID / fingerprint enrolled)
//   tryBiometric(prompt?)          → boolean (true = unlocked)
//   isExpoGo()                     → boolean (true when running inside Expo Go,
//                                    where biometric prompts get intercepted)
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Round 51d — Expo Go bypass.
// Inside the Expo Go sandbox, expo-local-authentication's native prompt is
// intercepted by Expo's own development host, which shows a generic dialog
// that doesn't actually authenticate against device biometrics. To avoid
// trapping the user in an unlock loop on real devices running Expo Go,
// we treat Expo Go as "biometric unavailable" and force the PIN path.
// The check uses both `Constants.appOwnership === 'expo'` (legacy) and
// `Constants.executionEnvironment === 'storeClient'` (modern SDKs).
export function isExpoGo(): boolean {
  try {
    const own = (Constants as any)?.appOwnership;
    const env = (Constants as any)?.executionEnvironment;
    return own === 'expo' || env === 'storeClient';
  } catch {
    return false;
  }
}

const PIN_KEY = 'mintu_lock_pin_v1';
const PIN_SALT_KEY = 'mintu_lock_salt_v1';
const BIO_ENABLED_KEY = 'mintu_bio_enabled_v1';  // user-preference flag — defaults to true post-registration

function randSalt(): string {
  return Array.from({ length: 16 }, () => Math.random().toString(36).charAt(2)).join('');
}

// Lightweight hash — DJB2 + salt. Good enough for a device-local 4-digit PIN
// (SecureStore keychain already protects it; we just don't want plaintext).
function hash(pin: string, salt: string): string {
  let h = 5381;
  const s = salt + pin + salt;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16) + s.length.toString(16);
}

// On web, SecureStore isn't available — use AsyncStorage fallback.
const storeAvailable = Platform.OS !== 'web' && !!SecureStore.getItemAsync;

let webFallback: Record<string, string> = {};
async function getItem(key: string): Promise<string | null> {
  if (!storeAvailable) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return await AsyncStorage.getItem(key);
    } catch { return webFallback[key] || null; }
  }
  return SecureStore.getItemAsync(key);
}
async function setItem(key: string, value: string): Promise<void> {
  if (!storeAvailable) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(key, value); return;
    } catch { webFallback[key] = value; return; }
  }
  await SecureStore.setItemAsync(key, value);
}
async function removeItem(key: string): Promise<void> {
  if (!storeAvailable) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem(key); return;
    } catch { delete webFallback[key]; return; }
  }
  await SecureStore.deleteItemAsync(key);
}

export async function hasPin(): Promise<boolean> {
  const v = await getItem(PIN_KEY);
  return !!v;
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
  const salt = randSalt();
  await setItem(PIN_SALT_KEY, salt);
  await setItem(PIN_KEY, hash(pin, salt));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const saved = await getItem(PIN_KEY);
  const salt = await getItem(PIN_SALT_KEY);
  if (!saved || !salt) return false;
  return saved === hash(pin, salt);
}

export async function clearPin(): Promise<void> {
  await removeItem(PIN_KEY);
  await removeItem(PIN_SALT_KEY);
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    // Round 51d — Expo Go intercepts biometric prompts. Treat as unavailable
    // so the unlock flow falls through to PIN immediately.
    if (isExpoGo()) return false;
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHw && enrolled;
  } catch { return false; }
}

export async function supportedBiometricLabel(): Promise<'Face ID' | 'Fingerprint' | 'Biometric'> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Fingerprint';
    return 'Biometric';
  } catch { return 'Biometric'; }
}

export async function tryBiometric(promptMessage = 'Unlock MintU'): Promise<boolean> {
  try {
    if (!(await biometricAvailable())) return false;
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
    });
    return !!res.success;
  } catch { return false; }
}

// ── Biometric-enabled preference ──────────────────────────────────────
// We default to TRUE post-registration (the user explicitly set a PIN and,
// if the hardware+enrolment check passes, they've implicitly opted in to
// biometric fast-path). They can toggle this later from Profile → Security.

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await getItem(BIO_ENABLED_KEY);
  // default ON — only false if user explicitly toggled off
  return v !== '0';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  await setItem(BIO_ENABLED_KEY, on ? '1' : '0');
}

/** Called once from PIN setup success — marks biometric as opt-in enabled. */
export async function enableBiometricByDefault(): Promise<boolean> {
  const avail = await biometricAvailable();
  await setBiometricEnabled(avail);  // on phones with enrolled Face ID / fingerprint
  return avail;
}
