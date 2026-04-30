/**
 * components/glass/GlassButton.tsx
 *
 * Round 55 — iOS-Crystal pressable button.
 * Translucent fill + gradient highlight + spring scale-on-press via
 * react-native-reanimated. Two variants:
 *   • primary   — brand-orange glass with white text (CTA)
 *   • secondary — neutral white-glass with primary text (cancel/ghost)
 *
 * Press animation: scale 1.0 → 0.97 with a stiff spring (250ms-ish).
 * Fires haptic on iOS (device-only — web is a no-op).
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GLASS } from '../../utils/theme';
import { haptic } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'destructive';

type Props = {
  onPress?: () => void;
  disabled?: boolean;
  variant?: Variant;
  fullWidth?: boolean;
  style?: ViewStyle | ViewStyle[];
  hapticOnPress?: boolean;
  /** Called once when the press lands and the spring is in flight. */
  onPressIn?: () => void;
  children?: React.ReactNode;
};

function _GlassButton({
  onPress,
  disabled = false,
  variant = 'primary',
  fullWidth = false,
  style,
  hapticOnPress = true,
  onPressIn,
  children,
}: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const pressIn = () => {
    scale.value = withSpring(0.97, { damping: 14, stiffness: 220 });
    if (hapticOnPress && Platform.OS !== 'web') haptic.light();
    onPressIn?.();
  };
  const pressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 220 });
  };

  // Variant tokens
  const palette = {
    primary: {
      gradient: ['#FF8C42', '#FF6B1A', '#E84A0C'],
      textColor: COLORS.text.inverse,
      borderColor: 'rgba(232,74,12,0.35)',
    },
    secondary: {
      gradient: ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.55)'],
      textColor: COLORS.text.primary,
      borderColor: GLASS.borderLight,
    },
    destructive: {
      gradient: ['#FCA5A5', '#EF4444', '#DC2626'],
      textColor: COLORS.text.inverse,
      borderColor: 'rgba(220,38,38,0.35)',
    },
  }[variant];

  const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        { borderColor: palette.borderColor, opacity: disabled ? 0.55 : 1 },
        animStyle,
        flatStyle as any,
      ]}
    >
      <LinearGradient
        colors={palette.gradient as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Inner top highlight for the iOS "glass" sheen. */}
      <View pointerEvents="none" style={styles.topShine} />
      <View style={styles.content}>
        {typeof children === 'string' ? (
          <Animated.Text style={[styles.label, { color: palette.textColor }]}>
            {children}
          </Animated.Text>
        ) : (
          children
        )}
      </View>
    </AnimatedPressable>
  );
}

export const GlassButton = React.memo(_GlassButton);
export default GlassButton;

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    // Soft shadow per spec
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  fullWidth: { alignSelf: 'stretch' },
  topShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
