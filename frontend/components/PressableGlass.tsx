/**
 * PressableGlass — Tap target with haptic + press-scale micro-animation.
 *
 * Use instead of TouchableOpacity for primary actions. Provides:
 *   - Light haptic tap on press (native only; web no-op)
 *   - Subtle 0.96 scale-down on press-in (reanimated)
 *   - Consistent activeOpacity + hit slop defaults
 *
 * Note: Keep the inner JSX free of its own TouchableOpacity/Pressable.
 */
import React, { useRef } from 'react';
import { Pressable, Animated, StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import { haptic } from '../utils/haptics';

type Props = {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  feedback?: 'light' | 'medium' | 'heavy' | 'selection' | 'none';
  scale?: number;
  testID?: string;
  accessibilityRole?: string;
  accessibilityLabel?: string;
};

export default function PressableGlass({
  onPress, onLongPress, disabled, children, style, hitSlop = 4, feedback = 'light', scale = 0.96,
}: Props) {
  const anim = useRef(new Animated.Value(1)).current;
  const handleIn = () => {
    if (disabled) return;
    Animated.spring(anim, { toValue: scale, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const handleOut = () => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  const handlePress = (e: GestureResponderEvent) => {
    if (disabled) return;
    if (feedback !== 'none') haptic[feedback]();
    onPress?.(e);
  };
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={handleIn}
      onPressOut={handleOut}
    >
      <Animated.View style={[{ transform: [{ scale: anim }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
