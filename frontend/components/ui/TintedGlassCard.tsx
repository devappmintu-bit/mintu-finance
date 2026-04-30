/**
 * GlassCard — glassmorphism surface primitive.
 *
 * Usage:
 *   <GlassCard style={{ padding: 16 }} tint="orange">
 *     <Text>…content…</Text>
 *   </GlassCard>
 *
 * Renders a frosted BlurView on iOS/web, falls back to a solid semi-transparent
 * bg on Android (BlurView is expensive there). A soft top border + subtle
 * outer glow create the layered-panel feel.
 */
import React from 'react';
import { View, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, GLASS, RADIUS, SHADOW } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Tint = 'neutral' | 'orange' | 'success' | 'danger';

const tintBorder: Record<Tint, string> = {
  neutral: GLASS.borderLight,
  orange:  'rgba(255,107,26,0.28)',
  success: 'rgba(16,224,160,0.28)',
  danger:  'rgba(255,84,112,0.28)',
};

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: Tint;
  radius?: number;
  intensity?: number;
  /** When true, drops the blur and uses a solid dark panel (cheaper on lists). */
  solid?: boolean;
};

export default function GlassCard({ children, style, tint = 'neutral', radius = RADIUS.card, intensity = GLASS.intensity, solid = false }: Props) {
  const styles = useStyles();
  const useBlur = !solid && Platform.OS !== 'android';
  const borderColor = tintBorder[tint];

  if (useBlur) {
    return (
      <BlurView
        intensity={intensity}
        tint={GLASS.tint}
        style={[
          styles.base,
          { borderRadius: radius, borderColor, overflow: 'hidden' },
          SHADOW.lg,
          style,
        ]}
      >
        {/* Inner tint layer — boosts legibility over bright backgrounds */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS.solidBg, borderRadius: radius }]} pointerEvents="none" />
        <View style={{ flex: 0, zIndex: 1 }}>{children}</View>
      </BlurView>
    );
  }

  return (
    <View style={[styles.base, styles.solid, { borderRadius: radius, borderColor }, SHADOW.lg, style]}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  base: {
    borderWidth: 1,
  },
  solid: {
    backgroundColor: GLASS.solidBg,
  },
}));
