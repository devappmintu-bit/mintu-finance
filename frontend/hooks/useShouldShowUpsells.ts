/**
 * useShouldShowUpsells — R100T trust gate.
 *
 * Returns FALSE while the user has produced no real activity, and TRUE
 * once they've crossed any one of three "earned-the-pitch" thresholds.
 * Use this to suppress monetization/referral surfaces (Refer & Earn,
 * Premium upsells, sharable cards) on cold-start so the app delivers
 * value before asking for anything.
 *
 *   ≥ 3 expense transactions logged   → activated user
 *   ≥ 1 budget configured             → committed user
 *   ≥ 1 split group created           → social user
 *
 * If any of the three is true we return true. The check is cheap
 * (reads from the already-hydrated FinContext store) and falls open
 * (returns true) on null/undefined data so we never permanently hide
 * monetization for users with stale or partial context.
 */
import { useFinContext } from '../store/financialContext';

export function useShouldShowUpsells(): boolean {
  const txnCount    = useFinContext((s: any) => s?.transactions?.count ?? 0);
  const budgetsActv = useFinContext((s: any) => s?.budgets?.active ?? 0);
  const splitGroups = useFinContext((s: any) => s?.split?.groupCount ?? 0);

  // If the store hasn't loaded yet (loaded === false) we defer hiding —
  // most users are activated, suppressing on every cold context tick
  // would cause flicker.
  const loaded = useFinContext((s: any) => s?.meta?.loaded);
  if (!loaded) return true;

  // R100V — Refer & Earn raised threshold per audit. Earned virality
  // means waiting until the user has felt real value (≥10 logged txns,
  // OR an active budget, OR an active split group). Premium upsell
  // stays at the same gate via the legacy 3-txn pathway.
  return Number(txnCount) >= 10 || Number(budgetsActv) >= 1 || Number(splitGroups) >= 1;
}

export default useShouldShowUpsells;
