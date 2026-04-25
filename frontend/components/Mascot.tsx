/**
 * Mascot — unified MintU robot mascot.
 *
 * One artwork across every theme (light/dark/system) per product decision.
 * Keep the variant prop only for API compatibility with older call sites; it's
 * now a no-op and always resolves to the canonical mascot.
 */
import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

const MASCOT = require('../assets/images/mintu-logo.png');

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
  /** Retained for back-compat — has no effect (single artwork now). */
  variant?: 'auto' | 'light' | 'dark';
};

export default function Mascot({ size = 48, style, glow = false }: Props) {
  const styles = useStyles();
  return (
    <View style={[styles.wrap, { width: size, height: size }, glow && glowStyle(size), style]}>
      <Image source={MASCOT} style={{ width: size, height: size }} contentFit="contain" />
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

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: 'center', justifyContent: 'center' },
}));
