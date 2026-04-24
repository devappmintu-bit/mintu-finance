/**
 * AnimatedStreak — lively streak-count display with a pulsing flame.
 *
 * Usage:
 *   <AnimatedStreak value={streakDays} size="md" />
 *
 * Behaviour:
 *   • Smooth count-up animation when the number changes (not a jarring jump).
 *   • Flame emoji scale/pulses on every increment (subtle 1 -> 1.25 -> 1 dance).
 *   • Auto color-shift by streak tier: rookie→grey, fire→orange, pro→red, legend→purple.
 *   • Milestone halo (7/14/30/100) turns the flame into a gold aura.
 *
 * Zero-dependency on reanimated; uses the built-in Animated API so it works
 * identically on iOS/Android/Web in the current MintU stack.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { makeStyles } from '../utils/makeStyles';

type Size = 'xs' | 'sm' | 'md' | 'lg';

interface Props {
  value: number;
  size?: Size;
  /** Show the days suffix, e.g. "days" or "🔥". */
  suffix?: string;
  /** Animate the first render too (off by default to avoid jarring load). */
  animateOnMount?: boolean;
  style?: any;
  testID?: string;
}

const TYPO: Record<Size, { num: number; emoji: number; label: number; gap: number }> = {
  xs: { num: 14, emoji: 14, label: 10, gap: 3 },
  sm: { num: 18, emoji: 18, label: 11, gap: 4 },
  md: { num: 24, emoji: 22, label: 12, gap: 6 },
  lg: { num: 36, emoji: 32, label: 13, gap: 8 },
};

function tierColor(days: number): string {
  if (days >= 100) return '#A855F7';  // purple — legend
  if (days >= 30) return '#EF4444';   // red — expert
  if (days >= 14) return '#F59E0B';   // amber
  if (days >= 7) return '#F56E1E';    // saffron
  if (days >= 3) return '#10B981';    // emerald — starter
  return '#6B7280';                    // gray — rookie
}

function isMilestone(days: number): boolean {
  return [3, 7, 14, 30, 50, 100].includes(days);
}

export default function AnimatedStreak({
  value, size = 'md', suffix = 'days', animateOnMount = false, style, testID,
}: Props) {
  const s = useStyles();
  const [display, setDisplay] = useState<number>(animateOnMount ? 0 : value);
  const prev = useRef<number>(animateOnMount ? 0 : value);
  const anim = useRef(new Animated.Value(animateOnMount ? 0 : value)).current;
  const flameScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value === prev.current) return;
    // Count-up animation
    anim.setValue(prev.current);
    Animated.timing(anim, {
      toValue: value, duration: 700, easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => { prev.current = value; });

    // Flame pulse — only on increment
    if (value > prev.current) {
      flameScale.setValue(1);
      Animated.sequence([
        Animated.timing(flameScale, { toValue: 1.35, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(flameScale, { toValue: 1, useNativeDriver: true, friction: 3 }),
      ]).start();

      // Halo on milestone days
      if (isMilestone(value)) {
        haloOpacity.setValue(0);
        Animated.sequence([
          Animated.timing(haloOpacity, { toValue: 1, duration: 250, useNativeDriver: false }),
          Animated.timing(haloOpacity, { toValue: 0, duration: 900, useNativeDriver: false }),
        ]).start();
      }
    }

    const listener = anim.addListener(({ value: v }) => setDisplay(Math.max(0, Math.round(v))));
    return () => anim.removeListener(listener);
  }, [value, anim, flameScale, haloOpacity]);

  const t = TYPO[size];
  const color = tierColor(display);

  return (
    <View style={[s.wrap, { gap: t.gap }, style]} testID={testID}>
      <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={[
            s.halo,
            {
              opacity: haloOpacity,
              shadowColor: '#FFD700',
              shadowOpacity: 0.9,
              shadowRadius: 12,
              backgroundColor: 'rgba(255, 215, 0, 0.25)',
              width: t.emoji * 2,
              height: t.emoji * 2,
              borderRadius: t.emoji,
            },
          ]}
        />
        <Animated.Text
          style={[{ fontSize: t.emoji, transform: [{ scale: flameScale }] }]}
        >
          🔥
        </Animated.Text>
      </View>
      <Text
        style={{
          fontSize: t.num,
          fontWeight: '800',
          color,
          letterSpacing: -0.4,
          fontVariant: ['tabular-nums'],
        }}
      >
        {display}
      </Text>
      {suffix ? (
        <Text style={{ fontSize: t.label, color, fontWeight: '600', letterSpacing: 0.3 }}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  halo: { position: 'absolute', top: -4, left: -4 },
}));
