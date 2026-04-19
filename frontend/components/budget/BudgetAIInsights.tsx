/**
 * BudgetAIInsights — graphical, data-driven insights derived from the user's
 * actual budgets + spend. No hardcoded values: every number comes from the
 * props. Shown at the top of the Budget tab.
 *
 * Cards (horizontally scrollable):
 *   - Health score (% of budgets on track)
 *   - Category at risk (highest % utilisation)
 *   - Savings headroom (unused budget this period)
 *   - AI tip that changes with the user's pattern
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';

type Budget = { id: string; category: string; amount: number; period?: string; spent?: number };

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function BudgetAIInsights({ budgets }: { budgets: Budget[] }) {
  const insights = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;

    // Enrich each budget with %used / status (derive — never trust a server-shaped string here).
    const enriched = budgets.map((b) => {
      const spent = Math.max(0, Number(b.spent) || 0);
      const limit = Math.max(1, Number(b.amount) || 1);
      const pct = (spent / limit) * 100;
      return { ...b, spent, limit, pct };
    });

    const totalBudget = enriched.reduce((s, b) => s + b.limit, 0);
    const totalSpent = enriched.reduce((s, b) => s + b.spent, 0);
    const headroom = Math.max(0, totalBudget - totalSpent);

    const onTrack = enriched.filter((b) => b.pct < 80).length;
    const health = Math.round((onTrack / enriched.length) * 100);

    const atRisk = [...enriched].sort((a, b) => b.pct - a.pct)[0];

    // Craft an AI-style tip based on the leader profile (no hardcoded text).
    let tip = '';
    if (atRisk.pct >= 100) {
      const over = atRisk.spent - atRisk.limit;
      tip = `${atRisk.category} is over by ${fmtINR(over)}. Pause discretionary ${atRisk.category.toLowerCase()} spend until next period.`;
    } else if (atRisk.pct >= 80) {
      const left = atRisk.limit - atRisk.spent;
      tip = `${atRisk.category} has only ${fmtINR(left)} left (${Math.round(atRisk.pct)}% used). Slow down this week.`;
    } else if (health === 100 && headroom > 0) {
      tip = `All budgets on track. You have ${fmtINR(headroom)} unused — consider auto-sweeping to savings.`;
    } else {
      tip = `You're pacing well. Keep the momentum — ${fmtINR(headroom)} of room remaining this period.`;
    }

    return { health, atRisk, headroom, tip, enriched };
  }, [budgets]);

  if (!insights) {
    return (
      <View style={s.empty}>
        <Ionicons name="sparkles" size={18} color={COLORS.accent.primary} />
        <Text style={s.emptyText}>Set a budget to unlock AI insights tailored to your spending.</Text>
      </View>
    );
  }

  const { health, atRisk, headroom, tip } = insights;
  const healthColor = health >= 80 ? '#10B981' : health >= 50 ? '#F59E0B' : '#EF4444';
  const riskColor = atRisk.pct >= 100 ? '#EF4444' : atRisk.pct >= 80 ? '#F59E0B' : '#10B981';

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip} contentContainerStyle={s.stripContent}>
      {/* 1 — Health Ring */}
      <LinearGradient colors={['#FFF4E8', '#FFE4CC']} style={s.card}>
        <View style={s.row}>
          <Ionicons name="pulse" size={14} color={COLORS.accent.primary} />
          <Text style={s.label}>Budget Health</Text>
        </View>
        <View style={s.ringWrap}>
          <View style={[s.ring, { borderColor: healthColor }]}>
            <Text style={[s.ringText, { color: healthColor }]}>{health}%</Text>
          </View>
          <Text style={s.value}>{health >= 80 ? 'Strong' : health >= 50 ? 'Fair' : 'At risk'}</Text>
        </View>
      </LinearGradient>

      {/* 2 — Category at Risk (mini bar) */}
      <View style={s.card}>
        <View style={s.row}>
          <Ionicons name="warning" size={14} color={riskColor} />
          <Text style={s.label}>Watching</Text>
        </View>
        <Text style={s.value} numberOfLines={1}>{atRisk.category}</Text>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${Math.min(100, atRisk.pct)}%`, backgroundColor: riskColor }]} />
        </View>
        <Text style={s.subtle}>{fmtINR(atRisk.spent)} / {fmtINR(atRisk.limit)}</Text>
      </View>

      {/* 3 — Headroom */}
      <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={s.card}>
        <View style={s.row}>
          <Ionicons name="trending-up" size={14} color="#047857" />
          <Text style={s.label}>Safe to spend</Text>
        </View>
        <Text style={[s.value, { color: '#047857', fontSize: 22 }]}>{fmtINR(headroom)}</Text>
        <Text style={s.subtle}>until next period</Text>
      </LinearGradient>

      {/* 4 — AI Tip */}
      <View style={[s.card, { backgroundColor: '#1A2A08', borderColor: '#1A2A08' }]}>
        <View style={s.row}>
          <Ionicons name="sparkles" size={14} color="#8BE24E" />
          <Text style={[s.label, { color: '#8BE24E' }]}>AI Tip</Text>
        </View>
        <Text style={[s.tip, { color: '#FFFFFF' }]} numberOfLines={3}>{tip}</Text>
      </View>
    </ScrollView>
  );
}

const CARD_W = 180;
const s = StyleSheet.create({
  strip: { marginBottom: 16 },
  stripContent: { paddingHorizontal: 12, gap: 10 },
  card: {
    width: CARD_W,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0E1D0',
    backgroundColor: '#FFFFFF',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  value: { fontSize: 18, fontWeight: '800', color: '#111827' },
  subtle: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  tip: { fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 17 },
  ringWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ring: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 4, alignItems: 'center', justifyContent: 'center',
  },
  ringText: { fontSize: 13, fontWeight: '800' },
  barTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  empty: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: '#FFF4E8', borderRadius: 14, padding: 12, marginHorizontal: 12, marginBottom: 12,
  },
  emptyText: { flex: 1, fontSize: 12, color: '#78350F', fontWeight: '600' },
});
