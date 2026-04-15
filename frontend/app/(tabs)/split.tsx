import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

export default function SplitScreen() {
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [groups, setGroups] = useState<any[]>([]);
  const [balances, setBalances] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberPhones, setMemberPhones] = useState<string[]>([]);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [gRes, bRes] = await Promise.all([api.get('/split/groups'), api.get('/split/balances')]);
      setGroups(gRes.data);
      setBalances(bRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) { Alert.alert('Error', 'Enter group name'); return; }
    try {
      await api.post('/split/groups', { name: groupName, members: memberPhones });
      setCreateModal(false); setGroupName(''); setMemberPhones([]);
      fetchData();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const addMemberPhone = () => {
    const p = memberPhone.replace(/\D/g, '');
    if (p.length === 10 && !memberPhones.includes(p)) { setMemberPhones([...memberPhones, p]); setMemberPhone(''); }
  };

  const handleAddExpense = async () => {
    if (!expDesc || !expAmount || !selectedGroup) return;
    try {
      await api.post('/split/expenses', {
        group_id: selectedGroup.id,
        description: expDesc,
        amount: parseFloat(expAmount),
        paid_by: user?.id,
        split_type: 'equal',
      });
      setExpenseModal(false); setExpDesc(''); setExpAmount('');
      fetchData();
      Alert.alert('Done!', 'Expense split equally');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 100 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} testID="split-screen">
        <View style={s.header}>
          <Text style={s.pageTitle}>Split</Text>
          <TouchableOpacity testID="create-split-group-btn" style={s.addBtn} onPress={() => setCreateModal(true)}>
            <Ionicons name="add" size={22} color={COLORS.text.inverse} />
          </TouchableOpacity>
        </View>

        {/* Balance Summary */}
        {balances && (
          <View style={s.balanceCard}>
            <View style={s.balRow}>
              <View style={s.balItem}>
                <Text style={s.balLabel}>You're owed</Text>
                <Text style={[s.balAmount, { color: COLORS.accent.moneyIn }]}>{'\u20B9'}{balances.total_owed_to_you.toFixed(0)}</Text>
              </View>
              <View style={s.balDivider} />
              <View style={s.balItem}>
                <Text style={s.balLabel}>You owe</Text>
                <Text style={[s.balAmount, { color: COLORS.accent.moneyOut }]}>{'\u20B9'}{balances.total_you_owe.toFixed(0)}</Text>
              </View>
            </View>
            {/* People who owe you */}
            {Object.entries(balances.owe_you || {}).map(([name, amt]: [string, any]) => (
              <View key={name} style={s.personRow}>
                <View style={[s.personAvatar, { backgroundColor: COLORS.accent.moneyIn + '15' }]}>
                  <Ionicons name="person" size={16} color={COLORS.accent.moneyIn} />
                </View>
                <Text style={s.personName}>{name}</Text>
                <Text style={[s.personAmt, { color: COLORS.accent.moneyIn }]}>+{'\u20B9'}{amt.toFixed(0)}</Text>
              </View>
            ))}
            {Object.entries(balances.you_owe || {}).map(([name, amt]: [string, any]) => (
              <View key={name} style={s.personRow}>
                <View style={[s.personAvatar, { backgroundColor: COLORS.accent.moneyOut + '15' }]}>
                  <Ionicons name="person" size={16} color={COLORS.accent.moneyOut} />
                </View>
                <Text style={s.personName}>{name}</Text>
                <Text style={[s.personAmt, { color: COLORS.accent.moneyOut }]}>-{'\u20B9'}{amt.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Groups */}
        <Text style={s.section}>Groups</Text>
        {groups.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color={COLORS.text.muted} />
            <Text style={s.emptyTitle}>No split groups yet</Text>
            <Text style={s.emptyText}>Create a group to split expenses with friends</Text>
          </View>
        )}
        {groups.map((g: any) => (
          <TouchableOpacity
            key={g.id}
            style={s.groupCard}
            onPress={() => { setSelectedGroup(g); setExpenseModal(true); }}
          >
            <View style={s.groupIcon}>
              <Ionicons name="people" size={22} color={COLORS.accent.primary} />
            </View>
            <View style={s.groupInfo}>
              <Text style={s.groupName}>{g.name}</Text>
              <Text style={s.groupMeta}>{g.members?.length} members · {'\u20B9'}{(g.total_expenses || 0).toFixed(0)} total</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Create Group Modal */}
      <Modal visible={createModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Split Group</Text>
              <TouchableOpacity onPress={() => setCreateModal(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <Text style={s.formLabel}>Group Name</Text>
            <TextInput style={s.input} placeholder="e.g. Goa Trip, Flat Expenses" placeholderTextColor={COLORS.text.muted} value={groupName} onChangeText={setGroupName} />
            <Text style={s.formLabel}>Add Members (phone)</Text>
            <View style={s.addMemberRow}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Phone number" placeholderTextColor={COLORS.text.muted} value={memberPhone} onChangeText={setMemberPhone} keyboardType="phone-pad" maxLength={10} />
              <TouchableOpacity style={s.addMemberBtn} onPress={addMemberPhone}><Ionicons name="add" size={20} color={COLORS.text.inverse} /></TouchableOpacity>
            </View>
            {memberPhones.map((p, i) => (
              <View key={i} style={s.chipRow}>
                <Text style={s.chipTxt}>+91 {p}</Text>
                <TouchableOpacity onPress={() => setMemberPhones(memberPhones.filter((_, j) => j !== i))}><Ionicons name="close-circle" size={18} color={COLORS.text.muted} /></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.submitBtn} onPress={handleCreateGroup}><Text style={s.submitText}>Create Group</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Expense Modal */}
      <Modal visible={expenseModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add Expense</Text>
              <TouchableOpacity onPress={() => setExpenseModal(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            {selectedGroup && <Text style={s.groupLabel}>{selectedGroup.name} · {selectedGroup.members?.length} members</Text>}
            <Text style={s.formLabel}>Description</Text>
            <TextInput style={s.input} placeholder="e.g. Dinner, Uber, Groceries" placeholderTextColor={COLORS.text.muted} value={expDesc} onChangeText={setExpDesc} />
            <Text style={s.formLabel}>Amount</Text>
            <View style={s.amountRow}>
              <Text style={s.rupee}>{'\u20B9'}</Text>
              <TextInput style={s.amountInput} placeholder="0" placeholderTextColor={COLORS.text.muted} value={expAmount} onChangeText={setExpAmount} keyboardType="numeric" />
            </View>
            <View style={s.splitInfo}>
              <Ionicons name="git-compare" size={16} color={COLORS.accent.primary} />
              <Text style={s.splitInfoText}>Split equally among {selectedGroup?.members?.length || 0} members</Text>
            </View>
            <TouchableOpacity style={s.submitBtn} onPress={handleAddExpense}><Text style={s.submitText}>Add & Split</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { padding: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.5 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  section: { fontSize: 16, fontWeight: '700', color: COLORS.text.secondary, marginTop: SPACING.lg, marginBottom: SPACING.md },
  // Balance
  balanceCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border.card, marginBottom: SPACING.lg },
  balRow: { flexDirection: 'row', marginBottom: SPACING.lg },
  balItem: { flex: 1, alignItems: 'center' },
  balDivider: { width: 1, backgroundColor: COLORS.border.subtle },
  balLabel: { fontSize: 13, color: COLORS.text.muted, marginBottom: 4 },
  balAmount: { fontSize: 26, fontWeight: '800' },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border.subtle },
  personAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  personName: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  personAmt: { fontSize: 16, fontWeight: '700' },
  // Groups
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border.card },
  groupIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '600', color: COLORS.text.primary },
  groupMeta: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.secondary, marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.text.muted, marginTop: 6 },
  // Modals
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  groupLabel: { fontSize: 14, color: COLORS.accent.primary, fontWeight: '500', marginBottom: SPACING.lg },
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted, marginBottom: 8 },
  input: { backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: 16, fontSize: 16, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, marginBottom: SPACING.lg },
  addMemberRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
  addMemberBtn: { width: 52, borderRadius: RADIUS.xl, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8, alignSelf: 'flex-start' },
  chipTxt: { fontSize: 14, color: COLORS.text.primary },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.subtle },
  rupee: { fontSize: 24, fontWeight: '700', color: COLORS.accent.primary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: COLORS.text.primary, paddingVertical: 16 },
  splitInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.accent.primary + '10', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  splitInfoText: { fontSize: 13, color: COLORS.accent.primary, fontWeight: '500' },
  submitBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center' },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.text.inverse },
});
