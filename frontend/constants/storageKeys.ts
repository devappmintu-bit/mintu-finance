/**
 * storageKeys — central registry of every AsyncStorage and SecureStore key
 * used by the MintU client.
 *
 * Why centralise?
 *   • Prevents typos (`user_avatar` vs `user-avatar`) from creating silent
 *     data leaks between sessions.
 *   • Single-file change when extending `clearSessionState()` for a new
 *     user-scoped feature.
 *   • Makes the surface auditable — anyone reviewing this file sees every
 *     piece of on-device state in one place.
 *
 * Conventions:
 *   • PER_USER_*  — wiped on every login/logout (utils/clearSessionState.ts)
 *   • DEVICE_*    — survives login/logout (theme, language, onboarding-seen)
 *   • PREFIX_*    — variable-suffix key namespaces, swept via getAllKeys()
 */

// ─────────────────────────────────────────────────────────────────────
// AsyncStorage keys
// ─────────────────────────────────────────────────────────────────────

/** Keys that hold per-user data and MUST be wiped on session reset. */
export const PER_USER_ASYNC_KEYS = [
  'user_avatar',                    // header avatar image (data url)
  'mintu_app_locked_v1',            // soft-lock flag
  'getting_started_dismissed_v1',   // home onboarding checklist dismissal
  'search_recent_v1',               // recent search terms
  '@mintu/premium/plan',            // active premium tier
  '@mintu/premium/started_at',      // premium activation timestamp
  '@mintu:expo_push_token',         // device push token (re-register per user)
] as const;

/** Variable-suffix prefixes — swept via AsyncStorage.getAllKeys(). */
export const PER_USER_ASYNC_PREFIXES = [
  'swr::',                  // ENTIRE SWR API cache
  'streak_milestone_',      // daily milestone celebration flags
  'seen_quest_',            // daily quest seen flags
  '@mintu/quest/',          // future quest namespace
  '@mintu/streak/',         // future streak namespace
] as const;

/** Auth token — handled separately by authStore.removeAccount(); not in PER_USER_ASYNC_KEYS. */
export const ASYNC_TOKEN_KEY = 'token';

/** Tracks the currently-signed-in user on this device. */
export const ASYNC_CURRENT_USER_ID_KEY = 'mintu_current_user_id_v1';

/** DEVICE-scoped — survives login/logout. */
export const DEVICE_ASYNC_KEYS = {
  ONBOARDING_SEEN: 'onboarding_seen',
  APP_LANG: 'app_lang',
  THEME_MODE: 'mintu_theme_mode_v1',
  THEME_AMOLED: 'mintu_theme_amoled_v1',
} as const;

// ─────────────────────────────────────────────────────────────────────
// SecureStore keys
// ─────────────────────────────────────────────────────────────────────

/** SecureStore keys that hold per-user data and MUST be wiped on session reset.
 *
 *  CRITICAL — leaving these around is a security bug: User A's PIN would
 *  unlock User B's account on a shared device. */
export const PER_USER_SECURE_KEYS = [
  'mintu_lock_pin_v1',              // hashed app-lock PIN
  'mintu_lock_salt_v1',             // PIN salt
  'mintu_bio_enabled_v1',           // biometric opt-in flag
  'app_lock_enabled',               // lock-on-resume preference
] as const;

// ─────────────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────────────

export type PerUserAsyncKey = (typeof PER_USER_ASYNC_KEYS)[number];
export type PerUserSecureKey = (typeof PER_USER_SECURE_KEYS)[number];
