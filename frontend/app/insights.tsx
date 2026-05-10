/**
 * app/insights.tsx — R118 SLICE A POLISH+
 *
 * "Full Report" — a single full-screen brief aggregating EVERYTHING
 * the Real-Time SMS Intelligence Engine knows about the user, pulled
 * from all 4 deterministic R118 endpoints:
 *
 *   • /api/intelligence/mood-score      → composite 0–100 dial
 *   • /api/intelligence/behavior        → 4 behavioural patterns
 *   • /api/intelligence/cashflow        → predictive EOM projection
 *   • /api/intelligence/subscriptions   → recurring drips
 *
 * Plus a Money Story shortcut.
 *
 * Tone: encouraging, never judgmental. NO LLM — every number is
 * deterministically derived from the user's own activity, sourced
 * with a "Why am I seeing this?" footer at the bottom.
 *
 * Layout:
 *   [HERO]      Mood score + headline copy + sub-score sparkline
 *   [PROJECTED] Cashflow EOM strip (if available)
 *   [PATTERNS]  Top 2 active behaviour insights
 *   [SUBS]      Intelligence subscriptions summary tile
 *   [STORY]     Money Story shortcut tile
 *   [FOOTER]    Source/transparency disclosure
 */
import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useMoodScore, useBehavior, useCashflow, useIntelligenceSubs,
  useMoneyStory, bandPalette,
} from '../hooks/useIntelligence';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_FONT } from '../utils/brutalist';

const KIND_PALETTE: Record<string, { bg: string; ink: string; ring: string }> = {
  late_night_impulse: { bg: '#E5DAFE', ink: '#2A1A66', ring: '#5840CC' },
  weekend_overspend:  { bg: '#FFE4B8', ink: '#5A2D00', ring: '#E07B00' },
  payday_inflation:   { bg: '#FFE0E8', ink: '#660A2C', ring: '#C7244D' },
  stress_pattern:     { bg: '#D6EFFF', ink: '#0A3A66', ring: '#1865B5' },
};

