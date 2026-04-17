import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, FlatList, KeyboardAvoidingView, Platform, Linking, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

const UPI_APPS = [
  { id: 'gpay', name: 'Google Pay', color: '#4285F4', icon: 'logo-google' },
  { id: 'phonepe', name: 'PhonePe', color: '#5F259F', icon: 'phone-portrait' },
  { id: 'paytm', name: 'Paytm', color: '#00BAF2', icon: 'wallet' },
  { id: 'bhim', name: 'BHIM', color: '#00695C', icon: 'shield-checkmark' },
];

export default function SplitScreen() {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<any[]>([]);
  const [balances, setBalances] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupSummary, setGroupSummary] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberPhones, setMemberPhones] = useState<string[]>([]);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('Food');
  const [splitType, setSplitType] = useState('equal');
  const [payTarget, setPayTarget] = useState<any>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [gRes, bRes] = await Promise.all([api.get('/split/groups'), api.get('/split/balances')]);
      setGroups(gRes.data); setBalances(bRes.data);
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
        group_id: selectedGroup.id, description: expDesc,
        amount: parseFloat(expAmount), paid_by: user?.id,
        split_type: splitType, category: expCategory,
      });
      setExpenseModal(false); setExpDesc(''); setExpAmount('');
      fetchData();
      Alert.alert('Added!', `₹${expAmount} split ${splitType}ly`);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const openSummary = async (group: any) => {
    try {
      const res = await api.get(`/split/groups/${group.id}/summary`);
      setGroupSummary(res.data);
      setSelectedGroup(group);
      setSummaryModal(true);
    } catch (e) { Alert.alert('Error', 'Could not load summary'); }
  };

  // UPI Payment
  const initiatePayment = (debt: any) => {
    setPayTarget(debt);
    setPayModal(true);
  };

  const payViaUPI = async (appId?: string) => {
    if (!payTarget) return;
    try {
      const res = await api.get(`/split/pay-intent/${payTarget.to_id}?amount=${payTarget.amount}`);
      const { upi_link } = res.data;
      setPayModal(false);
      await Linking.openURL(upi_link);
      // After UPI app opens, ask for confirmation
      setTimeout(() => {
        Alert.alert('Payment Status', 'Did the payment go through?', [
          { text: 'No, Retry', style: 'cancel' },
          { text: 'Yes, Mark Paid', onPress: () => markSettled(payTarget) },
        ]);
      }, 3000);
    } catch (e: any) {
      setPayModal(false);
      Alert.alert('UPI Not Available', 'Mark as paid with cash instead?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark Cash Payment', onPress: () => markSettled({ ...payTarget, method: 'cash' }) },
      ]);
    }
  };

  const markSettled = async (target: any) => {
    try {
      await api.post('/split/settle', {
        target_user_id: target.to_id, amount: target.amount,
        method: target.method || 'upi', group_id: selectedGroup?.id,
      });
      Alert.alert('Settled! 🎉', `₹${target.amount.toFixed(0)} paid to ${target.to_name}`);
      fetchData();
      if (summaryModal && selectedGroup) openSummary(selectedGroup);
    } catch (e) { Alert.alert('Error', 'Could not record settlement'); }
  };

  const remindViaWhatsApp = (name: string, amount: number) => {
    const text = `Hey ${name}! 👋 Friendly reminder: you owe ₹${amount.toFixed(0)} from our shared expenses on MintU. No rush! 😊\n\n📲 Download MintU: https://mintu.app/download`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`).catch(() => Share.share({ message: text }));
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 100 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.pageTitle}>Split</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setCreateModal(true)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Balance Summary */}
        <View style={s.balanceCard}>
          <View style={s.balanceRow}>
            <View style={s.balanceItem}>
              <Text style={[s.balanceVal, { color: '#10B981' }]}>₹{(balances?.total_owed_to_you || 0).toFixed(0)}</Text>
              <Text style={s.balanceLbl}>You're owed</Text>
            </View>
            <View style={s.balanceDivider} />
            <View style={s.balanceItem}>
              <Text style={[s.balanceVal, { color: '#EF4444' }]}>₹{(balances?.total_you_owe || 0).toFixed(0)}</Text>
              <Text style={s.balanceLbl}>You owe</Text>
            </View>
          </View>
        </View>

        {/* Groups */}
        <Text style={s.sectionTitle}>Groups</Text>
        {groups.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="people-outline" size={40} color={COLORS.text.muted} />
            <Text style={s.emptyTitle}>No groups yet</Text>
            <Text style={s.emptyText}>Create a group to split expenses with friends</Text>
          </View>
        ) : (
          groups.map((g: any) => (
            <TouchableOpacity key={g.id} style={s.groupCard} onPress={() => openSummary(g)}>
              <View style={s.groupIcon}><Ionicons name="people" size={20} color={COLORS.accent.primary} /></View>
              <View style={s.groupInfo}>
                <Text style={s.groupName}>{g.name}</Text>
                <Text style={s.groupMembers}>{g.members?.length || 0} members</Text>
              </View>
              <TouchableOpacity style={s.addExpBtn} onPress={() => { setSelectedGroup(g); setExpenseModal(true); }}>
                <Ionicons name="add-circle" size={28} color={COLORS.accent.primary} />
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Create Group Modal */}
      <Modal visible={createModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Group</Text>
              <TouchableOpacity onPress={() => setCreateModal(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Group name (e.g., Goa Trip)" placeholderTextColor={COLORS.text.muted} value={groupName} onChangeText={setGroupName} />
            <View style={s.addMemberRow}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Add member phone" placeholderTextColor={COLORS.text.muted} value={memberPhone} onChangeText={setMemberPhone} keyboardType="phone-pad" maxLength={10} />
              <TouchableOpacity style={s.addMemberBtn} onPress={addMemberPhone}><Ionicons name="person-add" size={20} color="#fff" /></TouchableOpacity>
            </View>
            {memberPhones.map((p, i) => (
              <View key={i} style={s.memberChip}>
                <Ionicons name="person" size={14} color={COLORS.accent.primary} />
                <Text style={s.memberChipText}>{p}</Text>
                <TouchableOpacity onPress={() => setMemberPhones(memberPhones.filter((_, idx) => idx !== i))}><Ionicons name="close-circle" size={18} color={COLORS.text.muted} /></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.submitBtn} onPress={handleCreateGroup}>
              <Text style={s.submitText}>Create Group</Text>
            </TouchableOpacity>
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
            <TextInput style={s.input} placeholder="What's it for? (e.g., Dinner)" placeholderTextColor={COLORS.text.muted} value={expDesc} onChangeText={setExpDesc} />
            <TextInput style={s.input} placeholder="Amount (₹)" placeholderTextColor={COLORS.text.muted} value={expAmount} onChangeText={setExpAmount} keyboardType="numeric" />
            {/* Split Type */}
            <Text style={s.fieldLabel}>Split Type</Text>
            <View style={s.splitTypeRow}>
              {[
                { id: 'equal', label: 'Equal', icon: 'git-compare' },
                { id: 'shares', label: 'By Shares', icon: 'pie-chart' },
                { id: 'custom', label: 'By Amount', icon: 'calculator' },
              ].map((t) => (
                <TouchableOpacity key={t.id} style={[s.splitTypeBtn, splitType === t.id && s.splitTypeActive]} onPress={() => setSplitType(t.id)}>
                  <Ionicons name={t.icon as any} size={16} color={splitType === t.id ? '#fff' : COLORS.text.muted} />
                  <Text style={[s.splitTypeText, splitType === t.id && { color: '#fff' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Category */}
            <Text style={s.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
              {['Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Rent', 'Travel', 'Other'].map((c) => (
                <TouchableOpacity key={c} style={[s.catChip, expCategory === c && s.catChipActive]} onPress={() => setExpCategory(c)}>
                  <Text style={[s.catChipText, expCategory === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.submitBtn} onPress={handleAddExpense}>
              <Text style={s.submitText}>Add Expense</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Summary Modal */}
      <Modal visible={summaryModal} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={[s.modalSheet, { maxHeight: '92%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{groupSummary?.group_name}</Text>
              <TouchableOpacity onPress={() => setSummaryModal(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Stats */}
              <View style={s.summaryStats}>
                <View style={s.sumStat}><Text style={s.sumStatVal}>₹{(groupSummary?.total_spent || 0).toFixed(0)}</Text><Text style={s.sumStatLbl}>Total Spent</Text></View>
                <View style={s.sumStat}><Text style={s.sumStatVal}>{groupSummary?.total_expenses || 0}</Text><Text style={s.sumStatLbl}>Expenses</Text></View>
                <View style={s.sumStat}><Text style={s.sumStatVal}>{groupSummary?.member_count || 0}</Text><Text style={s.sumStatLbl}>Members</Text></View>
              </View>

              {/* Simplified Debts */}
              {groupSummary?.simplified_debts?.length > 0 && (
                <>
                  <Text style={s.sumSection}>Settle Up</Text>
                  {groupSummary.simplified_debts.map((debt: any, i: number) => (
                    <View key={i} style={s.debtRow}>
                      <View style={s.debtInfo}>
                        <Text style={s.debtFrom}>{debt.from_name}</Text>
                        <Ionicons name="arrow-forward" size={14} color={COLORS.text.muted} />
                        <Text style={s.debtTo}>{debt.to_name}</Text>
                      </View>
                      <Text style={s.debtAmt}>₹{debt.amount.toFixed(0)}</Text>
                      <View style={s.debtActions}>
                        <TouchableOpacity style={s.payBtn} onPress={() => initiatePayment(debt)}>
                          <Ionicons name="card" size={14} color="#fff" />
                          <Text style={s.payBtnText}>Pay</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.remindBtn} onPress={() => remindViaWhatsApp(debt.to_name, debt.amount)}>
                          <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Recent Expenses */}
              {groupSummary?.recent_expenses?.length > 0 && (
                <>
                  <Text style={s.sumSection}>Recent Activity</Text>
                  {groupSummary.recent_expenses.map((e: any, i: number) => (
                    <View key={i} style={s.activityRow}>
                      <View style={s.actDot} />
                      <View style={s.actInfo}>
                        <Text style={s.actDesc}>{e.description}</Text>
                        <Text style={s.actMeta}>Paid by {e.paid_by_name}</Text>
                      </View>
                      <Text style={s.actAmt}>₹{e.amount.toFixed(0)}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* Add expense button */}
              <TouchableOpacity style={[s.submitBtn, { marginTop: 16 }]} onPress={() => { setSummaryModal(false); setExpenseModal(true); }}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={s.submitText}> Add Expense</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* UPI Payment Method Modal */}
      <Modal visible={payModal} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.modalTitle}>Pay ₹{payTarget?.amount?.toFixed(0)} to {payTarget?.to_name}</Text>
            <Text style={s.paySubtitle}>Select payment method</Text>
            {UPI_APPS.map((app) => (
              <TouchableOpacity key={app.id} style={s.upiAppRow} onPress={() => payViaUPI(app.id)}>
                <View style={[s.upiAppIcon, { backgroundColor: app.color + '15' }]}>
                  <Ionicons name={app.icon as any} size={22} color={app.color} />
                </View>
                <Text style={s.upiAppName}>{app.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.cashBtn} onPress={() => { setPayModal(false); markSettled({ ...payTarget, method: 'cash' }); }}>
              <Ionicons name="cash" size={18} color={COLORS.accent.primary} />
              <Text style={s.cashBtnText}>Paid in Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setPayModal(false)}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { padding: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // Balance
  balanceCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceItem: { flex: 1, alignItems: 'center' },
  balanceVal: { fontSize: 24, fontWeight: '800' },
  balanceLbl: { fontSize: 12, color: COLORS.text.muted, marginTop: 4 },
  balanceDivider: { width: 1, height: 40, backgroundColor: COLORS.border.subtle },
  // Groups
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: SPACING.md },
  emptyCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xxxl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.card, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary },
  emptyText: { fontSize: 13, color: COLORS.text.muted },
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border.card },
  groupIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary },
  groupMembers: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  addExpBtn: { marginRight: 8 },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  input: { backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 14, fontSize: 16, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, marginBottom: SPACING.md },
  addMemberRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  addMemberBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary + '10', paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: 8 },
  memberChipText: { fontSize: 14, color: COLORS.accent.primary, fontWeight: '500' },
  submitBtn: { flexDirection: 'row', backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md },
  submitText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Split type
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted, marginBottom: 8 },
  splitTypeRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  splitTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.primary, borderWidth: 1, borderColor: COLORS.border.subtle },
  splitTypeActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  splitTypeText: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted },
  catRow: { gap: 8, marginBottom: SPACING.lg },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.primary, borderWidth: 1, borderColor: COLORS.border.subtle },
  catChipActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  catChipText: { fontSize: 13, fontWeight: '500', color: COLORS.text.secondary },
  // Summary
  summaryStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  sumStat: { alignItems: 'center' },
  sumStatVal: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary },
  sumStatLbl: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  sumSection: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: SPACING.md, marginTop: SPACING.md },
  // Debts
  debtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, gap: 8 },
  debtInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  debtFrom: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
  debtTo: { fontSize: 14, fontWeight: '600', color: '#10B981' },
  debtAmt: { fontSize: 16, fontWeight: '800', color: COLORS.text.primary, marginRight: 8 },
  debtActions: { flexDirection: 'row', gap: 6 },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accent.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full },
  payBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  remindBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#25D36612', justifyContent: 'center', alignItems: 'center' },
  // Activity
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  actDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent.primary },
  actInfo: { flex: 1 },
  actDesc: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  actMeta: { fontSize: 12, color: COLORS.text.muted },
  actAmt: { fontSize: 15, fontWeight: '700', color: COLORS.text.primary },
  // UPI Payment
  paySubtitle: { fontSize: 14, color: COLORS.text.muted, marginBottom: SPACING.lg },
  upiAppRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  upiAppIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  upiAppName: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.text.primary },
  cashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: SPACING.md, borderRadius: RADIUS.full, backgroundColor: COLORS.accent.primary + '10' },
  cashBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.accent.primary },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { fontSize: 15, fontWeight: '500', color: COLORS.text.muted },
});
