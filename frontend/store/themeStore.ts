/**
 * useThemePref — Round 56 LIGHT-ONLY THEME.
 *
 * The app has fully committed to the Glassmorphic Light design system.
 * This store is retained as a THIN COMPATIBILITY SHIM so any legacy
 * import in the codebase (e.g. `useResolvedTheme()` in _layout.tsx,
 * `useThemePref` in ThemeTransitionOverlay) keeps compiling. All modes
 * resolve to `'light'` and mutators are no-ops.
 *
 * Do NOT add new consumers here — prefer `useAppColors()` / `GLASS` from
 * utils/theme.ts directly.
 */
import { create } from 'zustand';
import { applyTheme as applyEngineTheme, ThemeMode as EngineMode } from '../utils/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = EngineMode;   // narrowed to 'light' at runtime

type ThemeState = {
  mode: ThemeMode;
  amoled: boolean;
  ready: boolean;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => Promise<void>;
  setAmoled: (v: boolean) => Promise<void>;
  loadFromStorage: () => Promise<void>;
};

export const useThemePref = create<ThemeState>((set) => ({
  mode: 'light',
  amoled: false,
  ready: true,
  resolved: 'light',
  setMode: async () => {
    // No-op: light-only. Keep tokens synced just in case.
    applyEngineTheme('light');
  },
  setAmoled: async () => {
    // No-op: light-only.
  },
  loadFromStorage: async () => {
    // Guarantee the engine is pinned to light on boot.
    applyEngineTheme('light');
    set({ ready: true, mode: 'light', amoled: false, resolved: 'light' });
  },
}));

export function useResolvedTheme(): ResolvedTheme {
  return 'light';
}
