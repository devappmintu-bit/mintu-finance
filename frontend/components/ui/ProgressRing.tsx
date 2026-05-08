/**
 * ProgressRing — a polished, animated SVG progress ring.
 *
 * Why this exists
 *   The legacy goals.tsx had a private static ring with no animation.
 *   This shared, animated ring can be reused across:
 *     • Goals  ("64% saved")
 *     • Profile MoneyScoreCard  (score progress to next tier)
 *     • Daily Quest cards (XP fill)
 *     • Onboarding completion meter
 *
 * Features
 *   • Smooth fill animation (Reanimated 4 worklet, 60fps)
 *   • Optional inner percentage label
 *   • Optional centered children (e.g. emoji)
 *   • Track + fill colors, stroke width, size, label visibility, all configurable
 *   • Accessibility: progressbar role + announces percentage to screen readers
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  /** 0–100 */
  pct: number;
  /** Outer diameter in pts */
  size?: number;
  /** Stroke width in pts */
  stroke?: number;
  /** Fill color (filled portion) */
  color?: string;
  /** Track color (background ring) */
  trackColor?: string;
  /** Show "<n>%" inside the ring */
  showLabel?: boolean;
  /** Optional override for the label color (default: fill color) */
  labelColor?: string;
  /** Replace the percentage label with custom content (e.g. an emoji) */
  children?: React.ReactNode;
  /** Tween duration (ms) */
  duration?: number;
  /** Accessibility label override */
  a11yLabel?: string;
};

function ProgressRing({
  pct,
  size = 88,
  stroke = 8,
  color = '#F56E1E',
  trackColor = '#F3F4F6',
  showLabel = false,
  labelColor,
  children,
  duration = 800,
  a11yLabel = 'Progress',
}: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePct = Math.max(0, Math.min(100, pct));

  // Animated value — drives strokeDashoffset.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(safePct, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [safePct, duration, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (circumference * progress.value) / 100,
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(safePct) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Animated fill */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // Start from 12 o'clock, sweep clockwise.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {/* Center content overlay */}
      <View style={[StyleSheet.absoluteFillObject, styles.center]} pointerEvents="none">
        {children ? (
          children
        ) : showLabel ? (
          <Text
            style={[
              styles.label,
              { color: labelColor || color, fontSize: Math.round(size * 0.26) },
            ]}
            numberOfLines={1}
          >
            {Math.round(safePct)}%
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '900', letterSpacing: -0.5 },
});

export default React.memo(ProgressRing);
