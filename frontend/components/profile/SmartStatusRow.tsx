/**
 * SmartStatusRow — SettingsListItem with live status chip and
 * optional inline "Fix now" CTA.
 *
 * Status color mapping:
 *   • ok        → green    (Connected / Synced)
 *   • warn      → amber    (Last sync > 24h / partial)
 *   • error     → red      (Failed / disconnected) → shows "Fix now"
 *   • syncing   → blue     (In-progress, pulses)
 *   • idle      → muted    (Not connected yet)
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  label: { fontSize: 14.5, fontWeight: '500', color: c.text.primary, letterSpacing: -0.1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.1 },
  fixPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: c.state.danger },
  fixPillTxt: { fontSize: 11, fontWeight: '800', color: c.bg.elevated, letterSpacing: 0.2 },
}));

export type RowStatus = 'ok' | 'warn' | 'error' | 'syncing' | 'idle';

export type SmartStatusRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  status: RowStatus;
  statusText?: string;        // e.g., "Synced 2h ago", "Sync failed"
  fixNowLabel?: string;       // override default "Fix now"
  onPress?: () => void;
  onFixNow?: () => void;
  testID?: string;
};

const STATUS_META: Record<RowStatus, { bg: string; fg: string; dot: string; defaultTxt: string }> = {
  ok:      { bg: '#10B98114', fg: COLORS.state.success, dot: COLORS.state.successAlt, defaultTxt: 'Connected' },
  warn:    { bg: '#F59E0B14', fg: '#B45309', dot: COLORS.accent.secondary, defaultTxt: 'Review' },
  error:   { bg: '#EF444414', fg: COLORS.state.danger, dot: COLORS.state.danger, defaultTxt: 'Error' },
  syncing: { bg: '#3B82F614', fg: '#1D4ED8', dot: '#3B82F6', defaultTxt: 'Syncing…' },
  idle:    { bg: '#9CA3AF14', fg: COLORS.text.muted, dot: COLORS.text.muted, defaultTxt: 'Not connected' },
};

export default function SmartStatusRow({
  icon, label, status, statusText, fixNowLabel = 'Fix now',
  onPress, onFixNow, testID,
}: SmartStatusRowProps) {
  const s = useStyles();
  const meta = STATUS_META[status];

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => { haptic(); onPress?.(); }}
      disabled={!onPress}
      activeOpacity={0.6}
      testID={testID}
    >
      <Ionicons name={icon} size={19} color={COLORS.text.muted} style={{ width: 22 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.label} numberOfLines={1}>{label}</Text>
        <View style={s.statusRow}>
          <View style={[s.dot, { backgroundColor: meta.dot }]} />
          <Text style={[s.statusText, { color: meta.fg }]} numberOfLines={1}>
            {statusText || meta.defaultTxt}
          </Text>
        </View>
      </View>

      {status === 'error' && onFixNow ? (
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); haptic(); onFixNow(); }}
          activeOpacity={0.75}
          style={s.fixPill}
        >
          <Text style={s.fixPillTxt}>{fixNowLabel}</Text>
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={'#C4C4C4'} />
      )}
    </TouchableOpacity>
  );
}

