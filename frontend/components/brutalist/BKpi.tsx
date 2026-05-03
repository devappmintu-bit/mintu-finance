/**
 * BKpi — large number + uppercase label in a hard-bordered tile.
 * Used for the Streak / Badges / Coins grid.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

interface Props {
  value: string | number;
  label: string;
  sub?: string;
  tone?: 'paper' | 'accent' | 'ink';
  onPress?: () => void;
  style?: ViewStyle;
}

export default function BKpi({ value, label, sub, tone = 'paper', onPress, style }: Props) {
  const { bg, fg } =
    tone === 'accent' ? { bg: BR_COLORS.accent, fg: '#fff' } :
    tone === 'ink'    ? { bg: BR_COLORS.ink,    fg: '#fff' } :
                        { bg: BR_COLORS.paper,  fg: BR_COLORS.ink };

  const inner = (
    <View style={[styles.tile, { backgroundColor: bg }, style]}>
      <Text style={[BR_TYPE.numLg, { color: fg, fontSize: 36, lineHeight: 38 }]}>{value}</Text>
      <Text style={[BR_TYPE.label, { color: fg, marginTop: 4 }]}>{label}</Text>
      {sub ? <Text style={[BR_TYPE.meta, { color: fg, opacity: 0.8, marginTop: 2 }]}>{sub}</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  tile: {
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    padding: BR_SPACE.md,
    flex: 1,
    minHeight: 92,
    justifyContent: 'flex-end',
  },
});
