/**
 * StructureCard — Secondary (light structure) layer.
 *
 * The workhorse surface. Use for:
 *   • Supporting content cards
 *   • Insight tiles
 *   • List rows that need a container
 *   • Form field groups
 *
 * ~70% of cards in the app should be this layer. It carries content
 * without competing with whichever BrutalCard is the focus.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { brutalSurfaceStyle } from '../../utils/brutal';

interface Props {
  children: React.ReactNode;
  density?: 'comfortable' | 'compact';
  style?: StyleProp<ViewStyle>;
}

export default function StructureCard({ children, density = 'comfortable', style }: Props) {
  return (
    <View style={[styles.base, brutalSurfaceStyle('secondary', density), style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { marginBottom: 12 },
});
