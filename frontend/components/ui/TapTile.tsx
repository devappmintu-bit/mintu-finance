/**
 * TapTile — unified interactive wrapper with animated ripple-glow.
 *
 * Use instead of raw <TouchableOpacity> for all tappable surfaces.
 * Applies:
 *   • Haptic selection feedback on press
 *   • Subtle scale-down (0.97) on press-in spring animation
 *   • Radial ripple-glow effect on tap (neon orange by default) — 260ms
 *   • Reduced-motion safe (respects system setting)
 *
 * Replaces ad-hoc `activeOpacity={0.8}` touches across the app with one
 * consistent feel. Wraps any children — styles passed through.
 */
import React, { useRef } from 'react';
import { Pressable, Animated, View, PressableProps, StyleProp, ViewStyle, Platform, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { haptic as h } from '../../utils/haptics';

type Feedback = 'selection' | 'light' | 'medium' | 'heavy' | 'none';

type Props = PressableProps & {
  feedback?: Feedback;
  scaleTo?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Enable/disable the ripple-glow (default true). */
  ripple?: boolean;
  /** Ripple tint color (default neon orange 0.35 alpha). */
  rippleColor?: string;
};

const hapticFor = (f: Feedback) => {
  if (f === 'none') return;
  try {
    if (f === 'selection') h.select();
    else if (f === 'light')  h.tap();
    else if (f === 'medium') h.press();
    else if (f === 'heavy')  h.celebrate();
  } catch { /* web: haptics unsupported */ }
};

export default function TapTile({
  feedback = 'selection',
  scaleTo = 0.97,
  disabled,
  style,
  children,
  onPressIn,
  onPressOut,
  onPress,
  ripple = true,
  rippleColor = 'rgba(255,107,26,0.35)',
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;

  const handlePressIn = (e: any) => {
    if (!disabled) {
      Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
      if (ripple) {
        rippleScale.setValue(0);
        rippleOpacity.setValue(0.9);
        Animated.parallel([
          Animated.timing(rippleScale,   { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]).start();
      }
    }
    onPressIn?.(e);
  };
  const handlePressOut = (e: any) => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
    onPressOut?.(e);
  };
  const handlePress = (e: any) => {
    if (!disabled) hapticFor(feedback);
    onPress?.(e);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      {...(Platform.OS === 'web' ? { style: [{ outlineWidth: 0 } as any, style] } : {})}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }], overflow: 'hidden' }, Platform.OS !== 'web' ? style : undefined]}>
        {children}
        {ripple && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: rippleColor,
                opacity: rippleOpacity,
                transform: [{ scale: rippleScale }],
                borderRadius: 999,
              },
            ]}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}
