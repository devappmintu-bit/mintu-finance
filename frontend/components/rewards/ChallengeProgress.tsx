/**
 * components/rewards/ChallengeProgress.tsx — Round 73.
 *
 * Replaces the static "weekly challenge" card (just title + desc)
 * with a live progress tracker: "1/3 days completed" + animated
 * progress bar + finish-line emoji.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '../../utils/theme';

interface Props {
  title: string;
  desc?: string;
  current: number;
  target: number;
  unit?: string;
  pct?: number;            // 0-100; falls back to (current/target)*100
}

export default function ChallengeProgress({
  title, desc, current, target, unit = 'completed', pct,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const safeTarget = Math.max(1, target);
  const safePct = Math.max(0, Math.min(100, pct ?? Math.round((current / safeTarget) * 100)));
  const done = safePct >= 100;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: safePct / 100,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [safePct, progress]);

  const widthAnim = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconBox}>
          <Ionicons name={done ? 'checkmark-circle' : 'trophy'} size={18} color={done ? '#10B981' : '#F59E0B'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>WEEKLY CHALLENGE</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        <View style={[styles.ratioPill, done && styles.ratioPillDone]}>
          <Text style={[styles.ratioTxt, done && { color: '#FFFFFF' }]}>{current}/{target}</Text>
        </View>
      </View>

      {desc ? <Text style={styles.desc} numberOfLines={2}>{desc}</Text> : null}

      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: widthAnim }]}>
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0A' }]}
          />
        </Animated.View>
      </View>

      <Text style={styles.footTxt}>
        {done ? '🎉 Challenge complete — claim your reward' : `${current} of ${target} ${unit} · ${safePct}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: {
    width: 32, height: 32, borderRadius: 0,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: {
    fontSize: 9.5,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.4,
    color: COLORS.text.muted,
  },
  title: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
    marginTop: 1,
  },
  ratioPill: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  ratioPillDone: {
    backgroundColor: '#10B981',
  },
  ratioTxt: {
    fontSize: 12,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.1,
  },
  desc: {
    fontSize: 12.5,
    color: COLORS.text.secondary,
    lineHeight: 17,
  },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  footTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.text.secondary,
    letterSpacing: 0.1,
  },
});
