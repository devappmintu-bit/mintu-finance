/**
 * AnimatedCoin — animated count-up display for the reward coin balance.
 *
 * Usage:
 *   <AnimatedCoin value={coinBalance} size="md" />
 *
 * When `value` changes (e.g., user earns a coin), the number smoothly
 * counts from the previous value to the new value over ~600ms with
 * ease-out easing — feels like a real-time bump instead of a jarring jump.
 *
 * Also emits a soft saffron glow pulse on change so coin pickups feel rewarding.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

type Size = 'xs' | 'sm' | 'md' | 'lg';

interface Props {
  value: number;
  size?: Size;
  /** Show the 🪩 coin emoji before the number. */
  showEmoji?: boolean;
  /** Duration of the count-up (ms). */
  duration?: number;
  style?: any;
}

const TYPO: Record<Size, { num: number; emoji: number; gap: number }> = {
  xs: { num: 12,  emoji: 11, gap: 3 },
  sm: { num: 14,  emoji: 13, gap: 4 },
  md: { num: 16,  emoji: 15, gap: 5 },
  lg: { num: 22,  emoji: 18, gap: 6 },
};

export default function AnimatedCoin({
  value, size = 'sm', showEmoji = true, duration = 600, style,
}: Props) {
  const s = useStyles();
  const [display, setDisplay] = useState<number>(value);
  const prev = useRef<number>(value);
  const anim = useRef(new Animated.Value(value)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value === prev.current) return;
    // Count-up animation
    anim.setValue(prev.current);
    Animated.timing(anim, {
      toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start(() => { prev.current = value; });
    // Glow pulse when value increases
    if (value > prev.current) {
      glow.setValue(0);
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad),  useNativeDriver: false }),
      ]).start();
    }
    const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(listener);
  }, [value, anim, glow, duration]);

  const t = TYPO[size];
  const bgOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] });

  return (
    <View style={[s.wrap, { gap: t.gap }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          s.glow,
          { backgroundColor: COLORS.accent.secondary, opacity: bgOpacity },
        ]}
      />
      {showEmoji && <Text style={{ fontSize: t.emoji }}>🪩</Text>}
      <Text style={{ fontSize: t.num, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.2 }}>
        {display.toLocaleString('en-IN')}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 },
}));
