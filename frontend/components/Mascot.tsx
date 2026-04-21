/**
 * Mascot — theme-aware MintU robot mascot.
 *
 * Automatically picks the right chest-shield variant based on the user's
 * resolved theme (light → white shield, dark → dark shield). Includes
 * optional glow + scale-to-fit + size presets.
 *
 * Usage:
 *   <Mascot size={64} />              // follows theme
 *   <Mascot size={48} glow />          // with soft orange halo
 *   <Mascot size={80} variant="dark" />// force a variant
 */
import React from 'react';
import { View, Image, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { useResolvedTheme, ResolvedTheme } from '../store/themeStore';
import { COLORS } from '../utils/theme';

const LIGHT_SRC = require('../assets/images/mintu-logo-light.png');
const DARK_SRC  = require('../assets/images/mintu-logo-dark.png');

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
  /** Force a variant. Default 'auto' follows system theme pref. */
  variant?: 'auto' | 'light' | 'dark';
};

export default function Mascot({ size = 48, style, glow = false, variant = 'auto' }: Props) {
  const resolved: ResolvedTheme = useResolvedTheme();
  const picked = variant === 'auto' ? resolved : variant;
  const src = picked === 'light' ? LIGHT_SRC : DARK_SRC;

  return (
    <View style={[styles.wrap, { width: size, height: size }, glow && glowStyle(size), style]}>
      <Image source={src} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

const glowStyle = (size: number): ViewStyle => ({
  ...Platform.select({
    ios: {
      shadowColor: COLORS.accent.primary,
      shadowOpacity: 0.6,
      shadowRadius: size * 0.35,
      shadowOffset: { width: 0, height: 0 },
    },
    android: { elevation: 12 },
    web: { boxShadow: `0 0 ${Math.round(size * 0.35)}px rgba(255,107,26,0.6)` as any },
  }),
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
