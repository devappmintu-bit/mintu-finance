/**
 * BrutalistPressable — R100X neo-brutalist press primitive.
 *
 * The single most identity-defining interaction in the neo-brutalist
 * vocabulary: an element that visibly "presses into" its hard-ink
 * shadow when tapped. The card shifts down-right by the shadow offset
 * AND the shadow collapses to zero — for a frame-perfect "stamp"
 * tactile feedback that no other 2025 fintech ships.
 *
 *   IDLE          PRESSED
 *   ┌────────┐    ┌────────┐
 *   │ CARD   │░   │ CARD   │   (shadow gone, card shifted)
 *   │        │░   │        │
 *   └────────┘░   └────────┘
 *    ░░░░░░░░░
 *
 * Implementation notes:
 * - Uses transform.translateX / translateY (GPU compositor, no layout
 *   thrash) and a separate shadow opacity layer so we never re-layout.
 * - 80ms easing — matches BR_MOTION.snap for that "linear / instant"
 *   neo-brutalist feel (not a "pretty" easing curve).
 * - Honors accessibility — `accessibilityRole="button"` and respects
 *   the system "Reduce Motion" preference (skips the translate).
 * - Falls back to a plain Pressable when `disabled` so we never
 *   animate disabled controls.
 *
 * Usage:
 *   <BrutalistPressable onPress={handler} stamp="md">
 *     <View style={styles.card}>...</View>
 *   </BrutalistPressable>
 */
import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { BR_STAMP, BR_COLORS } from '../../utils/brutalist';

type StampSize = 'sm' | 'md' | 'lg';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Shadow offset preset. md = (4,4), sm = (2,2), lg = (6,6). */
  stamp?: StampSize;
  /** Override shadow color — default ink black. Use `BR_COLORS.accent`
   *  for a punchy "highlight" stamp on hero CTAs. */
  shadowColor?: string;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  /** Optional A11y label override. */
  accessibilityLabel?: string;
  testID?: string;
}

const STAMP_OFFSET: Record<StampSize, number> = { sm: 2, md: 4, lg: 6 };

export default function BrutalistPressable({
  children,
  onPress,
  onLongPress,
  stamp = 'md',
  shadowColor,
  disabled,
  style,
  accessibilityLabel,
  testID,
}: Props) {
  const offset = STAMP_OFFSET[stamp];
  const anim = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  // Cache the user's "Reduce Motion" preference (Android + iOS).
  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      reduceMotion.current = !!v;
    }).catch(() => {});
  }, []);

  const press = (down: boolean) => {
    Animated.timing(anim, {
      toValue: down ? 1 : 0,
      duration: 80,                     // BR_MOTION.snap
      easing: Easing.linear,            // brutalist: no "pretty" curves
      useNativeDriver: true,
    }).start();
  };

  // Two interpolated values:
  //   - translate: 0 → offset px (down-right) on press
  //   - shadowOp: 1 → 0 (shadow collapses into the card)
  const translate = reduceMotion.current
    ? 0
    : anim.interpolate({ inputRange: [0, 1], outputRange: [0, offset] });
  const shadowOp = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  // Build the stamp from BR_STAMP for cross-platform consistency.
  const stampStyle =
    shadowColor === BR_COLORS.accent
      ? BR_STAMP.accent
      : shadowColor === BR_COLORS.negative
      ? BR_STAMP.negative
      : BR_STAMP[stamp];

  // On web, boxShadow is a string — animating opacity via overlay is
  // simpler than animating the boxShadow string itself. On iOS we can
  // animate shadowOpacity. Both branches collapse to "no shadow on press".
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={s.wrap}
    >
      {/* Shadow layer (collapses on press). For web we render an
          underlay box that fades; for native we let shadowOpacity ride
          on the animated container. */}
      {Platform.OS === 'web' ? (
        <Animated.View
          style={[
            s.webShadowLayer,
            {
              backgroundColor:
                shadowColor === BR_COLORS.accent
                  ? BR_COLORS.accent
                  : shadowColor === BR_COLORS.negative
                  ? BR_COLORS.negative
                  : BR_COLORS.ink,
              top: offset,
              left: offset,
              opacity: shadowOp,
            },
          ]}
          pointerEvents="none"
        />
      ) : null}

      <Animated.View
        style={[
          stampStyle,
          // iOS: bind shadowOpacity to anim so it fades on press.
          Platform.OS === 'ios'
            ? { shadowOpacity: shadowOp as any }
            : null,
          {
            transform: [
              { translateX: translate as any },
              { translateY: translate as any },
            ],
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: {
    // Pressable is a position-relative anchor for the absolute web
    // shadow underlay. No padding — host card decides its own.
    position: 'relative',
  },
  webShadowLayer: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    height: '100%',
    width: '100%',
    zIndex: 0,
  },
});
