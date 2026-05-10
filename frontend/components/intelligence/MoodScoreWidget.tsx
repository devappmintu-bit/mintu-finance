/**
 * components/intelligence/MoodScoreWidget.tsx — R118 SLICE A
 *
 * Visual representation of the user's 0-100 Money Mood Score.
 *
 * Compact home-screen variant:
 *   • Big mono numeral on the left (the score)
 *   • Band label + emoji + headline copy on the right
 *   • Tappable → opens an explainer sheet showing the 6 sub-scores
 *
 * Brutalist styles: hard ink frame, paper bg, mono numerals.
 * Tone: encouraging, never judgmental — copy mirrors backend headline.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useMoodScore, bandPalette, dragLabel, type MoodScore,
} from '../../hooks/useIntelligence';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_FONT } from '../../utils/brutalist';

function bandPaletteHelperUnused(_band: any): any { return null; } // placeholder, see relTime
void bandPaletteHelperUnused;

// Relative time formatter: "now" / "Xs ago" / "Xm ago" / "Xh ago" / "Xd ago"
function relTime(iso?: string): string {
  if (!iso) return 'recently';
  try {
    const t = new Date(iso).getTime();
    if (!t) return 'recently';
    const diffMs = Date.now() - t;
    if (diffMs < 0) return 'now';
    const sec = Math.round(diffMs / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.round(hr / 24);
    return `${d}d ago`;
  } catch { return 'recently'; }
}

// ─── Skeleton ────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <View style={[styles.card, styles.skeletonCard]}>
      <View style={styles.skeletonScore} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '60%' }]} />
      </View>
    </View>
  );
}

// ─── Main widget ─────────────────────────────────────────────
export default function MoodScoreWidget() {
  const { data, loading, error, refetch } = useMoodScore();
  const [open, setOpen] = useState(false);
  // Tick every 15s so the "Updated Xs ago" pill stays fresh without
  // triggering full re-fetches of the score.
  const [, forceTick] = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  // Pulse-in animation when fresh data arrives so the user notices
  // a live update (esp. after an SMS parse cache-bust).
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!data) return;
    pulse.setValue(0);
    Animated.timing(pulse, {
      toValue: 1, duration: 380, useNativeDriver: true,
    }).start();
  }, [data?.computed_at]);
  const pulseScale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.04, 1] });

  const palette = useMemo(
    () => (data ? bandPalette(data.band) : bandPalette('stable')),
    [data?.band],
  );

  if (loading && !data) return <SkeletonRow />;
  if (error || !data) return null; // honest fail-silent on first paint

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: palette.bg },
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Money mood score ${data.score} of 100, ${data.label}. Tap to see details.`}
      >
        {/* LEFT — Score block with ring (animated pulse on fresh data) */}
        <Animated.View
          style={[
            styles.scoreBox,
            { borderColor: palette.ring, transform: [{ scale: pulseScale }] },
          ]}
        >
          <Text style={[styles.scoreNum, { color: palette.ink }]}>{data.score}</Text>
          <Text style={[styles.scoreOver, { color: palette.ink }]}>/100</Text>
        </Animated.View>

        {/* RIGHT — Band + headline */}
        <View style={styles.right}>
          <View style={styles.bandRow}>
            <Text style={[styles.bandLabel, { color: palette.ink }]}>
              {data.label.toUpperCase()}
            </Text>
            <Text style={styles.bandEmoji}>{data.emoji}</Text>
            {/* Live freshness pill */}
            <View style={[styles.livePill, { borderColor: palette.ink }]}>
              <View style={[styles.liveDot, { backgroundColor: palette.ring }]} />
              <Text style={[styles.liveTxt, { color: palette.ink }]}>
                {relTime(data.computed_at)}
              </Text>
            </View>
          </View>
          <Text style={[styles.headline, { color: palette.ink }]} numberOfLines={2}>
            {data.headline}
          </Text>
          <View style={styles.footRow}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                router.push('/insights' as any);
              }}
              hitSlop={8}
            >
              <Text style={[styles.footLink, { color: palette.ink }]}>FULL REPORT →</Text>
            </Pressable>
            <Ionicons name="chevron-forward" size={14} color={palette.ink} />
          </View>
        </View>
      </Pressable>

      {/* Detail sheet */}
      <MoodDetailSheet
        visible={open}
        onClose={() => setOpen(false)}
        data={data}
        onRefresh={refetch}
      />
    </>
  );
}

