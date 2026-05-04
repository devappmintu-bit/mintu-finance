/**
 * hooks/useControlCenterData.ts — Round 74 (Phase 1).
 *
 * Aggregates "things you can act on right now" from existing
 * backend endpoints. Returns a unified ordered list that the
 * Home Control Center renders as one-tap rows.
 *
 * Why client-side aggregation?
 *   • Backend already exposes the 3 source endpoints (cached).
 *   • Skipping a new endpoint means zero backend regression risk.
 *   • Each source has its own SWR cache → instant on warm visits.
 *
 * Sources merged:
 *   • /api/split-insights      → "You owe Rahul ₹450" etc.
 *   • /api/ai/proactive-nudges → spending anomalies + smart-save
 *   • /api/streak/check-in     → daily streak nudge (today's tap)
 */
import { useMemo, useEffect } from 'react';
import { router } from 'expo-router';
import useSwr from './useSwr';
import { useFinContext } from '../store/financialContext';

export type ActionKind =
  | 'split_settle'    // user owes someone
  | 'split_collect'   // someone owes user
  | 'overspend'       // category trending over budget
  | 'smart_save'      // suggested save / sweep amount
  | 'anomaly'         // unusual transaction
  | 'streak'          // daily streak check-in
  | 'budget_alert';   // budget % crossed

export interface ControlCenterAction {
  id: string;
  kind: ActionKind;
  icon: string;            // Ionicons name
  tone: 'urgent' | 'warning' | 'success' | 'info';
  title: string;
  body: string;
  amount?: number | null;
  cta_label: string;
  on_press: () => void;
  priority: number;        // higher = more urgent
}

const TONE_FOR_KIND: Record<ActionKind, ControlCenterAction['tone']> = {
  split_settle:  'urgent',
  split_collect: 'warning',
  overspend:     'urgent',
  smart_save:    'success',
  anomaly:       'warning',
  streak:        'info',
  budget_alert:  'urgent',
};

const ICON_FOR_KIND: Record<ActionKind, string> = {
  split_settle:  'arrow-up-circle',
  split_collect: 'arrow-down-circle',
  overspend:     'trending-up',
  smart_save:    'wallet',
  anomaly:       'alert-circle',
  streak:        'flame',
  budget_alert:  'shield-half',
};

interface SplitInsightsShape {
  outstanding?: { you_owe?: number; you_get?: number };
  top_creditor?: { name?: string; amount?: number } | null;
  top_debtor?: { name?: string; amount?: number } | null;
}

interface NudgeItem {
  id?: string; type?: string; title?: string;
  body?: string; message?: string;        // alt name for body in some payloads
  amount?: number; route?: string;
  data?: { amount?: number; group_id?: string; payee_id?: string };
  emoji?: string;
}
interface NudgesShape { nudges?: NudgeItem[]; count?: number }

