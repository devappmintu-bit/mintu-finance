import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  stats: {
    monthlySpend: number;
    savingsRate: number;
    topCategory: { name: string; amount: number } | null;
    transactionCount: number;
  } | null;
}

export default function FinancialSnapshot({ stats }: Props) {
  const s = useStyles();
  if (!stats || (stats.monthlySpend <= 0 && stats.transactionCount <= 0)) return null;

  const rateColor =
    stats.savingsRate >= 20 ? '#10B981' :
    stats.savingsRate >= 10 ? '#F59E0B' : '#E65100';

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>Your Financial Snapshot</Text>
        <View style={s.badge}><Text style={s.badgeText}>Last 30 days</Text></View>
      </View>
      <View style={s.grid}>
        <View style={s.item}>
          <Ionicons name="trending-down" size={18} color="#E65100" />
          <Text style={s.itemValue}>
            ₹{stats.monthlySpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
          <Text style={s.itemLabel}>Monthly Spend</Text>
        </View>
        <View style={s.divider} />
        <View style={s.item}>
          <Ionicons name="trending-up" size={18} color="#10B981" />
          <Text style={[s.itemValue, { color: rateColor }]}>{stats.savingsRate}%</Text>
          <Text style={s.itemLabel}>Savings Rate</Text>
        </View>
      </View>
      <View style={s.grid}>
        <View style={s.item}>
          <Ionicons name="pie-chart" size={18} color="#E65100" />
          <Text style={s.itemValue} numberOfLines={1}>
            {stats.topCategory ? stats.topCategory.name : '—'}
          </Text>
          <Text style={s.itemLabel}>
            {stats.topCategory
              ? `Top: ₹${stats.topCategory.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
              : 'Top Category'}
          </Text>
        </View>
        <View style={s.divider} />
        <View style={s.item}>
          <Ionicons name="receipt" size={18} color="#E65100" />
          <Text style={s.itemValue}>{stats.transactionCount}</Text>
          <Text style={s.itemLabel}>Transactions</Text>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: c.border.card },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '800', color: c.text.primary },
  badge: { backgroundColor: c.accent.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '700', color: c.accent.primary, letterSpacing: 0.3 },
  grid: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  itemValue: { fontSize: 18, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  itemLabel: { fontSize: 10, fontWeight: '600', color: c.text.muted, letterSpacing: 0.3 },
  divider: { width: 1, height: 40, backgroundColor: c.border.subtle },
}));
