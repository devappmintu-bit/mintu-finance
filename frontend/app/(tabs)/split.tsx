import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Linking, Share,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

// Smart group avatar generator
const GROUP_ICONS: Record<string, { emoji: string; bg: string }> = {
  trip: { emoji: '✈️', bg: '#0EA5E9' }, goa: { emoji: '🏖️', bg: '#F59E0B' },
  flat: { emoji: '🏠', bg: '#8B5CF6' }, office: { emoji: '💼', bg: '#6366F1' },
  food: { emoji: '🍕', bg: '#EF4444' }, dinner: { emoji: '🍽️', bg: '#EC4899' },
  rent: { emoji: '🏡', bg: '#10B981' }, party: { emoji: '🎉', bg: '#F97316' },
  team: { emoji: '👥', bg: '#3B82F6' }, family: { emoji: '👨‍👩‍👧‍👦', bg: '#059669' },
  weekend: { emoji: '🌴', bg: '#14B8A6' }, movie: { emoji: '🎬', bg: '#A855F7' },
  default: { emoji: '💰', bg: '#6366F1' },
};
const getGroupAvatar = (name: string) => {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(GROUP_ICONS)) {
    if (key !== 'default' && lower.includes(key)) return val;
  }
  return GROUP_ICONS.default;
};

