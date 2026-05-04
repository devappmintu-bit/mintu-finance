/**
 * BrutalButton — 3-layer CTA primitive.
 *
 *   primary   — Ink-filled block, white text, 3-px border, hard shadow.
 *               The ONE button per viewport that MUST be tapped.
 *
 *   secondary — Paper-filled, ink text, 1.5-px border, soft shadow.
 *               Supporting actions (Cancel, See more, Apply filter…).
 *
 *   ghost     — Zero border, zero shadow, ink text on transparent bg.
 *               Low-urgency / tertiary actions (Skip, Later, Learn more).
 *
 * Usage:
 *   <BrutalButton variant="primary" onPress={pay}>Pay ₹1,250</BrutalButton>
 */
import React from 'react';
import { Text, Pressable, StyleSheet, ViewStyle, StyleProp, ActivityIndicator, Platform } from 'react-native';
import { COLORS, TYPE, SPACING, WEIGHT } from '../../utils/theme';
import { BRUTAL_BORDER, BRUTAL_SHADOW } from '../../utils/brutal';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  size?: 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export default function BrutalButton({
  children,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  size = 'md',
  style,
  accessibilityLabel,
}: Props) {
  const sizeStyle = size === 'lg' ? styles.lg : size === 'sm' ? styles.sm : styles.md;
  const variantStyle = variant === 'primary' ? styles.primary
                     : variant === 'secondary' ? styles.secondary
                     : styles.ghost;
  const textStyle = variant === 'primary' ? styles.textPrimary
                  : styles.textInk;
  const shadowStyle = variant === 'primary' ? BRUTAL_SHADOW.primary
                    : variant === 'secondary' ? BRUTAL_SHADOW.secondary
                    : {};

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        variantStyle,
        sizeStyle,
        shadowStyle,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFF' : COLORS.text.primary} />
      ) : (
        <Text style={[textStyle, size === 'sm' && { fontSize: TYPE.sm }]} numberOfLines={1}>
          {typeof children === 'string' ? children.toUpperCase() : children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    // Minimum 44×44 tap target on iOS / 48 on Android — enforced via
    // the size styles below.
  },
  primary: {
    backgroundColor: COLORS.text.primary,
    borderWidth: BRUTAL_BORDER.primary,
    borderColor: COLORS.text.primary,
  },
  secondary: {
    backgroundColor: COLORS.bg.card,
    borderWidth: BRUTAL_BORDER.secondary,
    borderColor: COLORS.text.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  lg: { paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xl, minHeight: 56 },
  md: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, minHeight: 48 },
  sm: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, minHeight: 36 },
  textPrimary: {
    color: '#FFFFFF',
    fontSize: TYPE.base,
    fontWeight: WEIGHT.black,
    letterSpacing: 0.8,
  },
  textInk: {
    color: COLORS.text.primary,
    fontSize: TYPE.base,
    fontWeight: WEIGHT.black,
    letterSpacing: 0.8,
  },
  disabled: { opacity: 0.45 },
  pressed: Platform.select({
    ios:     { transform: [{ translateX: 2 }, { translateY: 2 }], opacity: 0.92 },
    default: { opacity: 0.85 },
  }) as any,
});
