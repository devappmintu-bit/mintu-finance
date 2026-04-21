/**
 * useThemePref — user's theme-mode preference (light / dark / system).
 *
 * Persisted to AsyncStorage so the choice survives app restarts. On every
 * change (including the initial load), this store calls `applyTheme()` from
 * `utils/theme.ts` which mutates the shared `COLORS` proxy in-place so every
 * StyleSheet.create in the app reads the new tokens on next remount.
 *
 * Combined with the root-level `key={resolvedMode}` remount trigger in
 * `_layout.tsx`, this gives a full light↔dark switch across all 60+ screens
 * with zero per-screen code changes.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { applyTheme as applyEngineTheme, ThemeMode as EngineMode } from '../utils/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = EngineMode;

type ThemeState = {
  mode: ThemeMode;
  ready: boolean;
  /** Returns the resolved (non-'system') theme that the engine is currently rendering. */
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => Promise<void>;
  loadFromStorage: () => Promise<void>;
};

const STORAGE_KEY = '@mintu:theme_mode';

const resolveMode = (pref: ThemeMode): ResolvedTheme => {
  if (pref === 'light' || pref === 'dark') return pref;
  const scheme = Appearance.getColorScheme();
  return scheme === 'light' ? 'light' : 'dark';
};

export const useThemePref = create<ThemeState>((set, get) => ({
  mode: 'system',
  ready: false,
  resolved: 'dark',
  setMode: async (m) => {
    const resolved = resolveMode(m);
    set({ mode: m, resolved });
    applyEngineTheme(resolved);
    try { await AsyncStorage.setItem(STORAGE_KEY, m); } catch {}
  },
  loadFromStorage: async () => {
    let stored: ThemeMode = 'system';
    try {
      const v = await AsyncStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dark' || v === 'system') stored = v;
    } catch {}
    const resolved = resolveMode(stored);
    set({ mode: stored, resolved, ready: true });
    applyEngineTheme(resolved);
  },
}));

// React to OS-level appearance changes (when user has 'system' set).
Appearance.addChangeListener(({ colorScheme }) => {
  const state = useThemePref.getState();
  if (state.mode !== 'system') return;
  const resolved: ResolvedTheme = colorScheme === 'light' ? 'light' : 'dark';
  useThemePref.setState({ resolved });
  applyEngineTheme(resolved);
});

/**
 * Convenience hook: returns the CURRENTLY-RESOLVED theme ('light' | 'dark'),
 * regardless of whether the user's pref was 'light' / 'dark' / 'system'.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useThemePref((s) => s.resolved);
}
