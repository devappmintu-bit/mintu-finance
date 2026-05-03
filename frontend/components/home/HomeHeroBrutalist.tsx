/**
 * HomeHeroBrutalist — v10 Brutalist rollout (Phase 3).
 *
 * Drop-in replacement for HomeHero. Keeps the same props signature so
 * the Home tab wiring is unchanged. Visual language matches
 * AIBrainDashboard / TransactionsHeroBrutalist / Budget+Split heroes:
 *
 *   • MONEY · MMM YYYY eyebrow + accent rule
 *   • Pace chip (green/amber/red) mirroring server `paceEmoji`
 *   • Mono ledger focal ₹ for MTD spend + projection underneath
 *   • 7-bar brutalist sparkline (today highlighted)
 *   • Action bar [EXPENSE · SCAN · BUDGET] → all feed SmartEntry
 *   • Tap anywhere on the block → opens deep spend insights (onSeeWhy)
 */
import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSmartEntry } from '../../store/smartEntry';
import { ROUTES } from '../../constants/routes';

const INK    = '#0A0A0A';
const PAPER  = '#F5F1EA';
const ACCENT = '#E84A0C';
const LINE   = '#E4E2DB';
const MUTED  = '#6B6B6B';
const OK     = '#0E8F5B';
const WARN   = '#D97706';
const DANGER = '#C2185B';
const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace' });

export interface HomeHeroProps {
  mtdSpend: number;
  mtdIncome: number;
  projectedMonthEnd: number;
  sparkline: Array<{ day: string; amount: number }>;
  topCategory?: { name?: string; amount?: number; emoji?: string } | null;
  paceEmoji?: string;
  paceHeadline?: string;
  onSeeWhy?: () => void;
}

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const haptic = () => {
  if (Platform.OS !== 'web') {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
  }
};

function HomeHeroBrutalistImpl({
  mtdSpend = 0, mtdIncome = 0, projectedMonthEnd = 0,
  sparkline = [], topCategory, paceEmoji = '🟢', paceHeadline, onSeeWhy,
}: HomeHeroProps) {
  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();
  const saved = Math.max(0, mtdIncome - mtdSpend);
  const saveRate = mtdIncome > 0 ? Math.max(0, Math.min(100, Math.round((saved / mtdIncome) * 100))) : 0;

  const pace = useMemo(() => {
    if (paceEmoji === '🔴') return { label: 'OVER PACE',  color: DANGER };
    if (paceEmoji === '🟠') return { label: 'WATCH PACE', color: WARN };
    return { label: 'ON PACE', color: OK };
  }, [paceEmoji]);

  const maxBar = Math.max(1, ...sparkline.map(s => s.amount || 0));
  const todayIdx = sparkline.length - 1;

  const openExpense = () => { haptic(); useSmartEntry.getState().open('expense', { type: 'debit' }, 'home_hero'); };
  const openBudget  = () => { haptic(); useSmartEntry.getState().open('budget', {}, 'home_hero'); };
  const openScan    = () => { haptic(); try { router.push(ROUTES.SMS_SCAN as any); } catch {} };

  return (
    <View style={styles.wrap}>
      {/* Eyebrow */}
      <View style={styles.eyebrowRow}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>MONEY · {monthLabel}</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.pacePill, { borderColor: pace.color }]}>
          <View style={[styles.paceDot, { backgroundColor: pace.color }]} />
          <Text style={[styles.paceLabel, { color: pace.color }]}>{pace.label}</Text>
        </View>
      </View>

      {/* Focal block */}
      <Pressable onPress={() => { haptic(); onSeeWhy?.(); }} style={({ pressed }) => [styles.card, pressed && { transform: [{ translateY: 1 }] }]}>
        <View style={styles.focalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.focalTag}>SPENT THIS MONTH</Text>
            <Text style={styles.focal} numberOfLines={1}>{fmt(mtdSpend)}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {paceHeadline
                ? paceHeadline
                : (projectedMonthEnd > 0
                    ? `Projected ${fmt(projectedMonthEnd)} by month-end`
                    : `${saveRate}% saved · ${fmt(saved)} in reserve`)}
            </Text>
            {topCategory?.name ? (
              <Text style={styles.topCat} numberOfLines={1}>
                {topCategory.emoji || '▸'} {topCategory.name} leads at {fmt(topCategory.amount || 0)}
              </Text>
            ) : null}
          </View>

          {/* Sparkline */}
          <View style={styles.spark}>
            {sparkline.slice(-7).map((s, i) => {
              const h = Math.max(6, Math.round(((s.amount || 0) / maxBar) * 46));
              const isToday = i === Math.min(6, todayIdx);
              return (
                <View key={i} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      { height: h, backgroundColor: isToday ? ACCENT : INK, opacity: isToday ? 1 : 0.25 },
                    ]}
                  />
                </View>
              );
            })}
            <Text style={styles.sparkLabel}>7D</Text>
          </View>
        </View>

        {/* Action bar */}
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.actionPrimary, pressed && { transform: [{ translateY: 1 }] }]} onPress={openExpense} testID="home-hero-expense">
            <Ionicons name="add-circle" size={14} color="#fff" />
            <Text style={styles.actionPrimaryTxt}>EXPENSE</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.action, pressed && { transform: [{ translateY: 1 }] }]} onPress={openScan} testID="home-hero-scan">
            <Ionicons name="scan-outline" size={14} color={INK} />
            <Text style={styles.actionTxt}>SCAN SMS</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.action, styles.actionLast, pressed && { transform: [{ translateY: 1 }] }]} onPress={openBudget} testID="home-hero-budget">
            <Ionicons name="pie-chart-outline" size={14} color={INK} />
            <Text style={styles.actionTxt}>BUDGET</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

export default memo(HomeHeroBrutalistImpl);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingHorizontal: 16 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },
  pacePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  paceDot: { width: 6, height: 6 },
  paceLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },

  card: { marginHorizontal: 16, borderWidth: 2, borderColor: INK, backgroundColor: '#fff' },
  focalRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderColor: INK },
  focalTag: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: MUTED },
  focal: { fontFamily: MONO, fontSize: 36, fontWeight: '900', color: INK, letterSpacing: -1.5, lineHeight: 40, marginTop: 2 },
  sub: { fontSize: 11, fontWeight: '700', color: MUTED, marginTop: 4, letterSpacing: 0.2 },
  topCat: { fontSize: 10, fontWeight: '800', color: INK, marginTop: 6, letterSpacing: 0.3 },

  spark: { alignItems: 'center', minWidth: 72, paddingTop: 4 },
  barCol: { width: 8, height: 48, justifyContent: 'flex-end' },
  bar: { width: 8, backgroundColor: INK },
  sparkLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, color: MUTED, marginTop: 6 },

  actions: { flexDirection: 'row' },
  actionPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: ACCENT, borderRightWidth: 1, borderColor: INK, minHeight: 48 },
  actionPrimaryTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: '#fff' },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: '#fff', borderRightWidth: 1, borderColor: INK, minHeight: 48 },
  actionLast: { borderRightWidth: 0 },
  actionTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: INK },
});
