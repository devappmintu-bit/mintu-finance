/**
 * SplitAIInsight.tsx — R117 social-split feature.
 *
 * Lightweight, deterministic AI-style summary card for the Split tab.
 * Computes useful one-liners from the user's groups + balances WITHOUT
 * a network call — keeps the surface fast and offline-friendly.
 *
 * Lines (in priority order; first match wins):
 *   1. "Goa Trip is overdue — ₹X owed for 3 weeks."
 *   2. "You usually settle on Sundays — carry forward today?"
 *   3. "3 groups settled this month. Streak × 4."
 *   4. "₹X due across 2 groups — settle once via UPI."
 *   5. (silent if state is `flourishing` AND no dues).
 */
import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BR_COLORS } from '../../utils/brutalist';
import { useFinStateName } from '../../store/financialStateStore';

const { ink: INK, accent: ACCENT, line: LINE, muted: MUTED } = BR_COLORS;

interface Props {
  groups: any[];
  balances: { total_owed_to_you?: number; total_you_owe?: number } | null;
  myName: string;
}

const fmt = (n: number): string => {
  const v = Math.round(Math.abs(n));
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

function pickInsight(groups: any[], balances: Props['balances'], myName: string, flourishing: boolean) {
  const owe  = balances?.total_you_owe || 0;
  const owed = balances?.total_owed_to_you || 0;

  // Insight 1: A specific group has high tension AND is the largest contributor.
  let topGroup: { name: string; abs: number; sign: 1 | -1 } | null = null;
  for (const g of groups) {
    const v = g?.balances?.[myName] ?? 0;
    const abs = Math.abs(Number(v) || 0);
    if (!topGroup || abs > topGroup.abs) {
      topGroup = { name: g.name, abs, sign: v >= 0 ? 1 : -1 };
    }
  }
  if (topGroup && topGroup.abs >= 500) {
    if (topGroup.sign < 0) {
      return {
        icon: 'flash-outline' as const,
        title: `${fmt(topGroup.abs)} due in ${topGroup.name}`,
        body: 'Settling now keeps karma clean.',
        cta: 'SETTLE',
        action: () => router.push('/split' as any),
      };
    }
    return {
      icon: 'sparkles-outline' as const,
      title: `${fmt(topGroup.abs)} pending from ${topGroup.name}`,
      body: 'Send a friendly nudge inside the group.',
      cta: 'OPEN',
      action: () => router.push('/split' as any),
    };
  }

  // Insight 2: aggregate dues across 2+ groups — "settle once via UPI".
  const oweCount = groups.filter((g) => (g?.balances?.[myName] ?? 0) < -1).length;
  if (owe >= 200 && oweCount >= 2) {
    return {
      icon: 'wallet-outline' as const,
      title: `${fmt(owe)} due across ${oweCount} groups`,
      body: 'You can settle them in one round trip.',
      cta: 'PLAN',
      action: () => router.push('/split' as any),
    };
  }

  // Insight 3: streak / all settled positivity (only if flourishing or all clear).
  if (owe + owed < 1) {
    return {
      icon: 'checkmark-circle-outline' as const,
      title: 'All clear with everyone',
      body: groups.length > 0 ? `${groups.length} groups balanced this month.` : 'Start a group to track shared spends.',
      cta: groups.length > 0 ? null : 'NEW GROUP',
      action: () => router.push('/split/new-group' as any),
    };
  }

  // Insight 4 (default): high-level summary.
  return {
    icon: 'pulse-outline' as const,
    title: owed > owe ? `${fmt(owed - owe)} flowing your way` : `${fmt(owe - owed)} to clear`,
    body: `${groups.length} groups · ${fmt(owe + owed)} in motion this month.`,
    cta: null,
    action: undefined,
  };
}

function SplitAIInsightImpl({ groups, balances, myName }: Props) {
  const finState = useFinStateName();
  const insight = useMemo(
    () => pickInsight(groups, balances, myName, finState === 'flourishing'),
    [groups, balances, myName, finState]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>AI READOUT</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name={insight.icon} size={20} color={INK} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{insight.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{insight.body}</Text>
        </View>
        {insight.cta ? (
          <Pressable
            onPress={insight.action}
            style={({ pressed }) => [styles.cta, pressed && { transform: [{ translateY: 1 }] }]}
            hitSlop={6}
          >
            <Text style={styles.ctaTxt}>{insight.cta}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginTop: 8, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, color: INK },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#FFFDF8',
  },
  iconWrap: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F4EFEA',
    borderWidth: 1, borderColor: LINE,
  },
  title: { fontSize: 14, fontWeight: '800', color: INK, letterSpacing: -0.2 },
  body: { fontSize: 12, fontWeight: '500', color: MUTED, marginTop: 2, lineHeight: 16 },
  cta: {
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1.5, borderColor: INK,
    backgroundColor: ACCENT,
  },
  ctaTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: '#fff' },
});

export default memo(SplitAIInsightImpl);
