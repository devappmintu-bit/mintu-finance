/**
 * SettingsGroup + SettingsRow — unified iOS-style grouped settings UI.
 *
 * Use this for all tappable profile rows (log out, delete, connected
 * accounts, preferences, etc.) so every row has identical visual
 * weight and spacing. Creates a clean "modern in-app" feel.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  danger?: boolean;
  badge?: string;
  rightLabel?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  testID?: string;
};

export function SettingsRow({
  icon, iconTint = '#F56E1E', iconBg,
  title, subtitle, danger, badge,
  rightLabel, rightElement,
  onPress, showChevron = true, testID,
}: RowProps) {
  const s = useStyles();
  const tint = danger ? '#EF4444' : iconTint;
  const bg = iconBg || tint + '1A';

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onPress?.();
  };

  return (
    <TouchableOpacity
      style={s.row}
      onPress={handlePress}
      activeOpacity={0.65}
      disabled={!onPress}
      testID={testID}
    >
      <View style={[s.iconBubble, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.titleRow}>
          <Text style={[s.title, danger && { color: '#EF4444' }]} numberOfLines={1}>{title}</Text>
          {badge ? (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={s.sub} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {rightElement ? (
        rightElement
      ) : rightLabel ? (
        <Text style={s.rightLabel}>{rightLabel}</Text>
      ) : null}
      {showChevron && onPress ? (
        <Ionicons name="chevron-forward" size={16} color="#C4C4C4" />
      ) : null}
    </TouchableOpacity>
  );
}

type GroupProps = {
  header?: string;
  footer?: string;
  children: React.ReactNode;
};

export function SettingsGroup({ header, footer, children }: GroupProps) {
  const s = useStyles();
  // Inject a divider between every child row
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginBottom: 14 }}>
      {header ? <Text style={s.header}>{header}</Text> : null}
      <View style={s.card}>
        {rows.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < rows.length - 1 ? <View style={s.divider} /> : null}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: {
    fontSize: 11,
    fontWeight: '800',
    color: c.text.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: 16,
    marginBottom: 8,
  },
  footer: {
    fontSize: 11,
    fontWeight: '500',
    color: c.text.muted,
    marginTop: 8,
    marginHorizontal: 16,
    lineHeight: 15,
  },
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
  },
  iconBubble: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14.5, fontWeight: '700', color: c.text.primary, letterSpacing: -0.1 },
  sub: { fontSize: 11.5, fontWeight: '500', color: c.text.muted, marginTop: 2, lineHeight: 15 },
  badge: {
    backgroundColor: c.accent.primary + '22',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.3 },
  rightLabel: { fontSize: 12, fontWeight: '700', color: c.text.muted },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border.subtle,
    marginLeft: 62, // align past the icon bubble
  },
}));
