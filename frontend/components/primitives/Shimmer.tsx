/**
 * Shimmer — flowing highlight skeleton block.
 *
 * Design System 2.0 · Phase 1 primitive.
 *
 * Replaces boring grey blocks during loading states with a subtle
 * left→right light sweep. Uses Reanimated on the UI thread — zero JS
 * cost per frame after start.
 *
 * Usage:
 *   <Shimmer width={200} height={18} radius={6} />
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';

const AGradient = Animated.createAnimatedComponent(LinearGradient);

export interface ShimmerProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

function ShimmerImpl({ width = '100%', height = 16, radius = 8, style }: ShimmerProps) {
  const x = useSharedValue(-1);

  useEffect(() => {
    x.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      false
    );
  }, [x]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * 320 }],
  }));

  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: COLORS.skeleton.bg,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <AGradient
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFillObject, animStyle, { width: 180 }]}
      />
    </View>
  );
}

export const Shimmer = React.memo(ShimmerImpl);
Shimmer.displayName = 'Shimmer';
export default Shimmer;
