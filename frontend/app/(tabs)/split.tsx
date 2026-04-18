import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Linking, Share,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';
import { SplitSkeleton } from '../../components/SkeletonLoader';
import GroupChat from '../../components/GroupChat';

// Warm Glass theme — matches app palette
const C = {
  bg: COLORS.bg.primary,
  card: 'rgba(255,255,255,0.92)',
  cardBorder: 'rgba(238,221,204,0.7)',
  glass: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(230,81,0,0.06)',
  accent: COLORS.accent.primary,
  accentLight: COLORS.accent.primaryLight,
  accentDim: 'rgba(230,81,0,0.08)',
  green: COLORS.accent.moneyIn,
  greenDim: 'rgba(46,125,50,0.08)',
  red: COLORS.accent.moneyOut,
  redDim: 'rgba(211,47,47,0.08)',
  gold: COLORS.accent.secondary,
  goldDim: 'rgba(255,179,0,0.12)',
  blue: '#1565C0',
  purple: '#6A1B9A',
  text1: COLORS.text.primary,
  text2: COLORS.text.secondary,
  text3: COLORS.text.muted,
  text4: '#C5B5A8',
  border: COLORS.border.subtle,
  sheetBg: '#FFFFFF',
  inv: '#FFFFFF',
};

const MEMBER_COLORS = ['#E65100', '#FFB300', '#2E7D32', '#D32F2F', '#6A1B9A', '#C62828', '#1565C0', '#F57F17'];
const GROUP_ICONS: Record<string, { emoji: string; colors: string[] }> = {
  trip: { emoji: '\u2708\uFE0F', colors: ['#0EA5E9', '#6366F1'] },
  goa: { emoji: '\uD83C\uDFD6\uFE0F', colors: ['#F59E0B', '#EF4444'] },
  flat: { emoji: '\uD83C\uDFE0', colors: ['#8B5CF6', '#6366F1'] },
  office: { emoji: '\uD83D\uDCBC', colors: ['#3B82F6', '#6366F1'] },
  food: { emoji: '\uD83C\uDF55', colors: ['#EF4444', '#F97316'] },
  dinner: { emoji: '\uD83C\uDF7D\uFE0F', colors: ['#EC4899', '#F43F5E'] },
  rent: { emoji: '\uD83C\uDFE1', colors: ['#10B981', '#059669'] },
  party: { emoji: '\uD83C\uDF89', colors: ['#F97316', '#EF4444'] },
  team: { emoji: '\uD83D\uDC65', colors: ['#3B82F6', '#0EA5E9'] },
  family: { emoji: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66', colors: ['#059669', '#10B981'] },
  default: { emoji: '\uD83D\uDCB0', colors: ['#E65100', '#FF7D33'] },
};
const getGA = (n: string) => {
  const l = n.toLowerCase();
  for (const [k, v] of Object.entries(GROUP_ICONS)) { if (k !== 'default' && l.includes(k)) return v; }
  return GROUP_ICONS.default;
};

const UPI_APPS = [
  { id: 'gpay', name: 'Google Pay', color: '#4285F4', icon: 'logo-google' },
  { id: 'phonepe', name: 'PhonePe', color: '#5F259F', icon: 'phone-portrait' },
  { id: 'paytm', name: 'Paytm', color: '#00BAF2', icon: 'wallet' },
  { id: 'bhim', name: 'BHIM', color: '#00695C', icon: 'shield-checkmark' },
];
const SPLIT_TYPES = [
  { id: 'equal', icon: 'git-compare', label: 'Equal' },
  { id: 'custom', icon: 'calculator', label: '₹ Amt' },
  { id: 'shares', icon: 'add-circle-outline', label: 'Shares' },
  { id: 'percentage', icon: 'pie-chart', label: '%' },
];

// Build a flat "Settle Up" list across all groups — each entry is a pending debt row.
// We use simplified_debts from each group summary: rows where `from_id === me` (I owe) OR `to_id === me` (they owe me).
type DebtRow = {
  group_id: string;
  group_name: string;
  group_emoji: string;
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  amount: number;
  direction: 'i_owe' | 'owed_to_me';
};

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
  const [groupName, setGroupName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phones, setPhones] = useState<string[]>([]);
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [splitType, setSplitType] = useState('equal');
  const [memberAmts, setMemberAmts] = useState<Record<string, string>>({});
  const [memberOn, setMemberOn] = useState<Record<string, boolean>>({});
  const [addPhoneVal, setAddPhoneVal] = useState('');
  const [renameVal, setRenameVal] = useState('');
  const [showRename, setShowRename] = useState(false);
  const [chatGroup, setChatGroup] = useState<any>(null);
  const [remindNote, setRemindNote] = useState('');
  const [remindTarget, setRemindTarget] = useState<DebtRow | null>(null);

  // Fetch simplified debts across all groups in parallel and flatten into one list
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
        api.get('/split/groups'), api.get('/split/balances'),
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
  const close = () => { setModal(''); setShowRename(false); setRemindNote(''); setRemindTarget(null); };

  // GROUP CRUD
  const createGroup = async () => {
    if (!groupName.trim()) { Toast.show({ type: 'error', text1: 'Error', text2: 'Enter group name' }); return; }
    try {
      await api.post('/split/groups', { name: groupName, members: phones });
      close(); setGroupName(''); setPhones([]); fetchData();
      Toast.show({ type: 'success', text1: 'Group Created!', text2: `${groupName} is ready` });
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };
  const deleteGroup = (gr: any) => {
    if (!gr?.id) { Toast.show({ type: 'error', text1: 'Error', text2: 'No group selected' }); return; }
    const gid = gr.id; const gname = gr.name || 'this group';
    Alert.alert('Delete Group', `Delete "${gname}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const resp = await api.delete(`/split/groups/${gid}`);
          Toast.show({ type: 'success', text1: 'Deleted!', text2: `${gname} removed` });
        } catch (e: any) {
          console.error('Delete group error:', e?.response?.data || e);
          Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not delete' });
        }
        close(); setTimeout(() => fetchData(), 300);
      }},
    ]);
  };
  const renameGroup = async () => {
    if (!renameVal.trim()) return;
    try { await api.put(`/split/groups/${selectedGroup?.id}/name`, { name: renameVal.trim() }); setShowRename(false); openManage(selectedGroup); fetchData(); Toast.show({ type: 'success', text1: 'Renamed!' }); } catch {}
  };
  const addMember = async () => {
    const p = addPhoneVal.replace(/\D/g, '').slice(-10);
    if (p.length !== 10) { Toast.show({ type: 'error', text1: 'Error', text2: 'Enter valid 10-digit number' }); return; }
    try { const r = await api.post(`/split/groups/${selectedGroup?.id}/members`, { phones: [p] }); Toast.show({ type: 'success', text1: 'Done!', text2: r.data.message }); setAddPhoneVal(''); openManage(selectedGroup); fetchData(); } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };
  const removeMember = (mid: string) => {
    Alert.alert('Remove?', 'Remove from group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/split/groups/${selectedGroup?.id}/members/${mid}`);
          Toast.show({ type: 'success', text1: 'Member Removed' });
        } catch (e: any) { console.error('Remove member:', e?.response?.data || e); }
        if (selectedGroup) openManage(selectedGroup); setTimeout(() => fetchData(), 300);
      }},
    ]);
  };
  const leaveGroup = () => {
    if (!selectedGroup?.id) return;
    const gid = selectedGroup.id;
    Alert.alert('Leave?', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/split/groups/${gid}/leave`);
          Toast.show({ type: 'success', text1: 'Left Group' });
        } catch (e: any) {
          console.error('Leave group:', e?.response?.data || e);
          Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not leave' });
        }
        close(); setTimeout(() => fetchData(), 300);
      }},
    ]);
  };
  const addPhoneToList = () => {
    const nums = phoneInput.split(',').map(p => p.replace(/\D/g, '').slice(-10)).filter(p => p.length === 10 && !phones.includes(p));
    if (nums.length) { setPhones([...phones, ...nums]); setPhoneInput(''); }
  };

  // EXPENSE CRUD
  const openAddExpense = (gr: any) => {
    setSelectedGroup(gr); setExpAmount(''); setExpDesc(''); setSplitType('equal');
    const on: Record<string, boolean> = {}; const a: Record<string, string> = {};
    (gr.members || []).forEach((m: any) => { on[m.user_id] = true; a[m.user_id] = ''; });
    setMemberOn(on); setMemberAmts(a); setModal('expense');
  };
  const getSplit = (mid: string) => {
    const amt = parseFloat(expAmount) || 0; const en = Object.entries(memberOn).filter(([_, v]) => v); const cnt = en.length || 1;
    if (splitType === 'equal') return (amt / cnt).toFixed(0);
    if (splitType === 'custom') return memberAmts[mid] || '0';
    if (splitType === 'shares') { const t = en.reduce((s, [id]) => s + (parseFloat(memberAmts[id]) || 1), 0); return ((amt * (parseFloat(memberAmts[mid]) || 1)) / t).toFixed(0); }
    if (splitType === 'percentage') return ((amt * (parseFloat(memberAmts[mid]) || 0)) / 100).toFixed(0);
    return '0';
  };
  const addExpense = async () => {
    const amt = parseFloat(expAmount);
    if (!amt || !selectedGroup) { Toast.show({ type: 'error', text1: 'Error', text2: 'Enter valid amount' }); return; }
    const en = Object.entries(memberOn).filter(([_, v]) => v).map(([id]) => id);
    if (en.length < 2) { Toast.show({ type: 'error', text1: 'Error', text2: 'Select at least 2 members' }); return; }
    let splits: Record<string, number> = {};
    if (splitType === 'equal') { const p = amt / en.length; en.forEach(id => { splits[id] = Math.round(p * 100) / 100; }); }
    else if (splitType === 'shares') { const t = en.reduce((s, id) => s + (parseFloat(memberAmts[id]) || 1), 0); en.forEach(id => { splits[id] = Math.round(amt * (parseFloat(memberAmts[id]) || 1) / t * 100) / 100; }); }
    else if (splitType === 'percentage') { en.forEach(id => { splits[id] = Math.round(amt * (parseFloat(memberAmts[id]) || 0) / 100 * 100) / 100; }); }
    else { en.forEach(id => { splits[id] = parseFloat(memberAmts[id]) || 0; }); }
    try {
      await api.post('/split/expenses', { group_id: selectedGroup.id, description: expDesc || 'Expense', amount: amt, paid_by: user?.id, split_type: splitType, splits });
      close(); fetchData();
      Toast.show({ type: 'success', text1: 'Added!', text2: `₹${amt} split among ${en.length} people` });
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };
  const deleteExpense = (eid: string) => Alert.alert('Delete?', 'Remove this expense?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.delete(`/split/expenses/${eid}`); } catch (e) { console.error('Delete expense error:', e); } if (selectedGroup) openSummary(selectedGroup); fetchData(); } },
  ]);

  // SUMMARY & MANAGE
  const openSummary = async (gr: any) => { try { const r = await api.get(`/split/groups/${gr.id}/summary`); setGroupSummary(r.data); setSelectedGroup(gr); setModal('summary'); } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not load' }); } };
  const openManage = async (gr: any) => { try { const r = await api.get(`/split/groups/${gr.id}/manage`); setGroupManage(r.data); setSelectedGroup(gr); setModal('manage'); } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not load' }); } };

  // PAYMENTS
  const payViaUPI = async () => {
    if (!payTarget) return;
    const amount = payTarget.amount;
    const targetId = payTarget.to_id;
    const targetName = payTarget.to_name;
    try {
      const r = await api.get(`/split/pay-intent/${targetId}?amount=${amount}`);
      setModal('');
      if (Platform.OS === 'web') {
        // Web can't open upi:// — simulate payment confirmation flow directly
        setTimeout(() => Alert.alert(
          'Simulated Payment',
          `Pay ₹${amount.toFixed(0)} to ${targetName}?\n(UPI deep-link only works on phone. Confirming will mark as paid.)`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm Paid', onPress: () => settleReward({ to_id: targetId, to_name: targetName, amount, method: 'upi', group_id: payTarget.group_id }) },
          ]
        ), 100);
        return;
      }
      // Native — open UPI app
      await Linking.openURL(r.data.upi_link);
      setTimeout(() => Alert.alert('Payment Status', 'Did the payment go through?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Paid', onPress: () => settleReward({ to_id: targetId, to_name: targetName, amount, method: 'upi', group_id: payTarget.group_id }) },
      ]), 2500);
    } catch (e: any) {
      setModal('');
      const msg = e?.response?.data?.detail || '';
      if (msg.includes('UPI')) {
        Alert.alert('UPI Not Set Up', `${targetName} hasn't added their UPI ID yet. Pay in cash instead?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark as Cash', onPress: () => settleReward({ to_id: targetId, to_name: targetName, amount, method: 'cash', group_id: payTarget.group_id }) },
        ]);
      } else {
        Alert.alert('Payment Error', 'Could not start payment. Try marking as cash?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark Cash', onPress: () => settleReward({ to_id: targetId, to_name: targetName, amount, method: 'cash', group_id: payTarget.group_id }) },
        ]);
      }
    }
  };
  const settleReward = async (t: any) => {
    try { const r = await api.post('/split/settle-with-rewards', { target_user_id: t.to_id, amount: t.amount, method: t.method || 'upi', group_id: t.group_id || selectedGroup?.id }); setLastReward(r.data.reward); setModal('reward'); fetchData(); } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not settle' }); }
  };

  // Pay directly from a DebtRow (main-screen Settle Up)
  const payDebtRow = (row: DebtRow) => {
    setPayTarget({ to_id: row.to_id, to_name: row.to_name, amount: row.amount, group_id: row.group_id });
    setSelectedGroup({ id: row.group_id, name: row.group_name });
    setModal('pay');
  };

  // Mark a debt as paid offline (cash/bank)
  const markPaidOffline = (row: DebtRow, method: 'cash' | 'bank_transfer' = 'cash') => {
    Alert.alert(
      'Mark as Paid?',
      `Mark ₹${row.amount.toFixed(0)} to ${row.to_name} as paid in ${method === 'cash' ? 'cash' : 'bank transfer'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: async () => {
          try {
            const r = await api.post('/split/mark-paid-offline', {
              target_user_id: row.to_id, amount: row.amount, group_id: row.group_id, method,
            });
            Toast.show({ type: 'success', text1: 'Marked as paid ✅', text2: r.data.message });
            fetchData();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Failed' });
          }
        }},
      ]
    );
  };

  // Open remind modal for a specific debt (supports custom note)
  const openRemind = (row: DebtRow) => {
    setRemindTarget(row);
    setRemindNote('');
    setModal('remind');
  };

  // Send reminder: calls backend (records + posts system msg) then opens WhatsApp
  const sendReminder = async () => {
    if (!remindTarget) return;
    // For "owed_to_me" direction, I'm reminding the other person (from_id=them)
    const targetUserId = remindTarget.direction === 'owed_to_me' ? remindTarget.from_id : remindTarget.to_id;
    const targetName = remindTarget.direction === 'owed_to_me' ? remindTarget.from_name : remindTarget.to_name;
    try {
      const r = await api.post('/split/remind', {
        target_user_id: targetUserId,
        amount: remindTarget.amount,
        group_id: remindTarget.group_id,
        note: remindNote.trim(),
      });
      close();
      Toast.show({ type: 'success', text1: `Reminded ${targetName} 🔔`, text2: 'Opening WhatsApp...' });
      // Try opening WhatsApp (native only — web will just show toast)
      if (Platform.OS !== 'web' && r.data.whatsapp_link) {
        setTimeout(() => {
          Linking.openURL(r.data.whatsapp_link).catch(() => {
            Share.share({ message: r.data.whatsapp_text });
          });
        }, 400);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed';
      if (String(msg).toLowerCase().includes('already sent')) {
        Toast.show({ type: 'info', text1: 'Already Reminded', text2: 'Wait 1 hour before sending again' });
        close();
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: msg });
      }
    }
  };

  // Dismiss a received reminder
  const dismissReminder = async (rid: string) => {
    try { await api.post(`/split/reminders/${rid}/dismiss`); fetchData(); } catch {}
  };

  // Legacy WhatsApp-only remind (kept for Summary modal)
  const remind = (name: string, amt: number) => {
    const t = `Hey ${name}! You owe ₹${amt.toFixed(0)} on MintU. Settle up?\n\uD83D\uDCF2 https://mintu.app/download`;
    if (Platform.OS === 'web') { Toast.show({ type: 'success', text1: 'Reminder link', text2: t.slice(0, 60) + '...' }); return; }
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(t)}`).catch(() => Share.share({ message: t }));
  };

  const coins = settleLB?.my_stats?.coins || 0;

  if (loading) return (
    <SafeAreaView style={s.bg}>
      <SplitSkeleton />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.bg}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={C.accent} />}>
        {/* HEADER */}
        <View style={s.header}>
          <Text style={s.title}>Split</Text>
          <View style={s.headerR}>
            <View style={s.coinPill}>
              <Text style={s.coinText}>🪙 {coins}</Text>
            </View>
            <TouchableOpacity onPress={() => { setGroupName(''); setPhones([]); setPhoneInput(''); setModal('create'); }}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={s.addBtn}>
                <Ionicons name="add" size={22} color={C.inv} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* BALANCE GLASS CARD */}
        <View style={s.balCard}>
          <View style={s.balRow}>
            <View style={s.balH}>
              <Text style={[s.balV, { color: C.green }]}>₹{(balances?.total_owed_to_you || 0).toFixed(0)}</Text>
              <Text style={s.balL}>You're owed</Text>
            </View>
            <View style={s.balD} />
            <View style={s.balH}>
              <Text style={[s.balV, { color: C.red }]}>₹{(balances?.total_you_owe || 0).toFixed(0)}</Text>
              <Text style={s.balL}>You owe</Text>
            </View>
          </View>
        </View>

        {/* RECEIVED REMINDERS BANNER */}
        {reminders.received.length > 0 && (
          <View style={s.remBanner}>
            <View style={s.remBannerHead}>
              <Ionicons name="notifications" size={16} color="#92400E" />
              <Text style={s.remBannerTitle}>
                {reminders.received.length === 1 ? '1 Payment Reminder' : `${reminders.received.length} Payment Reminders`}
              </Text>
            </View>
            {reminders.received.slice(0, 2).map((rem: any) => (
              <View key={rem.id} style={s.remRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.remText}>
                    <Text style={{ fontWeight: '700' }}>{rem.sender_name}</Text> reminded you about{' '}
                    <Text style={{ fontWeight: '700', color: C.red }}>₹{rem.amount.toFixed(0)}</Text>
                  </Text>
                  {rem.note ? <Text style={s.remNote}>"{rem.note}"</Text> : null}
                </View>
                <TouchableOpacity onPress={() => dismissReminder(rem.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color="#92400E" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* SETTLE UP SECTION (on-screen pay + remind) */}
        {settleRows.length > 0 && (
          <View style={s.settleCard}>
            <View style={s.settleHead}>
              <Ionicons name="flash" size={14} color={C.accent} />
              <Text style={s.settleTitle}>SETTLE UP</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.settleCount}>{settleRows.length}</Text>
            </View>
            {settleRows.slice(0, 4).map((row: DebtRow, i: number) => (
              <View key={`${row.from_id}-${row.to_id}-${i}`} style={s.settleRow}>
                <Text style={s.settleEmoji}>{row.group_emoji}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={s.settleName}>
                    {row.direction === 'i_owe' ? `To ${row.to_name}` : `From ${row.from_name}`}
                  </Text>
                  <Text numberOfLines={1} style={s.settleGroup}>{row.group_name}</Text>
                </View>
                <Text style={[s.settleAmt, { color: row.direction === 'i_owe' ? C.red : C.green }]}>
                  ₹{row.amount.toFixed(0)}
                </Text>
                {row.direction === 'i_owe' ? (
                  <>
                    <TouchableOpacity onPress={() => payDebtRow(row)} style={{ marginLeft: 8 }}>
                      <LinearGradient colors={[C.accent, C.accentLight]} style={s.settleBtn}>
                        <Ionicons name="flash" size={12} color={C.inv} />
                        <Text style={s.settleBtnT}>Pay</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => markPaidOffline(row, 'cash')}
                      style={s.settleIconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="checkmark-done" size={18} color={C.text3} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => openRemind(row)} style={{ marginLeft: 8 }}>
                    <LinearGradient colors={['#F59E0B', '#FB923C']} style={s.settleBtn}>
                      <Ionicons name="notifications" size={12} color={C.inv} />
                      <Text style={s.settleBtnT}>Remind</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {settleRows.length > 4 && (
              <Text style={s.settleMore}>+ {settleRows.length - 4} more — tap a group to see all</Text>
            )}
          </View>
        )}

        {/* LEADERBOARD */}
        {settleLB && settleLB.leaderboard?.length > 0 && (
          <View style={s.lbCard}>
            <View style={s.lbHead}>
              <Ionicons name="trophy" size={16} color={C.gold} />
              <Text style={s.lbTitle}>SETTLEMENT KINGS</Text>
            </View>
            {settleLB.leaderboard.slice(0, 3).map((e: any, i: number) => (
              <View key={i} style={[s.lbRow, e.is_me && s.lbMe]}>
                <Text style={s.lbMedal}>{['🥇', '🥈', '🥉'][i]}</Text>
                <Text style={[s.lbName, e.is_me && { color: C.accent, fontWeight: '800' }]}>{e.is_me ? 'You' : e.name}</Text>
                <Text style={s.lbCoins}>🪙 {e.coins}</Text>
              </View>
            ))}
          </View>
        )}

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
              <LinearGradient colors={av.colors.map(c => c + '20')} style={s.groupAv}>
                <Text style={s.groupEmoji}>{av.emoji}</Text>
              </LinearGradient>
              <View style={s.groupInfo}>
                <Text style={s.groupName}>{gr.name}</Text>
                <Text style={s.groupMeta}>{gr.members?.length || 0} members</Text>
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

      {/* === CREATE GROUP === */}
      <Modal visible={modal === 'create'} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.sheetH}>
              <Text style={s.sheetT}>New Group</Text>
              <TouchableOpacity onPress={close}><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Group name (e.g. Goa Trip)" placeholderTextColor={C.text4} value={groupName} onChangeText={setGroupName} />
            <Text style={s.label}>Add members (comma-separated phones)</Text>
            <View style={s.inputRow}>
              <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="9000000001, 9000000002" placeholderTextColor={C.text4} value={phoneInput} onChangeText={setPhoneInput} keyboardType="phone-pad" />
              <TouchableOpacity onPress={addPhoneToList}>
                <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                  <Ionicons name="person-add" size={20} color={C.inv} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {phones.map((p, i) => (
                <View key={i} style={s.chip}>
                  <Text style={s.chipText}>{p}</Text>
                  <TouchableOpacity onPress={() => setPhones(phones.filter((_, idx) => idx !== i))}>
                    <Ionicons name="close-circle" size={16} color={C.accent} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={createGroup}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={s.primaryBtn}>
                <Text style={s.primaryBtnText}>Create Group ({phones.length + 1} members)</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* === ADD EXPENSE === */}
      <Modal visible={modal === 'expense'} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.handle} />
            <TouchableOpacity style={s.closeFloat} onPress={close}><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
            <Text style={s.expLabel}>Split expense</Text>
            <View style={s.amtRow}>
              <Text style={s.rupee}>₹</Text>
              <TextInput style={s.amtInput} value={expAmount} onChangeText={setExpAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={C.text4} />
            </View>
            <TextInput style={s.descInput} value={expDesc} onChangeText={setExpDesc} placeholder="What's this for?" placeholderTextColor={C.text4} />
            <View style={s.splitTabs}>
              {SPLIT_TYPES.map((t) => (
                <TouchableOpacity key={t.id} style={[s.splitTab, splitType === t.id && s.splitTabOn]} onPress={() => setSplitType(t.id)}>
                  <Ionicons name={t.icon as any} size={16} color={splitType === t.id ? C.accent : C.text3} />
                  <Text style={[s.splitTabT, splitType === t.id && { color: C.accent }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 260 }}>
              {(selectedGroup?.members || []).map((m: any, idx: number) => {
                const on = memberOn[m.user_id] !== false; const isMe = m.user_id === user?.id; const clr = MEMBER_COLORS[idx % MEMBER_COLORS.length];
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
                      {splitType === 'equal' && on && <Text style={s.memAmt}>₹{getSplit(m.user_id)}</Text>}
                    </View>
                    {splitType === 'custom' && (
                      <View style={s.amtWrap}>
                        <Text style={s.amtPre}>₹</Text>
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
                    {splitType === 'percentage' && (
                      <View style={s.amtWrap}>
                        <TextInput style={s.memAmtIn} value={memberAmts[m.user_id]} onChangeText={v => setMemberAmts({ ...memberAmts, [m.user_id]: v })} keyboardType="numeric" placeholder="0" placeholderTextColor={C.text4} />
                        <Text style={s.amtSuf}>%</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={addExpense}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={s.primaryBtn}>
                <Text style={s.primaryBtnText}>Split ₹{expAmount || '0'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* === GROUP SUMMARY === */}
      <Modal visible={modal === 'summary'} animationType="slide" transparent>
        <View style={s.mBg}>
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.handle} />
            <View style={s.sheetH}>
              <LinearGradient colors={getGA(groupSummary?.group_name || '').colors.map(c => c + '25')} style={[s.groupAv, { width: 36, height: 36 }]}>
                <Text style={{ fontSize: 16 }}>{getGA(groupSummary?.group_name || '').emoji}</Text>
              </LinearGradient>
              <Text style={[s.sheetT, { flex: 1 }]}>{groupSummary?.group_name}</Text>
              <TouchableOpacity onPress={close}><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sumStats}>
                <View style={s.sumStat}><Text style={s.sumV}>₹{(groupSummary?.total_spent || 0).toFixed(0)}</Text><Text style={s.sumL}>Total</Text></View>
                <View style={s.sumStat}><Text style={s.sumV}>{groupSummary?.total_expenses || 0}</Text><Text style={s.sumL}>Expenses</Text></View>
                <View style={s.sumStat}><Text style={s.sumV}>{groupSummary?.member_count || 0}</Text><Text style={s.sumL}>Members</Text></View>
              </View>
              {groupSummary?.simplified_debts?.length > 0 && (<>
                <Text style={s.sumSec}>Settle Up</Text>
                {groupSummary.simplified_debts.map((d: any, i: number) => (
                  <View key={i} style={s.debtRow}>
                    <View style={s.debtInfo}>
                      <Text style={[s.debtN, { color: C.red }]}>{d.from_name}</Text>
                      <Ionicons name="arrow-forward" size={14} color={C.text4} />
                      <Text style={[s.debtN, { color: C.green }]}>{d.to_name}</Text>
                    </View>
                    <Text style={s.debtA}>₹{d.amount.toFixed(0)}</Text>
                    <TouchableOpacity onPress={() => { setPayTarget(d); setModal('pay'); }}>
                      <LinearGradient colors={[C.accent, C.accentLight]} style={s.payBtn}>
                        <Ionicons name="card" size={14} color={C.inv} />
                        <Text style={s.payBtnT}>Pay</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.waBtn} onPress={() => remind(d.to_name, d.amount)}>
                      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>)}
              {groupSummary?.recent_expenses?.length > 0 && (<>
                <Text style={s.sumSec}>Activity</Text>
                {groupSummary.recent_expenses.map((e: any, i: number) => (
                  <View key={i} style={s.actRow}>
                    <View style={s.actDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.actDesc}>{e.description}</Text>
                      <Text style={s.actMeta}>Paid by {e.paid_by_name}</Text>
                    </View>
                    <Text style={s.actAmt}>₹{e.amount.toFixed(0)}</Text>
                  </View>
                ))}
              </>)}
              <TouchableOpacity onPress={() => { close(); openAddExpense(selectedGroup); }}>
                <LinearGradient colors={[C.accent, C.accentLight]} style={[s.primaryBtn, { marginTop: 16 }]}>
                  <Ionicons name="add" size={18} color={C.inv} />
                  <Text style={s.primaryBtnText}> Add Expense</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* === GROUP MANAGE === */}
      <Modal visible={modal === 'manage'} animationType="slide" transparent>
        <View style={s.mBg}>
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.manAvatars}>
                {(groupManage?.members || []).slice(0, 5).map((m: any, i: number) => (
                  <View key={i} style={[s.manAv, { marginLeft: i > 0 ? -14 : 0, zIndex: 5 - i, backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '18' }]}>
                    <Text style={[s.manInit, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{m.initial}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.manName}>{groupManage?.name}</Text>
              <TouchableOpacity style={s.manAction} onPress={() => { setRenameVal(groupManage?.name || ''); setShowRename(true); }}>
                <Ionicons name="create-outline" size={22} color={C.accent} />
                <Text style={s.manActionT}>Rename group</Text>
              </TouchableOpacity>
              {showRename && (
                <View style={s.inputRow}>
                  <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={renameVal} onChangeText={setRenameVal} autoFocus />
                  <TouchableOpacity onPress={renameGroup}>
                    <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                      <Ionicons name="checkmark" size={20} color={C.inv} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={s.manAction} onPress={() => Share.share({ message: `Join MintU group! Code: ${groupManage?.invite_code}\n\uD83D\uDCF2 https://mintu.app/download` })}>
                <Ionicons name="link-outline" size={22} color={C.accent} />
                <Text style={s.manActionT}>Invite via link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.manAction} onPress={() => deleteGroup(selectedGroup)}>
                <Ionicons name="trash-outline" size={22} color={C.red} />
                <Text style={[s.manActionT, { color: C.red }]}>Delete group</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.manAction} onPress={leaveGroup}>
                <Ionicons name="exit-outline" size={22} color={C.red} />
                <Text style={[s.manActionT, { color: C.red }]}>Leave group</Text>
              </TouchableOpacity>
              <Text style={[s.label, { marginTop: 16 }]}>Add member</Text>
              <View style={s.inputRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Phone number" placeholderTextColor={C.text4} value={addPhoneVal} onChangeText={setAddPhoneVal} keyboardType="phone-pad" maxLength={10} />
                <TouchableOpacity onPress={addMember}>
                  <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                    <Ionicons name="person-add" size={20} color={C.inv} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              <Text style={[s.label, { marginTop: 16 }]}>Members ({groupManage?.member_count || 0})</Text>
              {(groupManage?.members || []).map((m: any, i: number) => (
                <View key={i} style={s.manMemRow}>
                  <View style={[s.memAv, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '15' }]}>
                    <Text style={[s.memInit, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{m.initial}</Text>
                  </View>
                  <Text style={s.manMemName}>{m.name}</Text>
                  {m.is_admin && (
                    <LinearGradient colors={['#880E4F', '#6A1B9A']} style={s.adminBadge}>
                      <Text style={s.adminT}>Admin</Text>
                    </LinearGradient>
                  )}
                  {!m.is_admin && m.user_id !== user?.id && (
                    <TouchableOpacity onPress={() => removeMember(m.user_id)}>
                      <Ionicons name="close-circle" size={22} color={C.text4} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={close}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={[s.primaryBtn, { marginTop: 12 }]}>
                <Text style={s.primaryBtnText}>Done</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* === UPI PAY === */}
      <Modal visible={modal === 'pay'} animationType="slide" transparent>
        <View style={s.mBg}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetT}>Pay ₹{payTarget?.amount?.toFixed(0)} to {payTarget?.to_name}</Text>
            <Text style={s.payS}>Select payment method</Text>
            {UPI_APPS.map(app => (
              <TouchableOpacity key={app.id} style={s.upiRow} onPress={payViaUPI}>
                <View style={[s.upiIcon, { backgroundColor: app.color + '15' }]}>
                  <Ionicons name={app.icon as any} size={22} color={app.color} />
                </View>
                <Text style={s.upiName}>{app.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.text4} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.cashBtn} onPress={() => { setModal(''); settleReward({ ...payTarget, method: 'cash' }); }}>
              <Ionicons name="cash" size={18} color={C.accent} />
              <Text style={s.cashBtnT}>Paid in Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={close}><Text style={s.cancelT}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* === REWARD === */}
      <Modal visible={modal === 'reward'} animationType="fade" transparent>
        <View style={s.rewBg}>
          <View style={s.rewCard}>
            <Text style={s.rewEmoji}>🎉</Text>
            <Text style={s.rewTitle}>Settled!</Text>
            <Text style={s.rewCoins}>+{lastReward?.coins_earned || 0} 🪙</Text>
            <Text style={s.rewLabel}>{lastReward?.label}</Text>
            {(lastReward?.cashback_available || 0) > 0 && (
              <View style={s.rewCashback}>
                <Text style={s.rewCashbackT}>💰 ₹{lastReward.cashback_available.toFixed(0)} cashback</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => { close(); fetchData(); }}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={[s.primaryBtn, { marginTop: 20, paddingHorizontal: 48 }]}>
                <Text style={s.primaryBtnText}>Awesome!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* === REMIND MODAL === */}
      <Modal visible={modal === 'remind'} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.sheetH}>
              <Ionicons name="notifications" size={22} color="#F59E0B" />
              <Text style={[s.sheetT, { flex: 1 }]}>Send Reminder</Text>
              <TouchableOpacity onPress={close}><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
            </View>
            {remindTarget && (
              <>
                <View style={s.remindInfo}>
                  <Text style={s.remindInfoN}>
                    {remindTarget.direction === 'owed_to_me' ? remindTarget.from_name : remindTarget.to_name}
                  </Text>
                  <Text style={s.remindInfoG}>{remindTarget.group_emoji} {remindTarget.group_name}</Text>
                  <Text style={s.remindInfoA}>₹{remindTarget.amount.toFixed(0)}</Text>
                </View>
                <Text style={s.label}>Add a friendly note (optional)</Text>
                <TextInput
                  style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                  multiline
                  placeholder="e.g. Hey, remember the Goa trip?"
                  placeholderTextColor={C.text4}
                  value={remindNote}
                  onChangeText={setRemindNote}
                  maxLength={200}
                />
                <Text style={s.remindHint}>
                  Will post a reminder in the group chat{Platform.OS !== 'web' ? ' + open WhatsApp' : ''}. 1 reminder/hour limit.
                </Text>
                <TouchableOpacity onPress={sendReminder}>
                  <LinearGradient colors={['#F59E0B', '#FB923C']} style={s.primaryBtn}>
                    <Ionicons name="notifications" size={18} color={C.inv} />
                    <Text style={s.primaryBtnText}> Send Reminder</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  addBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  // Balance card
  balCard: { backgroundColor: C.card, borderRadius: 24, padding: 22, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder, shadowColor: '#2E1F1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
  balRow: { flexDirection: 'row', alignItems: 'center' },
  balH: { flex: 1, alignItems: 'center' },
  balV: { fontSize: 26, fontWeight: '800' },
  balL: { fontSize: 12, color: C.text3, marginTop: 4 },
  balD: { width: 1, height: 40, backgroundColor: C.border },
  // Reminders banner
  remBanner: { backgroundColor: '#FEF3C7', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A' },
  remBannerHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  remBannerTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: '#92400E' },
  remRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  remText: { fontSize: 13, color: '#78350F', lineHeight: 18 },
  remNote: { fontSize: 12, color: '#92400E', fontStyle: 'italic', marginTop: 2 },
  // Settle Up card
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
  // Remind modal info
  remindInfo: { alignItems: 'center', paddingVertical: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  remindInfoN: { fontSize: 18, fontWeight: '700', color: C.text1 },
  remindInfoG: { fontSize: 13, color: C.text3, marginTop: 2 },
  remindInfoA: { fontSize: 28, fontWeight: '800', color: C.red, marginTop: 8 },
  remindHint: { fontSize: 11, color: C.text3, textAlign: 'center', marginVertical: 10, fontStyle: 'italic' },
  // Leaderboard
  lbCard: { backgroundColor: '#FFFBEB', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
  lbHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  lbTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#92400E' },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  lbMe: { backgroundColor: 'rgba(230,81,0,0.06)', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
  lbMedal: { fontSize: 16, width: 28 },
  lbName: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text2 },
  lbCoins: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  // Section
  section: { fontSize: 16, fontWeight: '700', color: C.text1, marginBottom: 12 },
  // Empty
  emptyCard: { backgroundColor: C.card, borderRadius: 24, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: C.cardBorder, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3 },
  emptyText: { fontSize: 13, color: C.text4 },
  // Group card
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder, shadowColor: '#2E1F1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  groupAv: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  groupEmoji: { fontSize: 20 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '700', color: C.text1 },
  groupMeta: { fontSize: 12, color: C.text3, marginTop: 2 },
  // Modal
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  sheetH: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  sheetT: { fontSize: 20, fontWeight: '700', color: C.text1 },
  closeFloat: { position: 'absolute', right: 24, top: 24, zIndex: 10 },
  input: { backgroundColor: COLORS.bg.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text1, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  iconBtn: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: C.text3, marginBottom: 8 },
  chipRow: { gap: 8, marginBottom: 12, flexDirection: 'row' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentDim, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipText: { fontSize: 14, color: C.accent, fontWeight: '500' },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.inv },
  // Expense modal
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
  amtWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.primary, borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: C.border },
  amtPre: { fontSize: 14, color: C.text3 },
  amtSuf: { fontSize: 14, color: C.text3, marginLeft: 2 },
  memAmtIn: { fontSize: 16, fontWeight: '600', color: C.text1, width: 60, textAlign: 'right', paddingVertical: 6 },
  sharesW: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.bg.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  shareV: { fontSize: 18, fontWeight: '700', color: C.text1, width: 24, textAlign: 'center' },
  // Summary
  sumStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.bg.primary, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
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
  // Manage
  manAvatars: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  manAv: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: C.sheetBg },
  manInit: { fontSize: 18, fontWeight: '700' },
  manName: { fontSize: 22, fontWeight: '700', color: C.text1, textAlign: 'center', marginBottom: 20 },
  manAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  manActionT: { fontSize: 16, fontWeight: '500', color: C.text1 },
  manMemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  manMemName: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text1 },
  adminBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  adminT: { fontSize: 11, fontWeight: '600', color: '#fff' },
  // UPI
  payS: { fontSize: 14, color: C.text3, marginBottom: 16 },
  upiRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  upiIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  upiName: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text1 },
  cashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 12, borderRadius: 14, backgroundColor: C.accentDim },
  cashBtnT: { fontSize: 15, fontWeight: '600', color: C.accent },
  cancelT: { textAlign: 'center', fontSize: 15, color: C.text3, paddingVertical: 14 },
  // Reward
  rewBg: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  rewCard: { backgroundColor: C.sheetBg, borderRadius: 28, padding: 32, width: '85%', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(230,81,0,0.2)', shadowColor: C.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12 },
  rewEmoji: { fontSize: 48, marginBottom: 8 },
  rewTitle: { fontSize: 22, fontWeight: '800', color: C.text1, marginBottom: 12 },
  rewCoins: { fontSize: 36, fontWeight: '900', color: '#92400E' },
  rewLabel: { fontSize: 14, fontWeight: '600', color: C.text3, marginTop: 4 },
  rewCashback: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: C.accentDim },
  rewCashbackT: { fontSize: 15, fontWeight: '700', color: C.accent },
});
