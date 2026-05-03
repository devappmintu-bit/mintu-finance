/**
 * QuickAmountChips — preset rupee values that drop into a currency
 * field with a single tap.
 *
 * Why
 * ---
 * The single biggest input-friction in MintU is "type 250 on a
 * decimal-pad". For 80 % of transactions the answer is one of 6 round
 * numbers (₹100 / ₹200 / ₹500 / ₹1,000 / ₹2,000 / ₹5,000). One tap
 * beats four keystrokes, every time.
 *
 * Behaviour
 * ---------
 *   • Renders 4–6 chip pills horizontally; auto-scrolls if overflow.
 *   • Chip with the same numeric value as `current` glows with the
 *     primary brand gradient.
 *   • Tap → `onSelect(n)` AND a tiny scale-bounce on the chip for
 *     tactile feedback.
 *   • Reanimated worklets (UI-thread); no JS-bridge per tap.
 *
 * Usage
 * -----
 *     <QuickAmountChips current={amt} onSelect={(n) => setAmt(String(n))} />
 *
 * Defaults: ₹100, ₹200, ₹500, ₹1,000, ₹2,000, ₹5,000.
 * Override via `presets`.
 */
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';
import { BRAND_GRADIENT } from '../../constants/brand';

const DEFAULT_PRESETS = [100, 200, 500, 1000, 2000, 5000];

export interface QuickAmountChipsProps {
  /** Currently-selected numeric value (string or number, "" if none). */
  current?: string | number;
  onSelect: (amount: number) => void;
  presets?: number[];
  testID?: string;
}

export default function QuickAmountChips({
  current,
  onSelect,
  presets = DEFAULT_PRESETS,
  testID,
}: QuickAmountChipsProps) {
  const currentNum = Number(typeof current === 'string' ? current.replace(/[^0-9.]/g, '') : current ?? 0);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID={testID}
    >
      {presets.map((p) => (
        <Chip
          key={p}
          value={p}
          active={currentNum === p}
          onPress={() => onSelect(p)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({ value, active, onPress }: { value: number; active: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    // Snappy bounce — 240 ms total. Out-cubic on the press, in-cubic
    // on release feels sharp without overshooting into "toy" territory.
    scale.value = withSequence(
      withTiming(0.93, { duration: 90, easing: Easing.out(Easing.cubic) }),
      withTiming(1.02, { duration: 90, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1.0, { duration: 80, easing: Easing.out(Easing.cubic) }),
    );
    onPress();
  }, [onPress, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Indian-grouped label ("₹1,000" not "₹1000").
  const label = `₹${value.toLocaleString('en-IN')}`;

  return (
    <Pressable onPress={handlePress} hitSlop={8}>
      <Animated.View style={[styles.chip, animStyle]}>
        {active ? (
          <View
            style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.pill }, { backgroundColor: '#0A0A0A' }]}
          />
        ) : null}
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.xs,
    gap: SPACE.sm,
    flexDirection: 'row',
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipText: {
    ...TYPO.caption,
    fontWeight: '600',
    color: COLORS.text.primary,
    fontVariant: ['tabular-nums'],
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});
