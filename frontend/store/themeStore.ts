/**
 * useThemePref — user's theme-mode preference with AMOLED escalation.
 *
 * Modes:
 *   • `light`  — white fintech palette
 *   • `dark`   — obsidian + neon orange (default)
 *   • `system` — follows OS appearance
 *
 * AMOLED is NOT a separate mode — instead, we expose an `amoled: boolean`
 * preference. When `amoled=true` AND the resolved theme is `dark`, the engine
 * uses the true-black AMOLED palette instead of the regular obsidian.
 * This avoids cluttering the main toggle with 4 pills.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { applyTheme as applyEngineTheme, ThemeMode as EngineMode } from '../utils/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = EngineMode;   // 'light' | 'dark' | 'amoled'

type ThemeState = {
  mode: ThemeMode;
  amoled: boolean;
  ready: boolean;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => Promise<void>;
  setAmoled: (v: boolean) => Promise<void>;
  loadFromStorage: () => Promise<void>;
};

const KEY_MODE   = '@mintu:theme_mode';
const KEY_AMOLED = '@mintu:theme_amoled';

const resolveTheme = (pref: ThemeMode, amoled: boolean): ResolvedTheme => {
  let base: 'light' | 'dark';
  if (pref === 'light') base = 'light';
  else if (pref === 'dark') base = 'dark';
  else base = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
  if (base === 'dark' && amoled) return 'amoled';
  return base;
};

export const useThemePref = create<ThemeState>((set, get) => ({
  mode: 'system',
  amoled: false,
  ready: false,
  resolved: 'dark',
  setMode: async (m) => {
    const { amoled } = get();
    const resolved = resolveTheme(m, amoled);
    set({ mode: m, resolved });
    applyEngineTheme(resolved);
    try { await AsyncStorage.setItem(KEY_MODE, m); } catch {}
  },
  setAmoled: async (v) => {
    const { mode } = get();
    const resolved = resolveTheme(mode, v);
    set({ amoled: v, resolved });
    applyEngineTheme(resolved);
    try { await AsyncStorage.setItem(KEY_AMOLED, v ? '1' : '0'); } catch {}
  },
  loadFromStorage: async () => {
    let stored: ThemeMode = 'system';
    let amoledStored = false;
    try {
      const v = await AsyncStorage.getItem(KEY_MODE);
      if (v === 'light' || v === 'dark' || v === 'system') stored = v;
      const a = await AsyncStorage.getItem(KEY_AMOLED);
      amoledStored = a === '1';
    } catch {}
    const resolved = resolveTheme(stored, amoledStored);
    set({ mode: stored, amoled: amoledStored, resolved, ready: true });
    applyEngineTheme(resolved);
  },
}));

// React to OS-level appearance changes (when user has 'system' set).
Appearance.addChangeListener(({ colorScheme }) => {
  const state = useThemePref.getState();
  if (state.mode !== 'system') return;
  const resolved = resolveTheme('system', state.amoled);
  useThemePref.setState({ resolved });
  applyEngineTheme(resolved);
});

export function useResolvedTheme(): ResolvedTheme {
  return useThemePref((s) => s.resolved);
}
