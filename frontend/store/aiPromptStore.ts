/**
 * aiPromptStore — v11 extended with PULSE-CONTEXT for the Pulse → Coach
 * bridge (R100E). Every "Open AI" CTA carries a `mode` so the coach
 * knows the user's intent (score_boost / plan_build / expense_help /
 * budget_optimize / goal_strategy / split_advice / daily_brief / free).
 *
 * R100E adds a discriminated `context` blob that survives one consume
 * cycle. Today the only context kind is `pulse` (Money Signal Layer
 * handoff) but the shape is open so other surfaces (e.g. an "Ask MintU
 * about this transaction" tap) can join later without churn.
 */
import { create } from 'zustand';
import type { Mode } from './financialContext';

// Discriminated context — keep the shapes shallow so they survive
// React-Native's structured-clone quirks (no class instances, no fns).
export type PulseContext = {
  kind: 'pulse';
  headline: string;
  summary: string;
  category: string;          // e.g. "RBI · INTEREST"
  source: string;            // e.g. "Reserve Bank of India"
  impacts: { kind: string; icon: string; text: string }[];
};
export type AIContext = PulseContext;  // Union expands in future.

export interface Pending {
  prompt: string;
  mode: Mode;
  source?: string;           // free-form origin tag ("pulse", "push", "home", …)
  context?: AIContext | null;
  ts: number;
}

interface State {
  pending: Pending | null;
  /** Last-consumed context — kept around so the chat can render the
   *  "📌 From Pulse" pill AFTER the auto-fire has consumed `pending`.
   *  Cleared when the user navigates away or starts a fresh thread. */
  activeContext: AIContext | null;
  set: (
    prompt: string,
    mode?: Mode,
    source?: string,
    context?: AIContext | null
  ) => void;
  consume: () => Pending | null;
  setActiveContext: (ctx: AIContext | null) => void;
  clear: () => void;
}

export const useAIPrompt = create<State>((set, get) => ({
  pending: null,
  activeContext: null,
  set: (prompt, mode = 'free', source, context = null) =>
    set({
      pending: { prompt, mode, source, context, ts: Date.now() },
      // Park the context so the chat can render the pill even after
      // consume() empties `pending`.
      activeContext: context ?? get().activeContext,
    }),
  consume: () => {
    const p = get().pending;
    set({ pending: null });
    return p;
  },
  setActiveContext: (ctx) => set({ activeContext: ctx }),
  clear: () => set({ pending: null, activeContext: null }),
}));
