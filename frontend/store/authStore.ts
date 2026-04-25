import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  name: string;
  phone: string;
  money_score: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  avatar: string;
  locked: boolean;          // app-level lock flag — true when the user has "logged out" into the PIN/biometric screen
  isLoading: boolean;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setAvatar: (avatar: string) => Promise<void>;
  /** Soft lock — preserves token + PIN, just flips `locked: true` so _layout redirects to /unlock.
   *  Matches "Logout" button behaviour per the design ask. */
  lock: () => Promise<void>;
  /** Called by /unlock after successful PIN / biometric verification. */
  unlock: () => Promise<void>;
  /** Full logout — clears token, PIN, avatar; routes back to OTP flow. */
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
  locked: false,
  isLoading: true,
  setUser: (user) => set({ user }),
  setToken: async (token) => {
    await AsyncStorage.setItem('token', token);
    set({ token });
  },
  setAvatar: async (avatar: string) => {
    set({ avatar });
    try {
      if (avatar) await AsyncStorage.setItem(AVATAR_KEY, avatar);
      else await AsyncStorage.removeItem(AVATAR_KEY);
    } catch { /* noop */ }
  },
  lock: async () => {
    await AsyncStorage.setItem(LOCKED_KEY, '1');
    // Round 36 — wipe SWR cache on soft-lock so if a different user unlocks
    // the same device (e.g. shared family phone with same PIN) they won't
    // briefly see the previous user's cached balances, transactions, etc.
    // On unlock we'll refetch cleanly.
    try { const { clearSwrCache } = await import('../utils/swrGet'); await clearSwrCache(); } catch {}
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
    await AsyncStorage.removeItem('token');
    // ── Comprehensive cleanup — wipes SWR cache, PIN, premium, avatar,
    // search history, push token, biometric prefs, and the current-user
    // marker. Single source of truth in utils/sessionReset.ts so this
    // can never drift from the auth.tsx ensureCleanSessionFor() path.
    try {
      const { resetSessionState } = await import('../utils/sessionReset');
      await resetSessionState();
    } catch { /* noop */ }
    set({ user: null, token: null, avatar: '', locked: false });
  },
  loadFromStorage: async () => {
    const [token, avatar, locked] = await Promise.all([
      AsyncStorage.getItem('token'),
      AsyncStorage.getItem(AVATAR_KEY),
      AsyncStorage.getItem(LOCKED_KEY),
    ]);
    set({ token, avatar: avatar || '', locked: locked === '1', isLoading: false });
  },
}));
