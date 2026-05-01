/**
 * StreakMeter — Wave 5.5 primitive.
 *
 * 7-segment weekly-streak visualisation: M T W T F S S. Each segment
 * is either filled (check-in done that day), today (currently lit with
 * pulsing brand glow), or empty/grey (missed or not yet).
 *
 * Props:
 *   days     — array of 7 booleans, Monday → Sunday
 *   todayIdx — 0..6 (0 = Mon, 6 = Sun)
 *   streak   — current streak count (for headline)
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';

export interface StreakMeterProps {
  days: boolean[];  // exactly 7 entries, Mon→Sun
  todayIdx: number; // 0..6
  streak: number;
}

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function StreakMeterImpl({ days, todayIdx, streak }: StreakMeterProps) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  const safeDays = days.length === 7 ? days : [false, false, false, false, false, false, false];
  const safeToday = todayIdx >= 0 && todayIdx < 7 ? todayIdx : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headline}>
        <Text style={styles.emoji}>🔥</Text>
        <Text style={styles.streakText}>
          <Text style={styles.streakNum}>{streak}</Text>
          {streak === 1 ? ' day streak' : ' days streak'}
        </Text>
      </View>
      <View style={styles.row}>
        {LABELS.map((label, i) => {
          const filled = safeDays[i];
          const isToday = i === safeToday;
          return (
            <View key={i} style={styles.cell}>
              <View style={[styles.seg, filled && styles.segFilled, isToday && styles.segToday]}>
                {isToday && (
                  <Animated.View style={[styles.segGlow, pulseStyle]} pointerEvents="none" />
                )}
              </View>
              <Text style={[styles.label, (filled || isToday) && styles.labelActive]}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export const StreakMeter = React.memo(StreakMeterImpl);
StreakMeter.displayName = 'StreakMeter';
export default StreakMeter;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginHorizontal: SPACE.lg,
    marginVertical: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.subtle,
  },
  headline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACE.sm },
  emoji: { fontSize: 18 },
  streakText: { ...TYPO.bodySm, color: COLORS.text.primary },
  streakNum: { ...TYPO.h3, color: COLORS.accent.primary, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', flex: 1 },
  seg: {
    width: '82%',
    aspectRatio: 1,
    maxWidth: 36,
    maxHeight: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segFilled: {
    backgroundColor: COLORS.accent.brandSoft,
    borderColor: COLORS.accent.primary,
  },
  segToday: {
    backgroundColor: COLORS.accent.primary,
    borderColor: COLORS.accent.primaryDark,
  },
  segGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  label: {
    ...TYPO.caption,
    fontSize: 10,
    color: COLORS.text.muted,
    marginTop: 4,
  },
  labelActive: { color: COLORS.text.primary, fontWeight: '700' },
});
