/**
 * Global BrutalToast store + host (R103D).
 *
 * One-liner celebrations from anywhere in the app:
 *
 *   import { showBrutalToast } from '@/store/brutalToastStore';
 *   showBrutalToast('🎯 Cap set — baseline started', 'accent');
 *
 * The host (`<BrutalToastHost />`) lives in the root `_layout.tsx`
 * so ANY screen can fire a celebration without prop-drilling. Stack
 * is FIFO (1 toast at a time); subsequent calls REPLACE the active
 * toast so the last action always wins.
 */
import { create } from 'zustand';
import type { BrutalTone } from '../theme/brutal';

type ToastState = {
  message: string | null;
  tone: BrutalTone;
  hold: number;
  show: (message: string, tone?: BrutalTone, hold?: number) => void;
  hide: () => void;
};

export const useBrutalToastStore = create<ToastState>((set) => ({
  message: null,
  tone: 'accent',
  hold: 2200,
  show: (message, tone = 'accent', hold = 2200) =>
    set({ message, tone, hold }),
  hide: () => set({ message: null }),
}));

/**
 * Imperative helper for non-React contexts (api error handlers,
 * settle confirmations, etc.).
 */
export const showBrutalToast = (
  message: string,
  tone: BrutalTone = 'accent',
  hold = 2200
) => useBrutalToastStore.getState().show(message, tone, hold);
