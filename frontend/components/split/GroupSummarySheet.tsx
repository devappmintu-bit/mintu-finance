import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { C, getGA } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  summary: any;
  onAddExpense: () => void;
  onEditExpense: (exp: any) => void;
  onDeleteExpense: (exp: any) => void;
  onPay: (debt: any) => void;
  onRemindLegacy: (name: string, amt: number) => void;
  // Round 38 — optional rename/leave hooks. Passed by split.tsx; the sheet
  // gracefully degrades if a caller doesn't wire them.
  onRename?: () => void;
  onLeave?: () => void;
  hasOutstandingBalance?: boolean;
};

export default function GroupSummarySheet({ visible, onClose, summary, onAddExpense, onEditExpense, onDeleteExpense, onPay, onRemindLegacy, onRename, onLeave, hasOutstandingBalance }: Props) {
  const s = useStyles();
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.mBg}>
        <View style={[s.sheet, { maxHeight: '92%' }]} accessibilityViewIsModal>
          <View style={s.handle} />
          <View style={s.sheetH}>
            <LinearGradient colors={getGA(summary?.group_name || '').colors.map((c: string) => c + '25') as any} style={s.groupAv}>
              <Text style={{ fontSize: 16 }}>{getGA(summary?.group_name || '').emoji}</Text>
            </LinearGradient>
            <Text style={[s.sheetT, { flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">{summary?.group_name}</Text>
            {/* Round 38 — kebab menu for rename / leave when callbacks provided */}
            {(onRename || onLeave) && (
              <TouchableOpacity
                onPress={() => {
                  // Tiny inline action sheet via Alert — no extra component needed.
                  const RN = require('react-native');
                  const opts: any[] = [];
                  if (onRename) opts.push({ text: 'Rename group', onPress: onRename });
                  if (onLeave) opts.push({
                    text: 'Leave group',
                    style: 'destructive',
                    onPress: () => {
                      if (hasOutstandingBalance) {
                        RN.Alert.alert('Settle first', 'You have an outstanding balance in this group. Settle up before leaving.');
                      } else {
                        RN.Alert.alert('Leave group?', "You won't see new expenses or be added to splits.", [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Leave', style: 'destructive', onPress: onLeave },
                        ]);
                      }
                    },
                  });
                  opts.push({ text: 'Cancel', style: 'cancel' });
                  RN.Alert.alert(summary?.group_name || 'Group', undefined, opts);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="More options"
                style={{ marginRight: 6 }}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={C.text3} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.sumStats}>
              <View style={s.sumStat}>
                <Text style={s.sumV}>{`₹${(summary?.total_spent || 0).toFixed(0)}`}</Text>
                <Text style={s.sumL}>Total</Text>
              </View>
              <View style={s.sumStat}><Text style={s.sumV}>{summary?.total_expenses || 0}</Text><Text style={s.sumL}>Expenses</Text></View>
              <View style={s.sumStat}><Text style={s.sumV}>{summary?.member_count || 0}</Text><Text style={s.sumL}>Members</Text></View>
            </View>
            {summary?.simplified_debts?.length > 0 && (
              <>
                <Text style={s.sumSec}>Settle Up</Text>
                {summary.simplified_debts.map((d: any, i: number) => (
                  <View key={i} style={s.debtRow}>
                    <View style={s.debtInfo}>
                      <Text style={[s.debtN, { color: C.red }]} numberOfLines={1}>{d.from_name}</Text>
                      <Ionicons name="arrow-forward" size={14} color={C.text4} />
                      <Text style={[s.debtN, { color: C.green }]} numberOfLines={1}>{d.to_name}</Text>
                    </View>
                    <Text style={s.debtA}>{`₹${d.amount.toFixed(0)}`}</Text>
                    <TouchableOpacity onPress={() => onPay(d)} accessibilityRole="button" accessibilityLabel={`Pay ₹${Math.round(d.amount)} to ${d.to_name}`}>
                      <LinearGradient colors={[C.accent, C.accentLight]} style={s.payBtn}>
                        <Ionicons name="card" size={14} color={C.inv} />
                        <Text style={s.payBtnT}>Pay</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.waBtn} onPress={() => onRemindLegacy(d.to_name, d.amount)} accessibilityRole="button" accessibilityLabel={`Remind ${d.to_name} on WhatsApp`}>
                      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
            {/* Round 38 — All-settled celebratory state when no debts */}
            {summary && (!summary.simplified_debts || summary.simplified_debts.length === 0) && (
              <View style={s.allSettled}>
                <Text style={{ fontSize: 24 }}>🎉</Text>
                <Text style={s.allSettledTxt}>Everyone's settled up</Text>
              </View>
            )}
            {summary?.recent_expenses?.length > 0 && (
              <>
                <Text style={s.sumSec}>Activity</Text>
                {summary.recent_expenses.map((e: any, i: number) => {
                  // Round 38 — derive a relative date so users can scan
                  // who-paid-when at a glance.
                  let dateLbl = '';
                  if (e.created_at || e.date) {
                    try {
                      const dt = new Date(e.created_at || e.date);
                      const days = Math.floor((Date.now() - dt.getTime()) / 86400000);
                      dateLbl = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? `${days}d ago` : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    } catch {}
                  }
                  return (
                    <View key={i} style={s.actRow}>
                      <View style={s.actDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.actDesc} numberOfLines={1} ellipsizeMode="tail">{e.description}</Text>
                        <Text style={s.actMeta} numberOfLines={1}>Paid by {e.paid_by_name}{dateLbl ? `  ·  ${dateLbl}` : ''}</Text>
                      </View>
                      <Text style={s.actAmt}>{`₹${e.amount.toFixed(0)}`}</Text>
                      <TouchableOpacity onPress={() => onEditExpense(e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.actIcon} accessibilityRole="button" accessibilityLabel={`Edit ${e.description}`}>
                        <Ionicons name="create-outline" size={18} color={C.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => onDeleteExpense(e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.actIcon} accessibilityRole="button" accessibilityLabel={`Delete ${e.description}`}>
                        <Ionicons name="trash-outline" size={18} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}
            <TouchableOpacity onPress={onAddExpense} accessibilityRole="button" accessibilityLabel="Add expense to group">
              <LinearGradient colors={[C.accent, C.accentLight]} style={[s.primaryBtn, { marginTop: 16 }]}>
                <Ionicons name="add" size={18} color={C.inv} />
                <Text style={s.primaryBtnText}> Add Expense</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  sheetH: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  sheetT: { fontSize: 20, fontWeight: '700', color: C.text1 },
  groupAv: { width: 36, height: 36, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  sumStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: c.bg.primary, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  sumStat: { alignItems: 'center' },
  sumV: { fontSize: 20, fontWeight: '800', color: C.text1 },
  sumL: { fontSize: 11, color: C.text3, marginTop: 2 },
  sumSec: { fontSize: 16, fontWeight: '700', color: C.text1, marginBottom: 10, marginTop: 12 },
  debtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 6 },
  debtInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  debtN: { fontSize: 14, fontWeight: '600' },
  debtA: { fontSize: 16, fontWeight: '800', color: C.text1 },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  payBtnT: { fontSize: 13, fontWeight: '700', color: C.inv },
  waBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(37,211,102,0.1)', justifyContent: 'center', alignItems: 'center' },
  actRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  actDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  actDesc: { fontSize: 14, fontWeight: '600', color: C.text1 },
  actMeta: { fontSize: 12, color: C.text3 },
  actAmt: { fontSize: 15, fontWeight: '700', color: C.text1 },
  actIcon: { padding: 4, marginLeft: 4 },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.inv },
  // Round 38 — celebratory "all-settled" empty state for the debts section.
  allSettled: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.35)',
    borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
    marginTop: 4, marginBottom: 8,
  },
  allSettledTxt: { fontSize: 14, fontWeight: '700', color: '#059669' },
}));
