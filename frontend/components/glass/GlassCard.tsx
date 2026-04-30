/**
 * components/glass/GlassCard.tsx
 *
 * Round 55 — iOS-Crystal glass primitive.
 * One translucent surface backed by `expo-blur` on native (BlurView)
 * and a stacked translucent gradient on web (BlurView is unsupported
 * there). Layered: BlurView → frosted-milk overlay → children. Soft
 * shadow + 1px hairline highlight border for the iOS look.
 *
 * Usage:
 *   <GlassCard radius={20} intensity={40} style={{ padding: 16 }}>
 *     ...
 *   </GlassCard>
 *
 * Performance notes (per user spec, blur ON for all platforms):
 *   • We render a SINGLE BlurView inside, never nested. Stacking glass
 *     cards is fine because each card has its own clipped blur region.
 *   • BlurView.intensity is capped at 60; higher values produce
 *     diminishing returns and hurt perf on Android pre-API-31.
 */
import React from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS, COLORS } from '../../utils/theme';

type Props = ViewProps & {
  /** Border radius. Default 20 (iOS-card spec range 16–24). */
  radius?: number;
  /** Blur strength 0–100; default 40. iOS uses higher values better. */
  intensity?: number;
  /** Tint over the blur — 'light' shows white frosted, 'dark' for hero overlays. */
  tint?: 'light' | 'dark' | 'default';
  /** Disable the soft drop shadow when stacking inside another card. */
  noShadow?: boolean;
  /** Disable the inner highlight (hairline) border. */
  noBorder?: boolean;
  children?: React.ReactNode;
};

function _GlassCard({
  radius = 20,
  intensity = GLASS.intensity,
  tint = GLASS.tint,
  noShadow = false,
  noBorder = false,
  style,
  children,
  ...rest
}: Props) {
  const cappedIntensity = Math.min(Math.max(intensity, 0), 60);
  const containerStyle: ViewStyle[] = [
    styles.container,
    { borderRadius: radius },
    !noBorder && {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: GLASS.borderLight,
    },
    !noShadow && styles.shadow,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  // Web: BlurView is unsupported — fall back to translucent + gradient
  if (Platform.OS === 'web') {
    return (
      <View style={containerStyle} {...rest}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS.solidBg, borderRadius: radius }]} />
        <View style={{ borderRadius: radius, overflow: 'hidden' }}>{children}</View>
      </View>
    );
  }

  return (
    <View style={containerStyle} {...rest}>
      <BlurView
        intensity={cappedIntensity}
        tint={tint}
        style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
      />
      {/* Frosted-milk overlay so legibility doesn't depend on what's
          behind the card. Subtle gradient gives top-edge highlight. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.45)'] as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      <View style={{ borderRadius: radius, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

export const GlassCard = React.memo(_GlassCard);
export default GlassCard;

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 4,
      // Android shadow is a small elevation — per spec, minimal.
    },
    default: {},
  }) as ViewStyle,
});
