/**
 * MintU 2.0 — Dynamic Home Insights Card
 * Replaces static ₹0 cards with a rich, data-driven "Pulse" card featuring:
 * - MTD spend + savings rate
 * - 7-day animated sparkline (SVG)
 * - Pace prediction headline
 * - Top category badge + week-over-week % change
 * - Money Score tier with progress to next level
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {  COLORS, RADIUS, SPACING, shadowStyle, useAppColors, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type SparkPoint = { day: string; date: string; amount: number };
type Tier = { current: any; next: any | null; progress_pct: number; score: number; streak_days: number };

type Props = {
  snapshot: {
    mtd_spend: number;
    mtd_income: number;
    savings_rate: number;
    projected_month_end: number;
    daily_avg: number;
    day_of_month: number;
    days_in_month: number;
    sparkline: SparkPoint[];
    this_week_total: number;
    last_week_total: number;
    week_change_pct: number;
    top_category: { name: string; amount: number; pct: number } | null;
    pace_headline: string;
    pace_emoji: string;
    tier: Tier;
    transaction_count: number;
  };
  onPressSparkline?: () => void;
};

const CHART_W = 320;
const CHART_H = 70;
const PAD = 8;

const formatINR = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
};

const Sparkline: React.FC<{ points: SparkPoint[] }> = ({ points }) => {
  const s = useStyles();
  const c = useAppColors();
  const { polyPts, areaPts, maxPt, minPt, maxAmt } = useMemo(() => {
    if (!points || points.length === 0) return { polyPts: '', areaPts: '', maxPt: null, minPt: null, maxAmt: 0 };
    const amts = points.map(p => p.amount);
    const maxAmt = Math.max(...amts, 1);
    const stepX = (CHART_W - PAD * 2) / Math.max(points.length - 1, 1);
    const coords = points.map((p, i) => {
      const x = PAD + i * stepX;
      const y = CHART_H - PAD - ((p.amount / maxAmt) * (CHART_H - PAD * 2));
      return { x, y, ...p };
    });
    const polyPts = coords.map(c => `${c.x},${c.y}`).join(' ');
    const areaPts = `${PAD},${CHART_H} ${polyPts} ${CHART_W - PAD},${CHART_H}`;
    const maxPt = coords.reduce((a, b) => (b.amount > a.amount ? b : a), coords[0]);
    const minPt = coords.reduce((a, b) => (b.amount < a.amount && b.amount > 0 ? b : a), coords[0]);
    return { polyPts, areaPts, maxPt, minPt, maxAmt };
  }, [points]);

  if (!polyPts) return null;

  return (
    <View style={s.sparkWrap}>
      <Svg width={CHART_W} height={CHART_H}>
        <Defs>
          <View id="sparkFill" x1="0" y1="0" x2="0" y2="1" style={{ backgroundColor: '#0A0A0A' }}>
            <Stop offset="0" stopColor={COLORS.accent.primary} stopOpacity="0.25" />
            <Stop offset="1" stopColor={COLORS.accent.primary} stopOpacity="0" />
          </View>
        </Defs>
        <Polygon points={areaPts} fill="url(#sparkFill)" />
        <Polyline
          points={polyPts}
          fill="none"
          stroke={COLORS.accent.primary}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {maxPt && maxPt.amount > 0 && (
          <Circle cx={maxPt.x} cy={maxPt.y} r={4} fill={COLORS.accent.primary} stroke={COLORS.bg.secondary} strokeWidth={2} />
        )}
      </Svg>
      <View style={s.sparkLabels}>
        {points.map((p, i) => (
          <Text key={i} style={s.sparkLabel} numberOfLines={1}>{p.day[0]}</Text>
        ))}
      </View>
    </View>
  );
};

export default function InsightsCard({ snapshot, onPressSparkline }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const { mtd_spend, mtd_income, savings_rate, sparkline, pace_headline, pace_emoji, top_category, week_change_pct, this_week_total, tier, transaction_count } = snapshot;
  const weekTrendDown = week_change_pct < 0;
  const hasData = transaction_count > 0;

  return (
    <View style={s.card}>
      {/* Header: Tier + Score */}
      <View style={s.tierRow}>
        <View style={[s.tierBadge, { backgroundColor: tier.current.color + '18', borderColor: tier.current.color + '45' }]}>
          <Text style={s.tierEmoji}>{tier.current.emoji}</Text>
          <Text style={[s.tierName, { color: tier.current.color }]}>{tier.current.name}</Text>
        </View>
        <View style={s.scorePill}>
          <Text style={s.scoreNum}>{tier.score}</Text>
          <Text style={s.scoreMax}>/100</Text>
        </View>
      </View>

      {/* Progress to next tier */}
      {tier.next && (
        <View style={s.progressBlock}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${tier.progress_pct}%`, backgroundColor: tier.current.color }]} />
          </View>
          <View style={s.progressLabelRow}>
            <Text style={s.progressLabel}>Next: {tier.next.emoji} {tier.next.name}</Text>
            <Text style={s.progressLabelR}>{tier.next.min - tier.score} pts to go</Text>
          </View>
        </View>
      )}

      {/* Pace headline */}
      <View style={s.paceBox}>
        <Text style={s.paceEmoji}>{pace_emoji}</Text>
        <Text style={s.paceText}>{pace_headline}</Text>
      </View>

      {/* Sparkline */}
      {hasData ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onPressSparkline}>
          <View style={s.sparkHeader}>
            <View>
              <Text style={s.sparkTitle}>Last 7 days</Text>
              <Text style={s.sparkSub}>{formatINR(this_week_total)} spent</Text>
            </View>
            {snapshot.last_week_total > 0 && (
              <View style={[s.trendPill, { backgroundColor: weekTrendDown ? COLORS.accent.moneyIn + '1E' : COLORS.accent.primary + '1E' }]}>
                <Ionicons name={weekTrendDown ? 'trending-down' : 'trending-up'} size={12} color={weekTrendDown ? COLORS.accent.moneyIn : COLORS.accent.primary} />
                <Text style={[s.trendText, { color: weekTrendDown ? COLORS.accent.moneyIn : COLORS.accent.primary }]}>
                  {weekTrendDown ? '' : '+'}{week_change_pct.toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
          <Sparkline points={sparkline} />
        </TouchableOpacity>
      ) : (
        <View style={s.emptySparkBox}>
          <Ionicons name="bar-chart-outline" size={24} color={COLORS.text.muted} />
          <Text style={s.emptySparkText}>Track 5+ transactions to unlock spending trends</Text>
        </View>
      )}

      {/* Footer Stats */}
      <View style={s.statsGrid}>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Spent</Text>
          <Text style={[s.statVal, { color: COLORS.accent.primary }]}>{formatINR(mtd_spend)}</Text>
        </View>
        <View style={s.statDiv} />
        <View style={s.statCell}>
          <Text style={s.statLabel}>Savings</Text>
          <Text style={[s.statVal, { color: savings_rate >= 20 ? COLORS.state.successAlt : COLORS.accent.secondary }]}>{savings_rate.toFixed(0)}%</Text>
        </View>
        <View style={s.statDiv} />
        <View style={s.statCell}>
          <Text style={s.statLabel}>{top_category ? 'Top' : 'Streak'}</Text>
          <Text style={[s.statVal, { color: COLORS.accent.primary }]} numberOfLines={1}>
            {top_category ? top_category.name : `${tier.streak_days}d 🔥`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  // Round 56 — Glassmorphic card. Translucent white on the warm canvas
  // (#FAFAF9) with a hairline border for the iOS-Crystal effect. Falls
  // back gracefully on Android (opacity handled by alpha channel).
  card: {
    backgroundColor: GLASS.solidBg,
    borderRadius: 0,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderLight,
    ...shadowStyle('#111827', 4, 18, 0.05, 3),
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0, borderWidth: 1 },
  tierEmoji: { fontSize: 15 },
  tierName: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  scorePill: { flexDirection: 'row', alignItems: 'baseline' },
  scoreNum: { fontSize: 26, fontWeight: '900', color: c.text.primary },
  scoreMax: { fontSize: 13, fontWeight: '700', color: c.text.muted },
  progressBlock: { marginBottom: 14 },
  progressTrack: { height: 6, backgroundColor: c.border.subtle, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressLabel: { fontSize: 11, fontWeight: '600', color: c.text.muted },
  progressLabelR: { fontSize: 11, fontWeight: '700', color: c.text.secondary },
  paceBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: c.accent.primary + '08', borderRadius: 0, marginBottom: 14 },
  paceEmoji: { fontSize: 18 },
  paceText: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text.primary, lineHeight: 18 },
  sparkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sparkTitle: { fontSize: 12, fontWeight: '700', color: c.text.muted, letterSpacing: 0.5 },
  sparkSub: { fontSize: 16, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0 },
  trendText: { fontSize: 11, fontWeight: '800' },
  sparkWrap: { alignItems: 'center', marginVertical: 6 },
  sparkLabels: { flexDirection: 'row', justifyContent: 'space-between', width: CHART_W - PAD * 2, marginTop: 2, paddingHorizontal: PAD },
  sparkLabel: { flex: 1, fontSize: 10, color: c.text.muted, fontWeight: '600', textAlign: 'center' },
  emptySparkBox: { alignItems: 'center', padding: 20, backgroundColor: c.bg.elevated, borderRadius: 0, marginVertical: 10, gap: 8 },
  emptySparkText: { fontSize: 12, color: c.text.muted, fontWeight: '500', textAlign: 'center' },
  statsGrid: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border.subtle, marginTop: 4 },
  statCell: { flex: 1, alignItems: 'center', gap: 3 },
  statLabel: { fontSize: 10, fontWeight: '700', color: c.text.muted, letterSpacing: 0.5 },
  statVal: { fontSize: 15, fontWeight: '800' },
  statDiv: { width: 1, height: 28, backgroundColor: c.border.subtle },
}));
