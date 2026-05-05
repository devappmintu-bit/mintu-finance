/**
 * PassivePane — Passive (no border) layer.
 *
 * Ambient. Use for:
 *   • Group containers that shouldn't read as "important"
 *   • Info strips (legal, tips, context)
 *   • Background bands (news stack frame, premium teaser)
 *   • Getting-started / onboarding hints (low urgency)
 *
 * Zero border, zero shadow, tinted fill — content sits on top of the
 * canvas with only padding and a gentle tone shift separating it.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { brutalSurfaceStyle } from '../../../utils/brutal';

interface Props {
  children: React.ReactNode;
  density?: 'comfortable' | 'compact';
  style?: StyleProp<ViewStyle>;
}

export default function PassivePane({ children, density = 'comfortable', style }: Props) {
  return (
    <View style={[styles.base, brutalSurfaceStyle('passive', density), style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { marginBottom: 12 },
});
