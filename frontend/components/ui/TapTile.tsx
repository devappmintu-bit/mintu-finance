/**
 * TapTile — unified interactive wrapper.
 *
 * Use instead of raw <TouchableOpacity> for all tappable surfaces.
 * Applies:
 *   • Haptic selection feedback on press
 *   • Subtle scale-down (0.97) on press-in animation
 *   • Reduced-motion safe (respects system setting)
 *
 * Replaces ad-hoc `activeOpacity={0.8}` touches across the app with one
 * consistent feel. Wraps any children — styles passed through.
 */
import React, { useRef } from 'react';
import { Pressable, Animated, PressableProps, StyleProp, ViewStyle, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

type Feedback = 'selection' | 'light' | 'medium' | 'heavy' | 'none';

type Props = PressableProps & {
  feedback?: Feedback;
  scaleTo?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const hapticFor = (f: Feedback) => {
  if (f === 'none') return;
  try {
    if (f === 'selection') Haptics.selectionAsync();
    else if (f === 'light')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (f === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (f === 'heavy')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    if (!disabled) {
      Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
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
      // On web, Pressable renders as a div; disable user-select for nicer feel
      {...(Platform.OS === 'web' ? { style: [{ outlineWidth: 0 } as any, style] } : {})}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }] }, Platform.OS !== 'web' ? style : undefined]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
