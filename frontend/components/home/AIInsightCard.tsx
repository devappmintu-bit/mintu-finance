/**
 * AIInsightCard — surfaces a single data-driven insight on Home, below the graph.
 *
 * Computes the insight 100% client-side from existing snapshot data — no extra
 * API call. Rotates through patterns:
 *   • weekday-spike: "You spent 3x more on Friday"
 *   • category-dominant: "Transport is 85% of your spend"
 *   • pace-behind: "Save ₹2,000 more to hit 98%"
 *   • on-track: "You're on track to save 95% — keep it going"
 *
 * Includes a CTA button that jumps to the most-relevant tab.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Props = {
  transactions?: any[];
  totalSpend?: number;
  savingsRate?: number;
  topCategory?: string;
  topCategoryAmount?: number;
  monthlyIncome?: number;
};

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AIInsightCard({
  transactions = [],
  totalSpend = 0,
  savingsRate = 0,
  topCategory,
  topCategoryAmount = 0,
  monthlyIncome = 0,
}: Props) {
  const s = useStyles();
  const insight = useMemo(() => {
    // 1) WEEKDAY SPIKE — strongest narrative when one day is 2x+ avg
    const dayTotals: Record<number, number> = {};
    (transactions || []).forEach((t) => {
      if (t.type !== 'debit') return;
      const dt = new Date(t.date || t.timestamp || t.created_at || Date.now());
      const d = dt.getDay();
      if (!isNaN(d)) dayTotals[d] = (dayTotals[d] || 0) + Number(t.amount || 0);
    });
    const days = Object.entries(dayTotals);
    if (days.length >= 3) {
      const [topD, topV] = days.sort((a, b) => b[1] - a[1])[0];
      const others = days.filter(([d]) => d !== topD).map(([, v]) => v);
      const avgOthers = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
      if (avgOthers > 0 && (topV as number) > avgOthers * 2) {
        const multiplier = Math.round((topV as number) / avgOthers);
        return {
          icon: '⚡',
          tint: '#E65100',
          title: `You spent ${multiplier}x more on ${WEEKDAYS[Number(topD)]}`,
          sub: `${fmtINR(topV as number)} that day vs ${fmtINR(avgOthers)} avg other days. A weekly cap could help.`,
          cta: 'See details',
          route: '/(tabs)/transactions',
        };
      }
    }

    // 2) CATEGORY DOMINANT — one category >= 40% of spend
    if (topCategory && topCategoryAmount && totalSpend > 0) {
      const pct = Math.round((topCategoryAmount / totalSpend) * 100);
      if (pct >= 40) {
        return {
          icon: '📊',
          tint: '#D32F2F',
          title: `${topCategory} is ${pct}% of your spend`,
          sub: `${fmtINR(topCategoryAmount)} of ${fmtINR(totalSpend)}. Cutting 20% here saves ${fmtINR(topCategoryAmount * 0.2)}/mo.`,
          cta: 'Set budget',
          route: '/(tabs)/budget',
        };
      }
    }

    // 3) BEHIND PACE — if savings rate < 20%
    if (savingsRate > 0 && savingsRate < 20 && monthlyIncome > 0) {
      const target = 20;
      const gap = Math.round(monthlyIncome * (target - savingsRate) / 100);
      return {
        icon: '🎯',
        tint: '#F59E0B',
        title: `Save ${fmtINR(gap)} more to hit ${target}%`,
        sub: `You're at ${savingsRate}%. The 50/30/20 rule recommends 20% savings.`,
        cta: 'Ask AI how',
        route: '/(tabs)/insights',
      };
    }

    // 4) ON-TRACK — savings >= 20%
    if (savingsRate >= 20) {
      return {
        icon: '🚀',
        tint: '#10B981',
        title: `You're saving ${Math.round(savingsRate)}% — well done!`,
        sub: `Consider moving excess to an SIP for long-term compounding.`,
        cta: 'See investments',
        route: '/premium',
      };
    }

    // 5) DEFAULT — nudge to log more
    return {
      icon: '💡',
      tint: COLORS.accent.primary,
      title: 'Log a few transactions to unlock insights',
      sub: 'The more you track, the smarter I get. Start with today\'s expenses.',
      cta: 'Add expense',
      route: '/(tabs)/transactions',
    };
  }, [transactions, totalSpend, savingsRate, topCategory, topCategoryAmount, monthlyIncome]);

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={[s.iconBox, { backgroundColor: insight.tint + '15' }]}>
          <Text style={s.icon}>{insight.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.headerLabelRow}>
            <Ionicons name="sparkles" size={11} color={COLORS.accent.primary} />
            <Text style={s.headerLabel}>AI INSIGHT</Text>
          </View>
          <Text style={s.title}>{insight.title}</Text>
        </View>
      </View>
      <Text style={s.sub}>{insight.sub}</Text>
      <TouchableOpacity
        style={[s.cta, { backgroundColor: insight.tint }]}
        onPress={() => router.push(insight.route as any)}
        activeOpacity={0.85}
      >
        <Text style={s.ctaText}>{insight.cta}</Text>
        <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.elevated,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border.card,
    gap: 10,
  },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  icon: { fontSize: 26 },
  headerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  headerLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: c.accent.primary },
  title: { fontSize: 14, fontWeight: '800', color: c.text.primary, lineHeight: 19 },
  sub: { fontSize: 12, color: c.text.secondary, lineHeight: 17, marginLeft: 60 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 999, alignSelf: 'flex-start',
    paddingHorizontal: 18, marginLeft: 60, marginTop: 2,
  },
  ctaText: { fontSize: 12, fontWeight: '800', color: c.bg.elevated, letterSpacing: 0.3 },
}));
