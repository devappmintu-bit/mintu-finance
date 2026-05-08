/**
 * aiMaturity — the AI Maturity Model.
 *
 * Source-of-truth gate for every AI surface in MintU. Prevents the
 * "performative AI" failure mode where the app fakes confident
 * scores/suggestions for users who haven't given the system enough
 * data to mean anything.
 *
 * STAGES (based on transactions logged):
 *   • Stage 0 — Cold        (0–4 txns)    no AI, no score, learn-mode
 *   • Stage 1 — Building    (5–24 txns)   no score, soft suggestions only
 *   • Stage 2 — Activated   (25–99 txns)  score + suggestions unlocked
 *   • Stage 3 — Power       (100+ txns)   full predictive layer
 *
 * Helper booleans below let UI surfaces gate their behavior with a
 * single hook call instead of duplicating threshold logic everywhere.
 */
import { useFinContext } from '../store/financialContext';

export type AIStage = 0 | 1 | 2 | 3;

export interface MaturitySnapshot {
  stage: AIStage;
  txnCount: number;
  /** Number of txns until the user crosses to the NEXT stage. 0 if at top. */
  txnsToNext: number;
  /** Total target threshold for the next stage, e.g. 5, 25, 100. */
  nextThreshold: number;
  /** True when the app should show the Money Score numerically. */
  canShowScore: boolean;
  /** True when the app may render AI "suggestion"/"coach me" CTAs. */
  canShowSuggestions: boolean;
  /** True when monetization/referral surfaces are appropriate. */
  canShowUpsells: boolean;
  /** Human-readable label for badges/pills. */
  label: 'COLD START' | 'BUILDING' | 'ACTIVATED' | 'POWER';
}

export function stageFromTxnCount(n: number): AIStage {
  if (n >= 100) return 3;
  if (n >= 25)  return 2;
  if (n >= 5)   return 1;
  return 0;
}

function snapshotFromCount(n: number): MaturitySnapshot {
  const stage = stageFromTxnCount(n);
  const thresholds = [5, 25, 100, 100];
  const nextThreshold = thresholds[stage];
  const txnsToNext = stage >= 3 ? 0 : Math.max(0, nextThreshold - n);
  return {
    stage,
    txnCount: n,
    txnsToNext,
    nextThreshold,
    canShowScore:        stage >= 2,
    canShowSuggestions:  stage >= 1,
    canShowUpsells:      stage >= 1,
    label: stage === 0 ? 'COLD START'
         : stage === 1 ? 'BUILDING'
         : stage === 2 ? 'ACTIVATED'
         :               'POWER',
  };
}

/** Hook form — reads txn count from FinContext. */
export function useAIMaturity(): MaturitySnapshot {
  const txnCount = useFinContext((s: any) => Number(s?.transactions?.count ?? 0));
  return snapshotFromCount(txnCount);
}

/** Pure form — pass any txn count. Useful in non-React contexts. */
export function maturityFor(n: number): MaturitySnapshot {
  return snapshotFromCount(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
}

export default useAIMaturity;