// ─── Detail sheet (sub-scores breakdown) ─────────────────────
function MoodDetailSheet({
  visible, onClose, data, onRefresh,
}: { visible: boolean; onClose: () => void; data: MoodScore; onRefresh?: () => void | Promise<void> }) {
  void onRefresh;
  const palette = bandPalette(data.band);

  const rows = useMemo(() => {
    const labels: Record<string, string> = {
      savings_trend:      'Savings trend',
      spending_stability: 'Spending stability',
      recurring_burden:   'Subscription load',
      impulse_behavior:   'Impulse behaviour',
      cash_runway:        'Cash runway',
      bill_safety:        'Bill safety',
    };
    return Object.entries(data.sub_scores).map(([k, v]) => ({
      key: k,
      label: labels[k] || k,
      pct: Math.round(v * 100),
      weight: Math.round((data.weights[k] ?? 0) * 100),
      isDrag: data.drags.includes(k),
    }));
  }, [data]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.modalScrim}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={[styles.sheetHero, { backgroundColor: palette.bg, borderBottomColor: palette.ring }]}>
            <View style={styles.sheetHeroRow}>
              <View>
                <Text style={[styles.sheetKicker, { color: palette.ink }]}>MONEY MOOD</Text>
                <Text style={[styles.sheetScore, { color: palette.ink }]}>
                  {data.score} <Text style={[styles.sheetScoreSub, { color: palette.ink }]}>/100</Text>
                </Text>
                <Text style={[styles.sheetBand, { color: palette.ink }]}>
                  {data.emoji}  {data.label}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={BR_COLORS.ink} />
              </Pressable>
            </View>
            <Text style={[styles.sheetHeadline, { color: palette.ink }]}>
              {data.headline}
            </Text>
          </View>

          <ScrollView style={styles.sheetScroll} contentContainerStyle={{ padding: BR_SPACE.lg }}>
            <Text style={styles.sectionLabel}>SUB-SCORES · 30D WINDOW</Text>

            {rows.map(r => (
              <View key={r.key} style={styles.subRow}>
                <View style={styles.subRowTop}>
                  <Text style={styles.subLabel}>{r.label}</Text>
                  <Text style={styles.subPct}>{r.pct}%</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${r.pct}%`,
                        backgroundColor: r.isDrag ? BR_COLORS.warning : palette.ring,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.subMeta}>
                  Weight {r.weight}%
                  {r.isDrag ? '  ·  pulling score down' : ''}
                </Text>
              </View>
            ))}

            {data.drags.length > 0 && (
              <View style={styles.dragsBox}>
                <Text style={styles.dragsTitle}>WHAT WE&apos;D NUDGE FIRST</Text>
                {data.drags.map(d => (
                  <Text key={d} style={styles.dragItem}>•  {dragLabel(d)}</Text>
                ))}
              </View>
            )}

            <Text style={styles.sourceFoot}>
              Computed from {data.tx_count} transactions over the last {data.window_days} days.
              No LLM — all signals are derived deterministically from your activity.
            </Text>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Compact home card
  card: {
    flexDirection: 'row',
    gap: BR_SPACE.lg,
    alignItems: 'center',
    padding: BR_SPACE.lg,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
  },
  cardPressed: { opacity: 0.85 },
  scoreBox: {
    width: 84,
    height: 84,
    borderWidth: 3,
    borderColor: BR_COLORS.ink,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -1,
    lineHeight: 38,
  },
  scoreOver: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: BR_FONT.mono,
    opacity: 0.8,
    marginTop: -2,
  },
  right: { flex: 1 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandLabel: { ...BR_TYPE.label, letterSpacing: 1.6, fontSize: 11 },
  bandEmoji: { fontSize: 16 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveTxt: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  headline: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  foot: { fontSize: 9, fontWeight: '900', letterSpacing: 1.6, opacity: 0.65 },
  footLink: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, opacity: 0.85 },

  // Skeleton
  skeletonCard: {
    backgroundColor: BR_COLORS.paperAlt,
    borderColor: BR_COLORS.line,
  },
  skeletonScore: {
    width: 84, height: 84,
    backgroundColor: BR_COLORS.line,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: BR_COLORS.line,
    width: '90%',
  },

  // Modal sheet
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: BR_COLORS.paper,
    borderTopWidth: 3,
    borderTopColor: BR_COLORS.ink,
  },
  sheetHero: {
    padding: BR_SPACE.lg,
    borderBottomWidth: 2,
  },
  sheetHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sheetKicker: { ...BR_TYPE.label, letterSpacing: 1.8, fontSize: 11 },
  sheetScore: {
    fontSize: 56,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -2,
    lineHeight: 60,
    marginTop: 2,
  },
  sheetScoreSub: { fontSize: 18, fontWeight: '700' },
  sheetBand: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  sheetHeadline: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    borderTopWidth: 1.5,
    borderTopColor: BR_COLORS.ink,
    opacity: 0.9,
  },
  closeBtn: {
    width: 32, height: 32,
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: { flex: 1 },
  sectionLabel: {
    ...BR_TYPE.label,
    color: BR_COLORS.muted,
    letterSpacing: 1.8,
    marginBottom: BR_SPACE.md,
  },

  // Sub-score row
  subRow: {
    paddingVertical: BR_SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: BR_COLORS.line,
  },
  subRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subLabel: { fontSize: 14, fontWeight: '700', color: BR_COLORS.ink },
  subPct: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    color: BR_COLORS.ink,
  },
  barTrack: {
    height: 6,
    backgroundColor: BR_COLORS.line,
    overflow: 'hidden',
  },
  barFill: { height: '100%' },
  subMeta: {
    fontSize: 10,
    color: BR_COLORS.muted,
    letterSpacing: 0.4,
    marginTop: 4,
  },

  // Drags
  dragsBox: {
    marginTop: BR_SPACE.lg,
    padding: BR_SPACE.md,
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
  },
  dragsTitle: {
    ...BR_TYPE.label,
    color: BR_COLORS.ink,
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  dragItem: {
    fontSize: 13,
    color: BR_COLORS.ink,
    fontWeight: '600',
    lineHeight: 20,
  },
  sourceFoot: {
    marginTop: BR_SPACE.lg,
    fontSize: 11,
    color: BR_COLORS.muted,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
