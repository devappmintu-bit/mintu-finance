import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Alert, Platform, Linking, Share, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { SplitSkeleton } from '../../components/SkeletonLoader';
import GroupChat from '../../components/GroupChat';
import { C, getGA, DebtRow } from '../../components/split/theme';
import SettleUpCard from '../../components/split/SettleUpCard';
import RemindersBanner from '../../components/split/RemindersBanner';
import LeaderboardCard from '../../components/split/LeaderboardCard';
import CreateGroupSheet from '../../components/split/CreateGroupSheet';
import ExpenseSheet from '../../components/split/ExpenseSheet';
import GroupSummarySheet from '../../components/split/GroupSummarySheet';
import GroupManageSheet from '../../components/split/GroupManageSheet';
import PaySheet from '../../components/split/PaySheet';
import RemindSheet from '../../components/split/RemindSheet';
import RewardModal from '../../components/split/RewardModal';

export default function SplitScreen() {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<any[]>([]);
  const [balances, setBalances] = useState<any>(null);
  const [settleLB, setSettleLB] = useState<any>(null);
  const [settleRows, setSettleRows] = useState<DebtRow[]>([]);
  const [reminders, setReminders] = useState<{ received: any[]; sent: any[] }>({ received: [], sent: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupSummary, setGroupSummary] = useState<any>(null);
  const [groupManage, setGroupManage] = useState<any>(null);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [lastReward, setLastReward] = useState<any>(null);
  const [chatGroup, setChatGroup] = useState<any>(null);
  const [remindTarget, setRemindTarget] = useState<DebtRow | null>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);

  // Flatten simplified_debts across all groups for main-screen Settle Up list
  const fetchSettleRows = useCallback(async (grps: any[]) => {
    if (!user?.id || !grps?.length) { setSettleRows([]); return; }
    try {
      const summaries = await Promise.all(
        grps.map((g: any) => api.get(`/split/groups/${g.id}/summary`).then(r => ({ g, d: r.data })).catch(() => null))
      );
      const rows: DebtRow[] = [];
      summaries.forEach((s: any) => {
        if (!s) return;
        const { g, d } = s;
        const emoji = getGA(g.name).emoji;
        (d?.simplified_debts || []).forEach((db: any) => {
          if (db.from_id === user.id || db.to_id === user.id) {
            rows.push({
              group_id: g.id, group_name: g.name, group_emoji: emoji,
              from_id: db.from_id, from_name: db.from_name,
              to_id: db.to_id, to_name: db.to_name,
              amount: db.amount,
              direction: db.from_id === user.id ? 'i_owe' : 'owed_to_me',
            });
          }
        });
      });
      rows.sort((a, b) => b.amount - a.amount);
      setSettleRows(rows);
    } catch (e) { console.error('settleRows', e); }
  }, [user?.id]);

  const fetchData = useCallback(async () => {
    try {
      const [gR, bR, lR, rR] = await Promise.all([
        api.get('/split/groups'),
        api.get('/split/balances'),
        api.get('/split/settlement-leaderboard').catch(() => ({ data: null })),
        api.get('/split/reminders').catch(() => ({ data: { received: [], sent: [] } })),
      ]);
      setGroups(gR.data); setBalances(bR.data);
      if (lR.data) setSettleLB(lR.data);
      if (rR.data) setReminders({ received: rR.data.received || [], sent: rR.data.sent || [] });
      fetchSettleRows(gR.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetchSettleRows]);

  useEffect(() => { fetchData(); }, []);
  const close = () => { setModal(''); setRemindTarget(null); setEditingExpense(null); };

  // GROUP CRUD
  const createGroup = async (name: string, phones: string[]) => {
    try {
      await api.post('/split/groups', { name, members: phones });
      close(); fetchData();
      Toast.show({ type: 'success', text1: 'Group Created!', text2: `${name} is ready` });
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };

  const deleteGroup = () => {
    if (!selectedGroup?.id) return;
    const gid = selectedGroup.id; const gname = selectedGroup.name || 'this group';
    Alert.alert('Delete Group', `Delete "${gname}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/split/groups/${gid}`);
          Toast.show({ type: 'success', text1: 'Deleted!', text2: `${gname} removed` });
        } catch (e: any) {
          Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not delete' });
        }
        close(); setTimeout(() => fetchData(), 300);
      }},
    ]);
  };

  const renameGroup = async (newName: string) => {
    if (!newName.trim() || !selectedGroup?.id) return;
    try {
      await api.put(`/split/groups/${selectedGroup.id}/name`, { name: newName });
      openManage(selectedGroup); fetchData();
      Toast.show({ type: 'success', text1: 'Renamed!' });
    } catch {}
  };

  const addMember = async (phone: string) => {
    if (!selectedGroup?.id) return;
    try {
      const r = await api.post(`/split/groups/${selectedGroup.id}/members`, { phones: [phone] });
      Toast.show({ type: 'success', text1: 'Done!', text2: r.data.message });
      openManage(selectedGroup); fetchData();
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };

  const removeMember = async (mid: string) => {
    if (!selectedGroup?.id) return;
    try {
      await api.delete(`/split/groups/${selectedGroup.id}/members/${mid}`);
      Toast.show({ type: 'success', text1: 'Member Removed' });
    } catch {}
    openManage(selectedGroup); setTimeout(() => fetchData(), 300);
  };

  const leaveGroup = () => {
    if (!selectedGroup?.id) return;
    const gid = selectedGroup.id;
    Alert.alert('Leave?', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await api.delete(`/split/groups/${gid}/leave`); Toast.show({ type: 'success', text1: 'Left Group' }); } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not leave' }); }
        close(); setTimeout(() => fetchData(), 300);
      }},
    ]);
  };

  // EXPENSE CRUD
  const openAddExpense = (gr: any) => { setSelectedGroup(gr); setEditingExpense(null); setModal('expense'); };
  const openEditExpense = (exp: any) => { setEditingExpense(exp); setModal('expense'); };
  const submitExpense = async (payload: { description: string; amount: number; split_type: string; splits: Record<string, number>; expense_id?: string }) => {
    if (!selectedGroup) return;
    try {
      if (payload.expense_id) {
        await api.put(`/split/expenses/${payload.expense_id}`, {
          description: payload.description, amount: payload.amount,
          split_type: payload.split_type, splits: payload.splits,
        });
        close();
        // Refresh summary if user was viewing it
        if (groupSummary) openSummary(selectedGroup);
        fetchData();
        Toast.show({ type: 'success', text1: 'Updated!', text2: `₹${payload.amount.toFixed(0)} re-split` });
      } else {
        await api.post('/split/expenses', { group_id: selectedGroup.id, paid_by: user?.id, ...payload });
        close(); fetchData();
        Toast.show({ type: 'success', text1: 'Added!', text2: `₹${payload.amount} split among ${Object.keys(payload.splits).length} people` });
      }
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };
  const deleteExpense = (exp: any) => {
    Alert.alert('Delete expense?', `Delete "${exp.description}" (₹${exp.amount.toFixed(0)})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/split/expenses/${exp.id}`);
          Toast.show({ type: 'success', text1: 'Deleted ✅' });
          if (selectedGroup) openSummary(selectedGroup);
          fetchData();
        } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Failed' }); }
      }},
    ]);
  };

  // SUMMARY & MANAGE
  const openSummary = async (gr: any) => {
    try { const r = await api.get(`/split/groups/${gr.id}/summary`); setGroupSummary(r.data); setSelectedGroup(gr); setModal('summary'); }
    catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not load' }); }
  };
  const openManage = async (gr: any) => {
    try { const r = await api.get(`/split/groups/${gr.id}/manage`); setGroupManage(r.data); setSelectedGroup(gr); setModal('manage'); }
    catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not load' }); }
  };

  // PAYMENTS
  const openPay = (target: { to_id: string; to_name: string; amount: number; group_id?: string }) => {
    setPayTarget(target);
    if (target.group_id) setSelectedGroup({ ...(selectedGroup || {}), id: target.group_id });
    setModal('pay');
  };

  const payViaUPI = async () => {
    if (!payTarget) return;
    const { to_id, to_name, amount, group_id } = payTarget;
    try {
      const r = await api.get(`/split/pay-intent/${to_id}?amount=${amount}`);
      setModal('');
      if (Platform.OS === 'web') {
        setTimeout(() => Alert.alert('Simulated Payment',
          `Pay ₹${amount.toFixed(0)} to ${to_name}?\n(UPI deep-link only works on phone.)`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm Paid', onPress: () => settleReward({ to_id, to_name, amount, method: 'upi', group_id }) },
          ]), 100);
        return;
      }
      await Linking.openURL(r.data.upi_link);
      setTimeout(() => Alert.alert('Payment Status', 'Did the payment go through?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Paid', onPress: () => settleReward({ to_id, to_name, amount, method: 'upi', group_id }) },
      ]), 2500);
    } catch (e: any) {
      setModal('');
      const msg = e?.response?.data?.detail || '';
      const isUpiErr = msg.toLowerCase().includes('upi');
      Alert.alert(isUpiErr ? 'UPI Not Set Up' : 'Payment Error',
        isUpiErr ? `${to_name} hasn't added their UPI ID yet. Pay in cash instead?` : 'Could not start payment. Try marking as cash?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark as Cash', onPress: () => settleReward({ to_id, to_name, amount, method: 'cash', group_id }) },
        ]);
    }
  };

  const settleReward = async (t: any) => {
    try {
      const r = await api.post('/split/settle-with-rewards', { target_user_id: t.to_id, amount: t.amount, method: t.method || 'upi', group_id: t.group_id });
      setLastReward(r.data.reward); setModal('reward'); fetchData();
    } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not settle' }); }
  };

  const partialSettle = async (partialAmt: number) => {
    if (!payTarget) return;
    const { to_id, to_name, group_id } = payTarget;
    try {
      const r = await api.post('/split/partial-settle', { target_user_id: to_id, amount: partialAmt, method: 'upi', group_id });
      close();
      Toast.show({ type: 'success', text1: `Partial ₹${partialAmt.toFixed(0)} paid to ${to_name}`, text2: `+${r.data.coins_earned} 🪙` });
      fetchData();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Failed' });
    }
  };

  const markPaidOffline = (row: DebtRow, method: 'cash' | 'bank_transfer' = 'cash') => {
    Alert.alert('Mark as Paid?',
      `Mark ₹${row.amount.toFixed(0)} to ${row.to_name} as paid in ${method === 'cash' ? 'cash' : 'bank transfer'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: async () => {
          try {
            const r = await api.post('/split/mark-paid-offline', { target_user_id: row.to_id, amount: row.amount, group_id: row.group_id, method });
            Toast.show({ type: 'success', text1: 'Marked as paid ✅', text2: r.data.message });
            fetchData();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Failed' });
          }
        }},
      ]);
  };

  const openRemind = (row: DebtRow) => { setRemindTarget(row); setModal('remind'); };
  const sendReminder = async (note: string) => {
    if (!remindTarget) return;
    const targetUserId = remindTarget.direction === 'owed_to_me' ? remindTarget.from_id : remindTarget.to_id;
    const targetName = remindTarget.direction === 'owed_to_me' ? remindTarget.from_name : remindTarget.to_name;
    try {
      const r = await api.post('/split/remind', { target_user_id: targetUserId, amount: remindTarget.amount, group_id: remindTarget.group_id, note });
      close();
      Toast.show({ type: 'success', text1: `Reminded ${targetName} 🔔`, text2: 'Opening WhatsApp...' });
      if (Platform.OS !== 'web' && r.data.whatsapp_link) {
        setTimeout(() => {
          Linking.openURL(r.data.whatsapp_link).catch(() => { Share.share({ message: r.data.whatsapp_text }); });
        }, 400);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed';
      if (String(msg).toLowerCase().includes('already sent')) {
        Toast.show({ type: 'info', text1: 'Already Reminded', text2: 'Wait 1 hour before sending again' });
        close();
      } else { Toast.show({ type: 'error', text1: 'Error', text2: msg }); }
    }
  };

  const dismissReminder = async (rid: string) => {
    try { await api.post(`/split/reminders/${rid}/dismiss`); fetchData(); } catch {}
  };

  // Legacy WhatsApp-only remind kept for Summary modal row buttons
  const remindLegacy = (name: string, amt: number) => {
    const t = `Hey ${name}! You owe ₹${amt.toFixed(0)} on MintU. Settle up?\n📲 https://mintu.app/download`;
    if (Platform.OS === 'web') { Toast.show({ type: 'success', text1: 'Reminder link', text2: t.slice(0, 60) + '...' }); return; }
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(t)}`).catch(() => Share.share({ message: t }));
  };

  const coins = settleLB?.my_stats?.coins || 0;

  if (loading) return (
    <SafeAreaView style={s.bg}><SplitSkeleton /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.bg}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={C.accent} />}>
        {/* HEADER */}
        <View style={s.header}>
          <Text style={s.title}>Split</Text>
          <View style={s.headerR}>
            <View style={s.coinPill}><Text style={s.coinText}>🪙 {coins}</Text></View>
            <TouchableOpacity onPress={() => setModal('create')}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={s.addBtn}>
                <Ionicons name="add" size={22} color={C.inv} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* BALANCE */}
        <View style={s.balCard}>
          <View style={s.balRow}>
            <View style={s.balH}>
              <Text style={[s.balV, { color: C.green }]}>{`₹${(balances?.total_owed_to_you || 0).toFixed(0)}`}</Text>
              <Text style={s.balL}>You're owed</Text>
            </View>
            <View style={s.balD} />
            <View style={s.balH}>
              <Text style={[s.balV, { color: C.red }]}>{`₹${(balances?.total_you_owe || 0).toFixed(0)}`}</Text>
              <Text style={s.balL}>You owe</Text>
            </View>
          </View>
        </View>

        <RemindersBanner received={reminders.received} onDismiss={dismissReminder} />

        <SettleUpCard
          rows={settleRows}
          onPay={(row) => openPay({ to_id: row.to_id, to_name: row.to_name, amount: row.amount, group_id: row.group_id })}
          onRemind={openRemind}
          onMarkPaid={markPaidOffline}
        />

        <LeaderboardCard settleLB={settleLB} />

        {/* GROUPS */}
        <Text style={s.section}>Groups</Text>
        {groups.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="people-outline" size={48} color={C.text4} />
            <Text style={s.emptyTitle}>No groups yet</Text>
            <Text style={s.emptyText}>Tap + to create your first split group</Text>
          </View>
        ) : groups.map((gr: any) => {
          const av = getGA(gr.name);
          return (
            <TouchableOpacity key={gr.id} style={s.groupCard} onPress={() => setChatGroup(gr)} activeOpacity={0.7}>
              <LinearGradient colors={av.colors.map(c => c + '20') as any} style={s.groupAv}>
                <Text style={s.groupEmoji}>{av.emoji}</Text>
              </LinearGradient>
              <View style={s.groupInfo}>
                <Text style={s.groupName}>{gr.name}</Text>
                <Text style={s.groupMeta}>{`${gr.members?.length || 0} members`}</Text>
              </View>
              <TouchableOpacity onPress={() => openAddExpense(gr)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="add-circle" size={30} color={C.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openManage(gr)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginLeft: 8 }}>
                <Ionicons name="ellipsis-vertical" size={20} color={C.text3} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* === SHEETS === */}
      <CreateGroupSheet visible={modal === 'create'} onClose={close} onCreate={createGroup} />
      <ExpenseSheet visible={modal === 'expense'} onClose={close} group={selectedGroup} currentUserId={user?.id} editing={editingExpense} onSubmit={submitExpense} />
      <GroupSummarySheet
        visible={modal === 'summary'}
        onClose={close}
        summary={groupSummary}
        onAddExpense={() => { close(); setTimeout(() => openAddExpense(selectedGroup), 200); }}
        onEditExpense={(exp: any) => { close(); setTimeout(() => openEditExpense(exp), 200); }}
        onDeleteExpense={deleteExpense}
        onPay={(d: any) => { setPayTarget({ to_id: d.to_id, to_name: d.to_name, amount: d.amount, group_id: selectedGroup?.id }); setModal('pay'); }}
        onRemindLegacy={remindLegacy}
      />
      <GroupManageSheet
        visible={modal === 'manage'}
        onClose={close}
        manage={groupManage}
        currentUserId={user?.id}
        onRename={renameGroup}
        onAddMember={addMember}
        onRemoveMember={removeMember}
        onDelete={deleteGroup}
        onLeave={leaveGroup}
      />
      <PaySheet
        visible={modal === 'pay'}
        onClose={close}
        target={payTarget}
        onPayUPI={payViaUPI}
        onPayCash={() => { setModal(''); if (payTarget) settleReward({ ...payTarget, method: 'cash' }); }}
        onPayPartial={partialSettle}
      />
      <RemindSheet visible={modal === 'remind'} onClose={close} target={remindTarget} onSend={sendReminder} />
      <RewardModal visible={modal === 'reward'} reward={lastReward} onClose={() => { close(); fetchData(); }} />

      {/* === GROUP CHAT === */}
      <Modal visible={!!chatGroup} animationType="slide">
        {chatGroup && (
          <GroupChat
            group={chatGroup}
            onClose={() => { setChatGroup(null); fetchData(); }}
            onAddExpense={(gr) => { setChatGroup(null); openAddExpense(gr); }}
            onManage={(gr) => { setChatGroup(null); openManage(gr); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: C.text1, letterSpacing: -0.5 },
  headerR: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.goldDim, borderWidth: 1, borderColor: 'rgba(255,179,0,0.2)' },
  coinText: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  addBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  balCard: { backgroundColor: C.card, borderRadius: 24, padding: 22, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
  balRow: { flexDirection: 'row', alignItems: 'center' },
  balH: { flex: 1, alignItems: 'center' },
  balV: { fontSize: 26, fontWeight: '800' },
  balL: { fontSize: 12, color: C.text3, marginTop: 4 },
  balD: { width: 1, height: 40, backgroundColor: C.border },
  section: { fontSize: 16, fontWeight: '700', color: C.text1, marginBottom: 12 },
  emptyCard: { backgroundColor: C.card, borderRadius: 24, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: C.cardBorder, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3 },
  emptyText: { fontSize: 13, color: C.text4 },
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder },
  groupAv: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  groupEmoji: { fontSize: 20 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '700', color: C.text1 },
  groupMeta: { fontSize: 12, color: C.text3, marginTop: 2 },
});
