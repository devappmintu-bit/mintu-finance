/**
 * BrutalCard — Primary (full brutal) layer.
 *
 * Use for: the single most important surface on screen.
 *   • Balance hero
 *   • Critical alert (account overdraft, missed payment)
 *   • Destructive confirmation
 *   • The ONE CTA a user should tap next
 *
 * Rule of thumb: max ONE BrutalCard per viewport. If you find yourself
 * reaching for a second, use <StructureCard> instead.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { brutalSurfaceStyle } from '../../utils/brutal';

interface Props {
  children: React.ReactNode;
  density?: 'comfortable' | 'compact';
  style?: StyleProp<ViewStyle>;
}

export default function BrutalCard({ children, density = 'comfortable', style }: Props) {
  return (
    <View style={[styles.base, brutalSurfaceStyle('primary', density), style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { marginBottom: 16 },
});