const SPLIT_TYPES = [
  { id: 'equal', icon: 'git-compare', label: 'Equal' },
  { id: 'custom', icon: 'calculator', label: '₹ Amount' },
  { id: 'shares', icon: 'add-circle-outline', label: 'Shares' },
  { id: 'percentage', icon: 'pie-chart', label: '% Split' },
];

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
  const [settleLB, setSettleLB] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Modals
  const [modal, setModal] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupSummary, setGroupSummary] = useState<any>(null);
  const [groupManage, setGroupManage] = useState<any>(null);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [lastReward, setLastReward] = useState<any>(null);
  // Group create
  const [groupName, setGroupName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phones, setPhones] = useState<string[]>([]);
  // Expense
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [splitType, setSplitType] = useState('equal');
  const [memberAmts, setMemberAmts] = useState<Record<string, string>>({});
  const [memberOn, setMemberOn] = useState<Record<string, boolean>>({});
  // Manage
  const [addPhone, setAddPhone] = useState('');
  const [renameVal, setRenameVal] = useState('');
  const [showRename, setShowRename] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [gRes, bRes, lbRes] = await Promise.all([
        api.get('/split/groups'),
        api.get('/split/balances'),
        api.get('/split/settlement-leaderboard').catch(() => ({ data: null })),
      ]);
      setGroups(gRes.data); setBalances(bRes.data);
      if (lbRes.data) setSettleLB(lbRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  const closeModal = () => { setModal(''); setShowRename(false); };

  // ===== GROUP CRUD =====
  const createGroup = async () => {
    if (!groupName.trim()) { Alert.alert('Error', 'Enter group name'); return; }
    try {
      await api.post('/split/groups', { name: groupName, members: phones });
      closeModal(); setGroupName(''); setPhones([]);
      fetchData();
      Alert.alert('Created!', `Group "${groupName}" with ${phones.length + 1} members`);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const deleteGroup = (group: any) => {
    Alert.alert('Delete Group', `Delete "${group.name}" and all expenses?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api({ method: 'DELETE', url: `/split/groups/${group.id}` }); } catch {}
        closeModal(); fetchData();
      }},
    ]);
  };

  const renameGroup = async () => {
    if (!renameVal.trim() || !selectedGroup) return;
    try {
      await api.put(`/split/groups/${selectedGroup.id}/name`, { name: renameVal.trim() });
      setShowRename(false);
      openManage(selectedGroup);
      fetchData();
    } catch (e) { Alert.alert('Error', 'Could not rename'); }
  };

  const addMemberToGroup = async () => {
    const p = addPhone.replace(/\D/g, '').slice(-10);
    if (p.length !== 10) { Alert.alert('Error', 'Enter valid 10-digit number'); return; }
    try {
      const res = await api.post(`/split/groups/${selectedGroup?.id}/members`, { phones: [p] });
      Alert.alert('Done!', res.data.message);
      setAddPhone('');
      openManage(selectedGroup);
      fetchData();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const removeMember = async (memberId: string) => {
    Alert.alert('Remove Member', 'Remove from group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api({ method: 'DELETE', url: `/split/groups/${selectedGroup?.id}/members/${memberId}` }); } catch {}
        openManage(selectedGroup); fetchData();
      }},
    ]);
  };

  const leaveGroup = () => {
    Alert.alert('Leave Group', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await api({ method: 'DELETE', url: `/split/groups/${selectedGroup?.id}/leave` }); } catch {}
        closeModal(); fetchData();
      }},
    ]);
  };

  const addPhoneToList = () => {
    const nums = phoneInput.split(',').map(p => p.replace(/\D/g, '').slice(-10)).filter(p => p.length === 10 && !phones.includes(p));
    if (nums.length) { setPhones([...phones, ...nums]); setPhoneInput(''); }
  };

  // ===== EXPENSE CRUD =====
  const openAddExpense = (group: any) => {
    setSelectedGroup(group); setExpAmount(''); setExpDesc(''); setSplitType('equal');
    const on: Record<string, boolean> = {}; const amts: Record<string, string> = {};
    (group.members || []).forEach((m: any) => { on[m.user_id] = true; amts[m.user_id] = ''; });
    setMemberOn(on); setMemberAmts(amts); setModal('expense');
  };

  const getMemberSplit = (mid: string): string => {
    const amt = parseFloat(expAmount) || 0;
    const enabled = Object.entries(memberOn).filter(([_, v]) => v);
    const cnt = enabled.length || 1;
    if (splitType === 'equal') return (amt / cnt).toFixed(0);
    if (splitType === 'custom') return memberAmts[mid] || '0';
    if (splitType === 'shares') {
      const total = enabled.reduce((s, [id]) => s + (parseFloat(memberAmts[id]) || 1), 0);
      return ((amt * (parseFloat(memberAmts[mid]) || 1)) / total).toFixed(0);
    }
    if (splitType === 'percentage') return ((amt * (parseFloat(memberAmts[mid]) || 0)) / 100).toFixed(0);
    return '0';
  };

  const addExpense = async () => {
    const amt = parseFloat(expAmount);
    if (!amt || amt <= 0 || !selectedGroup) { Alert.alert('Error', 'Enter valid amount'); return; }
    const enabled = Object.entries(memberOn).filter(([_, v]) => v).map(([id]) => id);
    if (enabled.length < 2) { Alert.alert('Error', 'Select at least 2 members'); return; }

    let splits: Record<string, number> = {};
    if (splitType === 'equal') {
      const per = amt / enabled.length;
      enabled.forEach(id => { splits[id] = Math.round(per * 100) / 100; });
    } else if (splitType === 'shares') {
      const total = enabled.reduce((s, id) => s + (parseFloat(memberAmts[id]) || 1), 0);
      enabled.forEach(id => { splits[id] = Math.round(amt * (parseFloat(memberAmts[id]) || 1) / total * 100) / 100; });
    } else if (splitType === 'percentage') {
      enabled.forEach(id => { splits[id] = Math.round(amt * (parseFloat(memberAmts[id]) || 0) / 100 * 100) / 100; });
    } else {
      enabled.forEach(id => { splits[id] = parseFloat(memberAmts[id]) || 0; });
    }

    try {
      await api.post('/split/expenses', {
        group_id: selectedGroup.id, description: expDesc || 'Expense',
        amount: amt, paid_by: user?.id, split_type: splitType, splits,
      });
      closeModal(); fetchData();
      Alert.alert('Added! 🎉', `₹${amt} split among ${enabled.length} people`);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const deleteExpense = (expId: string) => {
    Alert.alert('Delete Expense', 'Remove this expense?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api({ method: 'DELETE', url: `/split/expenses/${expId}` }); } catch {}
        if (selectedGroup) openSummary(selectedGroup);
        fetchData();
      }},
    ]);
  };

  // ===== SUMMARY & MANAGE =====
  const openSummary = async (group: any) => {
    try {
      const res = await api.get(`/split/groups/${group.id}/summary`);
      setGroupSummary(res.data); setSelectedGroup(group); setModal('summary');
    } catch (e) { Alert.alert('Error', 'Could not load'); }
  };

  const openManage = async (group: any) => {
    try {
      const res = await api.get(`/split/groups/${group.id}/manage`);
      setGroupManage(res.data); setSelectedGroup(group); setModal('manage');
    } catch (e) { Alert.alert('Error', 'Could not load'); }
  };

  // ===== PAYMENTS =====
  const payViaUPI = async () => {
    if (!payTarget) return;
    try {
      const res = await api.get(`/split/pay-intent/${payTarget.to_id}?amount=${payTarget.amount}`);
      setModal('');
      await Linking.openURL(res.data.upi_link);
      setTimeout(() => {
        Alert.alert('Payment Status', 'Did the payment go through?', [
          { text: 'No', style: 'cancel' },
          { text: 'Yes ✓', onPress: () => settleWithRewards(payTarget) },
        ]);
      }, 3000);
    } catch {
      setModal('');
      Alert.alert('UPI Not Available', 'Mark as cash?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Cash Payment', onPress: () => settleWithRewards({ ...payTarget, method: 'cash' }) },
      ]);
    }
  };

  const settleWithRewards = async (target: any) => {
    try {
      const res = await api.post('/split/settle-with-rewards', {
        target_user_id: target.to_id, amount: target.amount,
        method: target.method || 'upi', group_id: selectedGroup?.id,
      });
      setLastReward(res.data.reward); setModal('reward');
      fetchData();
    } catch { Alert.alert('Error', 'Could not settle'); }
  };

  const remind = (name: string, amt: number) => {
    const t = `Hey ${name}! 👋 You owe ₹${amt.toFixed(0)} on MintU. Settle up? 😊\n📲 https://mintu.app/download`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(t)}`).catch(() => Share.share({ message: t }));
  };

  const myCoins = settleLB?.my_stats?.coins || 0;

  if (loading) return <SafeAreaView style={g.container}><ActivityIndicator size="large" color="#00F5A0" style={{ marginTop: 100 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={g.container}>
      <ScrollView contentContainerStyle={g.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#00F5A0" />}>
        {/* Header */}
        <View style={g.header}>
          <Text style={g.title}>Split</Text>
          <View style={g.headerR}>
            <View style={g.coinBadge}><Text style={g.coinText}>🪙 {myCoins}</Text></View>
            <TouchableOpacity style={g.addBtn} onPress={() => { setGroupName(''); setPhones([]); setPhoneInput(''); setModal('create'); }}>
              <Ionicons name="add" size={22} color="#0B0F2F" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance Card */}
        <View style={g.glassCard}>
          <View style={g.balRow}>
            <View style={g.balHalf}><Text style={[g.balVal, { color: '#00F5A0' }]}>₹{(balances?.total_owed_to_you || 0).toFixed(0)}</Text><Text style={g.balLbl}>You're owed</Text></View>
            <View style={g.balDiv} />
            <View style={g.balHalf}><Text style={[g.balVal, { color: '#FF6B6B' }]}>₹{(balances?.total_you_owe || 0).toFixed(0)}</Text><Text style={g.balLbl}>You owe</Text></View>
          </View>
        </View>

        {/* Leaderboard */}
        {settleLB && settleLB.leaderboard?.length > 0 && (
          <View style={g.lbCard}>
            <View style={g.lbHead}><Ionicons name="trophy" size={16} color="#FFD700" /><Text style={g.lbTitle}>SETTLEMENT KINGS</Text></View>
            {settleLB.leaderboard.slice(0, 3).map((e: any, i: number) => (
              <View key={i} style={[g.lbRow, e.is_me && g.lbRowMe]}>
                <Text style={g.lbMedal}>{['🥇', '🥈', '🥉'][i]}</Text>
                <Text style={[g.lbName, e.is_me && { color: '#00F5A0', fontWeight: '800' }]}>{e.is_me ? 'You' : e.name}</Text>
                <Text style={g.lbCoins}>🪙 {e.coins}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Groups */}
        <Text style={g.section}>Groups</Text>
        {groups.length === 0 ? (
          <View style={g.emptyCard}><Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.3)" /><Text style={g.emptyTitle}>No groups yet</Text><Text style={g.emptyText}>Tap + to create your first split group</Text></View>
        ) : groups.map((gr: any) => {
          const av = getGroupAvatar(gr.name);
          return (
            <TouchableOpacity key={gr.id} style={g.groupCard} onPress={() => openSummary(gr)} activeOpacity={0.7}>
              <View style={[g.groupAvatar, { backgroundColor: av.bg + '30' }]}>
                <Text style={g.groupEmoji}>{av.emoji}</Text>
              </View>
              <View style={g.groupInfo}>
                <Text style={g.groupName}>{gr.name}</Text>
                <Text style={g.groupMeta}>{gr.members?.length || 0} members</Text>
              </View>
              <TouchableOpacity style={g.groupActionBtn} onPress={() => openAddExpense(gr)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="add-circle" size={28} color="#00F5A0" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openManage(gr)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="ellipsis-vertical" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ===== CREATE GROUP MODAL ===== */}
      <Modal visible={modal === 'create'} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={g.modalBg}>
          <View style={g.sheet}>
            <View style={g.handle} />
            <View style={g.sheetHeader}><Text style={g.sheetTitle}>New Group</Text><TouchableOpacity onPress={closeModal}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity></View>
            <TextInput style={g.input} placeholder="Group name (e.g. Goa Trip)" placeholderTextColor="rgba(255,255,255,0.3)" value={groupName} onChangeText={setGroupName} />
            <Text style={g.fieldLabel}>Add members (phone numbers)</Text>
            <View style={g.inputRow}>
              <TextInput style={[g.input, { flex: 1, marginBottom: 0 }]} placeholder="9000000001, 9000000002" placeholderTextColor="rgba(255,255,255,0.3)" value={phoneInput} onChangeText={setPhoneInput} keyboardType="phone-pad" />
              <TouchableOpacity style={g.iconBtn} onPress={addPhoneToList}><Ionicons name="person-add" size={20} color="#0B0F2F" /></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.chipRow}>
              {phones.map((p, i) => (
                <View key={i} style={g.chip}><Text style={g.chipText}>{p}</Text><TouchableOpacity onPress={() => setPhones(phones.filter((_, idx) => idx !== i))}><Ionicons name="close-circle" size={16} color="#00F5A0" /></TouchableOpacity></View>
              ))}
            </ScrollView>
            <TouchableOpacity style={g.primaryBtn} onPress={createGroup}><Text style={g.primaryBtnText}>Create Group ({phones.length + 1} members)</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== ADD EXPENSE MODAL ===== */}
      <Modal visible={modal === 'expense'} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={g.modalBg}>
          <View style={[g.sheet, { maxHeight: '92%' }]}>
            <View style={g.handle} />
            <TouchableOpacity style={g.closeFloat} onPress={closeModal}><Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
            <Text style={g.expLabel}>Split expense</Text>
            <View style={g.amtRow}><Text style={g.rupee}>₹</Text><TextInput style={g.amtInput} value={expAmount} onChangeText={setExpAmount} keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)" /></View>
            <TextInput style={g.descInput} value={expDesc} onChangeText={setExpDesc} placeholder="What's this for?" placeholderTextColor="rgba(255,255,255,0.3)" />
            {/* Split type tabs */}
            <View style={g.splitTabs}>
              {SPLIT_TYPES.map((t) => (
                <TouchableOpacity key={t.id} style={[g.splitTab, splitType === t.id && g.splitTabOn]} onPress={() => setSplitType(t.id)}>
                  <Ionicons name={t.icon as any} size={16} color={splitType === t.id ? '#00F5A0' : 'rgba(255,255,255,0.4)'} />
                  <Text style={[g.splitTabText, splitType === t.id && { color: '#00F5A0' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Members */}
            <ScrollView style={{ maxHeight: 280 }}>
              {(selectedGroup?.members || []).map((m: any) => {
                const on = memberOn[m.user_id] !== false;
                const isMe = m.user_id === user?.id;
                return (
                  <View key={m.user_id} style={g.memRow}>
                    <TouchableOpacity onPress={() => setMemberOn({ ...memberOn, [m.user_id]: !on })}><Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? '#00F5A0' : 'rgba(255,255,255,0.3)'} /></TouchableOpacity>
                    <View style={[g.memAvatar, { backgroundColor: isMe ? '#6366F130' : '#F59E0B30' }]}><Text style={[g.memInit, { color: isMe ? '#6366F1' : '#F59E0B' }]}>{(m.name || '?')[0]}</Text></View>
                    <View style={g.memInfo}><Text style={g.memName}>{isMe ? 'You' : m.name}</Text>{splitType === 'equal' && on && <Text style={g.memAmt}>₹{getMemberSplit(m.user_id)}</Text>}</View>
                    {splitType === 'custom' && <View style={g.amtWrap}><Text style={g.amtPre}>₹</Text><TextInput style={g.memAmtInput} value={memberAmts[m.user_id]} onChangeText={v => setMemberAmts({ ...memberAmts, [m.user_id]: v })} keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)" /></View>}
                    {splitType === 'shares' && (
                      <View style={g.sharesWrap}>
                        <TouchableOpacity style={g.shareBtn} onPress={() => setMemberAmts({ ...memberAmts, [m.user_id]: String(Math.max(0, (parseFloat(memberAmts[m.user_id]) || 1) - 1)) })}><Ionicons name="remove" size={16} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
                        <Text style={g.shareVal}>{memberAmts[m.user_id] || '1'}</Text>
                        <TouchableOpacity style={g.shareBtn} onPress={() => setMemberAmts({ ...memberAmts, [m.user_id]: String((parseFloat(memberAmts[m.user_id]) || 1) + 1) })}><Ionicons name="add" size={16} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
                      </View>
                    )}
                    {splitType === 'percentage' && <View style={g.amtWrap}><TextInput style={g.memAmtInput} value={memberAmts[m.user_id]} onChangeText={v => setMemberAmts({ ...memberAmts, [m.user_id]: v })} keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)" /><Text style={g.amtSuf}>%</Text></View>}
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={g.primaryBtn} onPress={addExpense}><Text style={g.primaryBtnText}>Split ₹{expAmount || '0'}</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== GROUP SUMMARY MODAL ===== */}
      <Modal visible={modal === 'summary'} animationType="slide" transparent>
        <View style={g.modalBg}><View style={[g.sheet, { maxHeight: '92%' }]}>
          <View style={g.handle} />
          <View style={g.sheetHeader}>
            <View style={[g.groupAvatar, { width: 36, height: 36, backgroundColor: getGroupAvatar(groupSummary?.group_name || '').bg + '30' }]}><Text style={{ fontSize: 16 }}>{getGroupAvatar(groupSummary?.group_name || '').emoji}</Text></View>
            <Text style={[g.sheetTitle, { flex: 1 }]}>{groupSummary?.group_name}</Text>
            <TouchableOpacity onPress={closeModal}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={g.sumStats}>
              <View style={g.sumStat}><Text style={g.sumStatVal}>₹{(groupSummary?.total_spent || 0).toFixed(0)}</Text><Text style={g.sumStatLbl}>Total</Text></View>
              <View style={g.sumStat}><Text style={g.sumStatVal}>{groupSummary?.total_expenses || 0}</Text><Text style={g.sumStatLbl}>Expenses</Text></View>
              <View style={g.sumStat}><Text style={g.sumStatVal}>{groupSummary?.member_count || 0}</Text><Text style={g.sumStatLbl}>Members</Text></View>
            </View>
            {/* Debts */}
            {groupSummary?.simplified_debts?.length > 0 && (<>
              <Text style={g.sumSection}>Settle Up</Text>
              {groupSummary.simplified_debts.map((d: any, i: number) => (
                <View key={i} style={g.debtRow}>
                  <View style={g.debtInfo}><Text style={[g.debtName, { color: '#FF6B6B' }]}>{d.from_name}</Text><Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.3)" /><Text style={[g.debtName, { color: '#00F5A0' }]}>{d.to_name}</Text></View>
                  <Text style={g.debtAmt}>₹{d.amount.toFixed(0)}</Text>
                  <TouchableOpacity style={g.payBtn} onPress={() => { setPayTarget(d); setModal('pay'); }}><Ionicons name="card" size={14} color="#0B0F2F" /><Text style={g.payBtnText}>Pay</Text></TouchableOpacity>
                  <TouchableOpacity style={g.waBtn} onPress={() => remind(d.to_name, d.amount)}><Ionicons name="logo-whatsapp" size={16} color="#25D366" /></TouchableOpacity>
                </View>
              ))}
            </>)}
            {/* Activity */}
            {groupSummary?.recent_expenses?.length > 0 && (<>
              <Text style={g.sumSection}>Activity</Text>
              {groupSummary.recent_expenses.map((e: any, i: number) => (
                <View key={i} style={g.actRow}>
                  <View style={g.actDot} />
                  <View style={{ flex: 1 }}><Text style={g.actDesc}>{e.description}</Text><Text style={g.actMeta}>Paid by {e.paid_by_name}</Text></View>
                  <Text style={g.actAmt}>₹{e.amount.toFixed(0)}</Text>
                </View>
              ))}
            </>)}
            <TouchableOpacity style={[g.primaryBtn, { marginTop: 16 }]} onPress={() => { closeModal(); openAddExpense(selectedGroup); }}><Ionicons name="add" size={18} color="#0B0F2F" /><Text style={g.primaryBtnText}> Add Expense</Text></TouchableOpacity>
          </ScrollView>
        </View></View>
      </Modal>

      {/* ===== GROUP MANAGE MODAL ===== */}
      <Modal visible={modal === 'manage'} animationType="slide" transparent>
        <View style={g.modalBg}><View style={[g.sheet, { maxHeight: '92%' }]}>
          <View style={g.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={g.manageAvatars}>
              {(groupManage?.members || []).slice(0, 5).map((m: any, i: number) => (
                <View key={i} style={[g.manageAvatar, { marginLeft: i > 0 ? -12 : 0, zIndex: 5 - i, backgroundColor: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] + '30' }]}>
                  <Text style={[g.manageInit, { color: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] }]}>{m.initial}</Text>
                </View>
              ))}
            </View>
            <Text style={g.manageName}>{groupManage?.name}</Text>
            {/* Actions */}
            <TouchableOpacity style={g.manageAction} onPress={() => { setRenameVal(groupManage?.name || ''); setShowRename(true); }}><Ionicons name="create-outline" size={22} color="#00F5A0" /><Text style={g.manageActionText}>Rename group</Text></TouchableOpacity>
            {showRename && <View style={g.inputRow}><TextInput style={[g.input, { flex: 1, marginBottom: 0 }]} value={renameVal} onChangeText={setRenameVal} autoFocus /><TouchableOpacity style={g.iconBtn} onPress={renameGroup}><Ionicons name="checkmark" size={20} color="#0B0F2F" /></TouchableOpacity></View>}
            <TouchableOpacity style={g.manageAction} onPress={() => Share.share({ message: `Join my MintU group! Code: ${groupManage?.invite_code}\n📲 https://mintu.app/download` })}><Ionicons name="link-outline" size={22} color="#00F5A0" /><Text style={g.manageActionText}>Invite via link</Text></TouchableOpacity>
            <TouchableOpacity style={g.manageAction} onPress={() => deleteGroup(selectedGroup)}><Ionicons name="trash-outline" size={22} color="#FF6B6B" /><Text style={[g.manageActionText, { color: '#FF6B6B' }]}>Delete group</Text></TouchableOpacity>
            <TouchableOpacity style={g.manageAction} onPress={leaveGroup}><Ionicons name="exit-outline" size={22} color="#FF6B6B" /><Text style={[g.manageActionText, { color: '#FF6B6B' }]}>Leave group</Text></TouchableOpacity>
            {/* Add member */}
            <Text style={[g.fieldLabel, { marginTop: 16 }]}>Add member</Text>
            <View style={g.inputRow}><TextInput style={[g.input, { flex: 1, marginBottom: 0 }]} placeholder="Phone number" placeholderTextColor="rgba(255,255,255,0.3)" value={addPhone} onChangeText={setAddPhone} keyboardType="phone-pad" maxLength={10} /><TouchableOpacity style={g.iconBtn} onPress={addMemberToGroup}><Ionicons name="person-add" size={20} color="#0B0F2F" /></TouchableOpacity></View>
            {/* Members */}
            <Text style={[g.fieldLabel, { marginTop: 16 }]}>Members ({groupManage?.member_count || 0})</Text>
            {(groupManage?.members || []).map((m: any, i: number) => (
              <View key={i} style={g.manageMemberRow}>
                <View style={[g.memAvatar, { backgroundColor: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] + '25' }]}><Text style={[g.memInit, { color: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] }]}>{m.initial}</Text></View>
                <Text style={g.manageMemberName}>{m.name}</Text>
                {m.is_admin && <View style={g.adminBadge}><Text style={g.adminText}>Admin</Text></View>}
                {!m.is_admin && m.user_id !== user?.id && <TouchableOpacity onPress={() => removeMember(m.user_id)}><Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.3)" /></TouchableOpacity>}
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={[g.primaryBtn, { marginTop: 12 }]} onPress={closeModal}><Text style={g.primaryBtnText}>Done</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* ===== UPI PAY MODAL ===== */}
      <Modal visible={modal === 'pay'} animationType="slide" transparent>
        <View style={g.modalBg}><View style={g.sheet}>
          <View style={g.handle} />
          <Text style={g.sheetTitle}>Pay ₹{payTarget?.amount?.toFixed(0)} to {payTarget?.to_name}</Text>
          <Text style={g.paySubtitle}>Select payment method</Text>
          {UPI_APPS.map(app => (
            <TouchableOpacity key={app.id} style={g.upiRow} onPress={payViaUPI}>
              <View style={[g.upiIcon, { backgroundColor: app.color + '20' }]}><Ionicons name={app.icon as any} size={22} color={app.color} /></View>
              <Text style={g.upiName}>{app.name}</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={g.cashBtn} onPress={() => { setModal(''); settleWithRewards({ ...payTarget, method: 'cash' }); }}><Ionicons name="cash" size={18} color="#00F5A0" /><Text style={g.cashBtnText}>Paid in Cash</Text></TouchableOpacity>
          <TouchableOpacity onPress={closeModal}><Text style={g.cancelText}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* ===== REWARD MODAL ===== */}
      <Modal visible={modal === 'reward'} animationType="fade" transparent>
        <View style={g.rewardBg}><View style={g.rewardCard}>
          <Text style={g.rewardEmoji}>🎉</Text>
          <Text style={g.rewardTitle}>Settled!</Text>
          <Text style={g.rewardCoins}>+{lastReward?.coins_earned || 0} 🪙</Text>
          <Text style={g.rewardLabel}>{lastReward?.label}</Text>
          {(lastReward?.cashback_available || 0) > 0 && <Text style={g.rewardCashback}>💰 ₹{lastReward.cashback_available.toFixed(0)} cashback</Text>}
          <TouchableOpacity style={g.primaryBtn} onPress={() => { closeModal(); fetchData(); }}><Text style={g.primaryBtnText}>Awesome! 🚀</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const g = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F2F' },
  scroll: { padding: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  headerR: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinBadge: { backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  coinText: { fontSize: 14, fontWeight: '700', color: '#FFD700' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00F5A0', justifyContent: 'center', alignItems: 'center' },
  // Glass card
  glassCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  balRow: { flexDirection: 'row', alignItems: 'center' },
  balHalf: { flex: 1, alignItems: 'center' },
  balVal: { fontSize: 26, fontWeight: '800' },
  balLbl: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  balDiv: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.1)' },
  // Leaderboard
  lbCard: { backgroundColor: 'rgba(255,215,0,0.06)', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)' },
  lbHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  lbTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#FFD700' },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  lbRowMe: { backgroundColor: 'rgba(0,245,160,0.08)', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
  lbMedal: { fontSize: 16, width: 28 },
  lbName: { flex: 1, fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  lbCoins: { fontSize: 14, fontWeight: '700', color: '#FFD700' },
  // Groups
  section: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  emptyCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  emptyText: { fontSize: 13, color: 'rgba(255,255,255,0.3)' },
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  groupAvatar: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  groupEmoji: { fontSize: 20 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  groupMeta: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  groupActionBtn: { marginRight: 8 },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { backgroundColor: '#111535', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  closeFloat: { position: 'absolute', right: 24, top: 24, zIndex: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  iconBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#00F5A0', justifyContent: 'center', alignItems: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.4)', marginBottom: 8 },
  chipRow: { gap: 8, marginBottom: 12, flexDirection: 'row' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,245,160,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipText: { fontSize: 14, color: '#00F5A0', fontWeight: '500' },
  primaryBtn: { flexDirection: 'row', backgroundColor: '#00F5A0', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#0B0F2F' },
  // Expense modal
  expLabel: { textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 },
  amtRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  rupee: { fontSize: 36, fontWeight: '300', color: 'rgba(255,255,255,0.5)', marginRight: 4 },
  amtInput: { fontSize: 48, fontWeight: '800', color: '#fff', minWidth: 60, textAlign: 'center' },
  descInput: { textAlign: 'center', fontSize: 15, color: 'rgba(255,255,255,0.6)', paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, marginBottom: 16 },
  splitTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  splitTab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 4 },
  splitTabOn: { borderBottomWidth: 2, borderBottomColor: '#00F5A0' },
  splitTabText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  memRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  memAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  memInit: { fontSize: 14, fontWeight: '700' },
  memInfo: { flex: 1 },
  memName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  memAmt: { fontSize: 12, color: '#00F5A0', marginTop: 2 },
  amtWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  amtPre: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  amtSuf: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginLeft: 2 },
  memAmtInput: { fontSize: 16, fontWeight: '600', color: '#fff', width: 60, textAlign: 'right', paddingVertical: 6 },
  sharesWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  shareVal: { fontSize: 18, fontWeight: '700', color: '#fff', width: 24, textAlign: 'center' },
  // Summary
  sumStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16, marginBottom: 16 },
  sumStat: { alignItems: 'center' },
  sumStatVal: { fontSize: 20, fontWeight: '800', color: '#fff' },
  sumStatLbl: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  sumSection: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 10, marginTop: 12 },
  debtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 6 },
  debtInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  debtName: { fontSize: 14, fontWeight: '600' },
  debtAmt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#00F5A0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  payBtnText: { fontSize: 13, fontWeight: '700', color: '#0B0F2F' },
  waBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(37,211,102,0.12)', justifyContent: 'center', alignItems: 'center' },
  actRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  actDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00F5A0' },
  actDesc: { fontSize: 14, fontWeight: '600', color: '#fff' },
  actMeta: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  actAmt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Manage
  manageAvatars: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  manageAvatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#111535' },
  manageInit: { fontSize: 18, fontWeight: '700' },
  manageName: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 20 },
  manageAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  manageActionText: { fontSize: 16, fontWeight: '500', color: '#fff' },
  manageMemberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  manageMemberName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#fff' },
  adminBadge: { backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  adminText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  // UPI
  paySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 16 },
  upiRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  upiIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  upiName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff' },
  cashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 12, borderRadius: 14, backgroundColor: 'rgba(0,245,160,0.1)' },
  cashBtnText: { fontSize: 15, fontWeight: '600', color: '#00F5A0' },
  cancelText: { textAlign: 'center', fontSize: 15, color: 'rgba(255,255,255,0.4)', paddingVertical: 14 },
  // Reward
  rewardBg: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  rewardCard: { backgroundColor: '#111535', borderRadius: 28, padding: 32, width: '85%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,245,160,0.2)' },
  rewardEmoji: { fontSize: 48, marginBottom: 8 },
  rewardTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 12 },
  rewardCoins: { fontSize: 36, fontWeight: '900', color: '#FFD700' },
  rewardLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  rewardCashback: { fontSize: 15, fontWeight: '700', color: '#00F5A0', marginTop: 12, backgroundColor: 'rgba(0,245,160,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
});
