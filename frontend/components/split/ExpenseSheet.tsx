import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { C, MEMBER_COLORS, SPLIT_TYPES } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  group: any;
  currentUserId?: string;
  editing?: any; // if provided, edits existing expense instead of creating
  onSubmit: (payload: { description: string; amount: number; split_type: string; splits: Record<string, number>; expense_id?: string }) => void;
};

export default function ExpenseSheet({ visible, onClose, group, currentUserId, editing, onSubmit }: Props) {
  const s = useStyles();
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [splitType, setSplitType] = useState('equal');
  const [memberAmts, setMemberAmts] = useState<Record<string, string>>({});
  const [memberOn, setMemberOn] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible && group) {
      const on: Record<string, boolean> = {}; const a: Record<string, string> = {};
      (group.members || []).forEach((m: any) => { on[m.user_id] = true; a[m.user_id] = ''; });
      if (editing) {
        setAmount(String(editing.amount || ''));
        setDesc(editing.description || '');
        const st = editing.split_type || 'equal';
        setSplitType(st);
        const sp = editing.splits || {};
        (group.members || []).forEach((m: any) => {
          on[m.user_id] = m.user_id in sp;
          if (st === 'custom') a[m.user_id] = sp[m.user_id] != null ? String(sp[m.user_id]) : '';
          else if (st === 'percentage' && editing.amount) a[m.user_id] = sp[m.user_id] != null ? String(Math.round((sp[m.user_id] / editing.amount) * 100)) : '';
          else if (st === 'shares') a[m.user_id] = '1';
          else a[m.user_id] = '';
        });
      } else {
        setAmount(''); setDesc(''); setSplitType('equal');
      }
      setMemberOn(on); setMemberAmts(a);
    }
  }, [visible, group, editing]);

  // Splitwise-accurate split math. For "equal", we hand the last person the
  // rounding remainder so the sum ALWAYS equals the bill amount (no ₹0.50 loss).
  const getSplit = (mid: string) => {
    const amt = parseFloat(amount) || 0;
    const en = Object.entries(memberOn).filter(([_, v]) => v);
    const cnt = en.length || 1;
    if (splitType === 'equal') {
      const base = Math.floor((amt / cnt) * 100) / 100;
      const isLast = en[en.length - 1]?.[0] === mid;
      if (!isLast) return base.toFixed(0);
      const rem = Math.round((amt - base * (cnt - 1)) * 100) / 100;
      return rem.toFixed(0);
    }
    if (splitType === 'custom') return memberAmts[mid] || '0';
    if (splitType === 'shares') {
      const t = en.reduce((sum, [id]) => sum + (parseFloat(memberAmts[id]) || 1), 0) || 1;
      return ((amt * (parseFloat(memberAmts[mid]) || 1)) / t).toFixed(0);
    }
    return '0';
  };

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || !group) { Toast.show({ type: 'error', text1: 'Error', text2: 'Enter valid amount' }); return; }
    const en = Object.entries(memberOn).filter(([_, v]) => v).map(([id]) => id);
    if (en.length < 2) { Toast.show({ type: 'error', text1: 'Error', text2: 'Select at least 2 members' }); return; }

    const splits: Record<string, number> = {};

    if (splitType === 'equal') {
      // Floor every member's share to 2 decimals, then give the LAST person the
      // rounding remainder. Guarantees Σ splits === amt exactly.
      const base = Math.floor((amt / en.length) * 100) / 100;
      let assigned = 0;
      en.forEach((id, i) => {
        if (i === en.length - 1) splits[id] = Math.round((amt - assigned) * 100) / 100;
        else { splits[id] = base; assigned += base; }
      });
    } else if (splitType === 'shares') {
      const total = en.reduce((sum, id) => sum + (parseFloat(memberAmts[id]) || 1), 0) || 1;
      let assigned = 0;
      en.forEach((id, i) => {
        const raw = amt * (parseFloat(memberAmts[id]) || 1) / total;
        if (i === en.length - 1) splits[id] = Math.round((amt - assigned) * 100) / 100;
        else { splits[id] = Math.round(raw * 100) / 100; assigned += splits[id]; }
      });
    } else { // custom exact
      const sumCustom = en.reduce((sum, id) => sum + (parseFloat(memberAmts[id]) || 0), 0);
      if (Math.abs(sumCustom - amt) > 0.01) {
        Toast.show({ type: 'error', text1: 'Amounts don\'t match', text2: `Total must be ₹${amt.toFixed(0)} — currently ₹${sumCustom.toFixed(0)}` });
        return;
      }
      en.forEach(id => { splits[id] = Math.round((parseFloat(memberAmts[id]) || 0) * 100) / 100; });
    }
    onSubmit({ description: desc || 'Expense', amount: amt, split_type: splitType, splits, expense_id: editing?.id });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
        <View style={[s.sheet, { maxHeight: '92%' }]}>
          <View style={s.handle} />
          <TouchableOpacity style={s.closeFloat} onPress={onClose}><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
          <Text style={s.expLabel}>{editing ? 'Edit expense' : 'Split expense'}</Text>
          <View style={s.amtRow}>
            <Text style={s.rupee}>{'₹'}</Text>
            <TextInput style={s.amtInput} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={C.text4} />
          </View>
          <TextInput style={s.descInput} value={desc} onChangeText={setDesc} placeholder="What's this for?" placeholderTextColor={C.text4} />
          <View style={s.splitTabs}>
            {SPLIT_TYPES.map((t) => (
              <TouchableOpacity key={t.id} style={[s.splitTab, splitType === t.id && s.splitTabOn]} onPress={() => setSplitType(t.id)}>
                <Ionicons name={t.icon as any} size={16} color={splitType === t.id ? C.accent : C.text3} />
                <Text style={[s.splitTabT, splitType === t.id && { color: C.accent }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView style={{ maxHeight: 260 }}>
            {(group?.members || []).map((m: any, idx: number) => {
              const on = memberOn[m.user_id] !== false;
              const isMe = m.user_id === currentUserId;
              const clr = MEMBER_COLORS[idx % MEMBER_COLORS.length];
              return (
                <View key={m.user_id} style={s.memRow}>
                  <TouchableOpacity onPress={() => setMemberOn({ ...memberOn, [m.user_id]: !on })}>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? C.accent : C.text4} />
                  </TouchableOpacity>
                  <View style={[s.memAv, { backgroundColor: clr + '15' }]}>
                    <Text style={[s.memInit, { color: clr }]}>{(m.name || '?')[0]}</Text>
                  </View>
                  <View style={s.memInfo}>
                    <Text style={s.memName}>{isMe ? 'You' : m.name}</Text>
                    {splitType === 'equal' && on && <Text style={s.memAmt}>{`₹${getSplit(m.user_id)}`}</Text>}
                  </View>
                  {splitType === 'custom' && (
                    <View style={s.amtWrap}>
                      <Text style={s.amtPre}>{'₹'}</Text>
                      <TextInput style={s.memAmtIn} value={memberAmts[m.user_id]} onChangeText={v => setMemberAmts({ ...memberAmts, [m.user_id]: v })} keyboardType="numeric" placeholder="0" placeholderTextColor={C.text4} />
                    </View>
                  )}
                  {splitType === 'shares' && (
                    <View style={s.sharesW}>
                      <TouchableOpacity style={s.shareBtn} onPress={() => setMemberAmts({ ...memberAmts, [m.user_id]: String(Math.max(0, (parseFloat(memberAmts[m.user_id]) || 1) - 1)) })}>
                        <Ionicons name="remove" size={16} color={C.text3} />
                      </TouchableOpacity>
                      <Text style={s.shareV}>{memberAmts[m.user_id] || '1'}</Text>
                      <TouchableOpacity style={s.shareBtn} onPress={() => setMemberAmts({ ...memberAmts, [m.user_id]: String((parseFloat(memberAmts[m.user_id]) || 1) + 1) })}>
                        <Ionicons name="add" size={16} color={C.text3} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={handleSubmit}>
            <LinearGradient colors={[C.accent, C.accentLight]} style={s.primaryBtn}>
              <Text style={s.primaryBtnText}>{editing ? `Update ₹${amount || '0'}` : (desc.trim() ? `Split ₹${amount || '0'} for ${desc.trim()}` : `Split ₹${amount || '0'}`)}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  closeFloat: { position: 'absolute', right: 24, top: 24, zIndex: 10 },
  expLabel: { textAlign: 'center', fontSize: 14, color: C.text3, marginTop: 8 },
  amtRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  rupee: { fontSize: 36, fontWeight: '300', color: C.text3, marginRight: 4 },
  amtInput: { fontSize: 48, fontWeight: '800', color: C.text1, minWidth: 60, textAlign: 'center' },
  descInput: { textAlign: 'center', fontSize: 15, color: C.text2, paddingVertical: 10, borderWidth: 1, borderColor: C.border, borderRadius: 20, marginBottom: 16 },
  splitTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 12 },
  splitTab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 4 },
  splitTabOn: { borderBottomWidth: 2, borderBottomColor: C.accent },
  splitTabT: { fontSize: 11, fontWeight: '600', color: C.text4 },
  memRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  memAv: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  memInit: { fontSize: 14, fontWeight: '700' },
  memInfo: { flex: 1 },
  memName: { fontSize: 15, fontWeight: '600', color: C.text1 },
  memAmt: { fontSize: 12, color: C.accent, marginTop: 2 },
  amtWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.primary, borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: C.border },
  amtPre: { fontSize: 14, color: C.text3 },
  amtSuf: { fontSize: 14, color: C.text3, marginLeft: 2 },
  memAmtIn: { fontSize: 16, fontWeight: '600', color: C.text1, width: 60, textAlign: 'right', paddingVertical: 6 },
  sharesW: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.bg.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  shareV: { fontSize: 18, fontWeight: '700', color: C.text1, width: 24, textAlign: 'center' },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.inv },
}));
