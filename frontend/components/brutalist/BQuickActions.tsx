/**
 * BQuickActions — 2x2 brutalist quick-action grid.
 *
 * Replaces the "20 settings rows" with the 4 highest-leverage entry
 * points: Settings · Payments · Goals · Progress.
 *
 * Each tile is a SECONDARY-tier surface (1px gray hairline, no stamp).
 * Icons are functional + retained here (Section 3 = "where icons should
 * stay" per the spec). Heavy text labels keep the brutalist signature.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

export interface QuickAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}

export default function BQuickActions({ items, style }: { items: QuickAction[]; style?: ViewStyle }) {
  return (
    <View style={[styles.grid, style]}>
      {items.map((it, i) => (
        <Pressable
          key={i}
          onPress={it.onPress}
          testID={it.testID}
          style={({ pressed }) => [
            styles.tile,
            { borderTopWidth: i < 2 ? BR_BORDER.hair : 0, borderLeftWidth: i % 2 === 0 ? BR_BORDER.hair : 0 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name={it.icon} size={22} color={BR_COLORS.ink} />
          <Text style={[BR_TYPE.bodyBold, styles.label]} numberOfLines={1}>
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Outer container: right + bottom rules for the grid; left + top come
    // from each tile so the inner seams remain a single 1px hairline.
    borderRightWidth: BR_BORDER.hair,
    borderBottomWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.paper,
  },
  tile: {
    width: '50%',
    paddingVertical: BR_SPACE.lg,
    paddingHorizontal: BR_SPACE.lg,
    borderRightWidth: BR_BORDER.hair,
    borderBottomWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.md,
    minHeight: 64,
    backgroundColor: BR_COLORS.paper,
  },
  label: { color: BR_COLORS.ink, flex: 1 },
  pressed: { backgroundColor: BR_COLORS.paperAlt },
});
