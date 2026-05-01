/**
 * BudgetHealthRing — Wave 5.3 primitive.
 *
 * Full-width glass card with a large centered SVG ring whose fill pct
 * + stroke color interpolate live from emerald → saffron → crimson as
 * the user's monthly spend approaches their budget. Centre shows big
 * % text + `₹ spent / ₹ budget` caption. Tap to deep-link into the
 * category that's most over-budget.
 *
 * Perf: 100 % Reanimated on the UI thread. React.memo-wrapped. No
 * network I/O — pure presentation from parent state.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle,
  withTiming, Easing, interpolateColor,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SPACE, TYPO, ELEVATION } from '../../utils/theme';
import { MoneyNumber } from '../primitives/MoneyNumber';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface BudgetHealthRingProps {
  totalSpent: number;
  totalBudget: number;
  ringSize?: number;
  onPress?: () => void;
  subtitle?: string;
}

function BudgetHealthRingImpl({
  totalSpent, totalBudget, ringSize = 200, onPress, subtitle,
}: BudgetHealthRingProps) {
  const pct = useMemo(
    () => (totalBudget > 0 ? Math.min(1.2, totalSpent / totalBudget) : 0),
    [totalSpent, totalBudget]
  );

  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.value = withTiming(pct, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);

  // Stroke geometry
  const stroke = 14;
  const r = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clampedProgress = Math.min(1, pct);

  const animatedCircleProps = useAnimatedProps(() => {
    const clamped = Math.min(1, progress.value);
    return {
      strokeDashoffset: circumference * (1 - clamped),
      stroke: interpolateColor(
        progress.value,
        [0, 0.6, 0.85, 1],
        [COLORS.state.success, '#E8A80C', COLORS.accent.primary, COLORS.state.danger]
      ),
    };
  });

  const pctNumberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 0.6, 0.85, 1],
      [COLORS.state.success, '#D18B0B', COLORS.accent.primary, COLORS.state.danger]
    ),
  }));

  const over = totalSpent > totalBudget && totalBudget > 0;
  const percent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        ELEVATION.z2,
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${percent}% of budget used. ${over ? 'Over budget.' : 'On track.'}`}
      testID="budget-health-ring"
    >
      <View style={styles.ringWrap}>
        <Svg width={ringSize} height={ringSize}>
          {/* Track */}
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={r}
            stroke="rgba(15,23,42,0.06)"
            strokeWidth={stroke}
            fill="none"
          />
          {/* Progress */}
          <AnimatedCircle
            cx={ringSize / 2} cy={ringSize / 2} r={r}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            animatedProps={animatedCircleProps}
          />
        </Svg>
        <View style={styles.centre} pointerEvents="none">
          <Animated.Text style={[styles.pct, pctNumberStyle]}>
            {percent}%
          </Animated.Text>
          <Text style={styles.pctLabel}>of budget</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <MoneyNumber value={totalSpent} prefix="₹" style={styles.spent} duration={700} />
        <Text style={styles.divider}>/</Text>
        <Text style={styles.total}>₹{totalBudget.toLocaleString('en-IN')}</Text>
      </View>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </Pressable>
  );
}

export const BudgetHealthRing = React.memo(BudgetHealthRingImpl);
BudgetHealthRing.displayName = 'BudgetHealthRing';
export default BudgetHealthRing;

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS['3xl'],
    padding: SPACE.xl,
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.subtle,
  },
  ringWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  centre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pct: { ...TYPO.display, fontSize: 44, lineHeight: 46 },
  pctLabel: { ...TYPO.caption, color: COLORS.text.muted, marginTop: 2, textTransform: 'uppercase' },
  footer: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: SPACE.md },
  spent: { ...TYPO.h1, color: COLORS.text.primary },
  divider: { ...TYPO.h2, color: COLORS.text.muted },
  total: { ...TYPO.h2, color: COLORS.text.muted },
  sub: { ...TYPO.bodySm, color: COLORS.text.muted, marginTop: SPACE.xs, textAlign: 'center' },
});
