/**
 * AICoachStateView — Round 84/85 end-to-end AI Coach rebuild.
 *
 * ZERO duplication. Single surface. State-driven. Flow is strictly:
 *
 *   DATA (SSoT) → INSIGHT (computed) → ACTION → UPDATE → CHAT
 *
 * Round 85 — aligned with the Profile-tab brutalist grammar:
 *   • All tokens (color/typo/border/stamp) sourced from utils/brutalist.
 *   • Mono numerals on amounts/percentages.
 *   • Ink/paper palette only — no #FFFFFF / #000000 ad-hoc values.
 *   • Hard offset stamp on the hero (BR_STAMP.md) — same Swiss-brutal
 *     "flat 2-D drop" used by BrutalistProfileView.
 *   • Up to 3 smart chips (was 2) per the new spec.
 *   • Tapping the action CTA invokes refresh() so the screen
 *     re-derives within seconds — closing the DATA→...→UPDATE loop.
 *
 * Three states — exactly one screen per state:
 *
 *   • NO DATA    (0 txns)  → ONE bold BrutalCard: "Add First Expense".
 *                             No insights. No prompts. No fake data.
 *   • LOW DATA   (1–10)    → ONE StructureCard with the strongest
 *                             derivable insight + one action CTA.
 *                             AskBar with up to 3 state-aware chips.
 *   • ACTIVE     (11+)     → ONE BrutalCard insight (category
 *                             dominance / MoM trend / budget deviation)
 *                             + computed action CTA. AskBar with
 *                             up to 3 state-aware chips.
 *
 * Every insight ends with a *computable* action. No generic copy,
 * no "Your money is behaving — keep the rhythm going." fallbacks.
 *
 * Insight priority (first computable wins):
 *   1. Any budget overspend     → "Create a budget reallocation"
 *   2. MoM spike ≥ 15 %         → "Set a monthly cap"
 *   3. Category dominance ≥ 35% → "Track / trim that category"
 *   4. Healthy (active only)    → "Bank your surplus into a goal"
 *
 * Emits exactly one `onAsk(prefill)` whenever the user taps a chip.
 * Parent (ai-coach.tsx) opens the chat modal on that callback.
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFinContext } from '../../store/financialContext';
import MintuMascot from '../MintuMascot';
import { ROUTES } from '../../constants/routes';
import { deriveInsightFromCtx as _sharedDerive } from '../../hooks/usePriorityInsight';
import {
  BR_COLORS,
  BR_TYPE,
  BR_FONT,
  BR_SPACE,
  BR_BORDER,
  BR_STAMP,
} from '../../utils/brutalist';

export type CoachDataState = 'no_data' | 'low_data' | 'active';

function fmtINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

interface ComputedInsight {
  /** Tag pill text (CATEGORY / BUDGET / TREND / HEALTHY). */
  tag: string;
  /** Punchy headline with a live number woven in. */
  headline: string;
  /** One supporting sentence backing the headline with data. */
  body: string;
  /** Action button label — always a verb. */
  actionLabel: string;
  /** Pressing the action calls this. */
  onAction: () => void;
  /** Chat prefills — max 2 — shown above the AskBar. */
  chips: { label: string; prompt: string }[];
  /** Tone used to tint the card border/pill. */
  tone: 'danger' | 'warning' | 'info' | 'success';
}

