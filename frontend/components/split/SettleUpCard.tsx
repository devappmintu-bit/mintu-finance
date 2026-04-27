import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {  COLORS, SHADOW, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import PressableGlass from '../PressableGlass';
import { C, DebtRow } from './theme';

type Props = {
  rows: DebtRow[];
  onPay: (row: DebtRow) => void;
  onRemind: (row: DebtRow) => void;
  onMarkPaid: (row: DebtRow, method?: 'cash' | 'bank_transfer') => void;
};

export default function SettleUpCard({ rows, onPay, onRemind, onMarkPaid }: Props) {
  const s = useStyles();
  const c = useAppColors();
  if (!rows || rows.length === 0) return null;
  return (
    <View style={s.settleCard}>
      <View style={s.settleHead}>
        <Ionicons name="flash" size={14} color={C.accent} />
        <Text style={s.settleTitle}>SETTLE UP</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.settleCount}>{rows.length}</Text>
      </View>
      {rows.slice(0, 4).map((row: DebtRow, i: number) => (
        <View key={`${row.from_id}-${row.to_id}-${i}`} style={s.settleRow}>
          <Text style={s.settleEmoji}>{row.group_emoji}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={s.settleName}>
              {row.direction === 'i_owe' ? `To ${row.to_name}` : `From ${row.from_name}`}
            </Text>
            <Text numberOfLines={1} style={s.settleGroup}>{row.group_name}</Text>
          </View>
          <Text style={[s.settleAmt, { color: row.direction === 'i_owe' ? C.red : C.green }]} numberOfLines={1}>
            {`\u20b9${row.amount.toFixed(0)}`}
          </Text>
          {row.direction === 'i_owe' ? (
            <>
              <PressableGlass onPress={() => onPay(row)} feedback="medium" style={{ marginLeft: 8 }}>
                <LinearGradient colors={[C.accent, C.accentLight]} style={s.settleBtn}>
                  <Ionicons name="flash" size={12} color={C.inv} />
                  <Text style={s.settleBtnT}>Pay</Text>
                </LinearGradient>
              </PressableGlass>
              <PressableGlass onPress={() => onMarkPaid(row, 'cash')} feedback="light" style={s.settleIconBtn} hitSlop={8}>
                <Ionicons name="checkmark-done" size={18} color={C.text3} />
              </PressableGlass>
            </>
          ) : (
            <PressableGlass onPress={() => onRemind(row)} feedback="light" style={{ marginLeft: 8 }} hitSlop={8}>
              <LinearGradient colors={[COLORS.accent.secondary, '#FB923C']} style={s.settleBellBtn}>
                <Ionicons name="notifications" size={18} color={C.inv} />
              </LinearGradient>
            </PressableGlass>
          )}
        </View>
      ))}
      {rows.length > 4 && (
        <Text style={s.settleMore}>{`+ ${rows.length - 4} more \u2014 tap a group to see all`}</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  settleCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 22,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    ...SHADOW.md,
  },
  settleHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  settleTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: C.accent },
  settleCount: { fontSize: 11, fontWeight: '700', color: C.text3, backgroundColor: C.accentDim, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  settleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  settleEmoji: { fontSize: 20 },
  settleName: { fontSize: 14, fontWeight: '700', color: C.text1 },
  settleGroup: { fontSize: 11, color: C.text3, marginTop: 1 },
  settleAmt: { fontSize: 15, fontWeight: '800', marginLeft: 6 },
  settleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  settleBtnT: { fontSize: 12, fontWeight: '700', color: C.inv },
  // Bell-only reminder button — no text, per design ask
  settleBellBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  settleIconBtn: {
    width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: 4,
    backgroundColor: c.bg.primary, borderWidth: 1, borderColor: C.border,
  },
  settleMore: { fontSize: 12, color: C.text3, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
}));