function fmtINR(n?: number, opts: { signed?: boolean; showZero?: boolean } = {}): string {
  if (n === undefined || n === null) return '—';
  if (!opts.showZero && n === 0) return '—';
  const sign = n < 0 ? '-' : (opts.signed ? '+' : '');
  return `${sign}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
}

export default function InsightsScreen() {
  const mood = useMoodScore();
  const behavior = useBehavior();
  const cashflow = useCashflow();
  const subs = useIntelligenceSubs();
  const story = useMoneyStory();

  const anyLoading = mood.loading || behavior.loading || cashflow.loading || subs.loading;
  const refresh = () => Promise.all([
    mood.refetch(), behavior.refetch(), cashflow.refetch(),
    subs.refetch(), story.refetch(),
  ]);

  const moodPalette = useMemo(
    () => mood.data ? bandPalette(mood.data.band) : bandPalette('stable'),
    [mood.data?.band],
  );

  const topPatterns = useMemo(
    () => (behavior.data?.insights || []).filter(i => i.is_active).slice(0, 2),
    [behavior.data?.insights],
  );

  const txCount = useMemo(() => {
    return Math.max(
      mood.data?.tx_count ?? 0,
      cashflow.data?.tx_count ?? 0,
      behavior.data?.tx_count ?? 0,
    );
  }, [mood.data?.tx_count, cashflow.data?.tx_count, behavior.data?.tx_count]);

  // First-load shell
  if (anyLoading && !mood.data && !cashflow.data && !behavior.data) {
    return (
      <SafeAreaView style={styles.loadingSafe} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={BR_COLORS.ink} />
        <Text style={styles.loadingTxt}>Compiling your full report…</Text>
      </SafeAreaView>
    );
  }

  // Empty UX (no transactions yet)
  if (!mood.data && !cashflow.data) {
    return (
      <SafeAreaView style={styles.loadingSafe} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BR_COLORS.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Full report</Text>
        </View>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Your report is forming</Text>
          <Text style={styles.emptyBody}>
            Track a few transactions and the Intelligence Engine will start
            composing your mood, projections, and behaviour patterns. Nothing
            here is invented — every number comes from your own activity.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BR_COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerKicker}>R118 INTELLIGENCE</Text>
          <Text style={styles.headerTitle}>Full report</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>LIVE</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollPad}
        refreshControl={<RefreshControl refreshing={anyLoading} onRefresh={refresh} />}
      >
        {/* ── HERO — Mood ──────────────────────────────── */}
        {mood.data && (
          <View style={[styles.heroBlock, { backgroundColor: moodPalette.bg }]}>
            <Text style={[styles.heroKicker, { color: moodPalette.ink }]}>
              MONEY MOOD · {mood.data.window_days}D WINDOW
            </Text>
            <View style={styles.heroBigRow}>
              <Text style={[styles.heroBigNum, { color: moodPalette.ink }]}>
                {mood.data.score}
              </Text>
              <Text style={[styles.heroBigOver, { color: moodPalette.ink }]}>/100</Text>
              <View style={{ flex: 1 }} />
              <Text style={[styles.heroBand, { color: moodPalette.ink }]}>
                {mood.data.emoji}  {mood.data.label.toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.heroCopy, { color: moodPalette.ink }]}>
              {mood.data.headline}
            </Text>

            {/* Sub-score sparkline */}
            <View style={styles.subBars}>
              {Object.entries(mood.data.sub_scores).map(([k, v]) => {
                const isDrag = mood.data!.drags.includes(k);
                return (
                  <View key={k} style={styles.subBarCol}>
                    <View style={[styles.subBarTrack]}>
                      <View
                        style={[
                          styles.subBarFill,
                          {
                            height: `${Math.round(v * 100)}%`,
                            backgroundColor: isDrag ? BR_COLORS.warning : moodPalette.ring,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={[styles.subBarsLbl, { color: moodPalette.ink }]}>
              {/* Equal-spaced abbreviated labels — full forms in the
                  detail sheet (MoodScoreWidget). Keeps the sparkline
                  legible on 360-px Android screens. */}
              SAVE · STAB · BURDEN · IMPULSE · RUNWAY · BILLS
            </Text>
          </View>
        )}

        {/* ── PROJECTED — Cashflow ─────────────────────── */}
        {cashflow.data && cashflow.data.tx_count >= 3 && cashflow.data.avg_daily_burn > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              PROJECTED · {cashflow.data.days_to_eom}D LEFT THIS MONTH
            </Text>
            <View style={[
              styles.cashCard,
              { backgroundColor: cashflow.data.vibe === 'warm' ? '#DDF5E5' : '#D6EFFF' },
            ]}>
              <Text style={styles.cashBig}>
                {fmtINR(cashflow.data.projected_net, { signed: true })}
              </Text>
              <Text style={styles.cashLbl}>EOM NET</Text>
              <View style={styles.cashRow}>
                <Cell lbl="BURN/DAY" val={fmtINR(cashflow.data.avg_daily_burn)} />
                <Cell lbl="EOM SPEND" val={fmtINR(cashflow.data.projected_spend)} mid />
                <Cell lbl="EOM IN" val={fmtINR(cashflow.data.projected_in)} />
              </View>
              <Text style={styles.cashCopy}>{cashflow.data.copy}</Text>
              {cashflow.data.bill_alerts && cashflow.data.bill_alerts.length > 0 && (
                <View style={styles.billsCallout}>
                  <Ionicons name="alarm-outline" size={14} color={BR_COLORS.ink} />
                  <Text style={styles.billsTxt}>
                    {cashflow.data.bill_alerts.length} bill
                    {cashflow.data.bill_alerts.length === 1 ? '' : 's'} due in next 7 days
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── PATTERNS — Behaviour ─────────────────────── */}
        {topPatterns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              BEHAVIOUR · {behavior.data?.window_days}D WINDOW
            </Text>
            {topPatterns.map(p => {
              const palette = KIND_PALETTE[p.kind] || KIND_PALETTE.weekend_overspend;
              return (
                <View
                  key={p.kind}
                  style={[
                    styles.patternRow,
                    { backgroundColor: palette.bg, borderColor: palette.ink },
                  ]}
                >
                  <Text style={styles.patternEmoji}>{p.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.patternTitle, { color: palette.ink }]}>
                      {p.title.toUpperCase()}
                    </Text>
                    <Text style={[styles.patternSignal, { color: palette.ink }]}>
                      {p.signal_text}
                    </Text>
                    <Text style={[styles.patternCopy, { color: palette.ink }]} numberOfLines={2}>
                      {p.copy}
                    </Text>
                  </View>
                  <Text style={[styles.patternConf, { color: palette.ink }]}>
                    {Math.round(p.confidence * 100)}%
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── SUBS — Intelligence Subscriptions ────────── */}
        {subs.data && subs.data.summary.count > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SUBSCRIPTIONS · INTELLIGENCE ENGINE</Text>
            <Pressable
              onPress={() => router.push('/subscriptions' as any)}
              style={({ pressed }) => [
                styles.subsCard,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.subsRow}>
                <Cell lbl="DETECTED" val={String(subs.data.summary.count)} />
                <Cell lbl="MONTHLY" val={fmtINR(subs.data.summary.monthly_total)} mid />
                <Cell lbl="PER YEAR" val={fmtINR(subs.data.summary.annual_projection)} />
              </View>
              {subs.data.tone && <Text style={styles.subsTone}>{subs.data.tone}</Text>}
              <View style={styles.cardFooter}>
                <Text style={styles.cardFooterTxt}>OPEN VAULT</Text>
                <Ionicons name="chevron-forward" size={14} color={BR_COLORS.ink} />
              </View>
            </Pressable>
          </View>
        )}

        {/* ── STORY shortcut ───────────────────────────── */}
        {story.data && story.data.panels && story.data.panels.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RECAP</Text>
            <Pressable
              onPress={() => router.push('/money-story' as any)}
              style={({ pressed }) => [
                styles.storyCard,
                pressed && { transform: [{ translateY: 1 }] },
              ]}
            >
              <View style={styles.storyStamp}>
                <Text style={styles.storyStampTxt}>STORY</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storyMonth}>{story.data.month_label}</Text>
                <Text style={styles.storyTeaser} numberOfLines={2}>
                  {story.data.panels.find(p => p.kind === 'hero')?.copy || 'Tap to read your story'}
                </Text>
              </View>
              <Text style={styles.storyCount}>{story.data.panels.length}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Source disclosure footer ─────────────────── */}
        <View style={styles.disclosure}>
          <Text style={styles.disclosureHead}>WHY ARE YOU SEEING THIS?</Text>
          <Text style={styles.disclosureBody}>
            Every number on this page was computed deterministically from
            your last {behavior.data?.window_days ?? 60} days of transactions
            ({txCount} entries). No language model rewrote a single value.
            Mood, cashflow, behaviour patterns, and subscription detection
            are all open algorithms running on your own data — never sold,
            never shared.
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── tiny helper ────────────────────────────────
function Cell({ lbl, val, mid }: { lbl: string; val: string; mid?: boolean }) {
  return (
    <View style={[styles.metricCell, mid && styles.metricCellMid]}>
      <Text style={styles.metricLbl}>{lbl}</Text>
      <Text style={styles.metricVal}>{val}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.paper },
  loadingSafe: {
    flex: 1, backgroundColor: BR_COLORS.paper,
    alignItems: 'center', justifyContent: 'center', padding: BR_SPACE.xl,
  },
  loadingTxt: {
    marginTop: BR_SPACE.md,
    fontSize: 13, fontWeight: '700', letterSpacing: 1,
    color: BR_COLORS.muted,
  },
  emptyBox: {
    flex: 1,
    paddingHorizontal: BR_SPACE.xl,
    paddingTop: 60,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 22, fontWeight: '900', color: BR_COLORS.ink,
    letterSpacing: -0.5,
  },
  emptyBody: {
    fontSize: 14, color: BR_COLORS.muted,
    fontWeight: '600', lineHeight: 21, marginTop: 12,
  },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: BR_COLORS.line,
    gap: BR_SPACE.md,
  },
  backBtn: {
    width: 32, height: 32,
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  headerKicker: { ...BR_TYPE.label, fontSize: 9, letterSpacing: 1.6, color: BR_COLORS.muted },
  headerTitle: { fontSize: 18, fontWeight: '900', color: BR_COLORS.ink, letterSpacing: -0.4 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: BR_COLORS.positive,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BR_COLORS.positive },
  liveTxt: { fontSize: 9, fontWeight: '900', color: BR_COLORS.positive, letterSpacing: 0.8 },

  // Scroll
  scrollPad: { padding: BR_SPACE.lg, paddingTop: BR_SPACE.md },

  // HERO
  heroBlock: {
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
    marginBottom: BR_SPACE.lg,
  },
  heroKicker: { ...BR_TYPE.label, fontSize: 10, letterSpacing: 1.8 },
  heroBigRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 6,
  },
  heroBigNum: {
    fontSize: 56, fontWeight: '900', fontFamily: BR_FONT.mono,
    letterSpacing: -2.4, lineHeight: 60,
  },
  heroBigOver: {
    fontSize: 16, fontWeight: '900', fontFamily: BR_FONT.mono,
    paddingBottom: 10, letterSpacing: -0.4, opacity: 0.8,
  },
  heroBand: { fontSize: 14, fontWeight: '900', letterSpacing: 0.4, paddingBottom: 12 },
  heroCopy: {
    fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: BR_SPACE.sm,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: 1.5, borderTopColor: BR_COLORS.ink,
  },
  subBars: {
    flexDirection: 'row', height: 56, marginTop: BR_SPACE.md,
    gap: 6, alignItems: 'flex-end',
  },
  subBarCol: { flex: 1, height: '100%' },
  subBarTrack: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'flex-end',
  },
  subBarFill: { width: '100%' },
  subBarsLbl: {
    fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 6,
    opacity: 0.65, textAlign: 'left',
  },

  // Section
  section: { marginBottom: BR_SPACE.lg },
  sectionLabel: {
    ...BR_TYPE.label, fontSize: 10, color: BR_COLORS.muted,
    letterSpacing: 1.8, marginBottom: BR_SPACE.sm,
  },

  // Cash card
  cashCard: {
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
  },
  cashBig: {
    fontSize: 36, fontWeight: '900', fontFamily: BR_FONT.mono,
    color: BR_COLORS.ink, letterSpacing: -1.4, lineHeight: 40,
  },
  cashLbl: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1.4,
    color: BR_COLORS.ink, opacity: 0.7, marginTop: 2,
  },
  cashRow: {
    flexDirection: 'row',
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    borderTopWidth: 1.5, borderTopColor: BR_COLORS.ink,
  },
  cashCopy: {
    fontSize: 13, fontWeight: '600', color: BR_COLORS.ink,
    lineHeight: 18, marginTop: BR_SPACE.md,
  },
  billsCallout: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: BR_SPACE.sm,
  },
  billsTxt: {
    fontSize: 12, fontWeight: '700', color: BR_COLORS.ink,
    opacity: 0.85,
  },

  // Cells (shared)
  metricCell: { flex: 1 },
  metricCellMid: {
    paddingHorizontal: BR_SPACE.md,
    borderLeftWidth: 1.5, borderRightWidth: 1.5,
    borderColor: BR_COLORS.ink,
  },
  metricLbl: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1.4,
    color: BR_COLORS.ink, opacity: 0.7,
  },
  metricVal: {
    fontSize: 14, fontWeight: '900', fontFamily: BR_FONT.mono,
    color: BR_COLORS.ink, letterSpacing: -0.3, marginTop: 2,
  },

  // Pattern row
  patternRow: {
    flexDirection: 'row',
    gap: BR_SPACE.md,
    padding: BR_SPACE.md,
    borderWidth: 1.5,
    marginBottom: BR_SPACE.sm,
    alignItems: 'flex-start',
  },
  patternEmoji: { fontSize: 24, marginTop: 2 },
  patternTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  patternSignal: {
    fontSize: 14, fontWeight: '900', letterSpacing: -0.2, marginTop: 4,
    lineHeight: 18,
  },
  patternCopy: {
    fontSize: 12, fontWeight: '600', lineHeight: 16, marginTop: 4,
    opacity: 0.85,
  },
  patternConf: {
    fontSize: 12, fontWeight: '900', fontFamily: BR_FONT.mono,
    paddingTop: 2,
  },

  // Subs card
  subsCard: {
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg, backgroundColor: '#FFF1D2',
  },
  subsRow: { flexDirection: 'row' },
  subsTone: {
    fontSize: 12, fontWeight: '600', fontStyle: 'italic',
    color: BR_COLORS.ink, marginTop: BR_SPACE.md, lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.18)',
  },
  cardFooterTxt: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1.4,
    color: BR_COLORS.ink,
  },

  // Story card
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.md,
    padding: BR_SPACE.lg,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: '#FFF8DC',
  },
  storyStamp: {
    width: 48, height: 48,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  storyStampTxt: {
    fontSize: 10, fontWeight: '900',
    color: '#FFFFFF', letterSpacing: 1.0,
  },
  storyMonth: {
    fontSize: 16, fontWeight: '900',
    color: BR_COLORS.ink, letterSpacing: -0.3,
  },
  storyTeaser: {
    fontSize: 12, fontWeight: '600',
    color: BR_COLORS.ink, opacity: 0.85,
    lineHeight: 16, marginTop: 2,
  },
  storyCount: {
    fontSize: 22, fontWeight: '900',
    fontFamily: BR_FONT.mono,
    color: BR_COLORS.ink, letterSpacing: -1,
  },

  // Disclosure
  disclosure: {
    borderWidth: 1.5, borderColor: BR_COLORS.line,
    padding: BR_SPACE.md,
    backgroundColor: BR_COLORS.paperAlt,
    marginTop: BR_SPACE.md,
  },
  disclosureHead: {
    ...BR_TYPE.label, fontSize: 10, letterSpacing: 1.8,
    color: BR_COLORS.muted, marginBottom: 6,
  },
  disclosureBody: {
    fontSize: 11, lineHeight: 16,
    color: BR_COLORS.muted, fontStyle: 'italic',
  },
});
