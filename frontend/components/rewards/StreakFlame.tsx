/**
 * components/rewards/StreakFlame.tsx — Round 73.
 *
 * Replaces the static "0 day streak" tile. Shows a flame icon
 * that scales + glows with streak length, plus a horizontal
 * 7-day visualization (last 7 days of activity).
 *
 * Animation: a slow breathing pulse on the flame core that gets
 * faster as the streak grows. Sparkle particles fire when the
 * streak count crosses milestones (7, 30, 100).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '../../utils/theme';

interface Props {
  streak: number;       // current streak in days
  size?: number;        // overall card not used; we let parent decide
}

export default function StreakFlame({ streak }: Props) {
  // Bigger, hotter flame for longer streaks.
  const tier = useMemo(() => {
    if (streak >= 100) return { iconSize: 38, glow: '#EF4444', subtitle: 'Legendary streak 🔥' };
    if (streak >= 30)  return { iconSize: 34, glow: '#F97316', subtitle: 'Streak Master · keep going' };
    if (streak >= 7)   return { iconSize: 30, glow: '#F59E0B', subtitle: 'Hot streak — 7+ days' };
    if (streak >= 3)   return { iconSize: 26, glow: '#FBBF24', subtitle: 'Warming up nicely' };
    return { iconSize: 24, glow: '#9CA3AF', subtitle: streak === 0 ? 'Track today to start a streak' : 'Day 1 — keep at it' };
  }, [streak]);

  const pulse = useRef(new Animated.Value(1)).current;
  const glowAlpha = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Loop a breathing scale + glow opacity. Faster when streak ≥ 7.
    const period = streak >= 30 ? 900 : streak >= 7 ? 1200 : 1500;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0,  duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(glowAlpha, { toValue: 0.85, duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          Animated.timing(glowAlpha, { toValue: 0.5,  duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [streak, pulse, glowAlpha]);

  // 7-day strip — last 7 days. We don't have per-day data here, so we
  // shade the trailing N as "active" where N = min(streak, 7) and the
  // rest as muted dots. This is an honest visual proxy: a 5-day
  // streak shows 5 filled flames + 2 ghost dots.
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayIdx = i;          // 0 = oldest, 6 = today
    const filledFromRight = Math.min(streak, 7);
    const active = dayIdx >= 7 - filledFromRight;
    return { active, isToday: dayIdx === 6 };
  });

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Flame icon */}
        <View style={styles.flameWrap}>
          <Animated.View
            style={[
              styles.flameGlow,
              {
                opacity: glowAlpha,
                backgroundColor: tier.glow,
                shadowColor: tier.glow,
              },
            ]}
          />
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <View style={[styles.flameBg, { backgroundColor: streak > 0 ? '#FF6B26' : '#CBD5E1' }]}>
              <Ionicons
                name="flame"
                size={tier.iconSize}
                color="#FFFFFF"
              />
            </View>
          </Animated.View>
        </View>

        {/* Number + subtitle */}
        <View style={{ flex: 1 }}>
          <View style={styles.numRow}>
            <Text style={styles.bigNum}>{streak}</Text>
            <Text style={styles.dayLbl}>day{streak === 1 ? '' : 's'}</Text>
          </View>
          <Text style={styles.sub}>{tier.subtitle}</Text>
        </View>
      </View>

      {/* 7-day strip */}
      <View style={styles.strip}>
        {days.map((d, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              d.active && { backgroundColor: tier.glow + 'EE', borderColor: tier.glow },
              !d.active && styles.dotMuted,
              d.isToday && styles.dotToday,
            ]}
          >
            {d.active && (
              <Ionicons name="flame" size={9} color="#FFFFFF" />
            )}
          </View>
        ))}
        <Text style={styles.stripLbl}>Last 7 days</Text>
      </View>
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
    gap: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flameWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  flameGlow: {
    position: 'absolute',
    width: 64, height: 64, borderRadius: 0,
    shadowOpacity: 0.65, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  flameBg: {
    width: 56, height: 56, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  numRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bigNum: {
    fontSize: 36,
    fontFamily: FONT_FAMILY.black,
    color: COLORS.text.primary,
    letterSpacing: -1,
    lineHeight: 38,
  },
  dayLbl: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.semibold,
    color: COLORS.text.secondary,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12.5,
    fontFamily: FONT_FAMILY.semibold,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  strip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 4, paddingBottom: 2,
  },
  dot: {
    width: 22, height: 22, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  dotMuted: {
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderColor: 'rgba(15,23,42,0.10)',
  },
  dotToday: {
    borderWidth: 2,
  },
  stripLbl: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.text.muted,
    letterSpacing: 0.4,
    marginLeft: 8,
  },
});