export default function useControlCenterData(opts: { paused?: boolean } = {}) {
  const gate = { paused: opts.paused ?? false };
  const { data: split, isLoading: l1 } = useSwr<SplitInsightsShape>('/split-insights', { ttlMs: 60_000, ...gate });
  const { data: nudges, isLoading: l2 } = useSwr<NudgesShape>('/ai/proactive-nudges', { ttlMs: 60_000, ...gate });
  // Round 83 — Money Command Center unification. Pull smart alerts
  // (budget warnings, overspend) directly into the ControlCenter so
  // the Home tab has a SINGLE "do-now" hub instead of 3 separate
  // alert surfaces competing for attention.
  const { data: alerts } = useSwr<{ alerts?: any[] }>('/alerts/smart', { ttlMs: 60_000, ...gate });

  // Round 82 — SSoT hydration. Push split + nudges payload into
  // useFinContext whenever either refreshes, so downstream AI Coach
  // consumers always see fresh `splits` + `insights.recommendations`.
  useEffect(() => {
    if (!split && !nudges) return;
    try { useFinContext.getState().hydrateFromControlCenter({ split, nudges }); } catch { /* noop */ }
  }, [split, nudges]);

  const actions = useMemo<ControlCenterAction[]>(() => {
    const out: ControlCenterAction[] = [];

    // ── 0. Smart Alerts (budget warnings / overspend / streak save)
    // Round 83 — unified into Command Center. These previously
    // rendered as a separate "Smart Alerts" section on Home; now
    // they live in the single do-now hub.
    const alertList = Array.isArray(alerts?.alerts) ? alerts!.alerts : [];
    alertList.slice(0, 3).forEach((a: any, i: number) => {
      const sev = (a.severity || '').toLowerCase();
      const kind: ActionKind =
        sev === 'warning' || sev === 'danger' ? 'overspend'
        : sev === 'info' ? 'smart_save'
        : 'budget_alert';
      out.push({
        id: a.id || `alert-${i}`,
        kind,
        icon: a.emoji ? (ICON_FOR_KIND[kind]) : ICON_FOR_KIND[kind],
        tone: sev === 'warning' || sev === 'danger' ? 'urgent'
            : sev === 'success' ? 'success'
            : TONE_FOR_KIND[kind],
        title: a.title || 'Heads up',
        body: a.message || a.body || '',
        amount: typeof a.amount === 'number' ? a.amount : null,
        cta_label: a.actions?.[0]?.label || 'Review',
        on_press: () => {
          const route = a.actions?.[0]?.route || '/(tabs)/budget';
          try { router.push(route as any); } catch { /* noop */ }
        },
        priority: sev === 'danger' ? 100 : sev === 'warning' ? 92 : 65,
      });
    });

    // ── 1. Split — you owe someone ──────────────────────────────
    if (split?.top_creditor?.amount && split.top_creditor.amount > 0) {
      out.push({
        id: 'split-settle',
        kind: 'split_settle',
        icon: ICON_FOR_KIND.split_settle,
        tone: TONE_FOR_KIND.split_settle,
        title: `You owe ${split.top_creditor.name || 'a friend'}`,
        body: 'Tap to settle now',
        amount: split.top_creditor.amount,
        cta_label: 'Settle',
        on_press: () => router.push('/(tabs)/split' as any),
        priority: 90,
      });
    }
    // ── 2. Split — someone owes you ─────────────────────────────
    if (split?.top_debtor?.amount && split.top_debtor.amount > 0) {
      out.push({
        id: 'split-collect',
        kind: 'split_collect',
        icon: ICON_FOR_KIND.split_collect,
        tone: TONE_FOR_KIND.split_collect,
        title: `${split.top_debtor.name || 'A friend'} owes you`,
        body: 'Send a gentle reminder',
        amount: split.top_debtor.amount,
        cta_label: 'Remind',
        on_press: () => router.push('/(tabs)/split' as any),
        priority: 75,
      });
    }
    // ── 3. Proactive nudges (split reminders, anomalies, save tips) ──
    const list = nudges?.nudges || [];
    list.slice(0, 6).forEach((n, i) => {
      const ntype = (n.type || '').toLowerCase();
      // Map nudge.type → ActionKind. Order matters — split_reminder
      // is the most common payload from the Indian split_manager
      // agent so we check it first.
      let kind: ActionKind = 'anomaly';
      let cta = 'View';
      if (ntype.includes('split')) {
        kind = 'split_settle';
        cta = 'Settle';
      } else if (ntype.includes('save')) {
        kind = 'smart_save';
        cta = 'Save';
      } else if (ntype.includes('overspend')) {
        kind = 'overspend';
        cta = 'Review';
      } else if (ntype.includes('budget')) {
        kind = 'budget_alert';
        cta = 'Review';
      }

      // Body: prefer `message` field (agent payload) over `body`.
      const body = n.body || n.message || '';
      // Amount: top-level OR nested data.amount (split_reminder shape).
      const amount = typeof n.amount === 'number' ? n.amount
        : typeof n.data?.amount === 'number' ? n.data.amount
        : null;
      // Route: split → /split, anomaly/overspend → transactions
      const route = n.route
        || (kind === 'split_settle' ? '/(tabs)/split'
        :  kind === 'smart_save'    ? '/(tabs)/budget'
        :                              '/(tabs)/transactions');

      out.push({
        id: n.id || `nudge-${i}`,
        kind,
        icon: ICON_FOR_KIND[kind],
        tone: TONE_FOR_KIND[kind],
        title: n.title || 'Action available',
        body,
        amount,
        cta_label: cta,
        on_press: () => router.push(route as any),
        // split_settle outranks save/anomaly so the user sees "owe"
        // rows first (highest perceived urgency).
        priority: kind === 'split_settle' ? 95
                : kind === 'budget_alert' ? 88
                : kind === 'overspend' ? 82
                : kind === 'smart_save' ? 60
                : 70,
      });
    });

    // Sort high-priority first; cap at 5 rows so the card stays glanceable.
    return out.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }, [split, nudges, alerts]);

  return {
    actions,
    isLoading: !split && !nudges && (l1 || l2),
  };
}
