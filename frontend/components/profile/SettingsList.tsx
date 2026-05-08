/**
 * SettingsList — list-based (NOT card-based) settings section.
 *
 * Renders uppercase section header + plain list items with
 * icon + label + chevron. No card backgrounds, no borders around
 * groups — just subtle hairline dividers between items.
 *
 * Phase 5 Wave 2: both components are React.memo-wrapped so parent
 * re-renders (e.g. profile.tsx on every unrelated state tick) don't
 * cascade repaints into each row.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  group: { marginBottom: 22 },
  header: {
    fontSize: 11,
    fontWeight: '700',
    color: c.text.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  label: { flex: 1, fontSize: 14.5, fontWeight: '500', color: c.text.primary, letterSpacing: -0.1 },
  value: { fontSize: 12.5, fontWeight: '500', color: c.text.muted, marginRight: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border.subtle,
    marginLeft: 40,
  },
}));

export type SettingsListItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
  testID?: string;
};

// Module-scoped haptic — no per-render closure allocation.
function triggerHaptic() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

function SettingsListItemImpl({ icon, label, value, danger, onPress, testID }: SettingsListItemProps) {
  const s = useStyles();
  const handlePress = React.useCallback(() => {
    triggerHaptic();
    onPress?.();
  }, [onPress]);

  return (
    <TouchableOpacity
      style={s.item}
      onPress={handlePress}
      disabled={!onPress}
      activeOpacity={0.55}
      testID={testID}
    >
      <Ionicons
        name={icon}
        size={19}
        color={danger ? COLORS.state.danger : styles.iconColor}
        style={{ width: 22 }}
      />
      <Text style={[s.label, danger && { color: COLORS.state.danger }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={s.value} numberOfLines={1}>{value}</Text> : null}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={'#C4C4C4'}
      />
    </TouchableOpacity>
  );
}

export const SettingsListItem = React.memo(SettingsListItemImpl);
SettingsListItem.displayName = 'SettingsListItem';

function SettingsListImpl({ header, children }: { header: string; children: React.ReactNode }) {
  const s = useStyles();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={s.group}>
      <Text style={s.header}>{header}</Text>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {child}
          {i < items.length - 1 ? <View style={s.divider} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

export const SettingsList = React.memo(SettingsListImpl);
SettingsList.displayName = 'SettingsList';

const styles = { iconColor: COLORS.text.muted };

