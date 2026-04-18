/**
 * GlassCard — Frosted-glass container (Crystal UI)
 *
 * Uses expo-blur's BlurView on native + iOS, falls back to a soft translucent
 * background on web/Android where BlurView is limited. Provides rounded corners,
 * soft shadow (via SHADOW token), and an optional subtle inner highlight.
 *
 * Usage:
 *   <GlassCard><Text>Content</Text></GlassCard>
 *   <GlassCard intensity={60} tint="light" radius="xxl" shadow="lg">...</GlassCard>
 */
import React, { memo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { RADIUS, SHADOW } from '../utils/theme';

type Props = {
  children: React.ReactNode;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  radius?: keyof typeof RADIUS;
  shadow?: keyof typeof SHADOW;
  style?: StyleProp<ViewStyle>;
  /** For dark/accent-colored backgrounds, set to 'dark' */
  variant?: 'light' | 'dark' | 'accent';
};

const GlassCard = memo(function GlassCard({ children, intensity = 40, tint = 'light', radius = 'xxl', shadow = 'md', style, variant = 'light' }: Props) {
  const r = RADIUS[radius];
  const sh = SHADOW[shadow];
  const bgFallback = variant === 'dark' ? 'rgba(46,31,26,0.72)' : variant === 'accent' ? 'rgba(230,81,0,0.08)' : 'rgba(255,255,255,0.72)';
  const borderColor = variant === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)';

  // BlurView works best on iOS; fall back to translucent View everywhere else (still looks great)
  if (Platform.OS === 'ios') {
    return (
      <View style={[{ borderRadius: r, overflow: 'hidden' }, sh, style]}>
        <BlurView intensity={intensity} tint={tint} style={[s.inner, { borderRadius: r, borderColor }]}>
          {children}
        </BlurView>
      </View>
    );
  }
  return (
    <View style={[s.webFallback, { borderRadius: r, backgroundColor: bgFallback, borderColor }, sh, style]}>
      {children}
    </View>
  );
});

const s = StyleSheet.create({
  inner: { borderWidth: 1, overflow: 'hidden' },
  webFallback: { borderWidth: 1 },
});

export default GlassCard;
