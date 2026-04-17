import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Linking, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

const SPLIT_TABS = [
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
  const [loading, setLoading] = useState(true);
  const [settleLB, setSettleLB] = useState<any>(null);
  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [rewardModal, setRewardModal] = useState(false);
  const [manageModal, setManageModal] = useState(false);
  const [groupManage, setGroupManage] = useState<any>(null);
  const [addMemberPhone, setAddMemberPhone] = useState('');
  // Group create
  const [groupName, setGroupName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberPhones, setMemberPhones] = useState<string[]>([]);
  // Expense (GPay-style)
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupSummary, setGroupSummary] = useState<any>(null);
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [splitType, setSplitType] = useState('equal');
  const [memberAmounts, setMemberAmounts] = useState<Record<string, string>>({});
  const [memberEnabled, setMemberEnabled] = useState<Record<string, boolean>>({});
  // Payment
  const [payTarget, setPayTarget] = useState<any>(null);
  const [lastReward, setLastReward] = useState<any>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [gRes, bRes, lbRes] = await Promise.all([
        api.get('/split/groups'),
        api.get('/split/balances'),
        api.get('/split/settlement-leaderboard').catch(() => ({ data: null })),
      ]);
      setGroups(gRes.data);
      setBalances(bRes.data);
      if (lbRes.data) setSettleLB(lbRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Create group
  const handleCreateGroup = async () => {
    if (!groupName.trim()) { Alert.alert('Error', 'Enter group name'); return; }
    try {
      await api.post('/split/groups', { name: groupName, members: memberPhones });
      setCreateModal(false); setGroupName(''); setMemberPhones([]);
      fetchData();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const addPhone = () => {
    // Support comma-separated multiple phones
    const phones = memberPhone.split(',').map(p => p.replace(/\D/g, '').slice(-10)).filter(p => p.length === 10);
    const newPhones = phones.filter(p => !memberPhones.includes(p));
    if (newPhones.length > 0) {
      setMemberPhones([...memberPhones, ...newPhones]);
      setMemberPhone('');
    } else if (memberPhone.trim()) {
      Alert.alert('Invalid', 'Enter valid 10-digit phone number(s). Separate multiple with commas.');
    }
  };

  // Open expense modal (GPay-style)
  const openAddExpense = (group: any) => {
    setSelectedGroup(group);
    setExpAmount(''); setExpDesc(''); setSplitType('equal');
    const enabled: Record<string, boolean> = {};
    const amounts: Record<string, string> = {};
    (group.members || []).forEach((m: any) => { enabled[m.user_id] = true; amounts[m.user_id] = ''; });
    setMemberEnabled(enabled);
    setMemberAmounts(amounts);
    setExpenseModal(true);
  };

  // Calculate per-member split
  const getPerMemberAmount = (memberId: string): string => {
    const amt = parseFloat(expAmount) || 0;
    const enabledMembers = Object.entries(memberEnabled).filter(([_, v]) => v);
    const count = enabledMembers.length || 1;

    if (splitType === 'equal') return (amt / count).toFixed(2);
    if (splitType === 'custom') return memberAmounts[memberId] || '0';
    if (splitType === 'shares') {
      const totalShares = enabledMembers.reduce((s, [id]) => s + (parseFloat(memberAmounts[id]) || 1), 0);
      const myShare = parseFloat(memberAmounts[memberId]) || 1;
      return ((amt * myShare) / totalShares).toFixed(2);
    }
    if (splitType === 'percentage') {
      const pct = parseFloat(memberAmounts[memberId]) || 0;
      return ((amt * pct) / 100).toFixed(2);
    }
    return '0';
  };

  // Submit expense
  const handleAddExpense = async () => {
    if (!expAmount || !selectedGroup) return;
    const amt = parseFloat(expAmount);
    if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }

    let splits: Record<string, number> = {};
    const enabledMembers = Object.entries(memberEnabled).filter(([_, v]) => v).map(([id]) => id);

    if (splitType === 'equal') {
      const per = amt / enabledMembers.length;
      enabledMembers.forEach(id => { splits[id] = Math.round(per * 100) / 100; });
    } else if (splitType === 'shares') {
      const totalShares = enabledMembers.reduce((s, id) => s + (parseFloat(memberAmounts[id]) || 1), 0);
      enabledMembers.forEach(id => {
        const share = parseFloat(memberAmounts[id]) || 1;
        splits[id] = Math.round((amt * share / totalShares) * 100) / 100;
      });
    } else {
      enabledMembers.forEach(id => { splits[id] = parseFloat(memberAmounts[id]) || 0; });
    }

    try {
      await api.post('/split/expenses', {
        group_id: selectedGroup.id, description: expDesc || 'Expense',
        amount: amt, paid_by: user?.id, split_type: splitType, splits,
      });
      setExpenseModal(false);
      fetchData();
      Alert.alert('Added! 🎉', `₹${amt} split among ${enabledMembers.length} members`);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  // Open group summary
  const openSummary = async (group: any) => {
    try {
      const res = await api.get(`/split/groups/${group.id}/summary`);
      setGroupSummary(res.data); setSelectedGroup(group); setSummaryModal(true);
    } catch (e) { Alert.alert('Error', 'Could not load summary'); }
  };

  // Group management (GPay-style)
  const openGroupManage = async (group: any) => {
    try {
      const res = await api.get(`/split/groups/${group.id}/manage`);
      setGroupManage(res.data); setSelectedGroup(group); setManageModal(true);
    } catch (e) { Alert.alert('Error', 'Could not load group'); }
  };

  const addMemberToGroup = async () => {
    const p = addMemberPhone.replace(/\D/g, '');
    if (p.length !== 10) { Alert.alert('Error', 'Enter valid 10-digit phone'); return; }
    try {
      const res = await api.post(`/split/groups/${selectedGroup?.id}/members`, { phones: [p] });
      Alert.alert('Done!', res.data.message);
      setAddMemberPhone('');
      openGroupManage(selectedGroup);
      fetchData();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const renameGroup = () => {
    Alert.prompt?.('Rename Group', 'Enter new name', async (name: string) => {
      if (name?.trim()) {
        await api.put(`/split/groups/${selectedGroup?.id}/name`, { name: name.trim() });
        fetchData(); openGroupManage(selectedGroup);
      }
    }) || Alert.alert('Rename', 'Use the create group feature to make a new group');
  };

  const leaveGroup = async () => {
    Alert.alert('Leave Group', 'Are you sure? Your expenses will remain.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        await api.delete(`/split/groups/${selectedGroup?.id}/leave`);
        setManageModal(false); fetchData();
      }},
    ]);
  };

  const shareInvite = () => {
    const code = groupManage?.invite_code || '';
    Share.share({ message: `Join my MintU split group! Code: ${code}\n📲 Download: https://mintu.app/download` });
  };

  // UPI Payment with rewards
  const initiatePayment = (debt: any) => { setPayTarget(debt); setPayModal(true); };

  const payViaUPI = async () => {
    if (!payTarget) return;
    try {
      const res = await api.get(`/split/pay-intent/${payTarget.to_id}?amount=${payTarget.amount}`);
      setPayModal(false);
      await Linking.openURL(res.data.upi_link);
      setTimeout(() => {
        Alert.alert('Payment Status', 'Did the payment go through?', [
          { text: 'No', style: 'cancel' },
          { text: 'Yes ✓', onPress: () => settleWithRewards(payTarget) },
        ]);
      }, 3000);
    } catch {
      setPayModal(false);
      Alert.alert('UPI Not Available', 'Mark as cash payment?', [
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
      setLastReward(res.data.reward);
      setRewardModal(true);
      fetchData();
      if (summaryModal && selectedGroup) openSummary(selectedGroup);
    } catch (e) { Alert.alert('Error', 'Could not record settlement'); }
  };

  const remind = (name: string, amt: number) => {
    const text = `Hey ${name}! 👋 You owe ₹${amt.toFixed(0)} from our MintU split. Settle up? 😊\n📲 Download: https://mintu.app/download`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`).catch(() => Share.share({ message: text }));
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 100 }} /></SafeAreaView>;

  const myCoins = settleLB?.my_stats?.coins || 0;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.pageTitle}>Split</Text>
          <View style={s.headerRight}>
            <View style={s.coinBadge}><Text style={s.coinText}>🪙 {myCoins}</Text></View>
            <TouchableOpacity style={s.addBtn} onPress={() => setCreateModal(true)}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance */}
        <View style={s.balanceCard}>
          <View style={s.balHalf}>
            <Text style={[s.balVal, { color: '#10B981' }]}>₹{(balances?.total_owed_to_you || 0).toFixed(0)}</Text>
            <Text style={s.balLbl}>You're owed</Text>
          </View>
          <View style={s.balDivider} />
          <View style={s.balHalf}>
            <Text style={[s.balVal, { color: '#EF4444' }]}>₹{(balances?.total_you_owe || 0).toFixed(0)}</Text>
            <Text style={s.balLbl}>You owe</Text>
          </View>
        </View>

        {/* Settlement Leaderboard Mini */}
        {settleLB && settleLB.leaderboard?.length > 0 && (
          <View style={s.lbCard}>
            <View style={s.lbHeader}><Ionicons name="trophy" size={16} color="#F59E0B" /><Text style={s.lbTitle}>SETTLEMENT LEADERBOARD</Text></View>
            {settleLB.leaderboard.slice(0, 3).map((e: any, i: number) => (
              <View key={i} style={[s.lbRow, e.is_me && s.lbRowMe]}>
                <Text style={s.lbMedal}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</Text>
                <Text style={[s.lbName, e.is_me && { fontWeight: '800', color: COLORS.accent.primary }]}>{e.is_me ? 'You' : e.name}</Text>
                <Text style={s.lbCoins}>🪙 {e.coins}</Text>
              </View>
            ))}
            {settleLB.my_stats?.badges?.length > 0 && (
              <View style={s.badgeRow}>
                {settleLB.my_stats.badges.map((b: any, i: number) => (
                  <View key={i} style={s.badge}><Text style={s.badgeText}>{b.emoji} {b.name}</Text></View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Groups */}
        <Text style={s.sectionTitle}>Groups</Text>
        {groups.length === 0 ? (
          <View style={s.emptyCard}><Ionicons name="people-outline" size={40} color={COLORS.text.muted} /><Text style={s.emptyTitle}>No groups yet</Text><Text style={s.emptyText}>Create a group to start splitting</Text></View>
        ) : groups.map((g: any) => (
          <TouchableOpacity key={g.id} style={s.groupCard} onPress={() => openSummary(g)}>
            <View style={s.groupAvatarStack}>
              {(g.members || []).slice(0, 3).map((m: any, i: number) => (
                <View key={i} style={[s.stackAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i, backgroundColor: ['#6366F1', '#F59E0B', '#10B981', '#EF4444'][i % 4] + '20' }]}>
                  <Text style={[s.stackInit, { color: ['#6366F1', '#F59E0B', '#10B981', '#EF4444'][i % 4] }]}>{(m.name || '?')[0]}</Text>
                </View>
              ))}
            </View>
            <View style={s.groupInfo}>
              <Text style={s.groupName}>{g.name}</Text>
              <Text style={s.groupMeta}>{g.members?.length || 0} members</Text>
            </View>
            <TouchableOpacity style={s.addExpBtn} onPress={() => openAddExpense(g)}>
              <Ionicons name="add-circle" size={30} color={COLORS.accent.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openGroupManage(g)} style={{ padding: 4 }}>
              <Ionicons name="settings-outline" size={18} color={COLORS.text.muted} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* GPay-Style Add Expense Modal */}
      <Modal visible={expenseModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBg}>
          <View style={s.expSheet}>
            <View style={s.sheetHandle} />
            <TouchableOpacity style={s.closeBtn} onPress={() => setExpenseModal(false)}><Ionicons name="close" size={22} color={COLORS.text.muted} /></TouchableOpacity>

            {/* Amount display */}
            <Text style={s.expLabel}>Enter amount to split</Text>
            <View style={s.amountRow}>
              <Text style={s.rupee}>₹</Text>
              <TextInput style={s.amountInput} value={expAmount} onChangeText={setExpAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.text.muted} />
            </View>
            <TextInput style={s.descInput} value={expDesc} onChangeText={setExpDesc} placeholder="What's this for?" placeholderTextColor={COLORS.text.muted} />

            {/* Split type tabs (GPay-style) */}
            <View style={s.splitTabs}>
              {SPLIT_TABS.map((tab) => (
                <TouchableOpacity key={tab.id} style={[s.splitTab, splitType === tab.id && s.splitTabActive]} onPress={() => setSplitType(tab.id)}>
                  <Ionicons name={tab.icon as any} size={18} color={splitType === tab.id ? COLORS.accent.primary : COLORS.text.muted} />
                  {splitType === tab.id && <View style={s.splitTabLine} />}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.splitLabel}>
              {splitType === 'equal' ? 'Split evenly' : splitType === 'custom' ? 'Split by amounts' : splitType === 'shares' ? 'Split by shares' : 'Split by percentages'}
            </Text>

            {/* Member list */}
            <ScrollView style={s.memberList}>
              {(selectedGroup?.members || []).map((m: any) => {
                const enabled = memberEnabled[m.user_id] !== false;
                const isMe = m.user_id === user?.id;
                return (
                  <View key={m.user_id} style={s.memberRow}>
                    <TouchableOpacity onPress={() => setMemberEnabled({ ...memberEnabled, [m.user_id]: !enabled })}>
                      <Ionicons name={enabled ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={enabled ? COLORS.accent.primary : COLORS.text.muted} />
                    </TouchableOpacity>
                    <View style={[s.memberAvatar, { backgroundColor: isMe ? '#6366F120' : '#F59E0B20' }]}>
                      <Text style={[s.memberInit, { color: isMe ? '#6366F1' : '#F59E0B' }]}>{(m.name || '?')[0]}</Text>
                    </View>
                    <View style={s.memberInfo}>
                      <Text style={s.memberName}>{isMe ? 'You' : m.name}</Text>
                      {splitType === 'equal' && enabled && <Text style={s.memberAmt}>₹{getPerMemberAmount(m.user_id)}</Text>}
                    </View>
                    {splitType === 'custom' && (
                      <View style={s.amtInputWrap}>
                        <Text style={s.amtPrefix}>₹</Text>
                        <TextInput style={s.memberAmtInput} value={memberAmounts[m.user_id]} onChangeText={(v) => setMemberAmounts({ ...memberAmounts, [m.user_id]: v })} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.text.muted} />
                      </View>
                    )}
                    {splitType === 'shares' && (
                      <View style={s.sharesWrap}>
                        <TouchableOpacity style={s.shareBtn} onPress={() => { const v = Math.max(0, (parseFloat(memberAmounts[m.user_id]) || 1) - 1); setMemberAmounts({ ...memberAmounts, [m.user_id]: String(v) }); }}>
                          <Ionicons name="remove" size={16} color={COLORS.text.muted} />
                        </TouchableOpacity>
                        <Text style={s.shareVal}>{memberAmounts[m.user_id] || '1'}</Text>
                        <TouchableOpacity style={s.shareBtn} onPress={() => { const v = (parseFloat(memberAmounts[m.user_id]) || 1) + 1; setMemberAmounts({ ...memberAmounts, [m.user_id]: String(v) }); }}>
                          <Ionicons name="add" size={16} color={COLORS.text.muted} />
                        </TouchableOpacity>
                      </View>
                    )}
                    {splitType === 'percentage' && (
                      <View style={s.amtInputWrap}>
                        <TextInput style={s.memberAmtInput} value={memberAmounts[m.user_id]} onChangeText={(v) => setMemberAmounts({ ...memberAmounts, [m.user_id]: v })} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.text.muted} />
                        <Text style={s.amtSuffix}>%</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={s.sendReqBtn} onPress={handleAddExpense}>
              <Text style={s.sendReqText}>Send request</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Summary Modal */}
      <Modal visible={summaryModal} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={[s.modalSheet, { maxHeight: '90%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.summaryHeader}>
              <View style={s.summaryAvatarStack}>
                {(selectedGroup?.members || []).slice(0, 4).map((m: any, i: number) => (
                  <View key={i} style={[s.sumAvatar, { marginLeft: i > 0 ? -8 : 0, backgroundColor: ['#6366F1', '#F59E0B', '#10B981', '#EF4444'][i % 4] + '25' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: ['#6366F1', '#F59E0B', '#10B981', '#EF4444'][i % 4] }}>{(m.name || '?')[0]}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.summaryTitle}>{groupSummary?.group_name}</Text>
              <TouchableOpacity onPress={() => setSummaryModal(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.sumStats}>
                <View style={s.sumStat}><Text style={s.sumStatVal}>₹{(groupSummary?.total_spent || 0).toFixed(0)}</Text><Text style={s.sumStatLbl}>Total</Text></View>
                <View style={s.sumStat}><Text style={s.sumStatVal}>{groupSummary?.total_expenses || 0}</Text><Text style={s.sumStatLbl}>Expenses</Text></View>
                <View style={s.sumStat}><Text style={s.sumStatVal}>{groupSummary?.member_count || 0}</Text><Text style={s.sumStatLbl}>Members</Text></View>
              </View>

              {groupSummary?.simplified_debts?.length > 0 && (
                <>
                  <Text style={s.sumSection}>Settle Up</Text>
                  {groupSummary.simplified_debts.map((d: any, i: number) => (
                    <View key={i} style={s.debtRow}>
                      <View style={s.debtInfo}>
                        <Text style={[s.debtName, { color: '#EF4444' }]}>{d.from_name}</Text>
                        <Ionicons name="arrow-forward" size={14} color={COLORS.text.muted} />
                        <Text style={[s.debtName, { color: '#10B981' }]}>{d.to_name}</Text>
                      </View>
                      <Text style={s.debtAmt}>₹{d.amount.toFixed(0)}</Text>
                      <TouchableOpacity style={s.payBtn} onPress={() => initiatePayment(d)}>
                        <Ionicons name="card" size={14} color="#fff" /><Text style={s.payBtnText}>Pay</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.remindBtn} onPress={() => remind(d.to_name, d.amount)}>
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              {groupSummary?.recent_expenses?.length > 0 && (
                <>
                  <Text style={s.sumSection}>Activity</Text>
                  {groupSummary.recent_expenses.map((e: any, i: number) => (
                    <View key={i} style={s.actRow}>
                      <View style={s.actDot} />
                      <View style={{ flex: 1 }}><Text style={s.actDesc}>{e.description}</Text><Text style={s.actMeta}>Paid by {e.paid_by_name}</Text></View>
                      <Text style={s.actAmt}>₹{e.amount.toFixed(0)}</Text>
                    </View>
                  ))}
                </>
              )}

              <TouchableOpacity style={s.addExpBottomBtn} onPress={() => { setSummaryModal(false); openAddExpense(selectedGroup); }}>
                <Ionicons name="add" size={18} color="#fff" /><Text style={s.addExpBottomText}> Add Expense</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* UPI App Selector */}
      <Modal visible={payModal} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.payTitle}>Pay ₹{payTarget?.amount?.toFixed(0)} to {payTarget?.to_name}</Text>
            <Text style={s.paySubtitle}>Select payment method</Text>
            {UPI_APPS.map((app) => (
              <TouchableOpacity key={app.id} style={s.upiRow} onPress={payViaUPI}>
                <View style={[s.upiIcon, { backgroundColor: app.color + '15' }]}><Ionicons name={app.icon as any} size={22} color={app.color} /></View>
                <Text style={s.upiName}>{app.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.cashPayBtn} onPress={() => { setPayModal(false); settleWithRewards({ ...payTarget, method: 'cash' }); }}>
              <Ionicons name="cash" size={18} color={COLORS.accent.primary} /><Text style={s.cashPayText}>Paid in Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPayModal(false)}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reward Celebration Modal */}
      <Modal visible={rewardModal} animationType="fade" transparent>
        <View style={s.rewardBg}>
          <View style={s.rewardCard}>
            <Text style={s.rewardEmoji}>🎉</Text>
            <Text style={s.rewardTitle}>Payment Settled!</Text>
            <View style={s.rewardCoinRow}>
              <Text style={s.rewardCoins}>+{lastReward?.coins_earned || 0} 🪙</Text>
              <Text style={s.rewardLabel}>{lastReward?.label}</Text>
            </View>
            <Text style={s.rewardTotal}>Total coins: {lastReward?.total_coins || 0}</Text>
            {lastReward?.cashback_available > 0 && (
              <Text style={s.rewardCashback}>💰 ₹{lastReward.cashback_available.toFixed(0)} cashback available!</Text>
            )}
            {lastReward?.new_badges?.length > 0 && (
              <View style={s.newBadgeRow}>
                {lastReward.new_badges.map((b: any, i: number) => (
                  <Text key={i} style={s.newBadge}>{b.emoji} {b.name}</Text>
                ))}
              </View>
            )}
            <TouchableOpacity style={s.rewardDoneBtn} onPress={() => setRewardModal(false)}>
              <Text style={s.rewardDoneText}>Awesome! 🚀</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Group Management Modal (GPay-style) */}
      <Modal visible={manageModal} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={[s.modalSheet, { maxHeight: '90%' }]}>
            <View style={s.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Avatar stack */}
              <View style={s.manageAvatars}>
                {(groupManage?.members || []).slice(0, 5).map((m: any, i: number) => (
                  <View key={i} style={[s.manageAvatar, { marginLeft: i > 0 ? -12 : 0, zIndex: 5 - i, backgroundColor: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] + '25' }]}>
                    <Text style={[s.manageInit, { color: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] }]}>{m.initial}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.manageName}>{groupManage?.name}</Text>

              {/* Actions */}
              <View style={s.manageActions}>
                <TouchableOpacity style={s.manageAction} onPress={shareInvite}>
                  <Ionicons name="link-outline" size={22} color="#6366F1" />
                  <Text style={s.manageActionText}>Invite via link</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.manageAction} onPress={shareInvite}>
                  <Ionicons name="qr-code-outline" size={22} color="#6366F1" />
                  <Text style={s.manageActionText}>Invite via QR code</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.manageAction} onPress={leaveGroup}>
                  <Ionicons name="exit-outline" size={22} color="#EF4444" />
                  <Text style={[s.manageActionText, { color: '#EF4444' }]}>Leave group</Text>
                </TouchableOpacity>
              </View>

              {/* Add member input */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Add member phone number" placeholderTextColor={COLORS.text.muted} value={addMemberPhone} onChangeText={setAddMemberPhone} keyboardType="phone-pad" maxLength={10} />
                <TouchableOpacity style={s.addMemberBtn} onPress={addMemberToGroup}>
                  <Ionicons name="person-add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Members list */}
              <Text style={s.manageMemberTitle}>Group members ({groupManage?.member_count || 0})</Text>
              {(groupManage?.members || []).map((m: any, i: number) => (
                <View key={i} style={s.manageMemberRow}>
                  <View style={[s.manageMemberAvatar, { backgroundColor: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] + '20' }]}>
                    <Text style={[s.manageMemberInit, { color: ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'][i % 5] }]}>{m.initial}</Text>
                  </View>
                  <Text style={s.manageMemberName}>{m.name}</Text>
                  {m.is_admin && <View style={s.adminBadge}><Text style={s.adminText}>Admin</Text></View>}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.submitBtn, { marginTop: 12 }]} onPress={() => setManageModal(false)}>
              <Text style={s.submitText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Group Modal */}
      <Modal visible={createModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.modalTitle}>New Group</Text>
              <TouchableOpacity onPress={() => setCreateModal(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Group name (e.g., Goa Trip)" placeholderTextColor={COLORS.text.muted} value={groupName} onChangeText={setGroupName} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Member phone" placeholderTextColor={COLORS.text.muted} value={memberPhone} onChangeText={setMemberPhone} keyboardType="phone-pad" maxLength={10} />
              <TouchableOpacity style={s.addMemberBtn} onPress={addPhone}><Ionicons name="person-add" size={20} color="#fff" /></TouchableOpacity>
            </View>
            {memberPhones.map((p, i) => (
              <View key={i} style={s.memberChip}><Ionicons name="person" size={14} color={COLORS.accent.primary} /><Text style={s.chipText}>{p}</Text>
                <TouchableOpacity onPress={() => setMemberPhones(memberPhones.filter((_, idx) => idx !== i))}><Ionicons name="close-circle" size={18} color={COLORS.text.muted} /></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.submitBtn} onPress={handleCreateGroup}><Text style={s.submitText}>Create Group</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { padding: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },
  coinText: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // Balance
  balanceCard: { flexDirection: 'row', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  balHalf: { flex: 1, alignItems: 'center' }, balDivider: { width: 1, height: 40, backgroundColor: COLORS.border.subtle },
  balVal: { fontSize: 24, fontWeight: '800' }, balLbl: { fontSize: 12, color: COLORS.text.muted, marginTop: 4 },
  // Leaderboard
  lbCard: { backgroundColor: '#FFFBEB', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FDE68A' },
  lbHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  lbTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#92400E' },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#FDE68A', gap: 8 },
  lbRowMe: { backgroundColor: '#FEF3C7', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
  lbMedal: { fontSize: 16, width: 28 }, lbName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text.primary }, lbCoins: { fontSize: 14, fontWeight: '700', color: '#F59E0B' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#FDE68A' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
  // Groups
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: SPACING.md },
  emptyCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.card, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary }, emptyText: { fontSize: 13, color: COLORS.text.muted },
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border.card },
  groupAvatarStack: { flexDirection: 'row', marginRight: SPACING.md },
  stackAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.card },
  stackInit: { fontSize: 13, fontWeight: '700' },
  groupInfo: { flex: 1 }, groupName: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary }, groupMeta: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  addExpBtn: { marginRight: 4 },
  // Modals
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  input: { backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 14, fontSize: 16, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, marginBottom: SPACING.md },
  addMemberBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary + '10', paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: 8 },
  chipText: { fontSize: 14, color: COLORS.accent.primary, fontWeight: '500' },
  submitBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: SPACING.md },
  submitText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // GPay Expense Modal
  expSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: '92%' },
  closeBtn: { position: 'absolute', right: SPACING.xl, top: SPACING.xl, zIndex: 10 },
  expLabel: { textAlign: 'center', fontSize: 14, color: COLORS.text.muted, marginTop: 8 },
  amountRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: SPACING.md },
  rupee: { fontSize: 36, fontWeight: '300', color: COLORS.text.primary, marginRight: 4 },
  amountInput: { fontSize: 48, fontWeight: '800', color: COLORS.text.primary, minWidth: 60, textAlign: 'center' },
  descInput: { textAlign: 'center', fontSize: 15, color: COLORS.text.muted, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border.subtle, borderRadius: RADIUS.full, marginBottom: SPACING.lg },
  splitTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, marginBottom: SPACING.sm },
  splitTab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  splitTabActive: {},
  splitTabLine: { position: 'absolute', bottom: -1, width: '80%', height: 3, borderRadius: 2, backgroundColor: COLORS.accent.primary },
  splitLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text.secondary, marginBottom: SPACING.md },
  memberList: { maxHeight: 300 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  memberInit: { fontSize: 16, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '600', color: COLORS.text.primary },
  memberAmt: { fontSize: 13, color: COLORS.text.muted, marginTop: 2 },
  amtInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.subtle, borderRadius: 8, paddingHorizontal: 8 },
  amtPrefix: { fontSize: 14, color: COLORS.text.muted }, amtSuffix: { fontSize: 14, color: COLORS.text.muted, marginLeft: 2 },
  memberAmtInput: { fontSize: 16, fontWeight: '600', color: COLORS.text.primary, width: 60, textAlign: 'right', paddingVertical: 6 },
  sharesWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.bg.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.subtle },
  shareVal: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary, width: 24, textAlign: 'center' },
  sendReqBtn: { backgroundColor: '#93C5FD', borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: SPACING.lg },
  sendReqText: { fontSize: 17, fontWeight: '700', color: '#1E3A5F' },
  // Summary
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.lg },
  summaryAvatarStack: { flexDirection: 'row' },
  sumAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.secondary },
  summaryTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  sumStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  sumStat: { alignItems: 'center' }, sumStatVal: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary }, sumStatLbl: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  sumSection: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: SPACING.md, marginTop: SPACING.md },
  debtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, gap: 6 },
  debtInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, debtName: { fontSize: 14, fontWeight: '600' },
  debtAmt: { fontSize: 16, fontWeight: '800', color: COLORS.text.primary },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accent.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full },
  payBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  remindBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#25D36612', justifyContent: 'center', alignItems: 'center' },
  actRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  actDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent.primary },
  actDesc: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary }, actMeta: { fontSize: 12, color: COLORS.text.muted }, actAmt: { fontSize: 15, fontWeight: '700', color: COLORS.text.primary },
  addExpBottomBtn: { flexDirection: 'row', backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  addExpBottomText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // UPI
  payTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary, marginBottom: 4 },
  paySubtitle: { fontSize: 14, color: COLORS.text.muted, marginBottom: SPACING.lg },
  upiRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  upiIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  upiName: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.text.primary },
  cashPayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.accent.primary + '10' },
  cashPayText: { fontSize: 15, fontWeight: '600', color: COLORS.accent.primary },
  cancelText: { textAlign: 'center', fontSize: 15, color: COLORS.text.muted, paddingVertical: 14 },
  // Reward celebration
  rewardBg: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  rewardCard: { backgroundColor: '#fff', borderRadius: 28, padding: 32, width: '85%', alignItems: 'center' },
  rewardEmoji: { fontSize: 48, marginBottom: 8 },
  rewardTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary, marginBottom: 16 },
  rewardCoinRow: { alignItems: 'center', marginBottom: 8 },
  rewardCoins: { fontSize: 36, fontWeight: '900', color: '#F59E0B' },
  rewardLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text.muted, marginTop: 4 },
  rewardTotal: { fontSize: 14, color: COLORS.text.secondary, marginTop: 8 },
  rewardCashback: { fontSize: 15, fontWeight: '700', color: '#10B981', marginTop: 8, backgroundColor: '#F0FDF4', paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full },
  newBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  newBadge: { fontSize: 13, fontWeight: '600', color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },
  rewardDoneBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 16, paddingHorizontal: 48, marginTop: 20 },
  rewardDoneText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Group Management (GPay-style)
  manageAvatars: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.md },
  manageAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.bg.secondary },
  manageInit: { fontSize: 20, fontWeight: '700' },
  manageName: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary, textAlign: 'center', marginBottom: SPACING.xl },
  manageActions: { marginBottom: SPACING.xl },
  manageAction: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  manageActionText: { fontSize: 16, fontWeight: '500', color: COLORS.text.primary },
  manageMemberTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text.muted, marginBottom: SPACING.md },
  manageMemberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  manageMemberAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  manageMemberInit: { fontSize: 16, fontWeight: '700' },
  manageMemberName: { flex: 1, fontSize: 16, fontWeight: '500', color: COLORS.text.primary },
  adminBadge: { backgroundColor: '#3B82F6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full },
  adminText: { fontSize: 12, fontWeight: '600', color: '#fff' },
});
