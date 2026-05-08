import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASYNC_TOKEN_KEY } from '../constants/storageKeys';
import type { User as ServiceUser } from '../services/types';

// Local store uses a less-permissive shape for the authenticated user.
// All known fields from the backend are required by the time we land
// in setUser(). `money_score` extends ServiceUser since it's set by
// /auth/verify-otp on register and updated by /money-score endpoints.
interface User extends ServiceUser {
  id: string;
  name: string;
  phone: string;
  money_score: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  avatar: string;
  /** True when the most recent /auth/verify-otp response indicated a brand-new
   *  account creation. Consumed by the home screen to render the welcome /
   *  onboarding empty state instead of skeleton-then-data. Auto-clears
   *  on the first home interaction (caller calls `clearNewUserFlag()`). */
  isNewUser: boolean;
  locked: boolean;          // app-level lock flag — true when the user has "logged out" into the PIN/biometric screen
  isLoading: boolean;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setAvatar: (avatar: string) => Promise<void>;
  /** Marks the most recent successful auth as a brand-new registration. */
  setIsNewUserFlag: (v: boolean) => void;
  /** One-shot clear, called by home screen after rendering welcome state. */
  clearNewUserFlag: () => void;
  /** Soft lock — preserves token + PIN, just flips `locked: true` so _layout redirects to /unlock.
   *  Matches "Logout" button behaviour per the design ask. */
  lock: () => Promise<void>;
  /** Called by /unlock after successful PIN / biometric verification. */
  unlock: () => Promise<void>;
  /** Full logout — clears token + ALL per-user device state via clearSessionState().
   *  After this the app routes back to the OTP flow. */
  removeAccount: () => Promise<void>;
  /** Alias kept for backwards compat — now delegates to lock() by default. */
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

const AVATAR_KEY = 'user_avatar';
const LOCKED_KEY = 'mintu_app_locked_v1';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  avatar: '',
  isNewUser: false,
  locked: false,
  isLoading: true,
  setUser: (user) => set({ user }),
  setToken: async (token) => {
    await AsyncStorage.setItem(ASYNC_TOKEN_KEY, token);
    set({ token });
    // R100Q-perf — warm critical caches the moment auth lands so the
    // first navigation after login renders from memory, not network.
    // Fire-and-forget; failures are silently swallowed inside the
    // helper. Parallel /missions/current + /split/groups + /budgets/current.
    try {
      const { warmCriticalCaches } = await import('../utils/api');
      warmCriticalCaches();
    } catch { /* noop */ }
  },
  setAvatar: async (avatar: string) => {
    set({ avatar });
    try {
      if (avatar) await AsyncStorage.setItem(AVATAR_KEY, avatar);
      else await AsyncStorage.removeItem(AVATAR_KEY);
    } catch { /* noop */ }
  },
  setIsNewUserFlag: (v) => set({ isNewUser: v }),
  clearNewUserFlag: () => set({ isNewUser: false }),
  lock: async () => {
    await AsyncStorage.setItem(LOCKED_KEY, '1');
    // Round 36 — wipe SWR cache on soft-lock so if a different user unlocks
    // the same device (e.g. shared family phone with same PIN) they won't
    // briefly see the previous user's cached balances, transactions, etc.
    // On unlock we'll refetch cleanly.
    try { const { clearSwrCache } = await import('../utils/swrGet'); await clearSwrCache(); } catch { /* noop */ }
    set({ locked: true });
  },
  unlock: async () => {
    await AsyncStorage.removeItem(LOCKED_KEY);
    set({ locked: false });
  },
  // Backwards-compat alias: the Profile "Logout" action now soft-locks the app
  // instead of nuking the user — matches the "relogin via biometric/PIN" flow.
  logout: async () => { await (get().lock()); },
  removeAccount: async () => {
    // Round 88 — fire /auth/logout server-side first so the session is
    // revoked in the DB. Best-effort: even if the network is down, we
    // still clear local state below so the user is logged out locally.
    try {
      const { getRefreshToken } = await import('../utils/tokenStore');
      const refresh = await getRefreshToken();
      if (refresh) {
        const { logoutSession } = await import('../services/user');
        await logoutSession(refresh).catch(() => {});
      }
    } catch { /* noop */ }
    // Wipe BOTH access (AsyncStorage) and refresh (SecureStore) tokens.
    try {
      const { clearTokens } = await import('../utils/tokenStore');
      await clearTokens();
    } catch {
      // Belt-and-braces fallback if tokenStore import failed.
      await AsyncStorage.removeItem(ASYNC_TOKEN_KEY);
    }
    // Comprehensive cleanup — wipes SWR cache, PIN, premium plan, avatar,
    // search history, push token, biometric prefs, current-user marker.
    // Single source of truth in utils/clearSessionState.ts so this can
    // never drift from the auth.tsx clearSessionState() call site.
    try {
      const { clearSessionState } = await import('../utils/clearSessionState');
      await clearSessionState();
    } catch { /* noop */ }
    set({ user: null, token: null, avatar: '', locked: false, isNewUser: false });
  },
  loadFromStorage: async () => {
    const [token, avatar, locked] = await Promise.all([
      AsyncStorage.getItem(ASYNC_TOKEN_KEY),
      AsyncStorage.getItem(AVATAR_KEY),
      AsyncStorage.getItem(LOCKED_KEY),
    ]);
    set({ token, avatar: avatar || '', locked: locked === '1', isLoading: false });
  },
}));
