/**
 * PressableScale — MintU R115 Sprint-1 universal tap primitive.
 *
 * A drop-in replacement for `TouchableOpacity` / `Pressable` that adds:
 *
 *   • Depth compression on press (scale 0.97 + opacity 0.85) using
 *     react-native-reanimated for guaranteed 60 fps even when the JS
 *     thread is busy.
 *   • Built-in semantic haptic. Caller picks an intent
 *     (`'select' | 'tap' | 'press' | 'navigate'`) — defaults to `tap`.
 *   • Hard-disable when `disabled` so users see no false confirmation.
 *   • Reduced-motion respect — falls back to opacity-only when the OS
 *     accessibility flag is on.
 *   • Web safety — gracefully degrades to a Pressable with no scale.
 *
 * Replaces every TouchableOpacity / Pressable that simply animates
 * "acknowledge press". Roughly 70% of the app's tap targets fall into
 * this category. Where you need custom press animation (e.g. a card
 * that flips), keep the bespoke implementation.
 *
 * Usage:
 * ------
 *   <PressableScale onPress={handleSave} haptic="success" style={s.btn}>
 *     <Text style={s.btnText}>Save</Text>
 *   </PressableScale>
 */
import React, { ReactNode, useCallback } from 'react';
import { Pressable, StyleProp, ViewStyle, ViewProps, AccessibilityRole, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { SPRING, DURATION, isReducedMotion } from '../../utils/motion';
import { haptic as hapticEngine } from '../../utils/haptics';

type HapticIntent = 'none' | 'select' | 'tap' | 'press' | 'navigate' | 'success' | 'warn' | 'error';

export interface PressableScaleProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Disable both press + haptic + animation. */
  disabled?: boolean;
  /** Style applied to the outer Animated.View. */
  style?: StyleProp<ViewStyle>;
  /** How much to compress on press. Default 0.97 (subtle). 0.94 reads as "button". */
  scaleTo?: number;
  /** Final opacity at peak press. Default 0.85. */
  pressedOpacity?: number;
  /** Haptic intent fired on press-in. */
  haptic?: HapticIntent;
  /** Long-press haptic intent. Defaults to `'press'` if onLongPress provided. */
  longPressHaptic?: HapticIntent;
  /** Test-id forwarded to the inner Pressable. */
  testID?: string;
  /** Accessibility role/label. */
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  /** Hit-slop forwarded to Pressable. */
  hitSlop?: ViewProps['hitSlop'];
  /** Allow tapping while still animating press-out. Default true. */
  rapid?: boolean;
}

/**
 * Fires a semantic haptic from a string intent — no-op for `'none'`.
 */
function fireHaptic(intent: HapticIntent | undefined) {
  if (!intent || intent === 'none') return;
  const fn = (hapticEngine as any)[intent];
  if (typeof fn === 'function') fn();
}

export default function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled = false,
  style,
  scaleTo = 0.97,
  pressedOpacity = 0.85,
  haptic = 'tap',
  longPressHaptic,
  testID,
  accessibilityRole = 'button',
  accessibilityLabel,
  hitSlop,
  rapid = true,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    cancelAnimation(scale);
    cancelAnimation(opacity);
    if (isReducedMotion()) {
      opacity.value = withTiming(pressedOpacity, { duration: DURATION.instant });
      return;
    }
    // Native-only — react-native-web doesn't have RNGH; we still degrade gracefully.
    scale.value = withSpring(scaleTo, SPRING.press);
    opacity.value = withTiming(pressedOpacity, { duration: DURATION.instant });
  }, [disabled, scaleTo, pressedOpacity, scale, opacity]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;
    if (isReducedMotion()) {
      opacity.value = withTiming(1, { duration: DURATION.fast });
      return;
    }
    scale.value = withSpring(1, SPRING.snappy);
    opacity.value = withTiming(1, { duration: DURATION.fast });
  }, [disabled, scale, opacity]);

  const handlePress = useCallback(() => {
    if (disabled || !onPress) return;
    fireHaptic(haptic);
    onPress();
  }, [disabled, onPress, haptic]);

  const handleLongPress = useCallback(() => {
    if (disabled || !onLongPress) return;
    fireHaptic(longPressHaptic ?? 'press');
    onLongPress();
  }, [disabled, onLongPress, longPressHaptic]);

  const aStyle = useAnimatedStyle(() => {
    if (Platform.OS === 'web') {
      return { opacity: opacity.value } as any;
    }
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    } as any;
  });

  return (
    <Animated.View style={[aStyle, style]}>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={420}
        unstable_pressDelay={rapid ? 0 : 80}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        hitSlop={hitSlop}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
