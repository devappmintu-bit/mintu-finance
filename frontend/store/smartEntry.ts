/**
 * smartEntry.ts — v10 Unified Entry store (Phase 2A).
 *
 * Single source of truth for "the user wants to add/edit something".
 * Any screen (or the AI Brain) can call:
 *
 *    useSmartEntry.getState().open('expense');
 *    useSmartEntry.getState().open('budget',  { category: 'Food' });
 *    useSmartEntry.getState().open('goal',    { name: 'Goa trip' });
 *
 * The SmartEntryHost (mounted once in the root layout) reads this
 * store and pops the right sheet — no more per-screen boilerplate.
 *
 * When a save succeeds, the host invalidates the right caches via the
 * existing cache-graph + broadcasts a `financialContext.refresh(true)`
 * so the AI Brain Dashboard re-computes instantly.
 */
import { create } from 'zustand';

export type SmartEntryKind = 'expense' | 'budget' | 'goal';

export interface SmartEntryInitial {
  amount?: number;
  category?: string;
  description?: string;
  type?: 'debit' | 'credit';
  name?: string;
  target_amount?: number;
  saved_amount?: number;
  emoji?: string;
  color?: string;
  period?: string;
  limit?: number;
}

interface SmartEntryState {
  kind: SmartEntryKind | null;
  initial: SmartEntryInitial;
  source: string; // 'fab' | 'brain' | 'empty' | 'mascot' | etc.
  open: (kind: SmartEntryKind, initial?: SmartEntryInitial, source?: string) => void;
  close: () => void;
}

// R114 B5 — Reservation lock. A second `open()` fired in the same
// 400ms window (e.g. user double-taps the FAB or a hand-off from
// Brain races the user) is silently coalesced so we don't end up
// with two sheets fighting for the same surface.
let lastOpenAt = 0;
let lastOpenKind: SmartEntryKind | null = null;
const OPEN_DEDUPE_MS = 400;

export const useSmartEntry = create<SmartEntryState>((set, get) => ({
  kind: null,
  initial: {},
  source: 'unknown',
  open: (kind, initial = {}, source = 'unknown') => {
    const now = Date.now();
    const current = get().kind;
    // Reject a duplicate within dedupe window OR while another sheet is mounted.
    if (current && current !== kind) {
      if (__DEV__) console.warn(`[SmartEntry] suppressed ${kind} — ${current} sheet still mounted`);
      return;
    }
    if (now - lastOpenAt < OPEN_DEDUPE_MS && lastOpenKind === kind) {
      if (__DEV__) console.warn(`[SmartEntry] suppressed duplicate ${kind} within ${OPEN_DEDUPE_MS}ms`);
      return;
    }
    lastOpenAt = now;
    lastOpenKind = kind;
    set({ kind, initial, source });
  },
  close: () => {
    lastOpenKind = null;
    set({ kind: null, initial: {}, source: 'unknown' });
  },
}));

// Convenience for non-React callers / tests.
export const SmartEntry = {
  open: (kind: SmartEntryKind, initial?: SmartEntryInitial, source?: string) =>
    useSmartEntry.getState().open(kind, initial, source),
  close: () => useSmartEntry.getState().close(),
};
