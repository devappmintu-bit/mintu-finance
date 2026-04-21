/**
 * useThemePref — user's theme-mode preference (light / dark / system).
 *
 * The app is currently dark-by-default, but users can opt into light or let the
 * OS decide (system). This store ONLY governs preference; the components that
 * care about it (e.g. <Mascot />, some settings surfaces) read the resolved
 * theme via `useResolvedTheme()` which combines this preference with the
 * current system appearance.
 *
 * Persisted to AsyncStorage so the choice survives app restarts.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

type ThemeState = {
  mode: ThemeMode;
  ready: boolean;
  setMode: (m: ThemeMode) => Promise<void>;
  loadFromStorage: () => Promise<void>;
};

const STORAGE_KEY = '@mintu:theme_mode';

export const useThemePref = create<ThemeState>((set) => ({
  mode: 'system',
  ready: false,
  setMode: async (m) => {
    set({ mode: m });
    try { await AsyncStorage.setItem(STORAGE_KEY, m); } catch {}
  },
  loadFromStorage: async () => {
    try {
      const v = await AsyncStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dark' || v === 'system') {
        set({ mode: v, ready: true });
        return;
      }
    } catch {}
    set({ ready: true });
  },
}));

/**
 * Resolve the ACTIVE theme based on preference + OS appearance.
 * Returns 'light' | 'dark'.
 */
export function useResolvedTheme(): ResolvedTheme {
  const mode = useThemePref((s) => s.mode);
  if (mode === 'light' || mode === 'dark') return mode;
  // 'system' — follow OS
  const scheme = Appearance.getColorScheme();
  return scheme === 'light' ? 'light' : 'dark';
}