/** Derive the single strongest insight from SSoT. Pure function. */
function deriveInsight(ctx: any): ComputedInsight | null {
  const txnCount = Number(ctx?.transactions?.count ?? 0);
  const categories: Record<string, number> = ctx?.transactions?.categories || {};
  const monthlySpend = Number(ctx?.transactions?.monthlySpend ?? 0);
  const overspend: string[] = Array.isArray(ctx?.insights?.overspending) ? ctx.insights.overspending : [];
  const mom = ctx?.insights?.mom || {};

  // 1. Budget overspend — highest priority, always actionable.
  if (overspend.length > 0) {
    const first = overspend[0] || '';
    const m = /^([A-Za-z][\w\s]+?)\s+over\s+budget\s+by\s+₹(\d+)/.exec(first);
    const cat = (m && m[1]) ? m[1].trim() : 'a category';
    const amt = (m && m[2]) ? `₹${m[2]}` : 'a lot';
    return {
      tag: 'BUDGET HEAT',
      tone: 'danger',
      headline: `${cat} is ${amt} over budget`,
      body: overspend.length > 1
        ? `${overspend.length} categories are running hot. Re-balancing now saves your month.`
        : `You've blown past your ${cat} limit. A quick reallocation fixes the month without giving up spending.`,
      actionLabel: 'Rebalance budgets',
      onAction: () => { try { router.push(ROUTES.BUDGET); } catch { /* noop */ } },
      chips: [
        { label: `WHY OVER ON ${cat.toUpperCase()}?`, prompt: `Why am I over on ${cat}? Give me a reallocation plan.` },
        { label: 'FIX THIS MONTH',                   prompt: 'Help me finish the month under budget with a concrete plan.' },
        { label: 'CUT 20% NEXT MONTH',               prompt: `Build a plan to cut ${cat} by 20% next month with 3 concrete swaps.` },
      ],
    };
  }

  // 2. MoM spike ≥ 15 % — trend alarm.
  const deltaPct = Number(mom?.delta_pct ?? 0);
  if (monthlySpend > 0 && Math.abs(deltaPct) >= 15) {
    const up = deltaPct > 0;
    return {
      tag: 'MONTHLY TREND',
      tone: up ? 'warning' : 'success',
      headline: up
        ? `Spending up ${Math.round(deltaPct)}% vs last month`
        : `Spending down ${Math.abs(Math.round(deltaPct))}% vs last month`,
      body: up
        ? `Prev: ${fmtINR(mom?.previous_spend)}   ·   Now: ${fmtINR(mom?.current_spend)}. A soft cap stops the drift.`
        : `Prev: ${fmtINR(mom?.previous_spend)}   ·   Now: ${fmtINR(mom?.current_spend)}. Lock in the win by redirecting the delta to a goal.`,
      actionLabel: up ? 'Set a monthly cap' : 'Send surplus to goal',
      onAction: () => {
        try { router.push(up ? ROUTES.BUDGET : ROUTES.GOALS); } catch { /* noop */ }
      },
      chips: up
        ? [
            { label: 'WHAT CAUSED THE SPIKE?', prompt: 'What categories caused my month-over-month spike? Show me the top 3.' },
            { label: 'BUILD A CAP PLAN',       prompt: 'Build a monthly spending cap plan that matches my actual categories.' },
            { label: 'WEEKLY BUDGET SPLIT',    prompt: 'Split my monthly cap into weekly budgets. Account for fixed bills.' },
          ]
        : [
            { label: 'LOCK IN MY WIN',     prompt: 'How do I lock in my savings win this month? Help me route it to a goal.' },
            { label: 'REPEAT NEXT MONTH',  prompt: 'What should I repeat next month to keep the savings streak going?' },
            { label: 'INVEST THE SURPLUS', prompt: 'Where should I invest the surplus from this month? SIP vs lumpsum.' },
          ],
    };
  }

  // 3. Category dominance ≥ 35 %.
  if (monthlySpend > 0 && Object.keys(categories).length > 0) {
    let topCat = ''; let topAmt = 0;
    for (const [k, v] of Object.entries(categories)) {
      const n = Number(v);
      if (n > topAmt) { topAmt = n; topCat = k; }
    }
    const share = (topAmt / monthlySpend) * 100;
    if (share >= 35 && topCat) {
      return {
        tag: 'CATEGORY DOMINANCE',
        tone: 'info',
        headline: `${topCat} = ${Math.round(share)}% of your spend`,
        body: `${fmtINR(topAmt)} out of ${fmtINR(monthlySpend)} this month. If ${topCat} shifts 10%, the whole month shifts.`,
        actionLabel: `Track ${topCat}`,
        onAction: () => { try { router.push(ROUTES.BUDGET); } catch { /* noop */ } },
        chips: [
          { label: `WHY SO MUCH ${topCat.toUpperCase()}?`, prompt: `Why is ${topCat} so high this month? Break down the transactions.` },
          { label: 'REDUCE THIS CATEGORY',                 prompt: `Give me 3 concrete ways to cut ${topCat} by 20% next month.` },
          { label: 'COMPARE TO PEERS',                     prompt: `How does my ${topCat} spending compare to peers in my income range?` },
        ],
      };
    }
  }

  // 4. Active user but nothing urgent — healthy.
  if (txnCount >= 11) {
    return {
      tag: 'HEALTHY',
      tone: 'success',
      headline: 'Your money is on rails this month',
      body: `${txnCount} transactions logged. No overspend, no spikes — this is the moment to bank the surplus.`,
      actionLabel: 'Create a savings goal',
      onAction: () => { try { router.push(ROUTES.GOALS); } catch { /* noop */ } },
      chips: [
        { label: 'WHERE SHOULD I INVEST?',  prompt: 'Where should I invest the surplus I\'m building this month?' },
        { label: 'BUILD AN EMERGENCY FUND', prompt: 'Help me plan a realistic emergency fund based on my current spending.' },
        { label: 'TAX-OPTIMISE MY SAVINGS', prompt: 'How do I tax-optimise the savings I\'m building? Best 80C vs NPS plays.' },
      ],
    };
  }

  return null;
}

