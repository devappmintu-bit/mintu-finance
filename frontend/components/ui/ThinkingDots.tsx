/**
 * ThinkingDots — WhatsApp/iMessage-style animated dots that pulse one after
 * another. Used as a "typing" / "loading" indicator next to static text.
 *
 *   <ThinkingDots />
 *
 * Zero deps. Pure Animated API.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useAppColors } from '../../utils/theme';

export default function ThinkingDots({ color, size = 5 }: { color?: string; size?: number }) {
  const c = useAppColors();
  const dots = [useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current];

  useEffect(() => {
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.35, duration: 350, useNativeDriver: true }),
        ]),
      ).start();
    pulse(dots[0], 0);
    pulse(dots[1], 150);
    pulse(dots[2], 300);
  }, []);

  const dotColor = color || c.accent.primary;

  return (
    <View style={styles.row}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: dotColor,
              opacity: v,
              transform: [{ scale: v.interpolate({ inputRange: [0.35, 1], outputRange: [0.8, 1.15] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 },
  dot: {},
});
