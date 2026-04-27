/**
 * BudgetSummaryDonut — Kiwi-style at-a-glance summary for Budgets tab.
 *
 * Renders a donut chart showing budget allocation across categories with a
 * center label of total-spent vs total-allocated. Uses react-native-gifted-charts.
 *
 * Designed to sit at the top of the budgets FlatList as a ListHeaderComponent.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';

type Budget = {
  id: string;
  category: string;
  amount: number;
  spent?: number;
};

const CAT_COLORS: Record<string, string> = {
  Food: COLORS.accent.secondary, Transport: '#3B82F6', Shopping: '#EC4899',
  Bills: COLORS.state.danger, Entertainment: '#8B5CF6', Healthcare: COLORS.state.successAlt,
  Education: '#14B8A6', Investment: '#6366F1', Groceries: '#84CC16',
  Rent: COLORS.accent.brand, Other: COLORS.text.muted,
};
const FALLBACK_COLORS = [COLORS.accent.brand, COLORS.state.successAlt, '#3B82F6', '#8B5CF6', COLORS.accent.secondary, COLORS.state.danger, '#14B8A6', '#EC4899'];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function BudgetSummaryDonut({ budgets }: { budgets: Budget[] }) {
  const s = useStyles();
  if (!budgets || budgets.length === 0) return null;

  const totalAllocated = budgets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);
  const pct = totalAllocated > 0 ? Math.min(100, Math.round((totalSpent / totalAllocated) * 100)) : 0;

  const data = budgets.map((b, i) => ({
    value: Math.max(1, b.amount || 0),
    color: CAT_COLORS[b.category] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    text: '',
  }));

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Budget allocation</Text>
        <View style={[s.pctPill, { backgroundColor: pct >= 90 ? '#FEE2E2' : pct >= 70 ? '#FEF3C7' : '#DCFCE7', borderColor: pct >= 90 ? '#F87171' : pct >= 70 ? '#FCD34D' : '#86EFAC' }]}>
          <Text style={[s.pctTxt, { color: pct >= 90 ? '#B91C1C' : pct >= 70 ? '#92400E' : '#166534' }]}>{pct}% used</Text>
        </View>
      </View>

      <View style={s.chartRow}>
        <View style={s.chartBox}>
          <PieChart
            data={data as any}
            donut
            radius={64}
            innerRadius={44}
            centerLabelComponent={() => (
              <View style={{ alignItems: 'center' }}>
                <Text style={s.centerLbl}>Spent</Text>
                <Text style={s.centerVal}>{inr(totalSpent)}</Text>
                <Text style={s.centerSub}>of {inr(totalAllocated)}</Text>
              </View>
            )}
          />
        </View>

        <View style={s.legendCol}>
          {budgets.slice(0, 5).map((b, i) => (
            <View key={b.id} style={s.legendRow}>
              <View style={[s.dot, { backgroundColor: CAT_COLORS[b.category] || FALLBACK_COLORS[i % FALLBACK_COLORS.length] }]} />
              <Text style={s.legendLbl} numberOfLines={1}>{b.category}</Text>
              <Text style={s.legendAmt}>{inr(b.amount)}</Text>
            </View>
          ))}
          {budgets.length > 5 && (
            <Text style={s.moreTxt}>+{budgets.length - 5} more below</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { backgroundColor: c.bg.secondary, padding: 16, borderRadius: 18, marginBottom: 14, borderWidth: 1, borderColor: c.border.subtle },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '800', color: c.text.primary },
  pctPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pctTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  chartBox: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  centerLbl: { fontSize: 9.5, color: c.text.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  centerVal: { fontSize: 14, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  centerSub: { fontSize: 10, color: c.text.muted, marginTop: 1 },

  legendCol: { flex: 1, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLbl: { flex: 1, fontSize: 12, color: c.text.primary, fontWeight: '600' },
  legendAmt: { fontSize: 12, color: c.text.secondary, fontWeight: '700' },
  moreTxt: { fontSize: 10, color: c.text.muted, fontStyle: 'italic', marginTop: 4 },
}));
