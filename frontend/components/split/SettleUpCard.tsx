import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { C, DebtRow } from './theme';

type Props = {
  rows: DebtRow[];
  onPay: (row: DebtRow) => void;
  onRemind: (row: DebtRow) => void;
  onMarkPaid: (row: DebtRow, method?: 'cash' | 'bank_transfer') => void;
};

export default function SettleUpCard({ rows, onPay, onRemind, onMarkPaid }: Props) {
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
          <Text style={[s.settleAmt, { color: row.direction === 'i_owe' ? C.red : C.green }]}>
            {`₹${row.amount.toFixed(0)}`}
          </Text>
          {row.direction === 'i_owe' ? (
            <>
              <TouchableOpacity onPress={() => onPay(row)} style={{ marginLeft: 8 }}>
                <LinearGradient colors={[C.accent, C.accentLight]} style={s.settleBtn}>
                  <Ionicons name="flash" size={12} color={C.inv} />
                  <Text style={s.settleBtnT}>Pay</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onMarkPaid(row, 'cash')} style={s.settleIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="checkmark-done" size={18} color={C.text3} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => onRemind(row)} style={{ marginLeft: 8 }}>
              <LinearGradient colors={['#F59E0B', '#FB923C']} style={s.settleBtn}>
                <Ionicons name="notifications" size={12} color={C.inv} />
                <Text style={s.settleBtnT}>Remind</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      ))}
      {rows.length > 4 && (
        <Text style={s.settleMore}>{`+ ${rows.length - 4} more — tap a group to see all`}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  settleCard: { backgroundColor: C.card, borderRadius: 20, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
  settleHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  settleTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: C.accent },
  settleCount: { fontSize: 11, fontWeight: '700', color: C.text3, backgroundColor: C.accentDim, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  settleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  settleEmoji: { fontSize: 20 },
  settleName: { fontSize: 14, fontWeight: '700', color: C.text1 },
  settleGroup: { fontSize: 11, color: C.text3, marginTop: 1 },
  settleAmt: { fontSize: 15, fontWeight: '800', marginLeft: 6 },
  settleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  settleBtnT: { fontSize: 12, fontWeight: '700', color: C.inv },
  settleIconBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginLeft: 4, backgroundColor: COLORS.bg.primary, borderWidth: 1, borderColor: C.border },
  settleMore: { fontSize: 12, color: C.text3, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
});
