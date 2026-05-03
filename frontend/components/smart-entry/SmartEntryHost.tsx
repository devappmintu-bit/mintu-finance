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
              await addTransaction({
                amount: payload.amount,
                category: payload.category,
                description: payload.description,
                type: payload.type,
              });
              Toast.show({ type: 'success', text1: 'Transaction saved' });
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
