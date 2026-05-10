/**
 * store/intelligenceRefreshStore.ts — R118 SLICE C bug fix
 *
 * Tiny Zustand store with a single monotonically-increasing tick that
 * signals all R118 intelligence hooks to refetch their data.
 *
 * Why this exists:
 *   The home dashboard widgets (MoodScore / MoneyStory / Behavior /
 *   CashFlow) hold their data in component-local useState. The
 *   /utils/api.ts `clearCache` helper only invalidates the SWR cache,
 *   which our intelligence hooks don't use. So calling clearCache from
 *   SmartEntryHost was effectively a no-op — the widgets stayed stale
 *   until the next mount.
 *
 * Now: SmartEntryHost calls `bumpIntelligence()` after every parse,
 * which increments `tick`. The intelligence hooks watch `tick` in a
 * useEffect and trigger their `refetch()` when it changes. Result:
 * the home repaints with fresh signal within ~1s of the parse —
 * delivering the "real-time intelligence" promise of the master prompt.
 */
import { create } from 'zustand';

interface IntelligenceRefreshState {
  tick: number;
  bump: () => void;
}

export const useIntelligenceRefresh = create<IntelligenceRefreshState>((set) => ({
  tick: 0,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
}));

/**
 * Convenience function for non-React-hook callers (like
 * SmartEntryHost's onCommit handler) that want to bump the tick
 * imperatively.
 */
export function bumpIntelligence(): void {
  useIntelligenceRefresh.getState().bump();
}
