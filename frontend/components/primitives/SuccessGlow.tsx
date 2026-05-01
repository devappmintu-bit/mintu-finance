/**
 * SuccessGlow — transient emerald halo around children when `trigger`
 * changes (e.g. on successful save / submit).
 *
 * Design System 2.0 · Phase 1 primitive.
 *
 * Why: Most apps just show a toast on success. Best-in-class apps
 * (Apple Wallet, Notion, Revolut) add a 400ms visual confirm right at
 * the site of the action — the user's brain closes the loop without
 * looking away. This primitive delivers that "just saved" moment.
 *
 * Usage:
 *   <SuccessGlow trigger={saveCount}>
 *     <Card>{...}</Card>
 *   </SuccessGlow>
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { COLORS } from '../../utils/theme';

export interface SuccessGlowProps {
  trigger: number | string | boolean;
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}

function SuccessGlowImpl({
  trigger,
  children,
  color = COLORS.state.success,
  radius = 24,
  style,
}: SuccessGlowProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Skip the very first render so there's no initial glow flash.
    opacity.value = withSequence(
      withTiming(0.55, { duration: 180, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) })
    );
    scale.value = withSequence(
      withTiming(1.04, { duration: 200 }),
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })
    );
  }, [trigger, opacity, scale]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[{ position: 'relative' }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: radius,
            borderWidth: 3,
            borderColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 20,
            shadowOpacity: 1,
          },
          glowStyle,
        ]}
      />
      <Animated.View style={scaleStyle}>
        {children}
      </Animated.View>
    </View>
  );
}

export const SuccessGlow = React.memo(SuccessGlowImpl);
SuccessGlow.displayName = 'SuccessGlow';
export default SuccessGlow;
