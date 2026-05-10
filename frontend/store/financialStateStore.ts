/**
 * financialStateStore.ts — R116 Calm Mode global tone propagation.
 *
 * The useFinancialState() hook gives a component the user's current
 * emotional state, but components that *don't* render Home (toasts,
 * banners, AI nudges, notification panels, etc.) need the same signal
 * without re-running the snapshot fetch.
 *
 * This Zustand store solves that:
 *   • Home calls `setFinState(result)` on every render with the
 *     latest output of useFinancialState().
 *   • Anywhere else, `useFinState()` reads the state with zero extra
 *     network calls.
 *   • Reset on logout via clearSessionState (keeps user-A's tone
 *     out of user-B's first session).
 *
 * Use cases:
 *   1. Suppress monetization toasts in `flourishing` state.
 *   2. Soften alert-banner copy when state is `steady`.
 *   3. Let the mascot adopt the right pose globally.
 *   4. Let Pulse / Profile / etc. tint subtle accents based on state.
 */
import { create } from 'zustand';
import type { FinancialStateResult, FinancialState } from '../hooks/useFinancialState';

interface FinStateStore {
  /** Last computed result. `null` until Home has mounted at least once. */
  state: FinancialStateResult | null;
  setFinState: (result: FinancialStateResult | null) => void;
  reset: () => void;
}

export const useFinStateStore = create<FinStateStore>((set) => ({
  state: null,
  setFinState: (result) => {
    // Avoid spurious re-renders by only writing when something changed.
    set((prev) => {
      if (!prev.state && !result) return prev;
      if (prev.state && result &&
        prev.state.state === result.state &&
        prev.state.headline === result.headline &&
        prev.state.meta.score === result.meta.score) {
        return prev;
      }
      return { state: result };
    });
  },
  reset: () => set({ state: null }),
}));

/**
 * Convenience hook that returns just the state name (for code that
 * only needs to branch on flourishing/steady/attention/critical).
 */
export function useFinStateName(): FinancialState | 'unknown' {
  return useFinStateStore((s) => s.state?.state ?? 'unknown');
}

/** True when state is flourishing or steady. Cheap subscriber for surfaces
 *  that just want a "should-I-be-quiet" hint. */
export function useIsCalm(): boolean {
  return useFinStateStore((s) => {
    const n = s.state?.state;
    return n === 'flourishing' || n === 'steady';
  });
}

/** True when state is `flourishing` only. */
export function useIsFlourishing(): boolean {
  return useFinStateStore((s) => s.state?.state === 'flourishing');
}

export default useFinStateStore;
