/**
 * DatePresetChips — one-tap date selection for transactions, goals,
 * and budgets.
 *
 * Why
 * ---
 * 90 % of transactions a user adds happened "today" or "yesterday".
 * Asking them to spin a date wheel for the obvious case is friction.
 * These chips collapse 4 wheel-spins into 1 tap.
 *
 * Behaviour
 * ---------
 *   • 4 default presets: Today · Yesterday · This week · This month.
 *     Each resolves to a real Date or a Date range on tap.
 *   • The chip whose resolved date matches `current` glows orange.
 *   • A "Custom…" chip on the right opens whatever sheet/picker the
 *     parent provides via `onCustomPress`.
 *   • Reanimated worklet for the press-bounce.
 *
 * Usage
 * -----
 *     <DatePresetChips
 *       current={date}
 *       onSelect={(d) => setDate(d)}
 *       onCustomPress={() => sheetRef.current?.present()}
 *     />
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';
import { BRAND_GRADIENT } from '../../constants/brand';

export interface DatePresetChipsProps {
  /** Currently-selected ISO date (yyyy-mm-dd) or Date. */
  current?: string | Date | null;
  onSelect: (date: Date) => void;
  onCustomPress?: () => void;
  /** Hide the trailing "Custom…" chip if the parent doesn't want a sheet. */
  hideCustom?: boolean;
  testID?: string;
}

interface Preset {
  key: 'today' | 'yesterday' | 'week' | 'month';
  label: string;
  resolve: () => Date;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const PRESETS: Preset[] = [
  { key: 'today', label: 'Today', resolve: () => startOfDay(new Date()) },
  {
    key: 'yesterday',
    label: 'Yesterday',
    resolve: () => {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() - 1);
      return d;
    },
  },
  {
    key: 'week',
    label: 'This week',
    resolve: () => {
      // Monday of the current week (ISO week start). We could surface
      // a range, but for transaction-add the start-of-range is enough.
      const d = startOfDay(new Date());
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - (day - 1));
      return d;
    },
  },
  {
    key: 'month',
    label: 'This month',
    resolve: () => {
      const d = startOfDay(new Date());
      d.setDate(1);
      return d;
    },
  },
];

export default function DatePresetChips({
  current,
  onSelect,
  onCustomPress,
  hideCustom,
  testID,
}: DatePresetChipsProps) {
  const currentDate: Date | null = useMemo(() => {
    if (!current) return null;
    return current instanceof Date ? current : new Date(current);
  }, [current]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID={testID}
    >
      {PRESETS.map((p) => (
        <Chip
          key={p.key}
          label={p.label}
          active={currentDate ? isSameDay(currentDate, p.resolve()) : false}
          onPress={() => onSelect(p.resolve())}
        />
      ))}
      {!hideCustom && onCustomPress ? (
        <Chip label="Custom…" icon="calendar-outline" active={false} onPress={onCustomPress} />
      ) : null}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
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

  return (
    <Pressable onPress={handlePress} hitSlop={8}>
      <Animated.View style={[styles.chip, animStyle]}>
        {active ? (
          <LinearGradient
            colors={[...BRAND_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.pill }]}
          />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {icon ? (
            <Ionicons
              name={icon}
              size={14}
              color={active ? '#FFFFFF' : COLORS.text.primary}
            />
          ) : null}
          <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
            {label}
          </Text>
        </View>
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
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});
