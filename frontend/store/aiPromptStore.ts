/**
 * aiPromptStore — v10 extended with MODE for context-aware routing.
 * All "Open AI" CTAs now carry a `mode` so the coach knows the user's
 * intent (score_boost / plan_build / expense_help / budget_optimize /
 * goal_strategy / split_advice / daily_brief / free).
 */
import { create } from 'zustand';
import type { Mode } from './financialContext';

export interface Pending {
  prompt: string;
  mode: Mode;
  source?: string;
  ts: number;
}

interface State {
  pending: Pending | null;
  set: (prompt: string, mode?: Mode, source?: string) => void;
  consume: () => Pending | null;
  clear: () => void;
}

export const useAIPrompt = create<State>((set, get) => ({
  pending: null,
  set: (prompt, mode = 'free', source) =>
    set({ pending: { prompt, mode, source, ts: Date.now() } }),
  consume: () => {
    const p = get().pending;
    set({ pending: null });
    return p;
  },
  clear: () => set({ pending: null }),
}));
