/**
 * PremiumCard — foundational card primitive for Design System 2.0.
 *
 * Variants:
 *  - 'flat'      — plain surface, hairline border, no shadow
 *  - 'elevated'  — card surface, z2 shadow, hairline border (default)
 *  - 'glass'     — glass-morphic surface (translucent + tint), z2 shadow
 *  - 'hero'      — brand-tinted gradient, z3 shadow (for heroes)
 *
 * Every PremiumCard adopts the same corner radius scale, padding
 * ladder, and elevation tokens — so the entire app feels coherent.
 */
import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, SPACE, ELEVATION } from '../../utils/theme';

type Variant = 'flat' | 'elevated' | 'glass' | 'hero';
type Size = 'sm' | 'md' | 'lg';

export interface PremiumCardProps {
  variant?: Variant;
  size?: Size;
  radius?: keyof typeof RADIUS;
  heroColors?: [string, string];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}

const PADS: Record<Size, number> = { sm: SPACE.md, md: SPACE.lg, lg: SPACE.xl };

function PremiumCardImpl({
  variant = 'elevated',
  size = 'md',
  radius = 'xl',
  heroColors = [COLORS.accent.brand, COLORS.accent.brandDark],
  style,
  children,
  testID,
}: PremiumCardProps) {
  const base: ViewStyle = {
    padding: PADS[size],
    borderRadius: RADIUS[radius],
    overflow: 'hidden',
  };

  if (variant === 'hero') {
    return (
      <View testID={testID} style={[base, ELEVATION.z3, style]}>
        <LinearGradient
          colors={heroColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  if (variant === 'glass') {
    return (
      <View
        testID={testID}
        style={[
          base,
          ELEVATION.z2,
          {
            backgroundColor: 'rgba(255,255,255,0.72)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,255,255,0.6)',
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  if (variant === 'flat') {
    return (
      <View
        testID={testID}
        style={[
          base,
          {
            backgroundColor: COLORS.bg.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: COLORS.border.subtle,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // elevated (default)
  return (
    <View
      testID={testID}
      style={[
        base,
        ELEVATION.z2,
        {
          backgroundColor: COLORS.bg.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: COLORS.border.subtle,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const PremiumCard = React.memo(PremiumCardImpl);
PremiumCard.displayName = 'PremiumCard';
export default PremiumCard;
