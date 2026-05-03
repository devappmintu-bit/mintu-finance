/**
 * BControlPanel — a state-aware control tile for the Command Center grid.
 *
 * Unlike a plain settings row, each control panel surfaces:
 *   • icon              — affordance
 *   • title             — control name (e.g., "Security")
 *   • status            — live current state (e.g., "BIO · ON")
 *   • optional flag     — alert dot if attention needed
 *
 * Visual: SECONDARY tier (1px gray hairline, no stamp) so the grid
 * recedes behind the primary HERO + AI blocks.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

export interface BControlPanelProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  status?: string;          // e.g., "BIO · ON" / "ENGLISH" / "NOT LINKED"
  alert?: boolean;          // shows a tiny accent dot near the icon
  onPress: () => void;
  testID?: string;
  style?: ViewStyle;
}

export default function BControlPanel({ icon, title, status, alert, onPress, testID, style }: BControlPanelProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.iconRow}>
        <View style={styles.iconBox}>
          <Ionicons name={icon} size={18} color={BR_COLORS.ink} />
        </View>
        {alert ? <View style={styles.alertDot} /> : null}
      </View>
      <Text style={[BR_TYPE.bodyBold, styles.title]} numberOfLines={1}>{title}</Text>
      {status ? (
        <Text style={styles.status} numberOfLines={1}>{status}</Text>
      ) : (
        <Text style={[styles.status, { color: BR_COLORS.muted }]}>—</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '50%',
    paddingVertical: BR_SPACE.lg,
    paddingHorizontal: BR_SPACE.lg,
    borderColor: BR_COLORS.line,
    borderRightWidth: BR_BORDER.hair,
    borderBottomWidth: BR_BORDER.hair,
    backgroundColor: BR_COLORS.paper,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  iconRow: { flexDirection: 'row', alignItems: 'center' },
  iconBox: {
    width: 28, height: 28,
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.hair,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  alertDot: {
    width: 8, height: 8,
    backgroundColor: BR_COLORS.accent,
    marginLeft: 6,
  },
  title: { color: BR_COLORS.ink, marginTop: BR_SPACE.md },
  status: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: BR_COLORS.ink,
    marginTop: 2,
  },
  pressed: { backgroundColor: BR_COLORS.paperAlt },
});
