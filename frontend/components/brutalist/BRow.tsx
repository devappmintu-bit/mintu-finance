/**
 * BRow — settings list row, brutalist style.
 *
 * Structure:
 *   [ ICON ]  LABEL                VALUE  ▸
 *
 * Rows stack directly (no gap) so borders merge into a Swiss grid
 * whose 1-px inner seam is the 2-px outer border of each row.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
  first?: boolean;          // first row in a stack — keeps top border
  testID?: string;
  rightSlot?: React.ReactNode;
  style?: ViewStyle;
}

export default function BRow({
  icon,
  label,
  value,
  danger,
  onPress,
  first = false,
  rightSlot,
  testID,
  style,
}: Props) {
  const color = danger ? BR_COLORS.negative : BR_COLORS.ink;
  const content = (
    <View style={[
      styles.row,
      { borderTopWidth: first ? BR_BORDER.bold : 0 },
      style,
    ]}>
      {icon ? (
        <View style={[styles.iconBox, danger && { backgroundColor: BR_COLORS.negative }]}>
          <Ionicons
            name={icon}
            size={16}
            color={danger ? '#fff' : BR_COLORS.ink}
          />
        </View>
      ) : null}
      <Text style={[BR_TYPE.body, styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={[BR_TYPE.meta, styles.value]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {rightSlot}
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={danger ? BR_COLORS.negative : BR_COLORS.ink}
          style={styles.chev}
        />
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [
      pressed && { backgroundColor: BR_COLORS.paperAlt },
    ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.md,
    minHeight: 56,
    gap: BR_SPACE.md,
    borderColor: BR_COLORS.line, // SECONDARY tier — 1px GRAY hairline
    borderBottomWidth: BR_BORDER.hair,
    backgroundColor: BR_COLORS.paper,
  },
  iconBox: {
    width: 32, height: 32,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  label: { flex: 1 },
  value: { color: BR_COLORS.muted, maxWidth: 140, textAlign: 'right' },
  chev: { marginLeft: 4 },
});
