/**
 * store/neoTheme.ts — Round 100Z.
 *
 * Zustand store + hook for the new Neo-Brutalism theme system.
 * Reflects system color-scheme by default; can be overridden by user.
 *
 *   const palette = useNeoPalette();   // re-renders on theme flip
 *   const isDark  = useIsDark();
 *   const set     = useNeoTheme.getState().setMode;  // 'light' | 'dark' | 'system'
 *
 * Persists user choice in AsyncStorage (key: 'neo.theme.v1').
 */
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { NB_LIGHT, NB_DARK, NeoPalette } from '../utils/neoBrutalism';

type Mode = 'light' | 'dark' | 'system';

type Store = {
  mode: Mode;
  setMode: (m: Mode) => void;
  hydrate: () => Promise<void>;
};

const KEY = 'neo.theme.v1';

export const useNeoTheme = create<Store>((set) => ({
  mode: 'system',
  setMode: (m) => {
    set({ mode: m });
    AsyncStorage.setItem(KEY, m).catch(() => {});
  },
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        set({ mode: raw });
      }
    } catch { /* best-effort */ }
  },
}));

/** Returns the active palette (NB_LIGHT or NB_DARK) reactively. */
export function useNeoPalette(): NeoPalette {
  const mode = useNeoTheme((s) => s.mode);
  const sys = useColorScheme();
  // System default for now is LIGHT — the Neo-Memphis identity is
  // brighter and more on-brand for first-impressions. Users can opt
  // into dark via the theme toggle in settings.
  const effective: 'light' | 'dark' = mode === 'system' ? (sys === 'dark' ? 'dark' : 'light') : mode;
  return effective === 'dark' ? NB_DARK : NB_LIGHT;
}

export function useIsDark(): boolean {
  const mode = useNeoTheme((s) => s.mode);
  const sys = useColorScheme();
  return (mode === 'system' ? sys === 'dark' : mode === 'dark');
}

/** Hydrate on mount — call once from root layout. */
export function useHydrateNeoTheme() {
  const hydrate = useNeoTheme((s) => s.hydrate);
  const [done, setDone] = useState(false);
  useEffect(() => {
    hydrate().finally(() => setDone(true));
  }, [hydrate]);
  return done;
}