interface Props {
  onAsk: (prefill: string) => void;
  /** Height of the sticky AskBar + safe area, so the scroll content
   * doesn't sit under it. */
  bottomInset?: number;
}

export default function AICoachStateView({ onAsk, bottomInset = 160 }: Props) {
  const ctx = useFinContext();
  const refresh = useFinContext((s: any) => s.refresh);
  const txnCount = Number(ctx?.transactions?.count ?? 0);

  const state: CoachDataState = txnCount === 0 ? 'no_data' : txnCount <= 10 ? 'low_data' : 'active';

  // Round 89 Strike 2 — ONE BRAIN. Use the shared priority engine at
  // hooks/usePriorityInsight.ts so Home (HeroDecision + TodayAction)
  // and AI Coach never drift. The shared engine returns a superset
  // (risk, coachPrompt, secondary) which this view simply ignores.
  const insight = useMemo(() => _sharedDerive(ctx), [
    ctx?.transactions?.count,
    ctx?.transactions?.monthlySpend,
    ctx?.transactions?.categories,
    ctx?.insights?.overspending,
    ctx?.insights?.mom?.delta_pct,
    ctx?.insights?.mom?.current_spend,
    ctx?.insights?.mom?.previous_spend,
  ]);

  // Round 85 — UPDATE step of the DATA→INSIGHT→ACTION→UPDATE loop.
  // Wraps the insight's onAction so that after the user navigates
  // (e.g., to /budget to set a new cap), the SSoT is force-refreshed
  // ~700 ms later. By the time the user pops back to the AI Coach
  // tab, the insight has *already* re-derived against the new data
  // — no stale "fix this" copy lingering after the user fixed it.
  const wrapAction = useCallback((onAction: () => void) => {
    return () => {
      try { onAction(); } catch { /* noop */ }
      try { setTimeout(() => { try { refresh && refresh(true); } catch { /* noop */ } }, 700); } catch { /* noop */ }
    };
  }, [refresh]);

  const goAdd = wrapAction(() => { try { router.push(ROUTES.TRANSACTIONS); } catch { /* noop */ } });

  // ─────────────────────────────────────────────────────────────────
  // STATE 1 — ZERO DATA. One primary CTA. Nothing else.
  // ─────────────────────────────────────────────────────────────────
  if (state === 'no_data') {
    return (
      <View style={[styles.wrap, { paddingBottom: bottomInset }]}>
        <View style={[styles.heroCard, BR_STAMP.md]}>
          <View style={styles.zeroMascotWrap}>
            <MintuMascot size={72} state="idle" />
          </View>
          <Text style={[BR_TYPE.h2, styles.zeroTitle]}>YOUR MONEY STORY STARTS HERE</Text>
          <Text style={[BR_TYPE.body, styles.zeroBody]}>
            Log your first expense and I'll turn it into a real insight. No fake
            averages, no generic tips — just your patterns.
          </Text>
          <TouchableOpacity
            onPress={goAdd}
            activeOpacity={0.85}
            style={styles.primaryCta}
            accessibilityRole="button"
            accessibilityLabel="Add your first expense"
            testID="aicoach-add-first"
          >
            <Ionicons name="add" size={18} color={BR_COLORS.accentInk} />
            <Text style={styles.primaryCtaText}>ADD FIRST EXPENSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // STATE 2 — LOW DATA (1-10 txns). Honest insight + 1 action +
  // up-to-3 chips. No fake intelligence.
  // ─────────────────────────────────────────────────────────────────
  if (state === 'low_data') {
    const real = insight;
    return (
      <View style={[styles.wrap, { paddingBottom: bottomInset }]}>
        <View style={[styles.heroCardLight]}>
          <View style={styles.tagRow}>
            <View style={[styles.tagPill, TAG_TONE[real?.tone || 'info']]}>
              <Text style={styles.tagPillText}>{real?.tag || 'FIRST PATTERNS'}</Text>
            </View>
            <Text style={styles.metaTxt}>
              <Text style={styles.metaNum}>{txnCount}</Text>/<Text style={styles.metaNum}>10</Text> TXNS
            </Text>
          </View>
          <Text style={[BR_TYPE.h2, styles.headline]}>
            {real?.headline || `Keep going — ${10 - txnCount} more for real signals`}
          </Text>
          <Text style={[BR_TYPE.body, styles.body]}>
            {real?.body
              || `I need roughly 10 transactions to spot trends and dominance. You're ${txnCount} in — add a few more and I'll stop guessing and start knowing.`}
          </Text>
          <TouchableOpacity
            onPress={wrapAction(real?.onAction || (() => router.push(ROUTES.TRANSACTIONS)))}
            activeOpacity={0.85}
            style={styles.primaryCta}
            accessibilityRole="button"
            testID="aicoach-primary-action"
          >
            <Text style={styles.primaryCtaText}>
              {(real?.actionLabel || 'LOG ANOTHER EXPENSE').toUpperCase()}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={BR_COLORS.accentInk} />
          </TouchableOpacity>
        </View>

        {/* Up to 3 chat chips — constrained to prevent prompt overload */}
        <View style={styles.chipRow}>
          {(real?.chips || [
            { label: 'HOW DOES THIS WORK?',       prompt: 'How does Mintu analyze my spending? What data do you need?' },
            { label: 'WHAT SHOULD I CATEGORIZE?', prompt: 'What categories should I use for best insights? Give me the top 5.' },
            { label: 'IMPORT BANK SMS',           prompt: 'Help me set up SMS auto-import so my expenses are logged automatically.' },
          ]).slice(0, 3).map((chip, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => onAsk(chip.prompt)}
              style={styles.chip}
              activeOpacity={0.75}
              testID={`aicoach-chip-${i}`}
            >
              <Text style={styles.chipText}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // STATE 3 — ACTIVE (11+ txns). One hero insight + action + chips.
  // ─────────────────────────────────────────────────────────────────
  const real = insight!; // guaranteed by deriveInsight for active users
  return (
    <View style={[styles.wrap, { paddingBottom: bottomInset }]}>
      <View style={[styles.heroCard, BR_STAMP.md]}>
        <View style={styles.tagRow}>
          <View style={[styles.tagPill, TAG_TONE[real.tone]]}>
            <Text style={styles.tagPillText}>{real.tag}</Text>
          </View>
          <Text style={styles.metaTxt}>
            <Text style={styles.metaNum}>{txnCount}</Text> TXNS · LIVE
          </Text>
        </View>
        <Text style={[BR_TYPE.h2, styles.headline]}>{real.headline}</Text>
        <Text style={[BR_TYPE.body, styles.body]}>{real.body}</Text>
        <TouchableOpacity
          onPress={wrapAction(real.onAction)}
          activeOpacity={0.85}
          style={styles.primaryCta}
          accessibilityRole="button"
          accessibilityLabel={real.actionLabel}
          testID="aicoach-primary-action"
        >
          <Text style={styles.primaryCtaText}>{real.actionLabel.toUpperCase()}</Text>
          <Ionicons name="arrow-forward" size={16} color={BR_COLORS.accentInk} />
        </TouchableOpacity>
      </View>

      {/* Up to 3 state-aware chat chips. */}
      <View style={styles.chipRow}>
        {real.chips.slice(0, 3).map((chip, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => onAsk(chip.prompt)}
            style={styles.chip}
            activeOpacity={0.75}
            testID={`aicoach-chip-${i}`}
          >
            <Text style={styles.chipText}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Round 85 — Passive transparency footer. Hairline ink rule
          + meta line. Same Swiss editorial device used in Profile. */}
      <View style={styles.transparencyRow}>
        <View style={styles.hairline} />
        <Text style={styles.transparencyTxt}>
          SURFACED FROM <Text style={styles.metaNum}>{txnCount}</Text> TXNS · REFRESHES ON EACH NEW EXPENSE
        </Text>
        <View style={styles.hairline} />
      </View>
    </View>
  );
}

// Tone palette — single source for danger/warning/info/success.
const TAG_TONE = {
  danger:  { backgroundColor: BR_COLORS.negative, borderColor: BR_COLORS.ink },
  warning: { backgroundColor: BR_COLORS.warning,  borderColor: BR_COLORS.ink },
  info:    { backgroundColor: BR_COLORS.accent,   borderColor: BR_COLORS.ink },
  success: { backgroundColor: BR_COLORS.positive, borderColor: BR_COLORS.ink },
} as const;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.sm,
    gap: BR_SPACE.md,
  },

  // Brutalist hero card — paper bg, 2px ink border, hard offset stamp.
  heroCard: {
    backgroundColor: BR_COLORS.paper,
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    paddingVertical: BR_SPACE.xl,
    paddingHorizontal: BR_SPACE.lg,
    gap: BR_SPACE.md,
  },
  // Lighter variant for low_data state — hairline border, no stamp.
  heroCardLight: {
    backgroundColor: BR_COLORS.paper,
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.hair,
    paddingVertical: BR_SPACE.lg,
    paddingHorizontal: BR_SPACE.lg,
    gap: BR_SPACE.md,
  },
  zeroMascotWrap: {
    alignItems: 'center',
    marginBottom: BR_SPACE.xs,
  },
  zeroTitle: {
    color: BR_COLORS.ink,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  zeroBody: {
    color: BR_COLORS.muted,
    textAlign: 'center',
  },

  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: BR_SPACE.sm,
  },
  tagPill: {
    paddingHorizontal: BR_SPACE.sm,
    paddingVertical: 4,
    borderWidth: BR_BORDER.bold,
    alignSelf: 'flex-start',
  },
  tagPillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: BR_COLORS.accentInk,
    textTransform: 'uppercase',
  },
  metaTxt: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: BR_COLORS.muted,
  },
  metaNum: {
    fontFamily: BR_FONT.mono,
    color: BR_COLORS.ink,
  },
  headline: {
    color: BR_COLORS.ink,
  },
  body: {
    color: BR_COLORS.muted,
  },

  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BR_SPACE.sm,
    backgroundColor: BR_COLORS.ink,
    paddingVertical: 14,
    paddingHorizontal: BR_SPACE.lg,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    marginTop: BR_SPACE.xs,
  },
  primaryCtaText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: BR_COLORS.accentInk,
    textTransform: 'uppercase',
  },

  // Chips — hairline ink border, paper bg.
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BR_SPACE.sm,
  },
  chip: {
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: 10,
    backgroundColor: BR_COLORS.paper,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: BR_COLORS.ink,
    textTransform: 'uppercase',
  },

  // Transparency footer — Swiss editorial rule + meta.
  transparencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    paddingVertical: BR_SPACE.sm,
  },
  hairline: {
    flex: 1,
    height: BR_BORDER.hair,
    backgroundColor: BR_COLORS.line,
  },
  transparencyTxt: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: BR_COLORS.muted,
  },
});

