/**
 * SmartInsightsStrip — a horizontal card strip of data-driven spending insights.
 *
 * Computes insights client-side from the already-loaded transactions so no extra
 * API call is needed. Cards: Top Merchant · Biggest Category · Avg Ticket · Weekday Pattern.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/theme';

type Txn = {
  id: string;
  amount: number;
  type: 'debit' | 'credit' | string;
  category?: string;
  merchant?: string;
  description?: string;
  date?: string;
  timestamp?: string;
  created_at?: string;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function SmartInsightsStrip({ transactions }: { transactions: Txn[] }) {
  const insights = useMemo(() => {
    const debits = (transactions || []).filter((t) => t.type === 'debit' && Number(t.amount) > 0);
    if (debits.length === 0) return null;

    // Top merchant by frequency (falls back to description)
    const merchantCount: Record<string, { count: number; total: number }> = {};
    debits.forEach((t) => {
      const key = (t.merchant || t.description || 'Other').trim();
      if (!merchantCount[key]) merchantCount[key] = { count: 0, total: 0 };
      merchantCount[key].count += 1;
      merchantCount[key].total += Number(t.amount);
    });
    const topMerchant = Object.entries(merchantCount).sort((a, b) => b[1].count - a[1].count)[0];

    // Biggest category by amount
    const catTotals: Record<string, number> = {};
    debits.forEach((t) => {
      const c = t.category || 'Other';
      catTotals[c] = (catTotals[c] || 0) + Number(t.amount);
    });
    const totalSpend = Object.values(catTotals).reduce((a, b) => a + b, 0);
    const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

    // Avg ticket size
    const avg = totalSpend / debits.length;

    // Weekday pattern (most frequent spending day)
    const dayTotals: Record<number, number> = {};
    debits.forEach((t) => {
      const dt = new Date(t.date || t.timestamp || t.created_at || Date.now());
      const d = dt.getDay();
      if (!isNaN(d)) dayTotals[d] = (dayTotals[d] || 0) + Number(t.amount);
    });
    const topDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

    return {
      topMerchant: topMerchant ? { name: topMerchant[0], count: topMerchant[1].count, total: topMerchant[1].total } : null,
      topCategory: topCat ? { name: topCat[0], amount: topCat[1], pct: Math.round((topCat[1] / totalSpend) * 100) } : null,
      avgTicket: avg,
      topDay: topDay ? { day: WEEKDAYS[Number(topDay[0])], amount: topDay[1] } : null,
      totalSpend,
      count: debits.length,
    };
  }, [transactions]);

  if (!insights) return null;

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Ionicons name="sparkles" size={14} color={COLORS.accent.primary} />
        <Text style={s.title}>Smart Insights</Text>
        <View style={s.chip}>
          <Text style={s.chipText}>{insights.count} txns</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.strip}
        snapToInterval={170}
        decelerationRate="fast"
      >
        {insights.topMerchant && (
          <Card
            icon="storefront"
            tint="#E65100"
            label="TOP MERCHANT"
            value={insights.topMerchant.name}
            sub={`${insights.topMerchant.count}× · ${fmtINR(insights.topMerchant.total)}`}
          />
        )}
        {insights.topCategory && (
          <Card
            icon="pie-chart"
            tint="#D32F2F"
            label="BIGGEST CATEGORY"
            value={insights.topCategory.name}
            sub={`${fmtINR(insights.topCategory.amount)} · ${insights.topCategory.pct}%`}
          />
        )}
        <Card
          icon="pricetag"
          tint="#1976D2"
          label="AVG TICKET"
          value={fmtINR(insights.avgTicket)}
          sub="per transaction"
        />
        {insights.topDay && (
          <Card
            icon="calendar"
            tint="#059669"
            label="TOP DAY"
            value={insights.topDay.day}
            sub={`${fmtINR(insights.topDay.amount)} spent`}
          />
        )}
        <Card
          icon="trending-up"
          tint={COLORS.accent.primary}
          label="TOTAL SPEND"
          value={fmtINR(insights.totalSpend)}
          sub={`across ${insights.count} entries`}
        />
      </ScrollView>
    </View>
  );
}

function Card({ icon, tint, label, value, sub }: { icon: string; tint: string; label: string; value: string; sub: string }) {
  return (
    <View style={[s.card, { borderLeftColor: tint }]}>
      <View style={[s.iconBox, { backgroundColor: tint + '18' }]}>
        <Ionicons name={icon as any} size={16} color={tint} />
      </View>
      <Text style={[s.cardLabel, { color: tint }]} numberOfLines={1}>{label}</Text>
      <Text style={s.cardValue} numberOfLines={1}>{value}</Text>
      <Text style={s.cardSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '800', color: COLORS.text.primary, flex: 1 },
  chip: { backgroundColor: COLORS.accent.primary + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipText: { fontSize: 10, fontWeight: '800', color: COLORS.accent.primary },

  strip: { paddingHorizontal: 16, gap: 10, paddingVertical: 2 },
  card: {
    width: 160,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border.card,
    borderLeftWidth: 3,
    gap: 4,
  },
  iconBox: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  cardLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  cardValue: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary, lineHeight: 18 },
  cardSub: { fontSize: 10, color: COLORS.text.muted, fontWeight: '600' },
});
