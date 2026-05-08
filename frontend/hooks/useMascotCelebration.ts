/**
 * useMascotCelebration — fires <MascotCelebration/> on real earned events.
 *
 * Watches FinContext for milestone signals and exposes:
 *   const { visible, title, subtitle, dismiss } = useMascotCelebration();
 *
 * Triggers (each fires AT MOST ONCE per session per signature):
 *   • Streak crossed a milestone day [3, 7, 14, 30, 50, 100]
 *   • Top goal just hit 100%
 *   • First-ever transaction logged (txnCount: 0 → 1 transition)
 *
 * Dedupe: keys events by signature (e.g. "streak-7") and stores in
 * AsyncStorage so a milestone doesn't re-fire across cold-starts.
 *
 * Honest-UX: the hook itself enforces "real earned events only" — it
 * never invents a celebration from cold data.
 */
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFinContext } from '../store/financialContext';

const MILESTONES = [3, 7, 14, 30, 50, 100];
const STORE_KEY = 'mascot.celebrations.v1';

type CelebrationState = {
  visible: boolean;
  title: string;
  subtitle?: string;
};

async function alreadyFired(sig: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.includes(sig);
  } catch {
    return false;
  }
}

async function markFired(sig: string) {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(sig)) arr.push(sig);
    // Cap at 50 entries so the list doesn't grow unbounded.
    const trimmed = arr.slice(-50);
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    /* best-effort */
  }
}

export function useMascotCelebration(): CelebrationState & { dismiss: () => void } {
  const streakDays = useFinContext((s) => s.streak?.days ?? 0);
  const topGoal = useFinContext((s) => s.goals?.topGoal);
  const txnCount = useFinContext((s) => s.transactions?.count ?? 0);
  const loaded = useFinContext((s) => s.meta?.loaded);

  const [state, setState] = useState<CelebrationState>({ visible: false, title: '' });
  const lastTxnCount = useRef<number | null>(null);

  useEffect(() => {
    if (!loaded) return;

    (async () => {
      // 1) Streak milestone
      if (MILESTONES.includes(streakDays)) {
        const sig = `streak-${streakDays}`;
        if (!(await alreadyFired(sig))) {
          await markFired(sig);
          setState({
            visible: true,
            title: `${streakDays}-day streak!`,
            subtitle:
              streakDays >= 30
                ? "You're built different. Most people quit by day 5."
                : 'Keep showing up. Small wins compound into big ones.',
          });
          return;
        }
      }

      // 2) Top goal hit
      if (topGoal && topGoal.target > 0 && topGoal.saved >= topGoal.target) {
        const sig = `goal-${topGoal.name}-${topGoal.target}`;
        if (!(await alreadyFired(sig))) {
          await markFired(sig);
          setState({
            visible: true,
            title: `"${topGoal.name}" — DONE!`,
            subtitle: 'Goal smashed. Quietly proud of you.',
          });
          return;
        }
      }

      // 3) First-ever transaction
      if (lastTxnCount.current === 0 && txnCount === 1) {
        const sig = 'first-txn';
        if (!(await alreadyFired(sig))) {
          await markFired(sig);
          setState({
            visible: true,
            title: 'First expense logged!',
            subtitle: 'Now I can start watching for your patterns.',
          });
        }
      }
      lastTxnCount.current = txnCount;
    })();
  }, [streakDays, topGoal?.name, topGoal?.saved, topGoal?.target, txnCount, loaded]);

  return {
    ...state,
    dismiss: () => setState({ visible: false, title: '' }),
  };
}

export default useMascotCelebration;
