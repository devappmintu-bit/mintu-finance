/**
 * AIBrainDashboard — v10 "AI → drives product" core surface.
 *
 * Mounts at the top of the AI Coach insights tab. Reads from the global
 * `useFinContext` store and renders 4 stacked blocks (no chat):
 *
 *   1. DYNAMIC CONTEXT STRIP   live numbers — spent · txns · goals · budgets · streak
 *   2. PRIMARY INSIGHT         auto-generated from data state (never generic)
 *   3. ACTION STACK            direct-action buttons (open sheet / route), not chat
 *   4. DEEP ANALYSIS BLOCKS    conditional on data availability
 *
 * Every element is DATA-DRIVEN. No hardcoded strings. If no data, surface
 * an onboarding action stack instead of "I can't help right now".
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useFinContext } from '../../store/financialContext';
import { useAIPrompt } from '../../store/aiPromptStore';
import { useSmartEntry } from '../../store/smartEntry';
import { useMascotState } from '../../hooks/useMascotState';
import { useBrainInsight } from '../../hooks/useBrainInsight';
import MintuMascot from '../MintuMascot';

// v10 Brain perspectives — tapping a chip swaps the LIVE LLM-powered
// view without leaving the screen. Each maps to a server mode.
const PERSPECTIVES: { key: string; label: string; icon: string }[] = [
  { key: 'home_pulse',      label: 'PULSE',    icon: 'pulse-outline' },
  { key: 'waste_detector',  label: 'WASTE',    icon: 'trash-bin-outline' },
  { key: 'what_if',         label: 'WHAT-IF',  icon: 'infinite-outline' },
  { key: 'peer_compare',    label: 'PEERS',    icon: 'people-outline' },
  { key: 'mom_compare',     label: 'VS LAST',  icon: 'calendar-outline' },
  { key: 'budget_optimize', label: 'BUDGET',   icon: 'pie-chart-outline' },
  { key: 'goal_strategy',   label: 'GOALS',    icon: 'flag-outline' },
];

const INK = '#0A0A0A';
const ACCENT = '#E84A0C';
const PAPER = '#F5F1EA';
const LINE = '#E4E2DB';
const MUTED = '#6B6B6B';

export default function AIBrainDashboard() {
  const ctx = useFinContext();
  const mascot = useMascotState();

  useEffect(() => {
    ctx.refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topCat = Object.entries(ctx.transactions.categories)
    .sort((a, b) => b[1] - a[1])[0];

  // v10 — server-driven perspective. Default to home_pulse (snappy +
  // cheap) and let the user swap via the chip rail. Falls back to
  // client-side buildBrain if the server insight is still hydrating.
  const [perspective, setPerspective] = useState<string>('home_pulse');
  const server = useBrainInsight(perspective, { enabled: true });
  const local   = buildBrain(ctx, topCat);
  const insight      = server.insight || local.insight;
  const priority     = (server.insight ? server.priority : local.priority) as 'low'|'med'|'high';
  const deepAnalysis = server.insight && server.deepAnalysis.length ? server.deepAnalysis : local.deepAnalysis;
  // Server actions have only {label, cta}; map to the rich
  // client-side Action shape so existing UI / runAction work unchanged.
  const actions: Action[] = server.insight && server.actions.length
    ? server.actions.map((a) => ctaToAction(a.label, a.cta))
    : local.actions;

  const askChat = (prompt: string, mode: any = 'free') => {
    useAIPrompt.getState().set(prompt, mode, 'brain_dashboard');
    // Trigger chat open via prompt — existing ai-coach useEffect handles the rest.
  };

  return (
    <View style={styles.wrap}>
      {/* 0. MASCOT MOODLINE — v10 Phase 2C. Context-aware MintU reacts
          to financialContext in real time: thinking (empty) → error
          (overspend) → success (score ≥ 75 / goal ≥ 80 %). */}
      <View style={[
        styles.mood,
        mascot.tone === 'warn' ? styles.moodWarn : mascot.tone === 'ok' ? styles.moodOk : styles.moodInfo,
      ]}>
        <MintuMascot size={52} state={mascot.state} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.moodTag}>
            {mascot.state === 'error' ? 'HEADS UP' : mascot.state === 'success' ? 'NICE WORK' : mascot.state === 'thinking' ? 'START HERE' : 'MONEY PULSE'}
          </Text>
          <Text style={styles.moodLine}>{mascot.moodline}</Text>
        </View>
      </View>

      {/* 1. CONTEXT STRIP */}
      <View style={styles.strip}>
        <Pill icon="wallet-outline" value={`₹${fmtCompact(ctx.transactions.monthlySpend)}`} label="SPENT" />
        <Pill icon="list-outline"   value={String(ctx.transactions.count)} label="TXNS" />
        <Pill icon="flag-outline"   value={String(ctx.goals.count)} label="GOALS" />
        <Pill icon="pie-chart-outline" value={String(Object.keys(ctx.budgets.categories).length)} label="BUDGETS" />
        <Pill icon="flame-outline"  value={`${ctx.streak.days}D`} label="STREAK" last />
      </View>

      {/* 1b. PERSPECTIVE CHIP RAIL — v10. Tap to swap the live LLM-powered
          brain view (pulse → waste → what-if → budget → goals). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.perspRail}>
        {PERSPECTIVES.map((p) => {
          const active = perspective === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPerspective(p.key)}
              style={[styles.perspChip, active && styles.perspChipActive]}
              testID={`persp-${p.key}`}
            >
              <Ionicons name={p.icon as any} size={12} color={active ? '#fff' : INK} />
              <Text style={[styles.perspText, active && { color: '#fff' }]}>{p.label}</Text>
              {active && server.loading ? (
                <View style={styles.perspDot} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 2. PRIMARY INSIGHT */}
      <View style={[styles.insight, priority === 'high' ? styles.insightHigh : null]}>
        <View style={styles.insightTagRow}>
          <View style={styles.insightRule} />
          <Text style={styles.insightTag}>
            {priority === 'high' ? 'ACT TODAY' : 'AI INSIGHT'}
          </Text>
        </View>
        <Text style={styles.insightText}>{insight}</Text>
      </View>

      {/* 3. ACTION STACK */}
      <Text style={styles.stackHeader}>RECOMMENDED ACTIONS</Text>
      <View style={styles.stack}>
        {actions.map((a, i) => (
          <Pressable
            key={i}
            testID={`brain-action-${i}`}
            onPress={() => runAction(a, askChat)}
            style={({ pressed }) => [
              styles.actionRow,
              i === 0 && styles.actionPrimary,
              pressed && { opacity: 0.92 },
            ]}
          >
            <View style={[styles.actionIcon, i === 0 && styles.actionIconPrimary]}>
              <Ionicons name={a.icon as any} size={16} color={i === 0 ? '#fff' : INK} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, i === 0 && { color: '#fff' }]}>{a.label}</Text>
              {a.sub ? (
                <Text style={[styles.actionSub, i === 0 && { color: 'rgba(255,255,255,0.8)' }]}>
                  {a.sub}
                </Text>
              ) : null}
            </View>
            <Ionicons name="arrow-forward" size={14} color={i === 0 ? '#fff' : INK} />
          </Pressable>
        ))}
      </View>

      {/* 4. DEEP ANALYSIS */}
      {deepAnalysis.length > 0 ? (
        <>
          <Text style={styles.stackHeader}>DEEP ANALYSIS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 12 }}
          >
            {deepAnalysis.map((d, i) => (
              <Pressable
                key={i}
                onPress={() => askChat(d.prompt, d.mode)}
                style={({ pressed }) => [styles.deepCard, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.deepTag}>{d.tag}</Text>
                <Text style={styles.deepText}>{d.text}</Text>
                <Text style={styles.deepCta}>ASK AI →</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

// ─── Pill ────────────────────────────────────────────────────────────
function Pill({ icon, value, label, last }: any) {
  return (
    <View style={[pill.cell, !last && pill.divider]}>
      <Ionicons name={icon} size={12} color={MUTED} />
      <Text style={pill.value} numberOfLines={1}>{value}</Text>
      <Text style={pill.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  divider: { borderRightWidth: 1, borderColor: LINE },
  value: { fontFamily: 'Menlo', fontSize: 14, fontWeight: '900', color: INK, marginTop: 2, letterSpacing: -0.5 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, color: MUTED, marginTop: 2 },
});

// ─── Action dispatch ─────────────────────────────────────────────────
type Action = {
  label: string;
  sub?: string;
  icon: string;
  kind: 'route' | 'chat' | 'sheet';
  target?: string;
  sheet?: 'expense' | 'budget' | 'goal';
  prompt?: string;
  mode?: string;
};

// Map server cta strings → client Action shape so server-authored actions
// can ride the same runAction() dispatcher as locally-built ones.
function ctaToAction(label: string, cta: string | undefined): Action {
  switch (cta) {
    case 'open_expense': return { label, icon: 'add-circle-outline', kind: 'sheet', sheet: 'expense' };
    case 'open_budget':  return { label, icon: 'pie-chart-outline',   kind: 'sheet', sheet: 'budget' };
    case 'open_goal':    return { label, icon: 'flag-outline',         kind: 'sheet', sheet: 'goal' };
    case 'open_split':   return { label, icon: 'people-outline',       kind: 'route', target: '/(tabs)/split' };
    case 'open_score':   return { label, icon: 'speedometer-outline',  kind: 'route', target: '/premium-reports' };
    case 'chat':         return { label, icon: 'chatbubbles-outline',  kind: 'chat', prompt: label, mode: 'free' };
    default:             return { label, icon: 'arrow-forward-outline', kind: 'chat',  prompt: label, mode: 'free' };
  }
}

function runAction(a: Action, askChat: (p: string, m?: any) => void) {
  if (a.kind === 'sheet' && a.sheet) {
    try { useSmartEntry.getState().open(a.sheet, {}, 'brain_dashboard'); } catch {}
    return;
  }
  if (a.kind === 'route' && a.target) { try { router.push(a.target as any); } catch {} return; }
  if (a.kind === 'chat' && a.prompt) askChat(a.prompt, a.mode || 'free');
}

// ─── Brain: the core logic ───────────────────────────────────────────
type Brain = {
  insight: string;
  actions: Action[];
  deepAnalysis: { tag: string; text: string; prompt: string; mode: string }[];
  priority: 'low' | 'med' | 'high';
};
function buildBrain(ctx: ReturnType<typeof useFinContext.getState>['get'] extends () => infer T ? T : never, topCat: [string, number] | undefined): Brain {
  const deep: Brain['deepAnalysis'] = [];

  // ONBOARDING STATE — the brain's most important mode: no data yet.
  if (ctx.transactions.count === 0) {
    return {
      priority: 'high',
      insight: `You haven't started tracking yet. Without transactions, I can't optimize your money. Let's fix that first.`,
      actions: [
        { label: 'Add first expense',    sub: 'Takes 15 seconds', icon: 'add-circle-outline', kind: 'sheet', sheet: 'expense' },
        { label: 'Set your first budget', sub: 'Cap a category',   icon: 'pie-chart-outline', kind: 'sheet', sheet: 'budget' },
        { label: 'Create a savings goal', sub: 'Save with intent', icon: 'flag-outline',      kind: 'sheet', sheet: 'goal' },
      ],
      deepAnalysis: [],
    };
  }

  // SHARED DEEP ANALYSIS BLOCKS (data-aware)
  if (topCat && ctx.transactions.monthlySpend > 0) {
    const [cat, amt] = topCat;
    const pct = Math.round((amt / ctx.transactions.monthlySpend) * 100);
    deep.push({
      tag: 'CATEGORY',
      text: `${cat} is ${pct}% of your spend — ₹${fmtCompact(amt)} this month.`,
      prompt: `Break down my ${cat.toLowerCase()} spend and suggest where to cut.`,
      mode: 'expense_help',
    });
  }
  if (ctx.budgets.total > 0) {
    const useRate = Math.round((ctx.budgets.used / ctx.budgets.total) * 100);
    const over = ctx.insights.overspending[0];
    deep.push({
      tag: 'BUDGET',
      text: over ? over : `${useRate}% of budget used. ${100 - useRate}% headroom left.`,
      prompt: `Optimize my budgets based on my actual spend.`,
      mode: 'budget_optimize',
    });
  }
  if (ctx.goals.count > 0 && ctx.goals.topGoal) {
    const g = ctx.goals.topGoal;
    const remain = Math.max(0, g.target - g.saved);
    const days = remain > 0 ? Math.ceil(remain / 200) : 0;
    deep.push({
      tag: 'GOAL',
      text: `At ₹200/day, you'll reach "${g.name}" in ${days} days.`,
      prompt: `Give me a realistic strategy to reach "${g.name}" faster.`,
      mode: 'goal_strategy',
    });
  }
  if (ctx.splits.owe > 0 || ctx.splits.owed > 0) {
    deep.push({
      tag: 'SPLIT',
      text: ctx.splits.owe > ctx.splits.owed
        ? `You owe ₹${fmtCompact(ctx.splits.owe)} — settle to keep a clean score.`
        : `You're owed ₹${fmtCompact(ctx.splits.owed)} — nudge your friends?`,
      prompt: `Help me clean up my split balances.`,
      mode: 'split_advice',
    });
  }

  // PRIMARY INSIGHT by priority
  let priority: Brain['priority'] = 'med';
  let insight = `You've logged ${ctx.transactions.count} txns totalling ₹${fmtCompact(ctx.transactions.monthlySpend)}.`;

  if (ctx.insights.overspending.length > 0) {
    priority = 'high';
    insight = `Over budget: ${ctx.insights.overspending[0]}. One swap can pull you back under.`;
  } else if (topCat && ctx.transactions.monthlySpend > 0) {
    const [cat, amt] = topCat;
    const pct = Math.round((amt / ctx.transactions.monthlySpend) * 100);
    if (pct >= 40) {
      priority = 'high';
      insight = `You spend ${pct}% on ${cat.toLowerCase()} — ₹${fmtCompact(amt)}. That's above optimal.`;
    } else {
      insight = `Top category: ${cat} (${pct}% · ₹${fmtCompact(amt)}). Balance is healthy.`;
    }
  }

  // ACTION STACK by state
  const actions: Action[] = [];
  if (ctx.insights.overspending.length > 0) {
    actions.push({ label: 'Reduce overspend',    sub: 'Ask AI for a 2-min fix', icon: 'trending-down-outline', kind: 'chat', prompt: `I'm over budget — give me 3 specific cuts to get back on track.`, mode: 'budget_optimize' });
  }
  if (ctx.goals.count === 0) {
    actions.push({ label: 'Set a savings goal', sub: 'Start with ₹10K', icon: 'flag-outline', kind: 'sheet', sheet: 'goal' });
  } else {
    actions.push({ label: 'Goal strategy',      sub: 'Predictive plan', icon: 'rocket-outline', kind: 'chat', prompt: `Build me a strategy to hit my top goal faster.`, mode: 'goal_strategy' });
  }
  actions.push({ label: 'Log today\'s expense', sub: 'Keep your streak alive', icon: 'add-circle-outline', kind: 'sheet', sheet: 'expense' });

  return { insight, actions, deepAnalysis: deep, priority };
}

// ─── Helpers ─────────────────────────────────────────────────────────
function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },

  // Mascot moodline (v10 Phase 2C — context-aware)
  mood: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 2, borderColor: INK,
    paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 10,
  },
  moodInfo: { backgroundColor: '#fff' },
  moodOk:   { backgroundColor: '#E9F7EF' },
  moodWarn: { backgroundColor: '#FDECE1' },
  moodTag:  { fontSize: 9, fontWeight: '900', letterSpacing: 1.6, color: INK, marginBottom: 2 },
  moodLine: { fontSize: 13, fontWeight: '700', color: INK, lineHeight: 18 },

  // Context strip
  strip: {
    flexDirection: 'row',
    borderWidth: 2, borderColor: INK,
    backgroundColor: '#fff',
  },

  // Perspective chip rail (v10)
  perspRail: { flexDirection: 'row', gap: 6, paddingVertical: 10, paddingRight: 12 },
  perspChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: INK, backgroundColor: '#fff',
  },
  perspChipActive: { backgroundColor: INK },
  perspText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: INK },
  perspDot: { width: 5, height: 5, backgroundColor: '#F59E0B', marginLeft: 2 },

  // Primary insight
  insight: {
    marginTop: 16,
    backgroundColor: INK,
    borderWidth: 2, borderColor: INK,
    padding: 16,
  },
  insightHigh: { backgroundColor: INK },
  insightTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  insightRule: { width: 12, height: 3, backgroundColor: ACCENT },
  insightTag: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: ACCENT },
  insightText: { color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '600' },

  // Action stack
  stackHeader: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: MUTED,
    marginTop: 20, marginBottom: 8,
  },
  stack: {
    borderWidth: 1, borderColor: LINE,
    backgroundColor: PAPER,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: LINE,
    gap: 12, minHeight: 64,
  },
  actionPrimary: { backgroundColor: ACCENT, borderColor: INK, borderBottomColor: INK },
  actionIcon: {
    width: 32, height: 32,
    borderWidth: 1, borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  actionIconPrimary: { backgroundColor: INK, borderColor: '#fff' },
  actionTitle: { fontSize: 14, fontWeight: '800', color: INK },
  actionSub: { fontSize: 11, fontWeight: '500', color: MUTED, marginTop: 2 },

  // Deep analysis cards
  deepCard: {
    width: 220,
    padding: 12,
    borderWidth: 2, borderColor: INK,
    backgroundColor: '#fff',
    minHeight: 110,
    justifyContent: 'space-between',
  },
  deepTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: ACCENT },
  deepText: { fontSize: 13, fontWeight: '600', color: INK, marginTop: 8, lineHeight: 18 },
  deepCta: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: INK, marginTop: 8 },
});
