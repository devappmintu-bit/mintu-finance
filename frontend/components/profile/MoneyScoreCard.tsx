/**
 * MoneyScoreCard — Round 58 Profile Revamp.
 *
 * The dominant element of the Profile screen. Replaces the small score
 * block tucked inside the old orange hero with an Apple-Wallet-class
 * statement card whose only job is to make the user's Money Score the
 * hero of the moment.
 *
 * Reasoning:
 *   • Score is rendered at 64pt — visually dwarfs every other element.
 *   • Segmented progress bar (10 tiles) gives a tactile sense of "how
 *     much further" instead of a flat fill.
 *   • Predictive insight + percentile share secondary lines below the
 *     bar — secondary, never competing with the score.
 *   • Tap → score breakdown sheet (existing).
 *   • Animation: score counts up from 0 on mount/focus to 60fps using
 *     useNativeDriver-friendly Animated.timing for a delightful first
 *     paint on every refresh.
 *
 * Pure presentational. Reuses tokens (GLASS, COLORS, shadowStyle).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, GLASS, shadowStyle } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

export interface MoneyScoreCardProps {
  /** 0..100 */
  score: number;
  predictiveInsight?: string | null;
  /** Optional — "better than X% users". Hidden when null. */
  percentile?: number | null;
  nextTier?: string | null;
  pointsToNext?: number | null;
  onTap: () => void;
  onLevelUp: () => void;
}

const SEGMENTS = 10;

function MoneyScoreCard({
  score, predictiveInsight, percentile, nextTier, pointsToNext,
  onTap, onLevelUp,
}: MoneyScoreCardProps) {
  const s = useStyles();
  const animScore = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  // Round 58b — stagger-fill animation. Each segment's opacity ramps
  // 0 → 1 with a 60ms offset so the bar fills left-to-right like a
  // satisfying loading bar. useNativeDriver=true (opacity is supported).
  const segOpacities = useRef(
    Array.from({ length: SEGMENTS }, () => new Animated.Value(0))
  ).current;

  // Round 58 — count-up animation. Capped at score. JS-driver because we
  // need to read the value out for text rendering. Fast (700ms) so the
  // user sees the final number quickly without skipping the delight.
  useEffect(() => {
    animScore.setValue(0);
    const listener = animScore.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });
    Animated.timing(animScore, {
      toValue: score,
      duration: 700,
      useNativeDriver: false,
    }).start();
    return () => animScore.removeListener(listener);
  }, [score, animScore]);

  // Stagger segment fills based on the live score.
  useEffect(() => {
    const filled = Math.round((Math.min(100, Math.max(0, score)) / 100) * SEGMENTS);
    // Reset then play.
    segOpacities.forEach((v) => v.setValue(0));
    Animated.stagger(
      55,
      segOpacities.slice(0, filled).map((v) =>
        Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: true })
      )
    ).start();
  }, [score, segOpacities]);

  const onPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
    onTap();
  };

  return (
    <View style={s.card}>
      {/* Top label */}
      <View style={s.topRow}>
        <Text style={s.label}>MONEY SCORE</Text>
        <TouchableOpacity onPress={onPress} hitSlop={8} activeOpacity={0.6}>
          <View style={s.tapHint}>
            <Text style={s.tapHintTxt}>Breakdown</Text>
            <Ionicons name="chevron-forward" size={12} color={COLORS.text.muted} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Score block — tappable */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={s.scoreBlock}>
        <View style={s.scoreRow}>
          <Text style={s.scoreNumber}>{displayScore}</Text>
          <Text style={s.scoreOf}>/ 100</Text>
        </View>

        {/* Segmented progress bar — staggered fill */}
        <View style={s.segmentRow}>
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <View key={i} style={s.segmentTrack}>
              <Animated.View
                style={[
                  s.segmentFill,
                  { opacity: segOpacities[i] },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Insight line — predictive */}
        {predictiveInsight ? (
          <View style={s.insightRow}>
            <Ionicons name="sparkles" size={12} color={COLORS.accent.brand} />
            <Text style={s.insightTxt} numberOfLines={2}>{predictiveInsight}</Text>
          </View>
        ) : null}

        {/* Secondary line — percentile + level up CTA */}
        <View style={s.secondaryRow}>
          {typeof percentile === 'number' && percentile > 0 ? (
            <Text style={s.secondaryTxt}>
              Better than <Text style={s.secondaryStrong}>{percentile}%</Text> of users
            </Text>
          ) : (
            <Text style={s.secondaryTxt}>
              {nextTier && pointsToNext
                ? <>+<Text style={s.secondaryStrong}>{pointsToNext} pts</Text> to {nextTier}</>
                : 'Keep logging to grow your score'
              }
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Level-up CTA — accent gradient lives ONLY here */}
      <TouchableOpacity
        style={s.cta}
        onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} onLevelUp(); }}
        activeOpacity={0.85}
        testID="profile-level-up"
      >
        <Ionicons name="trending-up" size={15} color="#FFFFFF" />
        <Text style={s.ctaTxt}>Boost my score</Text>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(MoneyScoreCard);

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: GLASS.solidBg,
    borderRadius: 0, padding: 20, marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    ...shadowStyle('#111827', 6, 24, 0.06, 4),
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '800', color: c.text.muted, letterSpacing: 1.2 },
  tapHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tapHintTxt: { fontSize: 11, color: c.text.muted, fontWeight: '700' },

  scoreBlock: { },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  scoreNumber: {
    fontSize: 64, lineHeight: 68, fontWeight: '900',
    color: c.text.primary, letterSpacing: -2,
  },
  scoreOf: { fontSize: 18, fontWeight: '700', color: c.text.muted, letterSpacing: -0.4 },

  segmentRow: { flexDirection: 'row', gap: 4, marginTop: 16 },
  segmentTrack: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: c.gray[200],
    overflow: 'hidden',
  },
  segmentFill: {
    width: '100%', height: '100%', backgroundColor: c.accent.primary,
  },

  insightRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14,
  },
  insightTxt: { flex: 1, fontSize: 13, color: c.text.primary, fontWeight: '500', lineHeight: 18 },

  secondaryRow: { marginTop: 6 },
  secondaryTxt: { fontSize: 12, color: c.text.muted, fontWeight: '500' },
  secondaryStrong: { color: c.text.primary, fontWeight: '800' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.accent.primary,
    paddingVertical: 12, borderRadius: 0, marginTop: 16,
    ...shadowStyle(c.accent.primary, 3, 10, 0.18, 4),
  },
  ctaTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.1 },
}));
