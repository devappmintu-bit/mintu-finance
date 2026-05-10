/**
 * clearSessionState — single, atomic wipe of every per-user piece of
 * device state used by the MintU client.
 *
 * Why this file exists:
 *   Without this, switching users on the same device (or registering a
 *   fresh user after a previous session) leaks SWR API cache, PIN +
 *   biometric prefs, premium tier, avatar, search history, and push
 *   token from the prior user. Symptoms include:
 *     • New user briefly seeing old user's balance / transactions
 *     • Old user's PIN unlocking new user's account (security bug)
 *     • Old user's premium tier being granted to a fresh free user
 *     • New user seeing "Getting Started" already dismissed
 *
 *   `clearSessionState()` is idempotent and safe to call on every
 *   login / registration / logout — even when the same user is signing
 *   back in.
 *
 * Call sites:
 *   • app/auth.tsx                  — before setToken/setUser on login & register
 *   • store/authStore.removeAccount — on full account deletion
 *   • app/_layout.tsx               — cold-start safety net when no token
 *
 * Design notes:
 *   • All clear operations run in parallel via Promise.all.
 *   • Each individual failure is caught and logged in __DEV__; one
 *     missing key never blocks the rest.
 *   • The list of keys lives in /constants/storageKeys.ts so adding a
 *     new user-scoped storage entry is a single-file change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  PER_USER_ASYNC_KEYS,
  PER_USER_ASYNC_PREFIXES,
  PER_USER_SECURE_KEYS,
  ASYNC_CURRENT_USER_ID_KEY,
} from '../constants/storageKeys';

const secureStoreAvailable =
  Platform.OS !== 'web' && !!(SecureStore as any)?.deleteItemAsync;

/** Best-effort wrapper — never throws. Logs in __DEV__ on failure. */
async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (__DEV__) {
      console.warn(`[clearSessionState] ${label} failed:`, e);
    }
  }
}

/**
 * Wipes ALL per-user device state.
 *
 *   • SWR API cache (in-memory + AsyncStorage `swr::*`)
 *   • PIN, salt, biometric pref, app-lock pref (SecureStore)
 *   • Avatar, premium plan, premium activation, search history,
 *     push token, soft-lock flag (AsyncStorage)
 *   • Streak milestone + quest sweep keys (variable suffix)
 *   • In-memory premium plan cache + listeners
 *   • current-user-id marker
 *
 * Does NOT clear (intentionally — these are device-scoped, not user-scoped):
 *   • `onboarding_seen` — once a device has seen onboarding, every user on
 *     that device skips it. Reasonable UX trade-off.
 *   • `app_lang`, theme prefs — device preferences.
 *   • Auth `token` — caller (authStore) owns this; clearing here would
 *     race with authStore.setToken on the same tick.
 */
export async function clearSessionState(): Promise<void> {
  await Promise.all([
    // 1. SWR API cache (in-memory + AsyncStorage `swr::*`).
    safe('clearSwrCache', async () => {
      const { clearSwrCache } = await import('./swrGet');
      await clearSwrCache();
    }),

    // 2. PIN + salt — security-critical.
    safe('clearPin', async () => {
      const { clearPin } = await import('./lockManager');
      await clearPin();
    }),

    // 3. Bulk-remove fixed AsyncStorage keys.
    safe('multiRemove(perUserAsync)', async () => {
      await AsyncStorage.multiRemove([...PER_USER_ASYNC_KEYS]);
    }),

    // 4. Sweep variable-suffix AsyncStorage keys.
    safe('sweep(perUserAsyncPrefixes)', async () => {
      const all = await AsyncStorage.getAllKeys();
      const sweep = all.filter((k) =>
        PER_USER_ASYNC_PREFIXES.some((prefix) => k.startsWith(prefix))
      );
      if (sweep.length) await AsyncStorage.multiRemove(sweep);
    }),

    // 5. SecureStore keys (or AsyncStorage fallback on web).
    safe('clearSecureStoreKeys', async () => {
      if (secureStoreAvailable) {
        await Promise.all(
          PER_USER_SECURE_KEYS.map((k) =>
            SecureStore.deleteItemAsync(k).catch(() => {})
          )
        );
      } else {
        await AsyncStorage.multiRemove([...PER_USER_SECURE_KEYS]).catch(() => {});
      }
    }),

    // 6. Reset in-memory premium plan + notify subscribers.
    safe('resetPremiumPlanMemory', async () => {
      const premium = await import('./premium');
      // setActivePlan('free') resets _cachedPlan + writes 'free' to
      // storage + fires subscribers; harmless even though we just
      // wiped the storage key in step 3.
      await premium.setActivePlan('free');
    }),

    // 7. current-user-id marker — caller will overwrite with new id.
    safe('removeCurrentUserId', async () => {
      await AsyncStorage.removeItem(ASYNC_CURRENT_USER_ID_KEY);
    }),

    // 8. R114 — wipe in-memory navigation memory (scroll positions,
    //    filter snapshots, etc.) so the next signed-in user gets a
    //    clean slate and never sees the previous user's last scroll.
    safe('clearNavigationMemory', async () => {
      const nav = await import('../hooks/useNavigationMemory');
      nav.clearAllNavigationMemory();
    }),

    // 9. R115 Sprint-2 — wipe persisted last-visited breadcrumbs and
    //    nav-intel graph so we never carry one user's habit graph or
    //    last sub-tab into another user's first session.
    safe('clearLastVisited', async () => {
      const lv = await import('../hooks/useLastVisited');
      await lv.clearAllLastVisited();
    }),
    safe('resetNavIntel', async () => {
      const intel = await import('./navIntel');
      intel.navIntel.reset();
    }),

    // R116 — wipe the global financial-state tone so user-A's
    // "flourishing" mood doesn't carry into user-B's first session.
    safe('resetFinState', async () => {
      const fs = await import('../store/financialStateStore');
      fs.useFinStateStore.getState().reset();
    }),
  ]);
}

/**
 * Marks `userId` as the current signed-in user on this device.
 * Called AFTER clearSessionState() + setToken/setUser, so the device
 * has a record of who is currently logged in.
 */
export async function recordCurrentUser(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(ASYNC_CURRENT_USER_ID_KEY, userId);
  } catch (e) {
    if (__DEV__) console.warn('[clearSessionState] recordCurrentUser failed:', e);
  }
}

/**
 * Returns the user-id last recorded on this device, or null. Used by
 * debugging tools and end-to-end tests.
 */
export async function getCurrentDeviceUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ASYNC_CURRENT_USER_ID_KEY);
  } catch {
    return null;
  }
}
