/**
 * sessionReset — single source of truth for clearing per-user device state.
 *
 * Why this file exists:
 *   The MintU client persists several pieces of "per-user" state on-device:
 *     • SWR API cache (in-memory + AsyncStorage `swr::*`)
 *     • PIN + biometric prefs (SecureStore)
 *     • Avatar, premium plan, search history, push token (AsyncStorage)
 *     • In-memory premium plan cache
 *
 *   Without explicit cleanup, these leak across user sessions on the same
 *   device. Symptoms:
 *     • New user sees old user's balance/transactions for 30 s after signup
 *     • Old user's PIN unlocks new user's account
 *     • Old user's premium plan is granted to a freshly registered free user
 *     • New user sees old user's "Getting Started" card already dismissed
 *
 *   `resetSessionState()` wipes ALL of the above in one idempotent call.
 *   `ensureCleanSessionFor(newUserId)` is the public hook the auth flow
 *   uses — it auto-detects user identity changes and wipes only when needed.
 *
 * Call sites:
 *   • app/auth.tsx — after every successful OTP verify / registration
 *   • store/authStore.ts:removeAccount() — on full account deletion
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Tracks the currently-signed-in user on this device. Used to detect
// user-switch (different phone number signs in on the same device).
const CURRENT_USER_ID_KEY = 'mintu_current_user_id_v1';

// AsyncStorage keys that are scoped per-user. Anything user-private goes here.
const PER_USER_ASYNC_KEYS = [
  'user_avatar',                    // header avatar image (data url)
  'mintu_app_locked_v1',            // soft-lock flag
  'getting_started_dismissed_v1',   // home onboarding checklist
  'search_recent_v1',               // recent search terms
  '@mintu/premium/plan',            // premium tier
  '@mintu/premium/started_at',      // premium activation timestamp
  '@mintu:expo_push_token',         // push token (re-register under new user)
];

// SecureStore keys that are scoped per-user. Critical for security.
const PER_USER_SECURE_KEYS = [
  'mintu_lock_pin_v1',              // hashed app-lock PIN
  'mintu_lock_salt_v1',              // PIN salt
  'mintu_bio_enabled_v1',            // biometric opt-in flag
  'app_lock_enabled',                // lock-on-resume preference
];

const storeAvailable = Platform.OS !== 'web' && !!SecureStore?.deleteItemAsync;

/**
 * Wipes ALL per-user device state. Idempotent — safe to call multiple times.
 *
 * Does NOT clear:
 *   • Auth token (caller is responsible — usually replaced, not removed)
 *   • Onboarding-seen flag (`onboarding_seen`) — that's device-scoped UX,
 *     not user-scoped data; new user on same device shouldn't be forced
 *     through onboarding again.
 *   • Theme / language prefs — device preferences, not user data.
 */
export async function resetSessionState(): Promise<void> {
  // 1. SWR API cache (in-memory + AsyncStorage `swr::*`). This is the
  //    single biggest leak — without this, /home/bundle, /transactions,
  //    /budgets, etc. all return the previous user's data for ~30 s.
  try {
    const { clearSwrCache } = await import('./swrGet');
    await clearSwrCache();
  } catch { /* noop */ }

  // 2. PIN + salt — security-critical. Old user's PIN must NOT unlock new user.
  try {
    const { clearPin } = await import('./lockManager');
    await clearPin();
  } catch { /* noop */ }

  // 3. Bulk-remove per-user AsyncStorage keys.
  try {
    await AsyncStorage.multiRemove(PER_USER_ASYNC_KEYS);
  } catch { /* noop */ }

  // 4. Sweep variable-suffix AsyncStorage keys (streak milestones, etc.)
  try {
    const all = await AsyncStorage.getAllKeys();
    const sweep = all.filter((k) =>
      k.startsWith('streak_milestone_') ||
      k.startsWith('seen_quest_') ||
      k.startsWith('@mintu/quest/') ||
      k.startsWith('@mintu/streak/')
    );
    if (sweep.length) await AsyncStorage.multiRemove(sweep);
  } catch { /* noop */ }

  // 5. SecureStore keys (or AsyncStorage fallback on web).
  if (storeAvailable) {
    await Promise.all(
      PER_USER_SECURE_KEYS.map((k) =>
        SecureStore.deleteItemAsync(k).catch(() => {})
      )
    );
  } else {
    try { await AsyncStorage.multiRemove(PER_USER_SECURE_KEYS); } catch { /* noop */ }
  }

  // 6. Reset in-memory premium plan cache so canAccess() doesn't keep
  //    returning the old user's tier until the next AsyncStorage round-trip.
  try {
    const premium = await import('./premium');
    // setActivePlan('free') also writes to storage AND fires subscribers;
    // since we just removed the storage key, the write reinstates 'free'
    // as the explicit value (cheap; harmless).
    await premium.setActivePlan('free');
  } catch { /* noop */ }

  // 7. Stored current_user_id — caller will overwrite with the new id, but
  //    on full logout we want this gone too.
  try { await AsyncStorage.removeItem(CURRENT_USER_ID_KEY); } catch { /* noop */ }
}

/**
 * Compares the incoming `newUserId` against the currently-cached user on
 * this device. If different (or first-ever sign-in), wipes all per-user
 * state, then records `newUserId` as the new current user.
 *
 * Returns `{ wasReset, isNewDevice }` so callers can react (e.g., show a
 * toast: "Welcome — your data is being loaded fresh.")
 *
 * Call BEFORE setUser/setToken so the new session paints from a clean slate.
 *
 * Behaviour matrix:
 *   Previous user-id  |  New user-id  |  Action
 *   ------------------+---------------+------------------
 *   null              |  X            |  RESET (first ever sign-in)
 *   X                 |  X            |  no-op (same user, fast path)
 *   X                 |  Y            |  RESET (user-switch)
 *
 * The "first-ever sign-in → RESET" branch guards against demo/dev/test
 * residual state baked into the AsyncStorage from a prior dev build.
 */
export async function ensureCleanSessionFor(
  newUserId: string
): Promise<{ wasReset: boolean; isNewDevice: boolean }> {
  if (!newUserId) return { wasReset: false, isNewDevice: false };

  let prev: string | null = null;
  try { prev = await AsyncStorage.getItem(CURRENT_USER_ID_KEY); } catch { /* noop */ }

  const isNewDevice = !prev;
  const isUserSwitch = !!prev && prev !== newUserId;
  const shouldReset = isNewDevice || isUserSwitch;

  if (shouldReset) {
    await resetSessionState();
  }

  // Always record the current user — even on the no-op path it's safe
  // (overwrites with the same value).
  try { await AsyncStorage.setItem(CURRENT_USER_ID_KEY, newUserId); } catch { /* noop */ }

  return { wasReset: shouldReset, isNewDevice };
}

/**
 * Returns the user-id last recorded as signed in on this device, or null.
 * Used by debugging tools and the test suite.
 */
export async function getCurrentDeviceUserId(): Promise<string | null> {
  try { return await AsyncStorage.getItem(CURRENT_USER_ID_KEY); }
  catch { return null; }
}
