/**
 * TodayChips — horizontal compact stat chips row.
 * Shows: today spent · left to spend · top category · streak at a glance.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from '../../utils/makeStyles';

type Props = { snapshot: any | null; stats: any | null };

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v}`;
};

function TodayChips({ snapshot, stats }: Props) {
  const s = useStyles();

  const chips = useMemo(() => {
    const arr: { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; label: string; value: string }[] = [];

    const spark = snapshot?.sparkline;
    const todaySpent = Array.isArray(spark) && spark.length > 0 ? Number(spark[spark.length - 1]?.amount || 0) : 0;
    if (todaySpent > 0) {
      arr.push({ icon: 'today', color: '#DB2777', bg: '#FCE7F3', label: 'Today', value: fmt(todaySpent) });
    }

    const income = Number(snapshot?.mtd_income ?? snapshot?.monthly_income ?? stats?.total_income ?? 0);
    const spend  = Number(snapshot?.mtd_spend ?? snapshot?.total_spend_month ?? stats?.total_expense ?? 0);
    if (income > 0) {
      const left = Math.max(0, income - spend);
      arr.push({ icon: 'wallet', color: '#059669', bg: '#D1FAE5', label: 'Left', value: fmt(left) });
    }

    const top = snapshot?.top_category;
    if (top && top.name) {
      arr.push({ icon: 'pricetag', color: '#7C3AED', bg: '#EDE9FE', label: top.name, value: fmt(Number(top.amount || 0)) });
    }

    const streak = Number(snapshot?.tier?.streak_days || 0);
    if (streak > 0 && arr.length < 4) {
      arr.push({ icon: 'flame', color: '#DC2626', bg: '#FEE2E2', label: 'Streak', value: `${streak}d` });
    }

    return arr;
  }, [snapshot, stats]);

  if (chips.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={s.scroll}>
      {chips.map((c, i) => (
        <View key={i} style={[s.chip, { backgroundColor: c.bg }]}>
          <Ionicons name={c.icon} size={14} color={c.color} />
          <View>
            <Text style={[s.chipLabel, { color: c.color }]} numberOfLines={1}>{c.label.toUpperCase()}</Text>
            <Text style={[s.chipValue, { color: c.color }]} numberOfLines={1}>{c.value}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export default memo(TodayChips);

const useStyles = makeStyles(() => ({
  scroll: { marginHorizontal: -20, marginBottom: 14 },
  row: { gap: 8, paddingHorizontal: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, minWidth: 108 },
  chipLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  chipValue: { fontSize: 14, fontWeight: '900', marginTop: 1 },
}));
