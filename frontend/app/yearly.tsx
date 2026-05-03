/**
 * MintU 2.0 — Yearly Analytics Dashboard (12-month view)
 * Features: monthly bar chart (income + expense), year stats, category breakdown, momentum, highlights.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import api from '../utils/api';
import { COLORS, shadowStyle, useAppColors } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { useActivePlan, FEATURES, canAccess } from '../utils/premium';
import { YearlySkeleton } from '../components/SkeletonLoader';
import { StaggeredEntrance } from '../components/primitives';

const CHART_H = 180;
const BAR_WIDTH = 22;
const BAR_GAP = 6;
const PAD_L = 28;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 30;

const fmtINR = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
};

type Monthly = {
  label: string;
  month_num: number;
  year: number;
  income: number;
  expense: number;
  savings: number;
  savings_rate: number;
  txn_count: number;
  top_category: string | null;
};

function BarChart({ data }: { data: Monthly[] }) {
  const s = useStyles();
  const c = useAppColors();
  const [selected, setSelected] = useState<number | null>(null);
  const { maxVal, chartW } = useMemo(() => {
    const maxVal = Math.max(1, ...data.flatMap(d => [d.income, d.expense]));
    const chartW = PAD_L + PAD_R + data.length * (BAR_WIDTH + BAR_GAP);
    return { maxVal, chartW };
  }, [data]);

  const plotH = CHART_H - PAD_T - PAD_B;
  const gridValues = [0.25, 0.5, 0.75, 1];

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={Math.max(chartW, 340)} height={CHART_H}>
          {/* Grid lines */}
          {gridValues.map((g, i) => {
            const y = PAD_T + plotH * (1 - g);
            return (
              <React.Fragment key={i}>
                <Line x1={PAD_L} y1={y} x2={chartW - PAD_R} y2={y} stroke={COLORS.border.subtle} strokeDasharray="3,3" strokeWidth={1} />
                <SvgText x={4} y={y + 4} fontSize={9} fill={COLORS.text.muted} fontWeight="600">{fmtINR(maxVal * g)}</SvgText>
              </React.Fragment>
            );
          })}

          {/* Bars */}
          {data.map((m, i) => {
            const x = PAD_L + i * (BAR_WIDTH + BAR_GAP);
            const incomeH = (m.income / maxVal) * plotH;
            const expenseH = (m.expense / maxVal) * plotH;
            const halfW = (BAR_WIDTH - 2) / 2;
            const isSel = selected === i;
            return (
              <React.Fragment key={i}>
                {/* Income bar (green, left half) */}
                <Rect
                  x={x}
                  y={PAD_T + (plotH - incomeH)}
                  width={halfW}
                  height={incomeH}
                  fill={isSel ? c.accent.moneyIn : c.state.success}
                  rx={2}
                  onPress={() => setSelected(i === selected ? null : i)}
                />
                {/* Expense bar (red, right half) */}
                <Rect
                  x={x + halfW + 2}
                  y={PAD_T + (plotH - expenseH)}
                  width={halfW}
                  height={expenseH}
                  fill={isSel ? c.accent.moneyOut : c.state.danger}
                  rx={2}
                  onPress={() => setSelected(i === selected ? null : i)}
                />
                {/* Month label */}
                <SvgText
                  x={x + BAR_WIDTH / 2}
                  y={CHART_H - 14}
                  fontSize={9}
                  fill={isSel ? COLORS.text.primary : COLORS.text.muted}
                  fontWeight={isSel ? '800' : '600'}
                  textAnchor="middle"
                >
                  {m.label.split(' ')[0]}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>

      {/* Legend */}
      <View style={s.legendRow}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: c.state.success }]} />
          <Text style={s.legendText}>Income</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: c.state.danger }]} />
          <Text style={s.legendText}>Expense</Text>
        </View>
      </View>

      {selected !== null && data[selected] && (
        <View style={s.selectedCard}>
          <Text style={s.selectedLabel}>{data[selected].label}</Text>
          <View style={s.selectedGrid}>
            <View style={s.selectedCell}>
              <Text style={[s.selectedVal, { color: c.state.success }]}>{fmtINR(data[selected].income)}</Text>
              <Text style={s.selectedSub}>Income</Text>
            </View>
            <View style={s.selectedCell}>
              <Text style={[s.selectedVal, { color: c.state.danger }]}>{fmtINR(data[selected].expense)}</Text>
              <Text style={s.selectedSub}>Expense</Text>
            </View>
            <View style={s.selectedCell}>
              <Text style={[s.selectedVal, { color: c.accent.brandDeeper }]}>{data[selected].savings_rate}%</Text>
              <Text style={s.selectedSub}>Saved</Text>
            </View>
          </View>
          {data[selected].top_category && (
            <Text style={s.selectedTop}>Top: {data[selected].top_category}</Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function YearlyDashboard() {
  const s = useStyles();
  const tc = useAppColors(); // 'tc' to avoid shadow with map-iter `c` below
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plan] = useActivePlan();
  const locked = !canAccess(FEATURES.YEARLY_DASHBOARD, plan);

  const load = async () => {
    try {
      const res = await api.get('/analytics/yearly');
      setData(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    if (locked) { setLoading(false); return; }
    load();
  }, [locked]);

  if (locked) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Yearly Dashboard</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 0, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="lock-closed" size={32} color={COLORS.accent.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center', marginBottom: 8 }}>Yearly Dashboard is Premium</Text>
          <Text style={{ fontSize: 13, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 19, maxWidth: 300, marginBottom: 20 }}>
            See 12-month breakdown, momentum trends, category analysis, and year-end highlights.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text.muted }}>Unlock with</Text>
            <View style={{ backgroundColor: COLORS.accent.primary + '15', borderColor: COLORS.accent.primary, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.accent.primary }}>📊 Standard · ₹99/mo</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/premium' as any)}
            activeOpacity={0.85}
            style={{ backgroundColor: COLORS.accent.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>Upgrade to unlock</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <YearlySkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Yearly Dashboard</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={tc.accent.brandDeeper} />}
      >
        <StaggeredEntrance delayMs={65} duration={420} distance={14}>
        {/* Hero headline */}
        {/* Hero — yearly brand gradient (deep indigo-orange, intentional brand identity per Round 50). */}
        <View style={[s.hero, { backgroundColor: '#0A0A0A' }]}>
          <Text style={s.heroLabel}>{data?.label || 'Last 12 months'}</Text>
          <Text style={s.heroHeadline}>{data?.headline}</Text>
          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={s.heroStatV}>{fmtINR(data?.yearly?.income || 0)}</Text>
              <Text style={s.heroStatL}>Income</Text>
            </View>
            <View style={s.heroDiv} />
            <View style={s.heroStat}>
              <Text style={s.heroStatV}>{fmtINR(data?.yearly?.expense || 0)}</Text>
              <Text style={s.heroStatL}>Spent</Text>
            </View>
            <View style={s.heroDiv} />
            <View style={s.heroStat}>
              <Text style={s.heroStatV}>{data?.yearly?.savings_rate || 0}%</Text>
              <Text style={s.heroStatL}>Saved</Text>
            </View>
          </View>
        </View>

        {/* Bar chart */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📊 Monthly breakdown</Text>
          <Text style={s.cardSub}>Tap a month to see details</Text>
          {data?.monthly && <BarChart data={data.monthly} />}
        </View>

        {/* Momentum */}
        {data?.momentum && data.yearly.expense > 0 && (
          <View style={[s.card, { backgroundColor: data.momentum.direction === 'falling' ? tc.state.successBg : data.momentum.direction === 'rising' ? tc.state.dangerBg : tc.bg.secondary }]}>
            <View style={s.momentumRow}>
              <Ionicons
                name={data.momentum.direction === 'rising' ? 'trending-up' : data.momentum.direction === 'falling' ? 'trending-down' : 'remove'}
                size={22}
                color={data.momentum.direction === 'rising' ? tc.state.danger : data.momentum.direction === 'falling' ? tc.state.success : tc.text.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.momentumTitle}>Momentum · {data.momentum.direction.toUpperCase()}</Text>
                <Text style={s.momentumDetail}>{data.momentum.commentary}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Top categories */}
        {data?.top_categories?.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🥇 Top spending categories</Text>
            {data.top_categories.map((c: any, i: number) => (
              <View key={i} style={s.catRow}>
                <View style={s.catRank}>
                  <Text style={s.catRankNum}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.catName}>{c.name}</Text>
                  <View style={s.catBar}>
                    <View style={[s.catBarFill, { width: `${c.pct}%`, backgroundColor: ['#E65100', '#EC4899', COLORS.accent.secondary, COLORS.state.successAlt, '#3B82F6'][i] }]} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.catAmt}>{fmtINR(c.amount)}</Text>
                  <Text style={s.catPct}>{c.pct}%</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Highlights */}
        {data?.highlights && (data.highlights.highest_spend_month || data.highlights.best_savings_month) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>✨ Highlights</Text>
            {data.highlights.highest_spend_month && (
              <View style={s.highRow}>
                <Text style={s.highEmoji}>💸</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.highTitle}>Highest spend month</Text>
                  <Text style={s.highSub}>{data.highlights.highest_spend_month.label} · {fmtINR(data.highlights.highest_spend_month.expense)}</Text>
                </View>
              </View>
            )}
            {data.highlights.lowest_spend_month && (
              <View style={s.highRow}>
                <Text style={s.highEmoji}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.highTitle}>Lowest spend month</Text>
                  <Text style={s.highSub}>{data.highlights.lowest_spend_month.label} · {fmtINR(data.highlights.lowest_spend_month.expense)}</Text>
                </View>
              </View>
            )}
            {data.highlights.best_savings_month && (
              <View style={s.highRow}>
                <Text style={s.highEmoji}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.highTitle}>Best savings month</Text>
                  <Text style={s.highSub}>{data.highlights.best_savings_month.label} · {data.highlights.best_savings_month.savings_rate}% saved</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Averages */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📐 Monthly averages</Text>
          <View style={s.avgGrid}>
            <View style={s.avgCell}>
              <Text style={[s.avgVal, { color: tc.state.success }]}>{fmtINR(data?.yearly?.avg_monthly_income || 0)}</Text>
              <Text style={s.avgLbl}>Avg income/mo</Text>
            </View>
            <View style={s.avgDiv} />
            <View style={s.avgCell}>
              <Text style={[s.avgVal, { color: tc.state.danger }]}>{fmtINR(data?.yearly?.avg_monthly_spend || 0)}</Text>
              <Text style={s.avgLbl}>Avg spend/mo</Text>
            </View>
            <View style={s.avgDiv} />
            <View style={s.avgCell}>
              <Text style={[s.avgVal, { color: tc.accent.brandDeeper }]}>{data?.yearly?.txn_count || 0}</Text>
              <Text style={s.avgLbl}>Transactions</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
        </StaggeredEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: c.bg.elevated, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: c.text.primary, textAlign: 'center' },
  hero: { margin: 12, padding: 18, borderRadius: 0, ...shadowStyle(c.accent.brandDeeper, 6, 16, 0.25, 6) },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroHeadline: { color: c.bg.elevated, fontSize: 16, fontWeight: '800', marginTop: 4, lineHeight: 22 },
  heroStats: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatV: { color: c.bg.elevated, fontSize: 16, fontWeight: '900' },
  heroStatL: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  heroDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.3)', alignSelf: 'center' },
  /* Brand-tinted shadow + brand-tinted border are intentional per Round 50. */
  card: { backgroundColor: c.bg.elevated, margin: 12, padding: 16, borderRadius: 0, borderWidth: 1, borderColor: c.border.card, ...shadowStyle('#2E1F1A', 2, 10, 0.05, 2) },
  cardTitle: { fontSize: 15, fontWeight: '800', color: c.text.primary },
  cardSub: { fontSize: 11, color: c.text.muted, marginTop: 2, marginBottom: 10 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11, color: c.text.muted, fontWeight: '600' },
  /* Brand-tinted alpha border + soft fill — intentional warm-orange identity per Round 50. */
  selectedCard: { marginTop: 10, padding: 12, backgroundColor: c.bg.elevated, borderRadius: 0, borderWidth: 1, borderColor: c.accent.brandDeeper + '40' },
  selectedLabel: { fontSize: 13, fontWeight: '800', color: c.accent.brandDeeper, marginBottom: 8 },
  selectedGrid: { flexDirection: 'row' },
  selectedCell: { flex: 1, alignItems: 'center' },
  selectedVal: { fontSize: 14, fontWeight: '800' },
  selectedSub: { fontSize: 10, color: c.text.muted, fontWeight: '600', marginTop: 2 },
  selectedTop: { fontSize: 11, color: c.text.secondary, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  momentumRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  momentumTitle: { fontSize: 13, fontWeight: '800', color: c.text.primary, letterSpacing: 0.3 },
  momentumDetail: { fontSize: 12, color: c.text.secondary, marginTop: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  catRank: { width: 24, height: 24, borderRadius: 0, backgroundColor: c.accent.brandDeeper + '15', justifyContent: 'center', alignItems: 'center' },
  catRankNum: { fontSize: 11, fontWeight: '800', color: c.accent.brandDeeper },
  catName: { fontSize: 13, fontWeight: '700', color: c.text.primary },
  catBar: { height: 5, backgroundColor: c.bg.elevated, borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  catBarFill: { height: '100%', borderRadius: 999 },
  catAmt: { fontSize: 12, fontWeight: '800', color: c.text.primary },
  catPct: { fontSize: 10, fontWeight: '700', color: c.text.muted },
  highRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  highEmoji: { fontSize: 20 },
  highTitle: { fontSize: 12, fontWeight: '800', color: c.text.muted, letterSpacing: 0.3 },
  highSub: { fontSize: 13, fontWeight: '700', color: c.text.primary, marginTop: 2 },
  avgGrid: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  avgCell: { flex: 1, alignItems: 'center' },
  avgVal: { fontSize: 15, fontWeight: '800' },
  avgLbl: { fontSize: 11, fontWeight: '600', color: c.text.muted, marginTop: 2 },
  avgDiv: { width: 1, height: 32, backgroundColor: c.border.subtle },
}));
