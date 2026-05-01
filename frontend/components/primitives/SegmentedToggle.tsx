/**
 * SegmentedToggle — DS2.0 iOS-style segmented control.
 *
 * Replaces the handwritten 2–3 tab "selectors" used across split,
 * budget, transactions, insights screens. Instead of a boolean
 * switch, this is a multi-option control with a sliding-pill
 * indicator.
 *
 * Usage:
 *   <SegmentedToggle
 *     options={[{id:'debit',label:'Expense'},{id:'credit',label:'Income'}]}
 *     value={type}
 *     onChange={setType}
 *   />
 *
 * Implementation: the pill uses an animated `left` property driven
 * by the active segment index × measured segment width. Haptic
 * selection on change.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Platform, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';

export interface SegmentOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedToggleProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  fullWidth?: boolean;
  testID?: string;
}

function SegmentedToggleImpl<T extends string = string>({
  options,
  value,
  onChange,
  fullWidth,
  testID,
}: SegmentedToggleProps<T>) {
  const [w, setW] = useState(0);
  const activeIdx = Math.max(0, options.findIndex((o) => o.id === value));
  const segW = options.length > 0 ? w / options.length : 0;

  const x = useSharedValue(0);

  // Animate the pill whenever the active index / segment width changes.
  React.useEffect(() => {
    x.value = withSpring(activeIdx * segW, { damping: 18, stiffness: 260 });
  }, [activeIdx, segW, x]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: segW,
  }));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setW(e.nativeEvent.layout.width);
  }, []);

  const handle = useCallback((id: T) => {
    if (Platform.OS !== 'web') { try { Haptics.selectionAsync(); } catch {} }
    onChange(id);
  }, [onChange]);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={[styles.track, fullWidth && { alignSelf: 'stretch' }]}
    >
      <Animated.View style={[styles.pill, pillStyle]} />
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => handle(o.id)}
            style={styles.seg}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {o.icon}
            <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const SegmentedToggle = React.memo(SegmentedToggleImpl) as <T extends string = string>(
  p: SegmentedToggleProps<T>
) => React.ReactElement;
// @ts-expect-error displayName on generic memo
SegmentedToggle.displayName = 'SegmentedToggle';
export default SegmentedToggle;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg.subtle,
    borderRadius: RADIUS.pill,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  pill: {
    position: 'absolute',
    top: 3, bottom: 3, left: 3,
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS.pill,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.sm + 1,
    paddingHorizontal: SPACE.md,
    gap: 6,
    zIndex: 1,
  },
  segText: { ...TYPO.bodySm, color: COLORS.text.muted, fontWeight: '600' },
  segTextActive: { color: COLORS.text.primary, fontWeight: '700' },
});
