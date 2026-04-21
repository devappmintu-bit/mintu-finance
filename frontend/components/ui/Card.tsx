/**
 * Card — shared card chrome primitive.
 *
 * Replaces the ad-hoc `{ backgroundColor:'#fff', borderRadius:16, padding:14,
 * borderWidth:1, borderColor:..., ...shadowStyle(...) }` recipe that's duplicated
 * dozens of times across the app.
 *
 * Variants:
 *   • default  — ivory surface, subtle border, tiny shadow
 *   • elevated — brighter white, medium saffron-tinted shadow (for hero cards)
 *   • ghost    — transparent, saffron-tinted border only (for nested cards)
 *   • danger   — warm red surface for destructive regions
 *
 * Pad presets (8pt grid): 'sm' 8, 'md' 12, 'lg' 16, 'xl' 20.
 *
 * Use for any boxed content — tabs, lists, modals. Pairs with SectionHeader.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { COLORS, shadowStyle } from '../../utils/theme';

type Variant = 'default' | 'elevated' | 'ghost' | 'danger';
type Pad = 'none' | 'sm' | 'md' | 'lg' | 'xl';

const PAD: Record<Pad, number> = { none: 0, sm: 8, md: 12, lg: 16, xl: 20 };

type Props = {
  variant?: Variant;
  pad?: Pad;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export default function Card({ variant = 'default', pad = 'md', radius = 16, style, children }: Props) {
  return (
    <View style={[base(variant, radius), { padding: PAD[pad] }, style]}>
      {children}
    </View>
  );
}

function base(v: Variant, radius: number): ViewStyle {
  switch (v) {
    case 'elevated':
      return {
        backgroundColor: COLORS.bg.elevated,
        borderRadius: radius,
        borderWidth: 1,
        borderColor: 'rgba(255,107,26,0.22)',
        ...shadowStyle(COLORS.accent.primary, 6, 20, 0.3, 6),
      };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
        borderRadius: radius,
        borderWidth: 1,
        borderColor: 'rgba(255,107,26,0.35)',
      };
    case 'danger':
      return {
        backgroundColor: 'rgba(255,84,112,0.1)',
        borderRadius: radius,
        borderWidth: 1,
        borderColor: 'rgba(255,84,112,0.35)',
      };
    default:
      return {
        backgroundColor: COLORS.bg.secondary,
        borderRadius: radius,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        ...shadowStyle('#000', 2, 10, 0.35, 3),
      };
  }
}

// Small stub so TS doesn't complain about unused Platform/StyleSheet imports on
// some RN versions.
void StyleSheet; void Platform;
