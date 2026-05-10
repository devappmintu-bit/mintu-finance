/**
 * SmartEntryHost — v10 Unified Entry (Phase 2A) host component.
 *
 * Mounted ONCE in `_layout.tsx`. Reads `useSmartEntry` store and
 * renders the correct sheet based on `kind`. Centralises:
 *
 *   • API writes (addTransaction / createBudget / createGoal)
 *   • Toast success/failure
 *   • financialContext.refresh(true) on save → Brain re-renders instantly
 *
 * Callers just do:  `useSmartEntry.getState().open('expense')`.
 *
 * IMPL NOTE: We React.lazy() the sheet components so the web SSR/static
 * build doesn't have to resolve their transitive `moti/framer-motion`
 * graph at render time. This keeps the root layout SSR-safe.
 */
import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

import { useSmartEntry } from '../../store/smartEntry';
import { useFinContext } from '../../store/financialContext';
import GlassSheet, { GlassSheetHandle } from '../ui/GlassSheet';
import { addTransaction } from '../../services/transactions';
import { createGoal } from '../../services/goals';
import { createBudget } from '../../services/budgets';

const TransactionSheet   = lazy(() => import('../transactions/TransactionSheet'));
const GoalSheet          = lazy(() => import('../goals/GoalSheet'));
const BudgetSmartSheet   = lazy(() => import('../budget/BudgetSmartSheet'));

export default function SmartEntryHost() {
  const { kind, initial, close } = useSmartEntry();
  const [submitting, setSubmitting] = useState(false);
  const budgetSheetRef = useRef<GlassSheetHandle | null>(null);

  // Auto-present the GlassSheet when kind flips to 'budget'.
  useEffect(() => {
    if (kind === 'budget') {
      const t = setTimeout(() => budgetSheetRef.current?.present?.(), 0);
      return () => clearTimeout(t);
    }
  }, [kind]);

  const bumpBrain = useCallback(async () => {
    // Force-refresh the global financialContext store so AIBrainDashboard
    // and any mascot microcopy re-derive against the new data instantly.
    try { await useFinContext.getState().refresh(true); } catch {}
  }, []);

  // ───── EXPENSE / TRANSACTION ─────
  if (kind === 'expense') {
    return (
      <Suspense fallback={null}>
        <TransactionSheet
          visible
          initialType={initial.type || 'debit'}
          submitting={submitting}
          isOnline
          onClose={close}
          onSubmit={async (payload) => {
            setSubmitting(true);
            try {
              // R100W — Capture pre-add count so we can detect the
              // "first ever expense" milestone and celebrate it.
              const ctxBefore = useFinContext.getState();
              const wasFirst = (Number(ctxBefore?.transactions?.count ?? 0) === 0) && payload.type !== 'credit';

              await addTransaction({
                amount: payload.amount,
                category: payload.category,
                description: payload.description,
                type: payload.type,
              });

              // R118 SLICE C — SMS Theater Upgrade.
              // Fire a celebratory pulse + signal all R118 hooks to
              // refetch by bumping the intelligence-refresh tick. The
              // hooks watch this tick and re-pull from the API. We
              // deliberately DO NOT call /utils/api.ts `clearCache`
              // here because the intelligence hooks don't use the SWR
              // cache — they hold data in component state, so the only
              // way to invalidate is via the tick store.
              try {
                const { showBrutalToast } = require('../../store/brutalToastStore');
                const sign = payload.type === 'credit' ? '+' : '-';
                const cat = payload.category || 'Other';
                showBrutalToast(
                  `✨ Parsed · ${sign}₹${Math.round(Number(payload.amount) || 0).toLocaleString('en-IN')} · ${cat}`,
                  payload.type === 'credit' ? 'positive' : 'accent',
                );
              } catch { /* noop */ }
              try {
                const { bumpIntelligence } = require('../../store/intelligenceRefreshStore');
                // Wait a short beat so the backend cache (240-300s TTL)
                // has been bypassed by the tick — actually we just
                // bump immediately; backend cache is per-user-key and
                // the new transaction has already been committed
                // synchronously above, so the next call will compute
                // against a graph that includes it. Backend cache TTL
                // is short enough that staleness is minimal.
                bumpIntelligence();
              } catch { /* noop */ }

              if (wasFirst) {
                // First-expense payoff moment. Brutalist toast + heavier
                // haptic for the celebration. Sets up the pattern the
                // AI Coach promised: log → reward → progress.
                if (Platform.OS !== 'web') {
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                }
                Toast.show({
                  type: 'success',
                  text1: '🎯 FIRST ENTRY LOGGED',
                  text2: '2 more and your AI Coach unlocks real patterns.',
                  visibilityTime: 4500,
                });
              } else {
                if (Platform.OS !== 'web') {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                }
                Toast.show({ type: 'success', text1: 'Transaction saved' });
              }
              await bumpBrain();
              close();
            } catch (e: any) {
              Toast.show({ type: 'error', text1: 'Could not save', text2: e?.message || '' });
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </Suspense>
    );
  }

  // ───── BUDGET ─────
  if (kind === 'budget') {
    return (
      <GlassSheet
        ref={budgetSheetRef}
        snapPoints={['92%']}
        onDismiss={close}
      >
        <Suspense fallback={null}>
          <BudgetSmartSheet
            submitting={submitting}
            onClose={() => { budgetSheetRef.current?.dismiss?.(); close(); }}
            onSubmit={async (payload) => {
              setSubmitting(true);
              try {
                await createBudget({
                  category: payload.category,
                  amount: Number(payload.amount),
                  period: payload.period || 'monthly',
                } as any);
                Toast.show({ type: 'success', text1: 'Budget saved' });
                // R103E — Brutal celebration banner. Audit ask: "setting a
                // cap should never feel empty". Mascot orange tone keeps
                // the moment on-brand.
                try {
                  const { showBrutalToast } = require('../../store/brutalToastStore');
                  showBrutalToast(`🎯 ${payload.category} cap set — Mintu's watching`, 'accent');
                } catch { /* non-fatal */ }
                await bumpBrain();
                budgetSheetRef.current?.dismiss?.();
                close();
              } catch (e: any) {
                Toast.show({ type: 'error', text1: 'Could not save budget', text2: e?.message || '' });
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </Suspense>
      </GlassSheet>
    );
  }

  // ───── GOAL ─────
  if (kind === 'goal') {
    return (
      <Suspense fallback={null}>
        <GoalSheet
          visible
          submitting={submitting}
          isOnline
          onClose={close}
          onSubmit={async (payload) => {
            setSubmitting(true);
            try {
              await createGoal({
                name: payload.name,
                target_amount: payload.target_amount,
                saved_amount: payload.saved_amount,
                emoji: payload.emoji,
                color: payload.color,
              });
              Toast.show({ type: 'success', text1: 'Goal created' });
              // R103E — Brutal celebration. Premium-purple tone for goals
              // because they're aspirational / future-self moments.
              try {
                const { showBrutalToast } = require('../../store/brutalToastStore');
                showBrutalToast(`🏆 ${payload.name} — let's make it happen`, 'premium');
              } catch { /* non-fatal */ }
              await bumpBrain();
              close();
            } catch (e: any) {
              Toast.show({ type: 'error', text1: 'Could not save goal', text2: e?.message || '' });
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </Suspense>
    );
  }

  return null;
}
