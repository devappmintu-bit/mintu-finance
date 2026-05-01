/**
 * constants/storage.ts — centralized AsyncStorage / SecureStore keys.
 *
 * Why this exists
 * ---------------
 * Previously the same key literals ('token', 'onboarding_seen',
 * 'app_lock_enabled', 'app_lang') appeared in 2+ files each. A typo in
 * one place (e.g. 'onboarding_seen' vs 'onboardingSeen') would silently
 * break the flow. All storage keys now live here as a single source of
 * truth.
 *
 * Usage
 * -----
 *   import { STORAGE } from '@/constants/storage';
 *   await SecureStore.setItemAsync(STORAGE.TOKEN, jwt);
 *   const lang = await AsyncStorage.getItem(STORAGE.APP_LANG);
 */

export const STORAGE = {
  /** Auth JWT stored in SecureStore. Reads via `getToken()` wrapper. */
  TOKEN: 'token',

  /** Whether the user has completed the first-run onboarding carousel. */
  ONBOARDING_SEEN: 'onboarding_seen',

  /** Biometric / PIN-lock toggle. */
  APP_LOCK_ENABLED: 'app_lock_enabled',

  /** Active UI language code ('en' / 'hi' / 'hinglish' / etc). */
  APP_LANG: 'app_lang',

  /** Encrypted PIN (4-digit) stored in SecureStore. */
  USER_PIN: 'user_pin',

  /** Cached user profile (lightweight) for offline first paint. */
  USER_CACHE: 'user_cache',

  /** Last-seen notification timestamp — used for unread badge resolution. */
  NOTIF_LAST_SEEN: 'notif_last_seen',

  /** Feature-flag overrides (dev / QA builds). */
  FEATURE_FLAGS: 'feature_flags',
} as const;

export type StorageKey = typeof STORAGE[keyof typeof STORAGE];
