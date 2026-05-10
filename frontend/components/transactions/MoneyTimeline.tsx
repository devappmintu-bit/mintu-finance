/**
 * MoneyTimeline.tsx — R117 calendar heatmap.
 *
 * Compact 30-day spend strip that lives ABOVE the transaction list.
 * Each cell = one day. Intensity (0-4) is computed from the daily
 * spend total relative to the peak in the window.
 *
 * Tap a cell → scrolls / filters to that day (left to caller via
 * onSelectDay). When no day is tapped, the strip shows the running
 * 30-day total + busiest day callout. When a day is tapped, the
 * footer flips to that day's stats.
 *
 * Calm-Mode aware: when the global financial state is `flourishing`
 * we tone down the peak intensity color so the strip never feels like
 * a panic chart.
 */
import React, { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { heatmapByDay, type HeatmapDay } from '../../utils/transactionInsights';
import { useIsCalm } from '../../store/financialStateStore';
import { BR_COLORS } from '../../utils/brutalist';

const { ink: INK, paper: PAPER, accent: ACCENT, line: LINE, muted: MUTED } = BR_COLORS;

interface Props {
  transactions: any[];
  /** Optional callback when a day is tapped. Caller may scroll its list. */
  onSelectDay?: (iso: string | null) => void;
}

function MoneyTimelineImpl({ transactions, onSelectDay }: Props) {
  const isCalm = useIsCalm();
  const [picked, setPicked] = useState<string | null>(null);

  const days = useMemo(() => heatmapByDay(transactions, 30), [transactions]);
  const totals = useMemo(() => {
    let total = 0;
    let peak: HeatmapDay | null = null;
    let activeDays = 0;
    for (const d of days) {
      total += d.total;
      if (d.count > 0) activeDays += 1;
      if (!peak || d.total > peak.total) peak = d;
    }
    return { total, peak, activeDays };
  }, [days]);

  const pickedDay = picked ? days.find((d) => d.iso === picked) || null : null;

  const tapDay = (iso: string) => {
    const next = picked === iso ? null : iso;
    setPicked(next);
    onSelectDay?.(next);
  };

  // Color ramp — brutalist 5-step. Calm Mode flattens the warm peak.
  const RAMP = isCalm
    ? ['#F4EFEA', '#E5DDD3', '#C8B8A6', '#A98A66', '#8C6B45']
    : ['#F4EFEA', '#FCD9B6', '#FDB572', '#F58A3F', '#C2410C'];

  const fmt = (n: number): string => {
    const v = Math.round(Math.abs(n));
    if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
    if (v >= 1_000)   return `₹${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
    return `₹${v}`;
  };

  const today = new Date();
  const monthLabel = today.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <View style={styles.wrap} testID="money-timeline">
      <View style={styles.head}>
        <View style={styles.headLeftRow}>
          <View style={styles.rule} />
          <Text style={styles.eyebrow}>30-DAY TIMELINE · {monthLabel}</Text>
        </View>
        {picked ? (
          <Pressable onPress={() => { setPicked(null); onSelectDay?.(null); }} hitSlop={8}>
            <Text style={styles.clear}>CLEAR</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {days.map((d) => {
          const dayLabel = d.date.getDate();
          const dow = d.date.toLocaleDateString('en-IN', { weekday: 'narrow' });
          const isPicked = picked === d.iso;
          const cellColor = RAMP[d.intensity] as string;
          return (
            <Pressable
              key={d.iso}
              onPress={() => tapDay(d.iso)}
              style={({ pressed }) => [styles.cellWrap, pressed && { transform: [{ translateY: 1 }] }]}
              hitSlop={4}
              accessibilityLabel={`${d.iso}, spent ${fmt(d.total)}`}
            >
              <Text style={styles.dow}>{dow}</Text>
              <View
                style={[
                  styles.cell,
                  { backgroundColor: cellColor },
                  d.isToday && styles.cellToday,
                  isPicked && styles.cellPicked,
                ]}
              >
                <Text
                  style={[
                    styles.cellNum,
                    d.intensity >= 3 && { color: '#fff' },
                    isPicked && { color: '#fff' },
                  ]}
                >
                  {dayLabel}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Footer — running total OR picked-day stats */}
      <View style={styles.foot}>
        {pickedDay ? (
          <>
            <View style={{ flex: 1 }}>
              <Text style={styles.footLabel}>
                {pickedDay.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
              </Text>
              <Text style={styles.footValue}>{fmt(pickedDay.total)}</Text>
            </View>
            <View style={styles.footDivider} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.footLabel}>TXNS</Text>
              <Text style={styles.footValue}>{pickedDay.count}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Text style={styles.footLabel}>30-DAY SPEND</Text>
              <Text style={styles.footValue}>{fmt(totals.total)}</Text>
            </View>
            <View style={styles.footDivider} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {totals.peak && totals.peak.total > 0 ? (
                <>
                  <Text style={styles.footLabel}>BUSIEST DAY</Text>
                  <View style={styles.peakRow}>
                    <Ionicons name="flame-outline" size={11} color={INK} />
                    <Text style={styles.footValue}>
                      {totals.peak.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase()}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.footLabel}>ACTIVE DAYS</Text>
                  <Text style={styles.footValue}>{totals.activeDays}/30</Text>
                </>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#FFFDF8',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  headLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, color: INK },
  clear: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: MUTED },
  row: { paddingHorizontal: 10, paddingBottom: 10, gap: 4 },
  cellWrap: { alignItems: 'center', gap: 3, marginRight: 2 },
  dow: { fontSize: 9, color: MUTED, fontWeight: '700', letterSpacing: 0.4 },
  cell: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.15)',
  },
  cellToday: { borderColor: INK, borderWidth: 2 },
  cellPicked: { backgroundColor: INK, borderColor: INK, borderWidth: 2 },
  cellNum: { fontSize: 11, fontWeight: '700', color: INK },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: PAPER,
  },
  footLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4, color: MUTED },
  footValue: { fontSize: 16, fontWeight: '800', color: INK, letterSpacing: -0.3, marginTop: 2 },
  footDivider: { width: 1, height: 28, backgroundColor: LINE, marginHorizontal: 12 },
  peakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
});

export default memo(MoneyTimelineImpl);
