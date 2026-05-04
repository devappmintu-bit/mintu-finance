/**
 * utils/tokenStore.ts — Round 88 Auth V2 token storage.
 *
 * Two-token model (matches /backend/services/token_service.py):
 *   • access_token  — short-lived (15 min) JWT. Stored in AsyncStorage
 *                     under STORAGE.TOKEN — already used as the bearer
 *                     header in api.ts. AsyncStorage is fine here:
 *                     even if the device is rooted and an attacker
 *                     reads it, the token expires within 15 min.
 *   • refresh_token — long-lived (30 day) opaque random string. MUST
 *                     live in SecureStore (Keychain on iOS,
 *                     EncryptedSharedPreferences on Android) so a
 *                     filesystem snapshot can't trivially replay it.
 *                     Server stores only sha256(plaintext); rotated on
 *                     every /auth/refresh call.
 *
 * On web the SecureStore native module is absent — we degrade to
 * AsyncStorage (the threat model on web is different anyway).
 *
 * Public API:
 *   saveTokens({access, refresh})
 *   getAccessToken() / getRefreshToken()
 *   clearTokens()    — wipes both stores
 *   onTokensChanged(fn) — subscriber pattern for the silent-refresh
 *                         coordinator in api.ts
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { STORAGE } from '../constants/storage';

const REFRESH_KEY = 'mintu.refresh_token_v1';

const secureAvailable =
  Platform.OS !== 'web' && !!(SecureStore as any)?.setItemAsync;

// ── Refresh-token helpers (SecureStore) ────────────────────────────────
async function setRefreshToken(value: string): Promise<void> {
  if (secureAvailable) {
    await SecureStore.setItemAsync(REFRESH_KEY, value);
  } else {
    // Web fallback — AsyncStorage. SecureStore is undefined on RN-Web.
    await AsyncStorage.setItem(REFRESH_KEY, value);
  }
}

async function deleteRefreshToken(): Promise<void> {
  if (secureAvailable) {
    try { await SecureStore.deleteItemAsync(REFRESH_KEY); } catch { /* noop */ }
  } else {
    try { await AsyncStorage.removeItem(REFRESH_KEY); } catch { /* noop */ }
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    if (secureAvailable) {
      return await SecureStore.getItemAsync(REFRESH_KEY);
    }
    return await AsyncStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

// ── Access-token helpers (AsyncStorage — already in api.ts) ────────────
export async function getAccessToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE.TOKEN);
  } catch {
    return null;
  }
}

async function setAccessToken(value: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE.TOKEN, value);
}

async function deleteAccessToken(): Promise<void> {
  try { await AsyncStorage.removeItem(STORAGE.TOKEN); } catch { /* noop */ }
}

// ── Compound helpers ───────────────────────────────────────────────────
export interface TokenPair {
  access: string;
  refresh?: string | null;
}

/**
 * Persist tokens after /auth/verify-otp or /auth/refresh.
 * `refresh` is optional — legacy /auth/verify-otp responses that
 * didn't carry device context still ship only the legacy `token`.
 * In that case we store it as the access token and skip refresh.
 */
export async function saveTokens(pair: TokenPair): Promise<void> {
  await setAccessToken(pair.access);
  if (pair.refresh) {
    await setRefreshToken(pair.refresh);
  }
}

/** Wipe both tokens — used on logout / removeAccount / failed refresh. */
export async function clearTokens(): Promise<void> {
  await Promise.all([deleteAccessToken(), deleteRefreshToken()]);
}

/** Convenience: did we ever store a refresh token on this device? */
export async function hasRefreshToken(): Promise<boolean> {
  const t = await getRefreshToken();
  return !!(t && t.length >= 32);
}
