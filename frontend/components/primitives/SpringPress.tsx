/**
 * SpringPress — universal pressable wrapper with spring-physics scale,
 * haptic feedback, and optional shadow-lift on press.
 *
 * Design System 2.0 · Phase 1 primitive.
 *
 * Why: Every Pressable/TouchableOpacity in the app uses inconsistent
 * `activeOpacity` values and no haptics. This primitive unifies the
 * feel so the entire app breathes with the same rhythm (Apple Wallet
 * / Notion style).
 *
 * Variants:
 *  - 'tap'     — subtle 0.96 scale, selection haptic (default)
 *  - 'bouncy'  — 0.92 scale + shadow-lift, light impact haptic
 *  - 'ghost'   — 0.98 scale, no haptic (for low-emphasis)
 *  - 'card'    — 0.985 scale, selection haptic, shadow-lift
 */
import React, { useCallback } from 'react';
import { Pressable, Platform, StyleProp, ViewStyle, PressableProps } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

type Variant = 'tap' | 'bouncy' | 'ghost' | 'card';

export interface SpringPressProps extends Omit<PressableProps, 'style'> {
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  disabled?: boolean;
  /** Disable haptics globally for this instance (e.g. in long lists). */
  noHaptic?: boolean;
}

const CONFIGS: Record<Variant, { scale: number; lift: number; haptic: 'selection' | 'light' | 'none' }> = {
  tap:    { scale: 0.96,  lift: 0, haptic: 'selection' },
  bouncy: { scale: 0.92,  lift: 2, haptic: 'light' },
  ghost:  { scale: 0.985, lift: 0, haptic: 'none' },
  card:   { scale: 0.985, lift: 1, haptic: 'selection' },
};

function fireHaptic(kind: 'selection' | 'light' | 'none') {
  if (kind === 'none' || Platform.OS === 'web') return;
  try {
    if (kind === 'selection') Haptics.selectionAsync();
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch { /* noop */ }
}

function SpringPressImpl({
  variant = 'tap',
  style,
  children,
  disabled,
  noHaptic,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: SpringPressProps) {
  const cfg = CONFIGS[variant];
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: -lift.value }],
  }));

  const handleIn = useCallback((e: any) => {
    scale.value = withSpring(cfg.scale, { damping: 14, stiffness: 320 });
    if (cfg.lift > 0) lift.value = withTiming(cfg.lift, { duration: 120, easing: Easing.out(Easing.quad) });
    if (!noHaptic) fireHaptic(cfg.haptic);
    onPressIn?.(e);
  }, [scale, lift, cfg, noHaptic, onPressIn]);

  const handleOut = useCallback((e: any) => {
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
    if (cfg.lift > 0) lift.value = withTiming(0, { duration: 140 });
    onPressOut?.(e);
  }, [scale, lift, cfg, onPressOut]);

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        disabled={disabled}
        onPressIn={handleIn}
        onPressOut={handleOut}
        onPress={onPress}
        style={{ flex: (style as any)?.flex }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export const SpringPress = React.memo(SpringPressImpl);
SpringPress.displayName = 'SpringPress';
export default SpringPress;
