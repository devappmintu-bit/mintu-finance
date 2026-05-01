/**
 * PinDot — Wave 5.7 unlock-screen polish primitive.
 *
 * Renders one of the 4 mPIN slots with a delightful ink-pop animation
 * when a digit is entered (scale 1 → 1.25 → 1 spring) and a smooth
 * error-fade when the `errored` flag flips on.
 *
 * Visual spec:
 *   • Empty  — hollow 18pt circle, subtle border, 56pt tall box
 *   • Filled — 10pt solid ink dot, scales up briefly on transition
 *   • Errored — ink + box border tint to crimson, no shape change
 *                 (parent screen owns the shake animation)
 *
 * Perf: React.memo-wrapped. useSharedValue + useAnimatedStyle so the
 * animation runs entirely on the UI thread — keypad taps stay 60fps
 * even on mid-tier Android.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring, Easing,
} from 'react-native-reanimated';
import { COLORS, RADIUS } from '../../utils/theme';

export interface PinDotProps {
  filled: boolean;
  errored?: boolean;
  size?: number;              // dot box side (default 56)
  testID?: string;
}

function PinDotImpl({ filled, errored = false, size = 56, testID }: PinDotProps) {
  const dotScale = useSharedValue(filled ? 1 : 0);
  const boxScale = useSharedValue(1);

  useEffect(() => {
    if (filled) {
      // Ink-pop: dot appears + overshoots, box subtly bounces
      dotScale.value = withSequence(
        withTiming(1.25, { duration: 120, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 12, stiffness: 180 }),
      );
      boxScale.value = withSequence(
        withTiming(1.05, { duration: 100 }),
        withSpring(1, { damping: 14, stiffness: 200 }),
      );
    } else {
      // Reset — small fade-out
      dotScale.value = withTiming(0, { duration: 140 });
    }
  }, [filled, dotScale, boxScale]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: Math.min(1, dotScale.value),
  }));
  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: boxScale.value }],
  }));

  const dotSize = Math.round(size * 0.18); // 10pt on a 56pt box

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.box,
        { width: size, height: size, borderRadius: RADIUS.lg },
        filled && styles.boxFilled,
        errored && styles.boxErrored,
        boxStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: errored ? COLORS.state.danger : COLORS.text.primary,
          },
          dotStyle,
        ]}
      />
    </Animated.View>
  );
}

export const PinDot = React.memo(PinDotImpl);
PinDot.displayName = 'PinDot';
export default PinDot;

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: '#FFFFFF',
  },
  boxFilled: {
    borderColor: COLORS.accent.primary,
    backgroundColor: '#FFFAF5',
  },
  boxErrored: {
    borderColor: COLORS.state.danger,
    backgroundColor: '#FFF5F5',
  },
  dot: {},
});
