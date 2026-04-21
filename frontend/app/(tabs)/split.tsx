import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Alert, Platform, Linking, Share, RefreshControl, InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import {
  fetchSplitGroups, createSplitGroup, fetchGroupSummary, fetchGroupManage,
  fetchSplitBalances, fetchSplitActivity, fetchReminders, dismissReminder as dismissReminderSrv,
  updateGroupName, addGroupMember, removeGroupMember, leaveGroup, deleteGroup,
  createExpense, updateExpense, deleteExpense,
  fetchSettlementLeaderboard, fetchPayIntent, settleWithRewards,
  partialSettle as partialSettleSrv, markPaidOffline as markPaidOfflineSrv,
  createSplitRazorpayOrder, sendPaymentReminder,
} from '../../services/split';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import { SplitSkeleton } from '../../components/SkeletonLoader';
import GroupChat from '../../components/GroupChat';
import PressableGlass from '../../components/PressableGlass';
import { SHADOW, COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { shareSmart, copyToClipboard } from '../../utils/share';
import { C, getGA, DebtRow } from '../../components/split/theme';
import SettleUpCard from '../../components/split/SettleUpCard';
import SplitHero from '../../components/split/SplitHero';
import SplitInsightsHero from '../../components/split/SplitInsightsHero';
import RemindersBanner from '../../components/split/RemindersBanner';
import CreateGroupSheet from '../../components/split/CreateGroupSheet';
import ContactPickerSheet from '../../components/split/ContactPickerSheet';
import ExpenseSheet from '../../components/split/ExpenseSheet';
import GroupSummarySheet from '../../components/split/GroupSummarySheet';
import GroupManageSheet from '../../components/split/GroupManageSheet';
import PaySheet from '../../components/split/PaySheet';
import RemindSheet from '../../components/split/RemindSheet';
import RewardModal from '../../components/split/RewardModal';
import EmptyState from '../../components/ui/EmptyState';

export default function SplitScreen() {
  const s = useStyles();
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [groups, setGroups] = useState<any[]>([]);
  const [inviteGroup, setInviteGroup] = useState<{ id: string; name: string; memberCount: number } | null>(null);
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
  const settleRowsCacheKey = React.useRef<string>('');

  // Flatten simplified_debts across all groups for main-screen Settle Up list.
  // Cache by groups signature so we don't redundantly fetch N summaries on every data refresh.
  const fetchSettleRows = useCallback(async (grps: any[]) => {
    if (!user?.id || !grps?.length) { setSettleRows([]); settleRowsCacheKey.current = ''; return; }
    const key = grps.map((g: any) => `${g.id}:${g.members?.length || 0}`).sort().join('|');
    if (key === settleRowsCacheKey.current) return; // Same groups → skip heavy recompute
    try {
      const summaries = await Promise.all(
        grps.map((g: any) => fetchGroupSummary(g.id).then(d => ({ g, d })).catch(() => null))
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
      settleRowsCacheKey.current = key;
    } catch (e) { console.error('settleRows', e); }
  }, [user?.id]);

  const fetchData = useCallback(async () => {
    try {
      // Phase 1 — critical: groups + balances (block render)
      const [gR, bR] = await Promise.all([
        fetchSplitGroups().then(data => ({ data })),
        fetchSplitBalances().then(data => ({ data })),
      ]);
      setGroups(gR.data); setBalances(bR.data);
      setLoading(false);

      // Phase 2 — deferred: leaderboard + reminders + heavy settleRows recompute
      InteractionManager.runAfterInteractions(async () => {
        try {
          const [lR, rR] = await Promise.all([
            fetchSettlementLeaderboard().then(data => ({ data })).catch(() => ({ data: null })),
            fetchReminders().then(data => ({ data })).catch(() => ({ data: { received: [], sent: [] } })),
          ]);
          if (lR.data) setSettleLB(lR.data);
          if (rR.data) setReminders({ received: rR.data.received || [], sent: rR.data.sent || [] });
          fetchSettleRows(gR.data);
        } catch (e) { console.error('split phase2', e); }
        finally { setRefreshing(false); }
      });
    } catch (e) { console.error(e); setLoading(false); setRefreshing(false); }
  }, [fetchSettleRows]);

  useEffect(() => { fetchData(); }, []);
  const close = () => { setModal(''); setRemindTarget(null); setEditingExpense(null); };

  // GROUP CRUD
  const createGroup = async (name: string, phones: string[], emoji?: string) => {
    const trimmed = (name || '').trim();
    // Validation
    if (trimmed.length < 2) {
      Toast.show({ type: 'error', text1: 'Name too short', text2: 'Group names need at least 2 characters' });
      return;
    }
    if (trimmed.length > 50) {
      Toast.show({ type: 'error', text1: 'Name too long', text2: 'Keep it under 50 characters' });
      return;
    }
    // Optimistic UI — insert a placeholder group instantly so the list updates before the API resolves.
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      id: tempId,
      name: trimmed,
      members: [user?.phone || 'you', ...phones],
      custom_emoji: emoji || '👥',
      _optimistic: true,
    };
    setGroups((prev) => [optimistic, ...prev]);
    close();
    try {
      const res = { data: await createSplitGroup({ name: trimmed, members: phones, ...(emoji ? { custom_emoji: emoji } : {}) } as any) };
      const created = res.data || optimistic;
      // Reconcile: replace the optimistic entry with the server-blessed one.
      setGroups((prev) => prev.map((g) => (g.id === tempId ? { ...created, _optimistic: false } : g)));
      Toast.show({ type: 'success', text1: 'Group created! 🎉', text2: `${trimmed} is ready` });
      // Surface the invite sheet right after creation for quick WhatsApp / copy-link sharing.
      setInviteGroup({ id: created.id || tempId, name: trimmed, memberCount: 1 + phones.length });
      // Sync to get authoritative data
      fetchData();
    } catch (e: any) {
      // Roll back optimistic on failure
      setGroups((prev) => prev.filter((g) => g.id !== tempId));
      const raw = e?.response?.data?.detail;
      const msg = Array.isArray(raw)
        ? (raw[0]?.msg || 'Invalid input')
        : (typeof raw === 'string' ? raw : 'Try again');
      Toast.show({ type: 'error', text1: 'Could not create', text2: msg });
    }
  };

  const deleteGroup = () => {
    if (!selectedGroup?.id) return;
    const gid = selectedGroup.id; const gname = selectedGroup.name || 'this group';
    Alert.alert('Delete Group', `Delete "${gname}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteGroup(gid);
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
      await updateGroupName(selectedGroup.id, newName);
      openManage(selectedGroup); fetchData();
      Toast.show({ type: 'success', text1: 'Renamed!' });
    } catch {}
  };

  const addMember = async (phone: string) => {
    if (!selectedGroup?.id) return;
    try {
      const r = { data: await addGroupMember(selectedGroup.id, phone) };
      Toast.show({ type: 'success', text1: 'Done!', text2: r.data.message });
      openManage(selectedGroup); fetchData();
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };

  const removeMember = async (mid: string) => {
    if (!selectedGroup?.id) return;
    try {
      await removeGroupMember(selectedGroup.id, mid);
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
        try { await leaveGroup(gid); Toast.show({ type: 'success', text1: 'Left Group' }); } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not leave' }); }
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
        await updateExpense(payload.expense_id, {
          description: payload.description, amount: payload.amount,
          split_type: payload.split_type, splits: payload.splits,
        });
        close();
        // Refresh summary if user was viewing it
        if (groupSummary) openSummary(selectedGroup);
        fetchData();
        Toast.show({ type: 'success', text1: 'Updated!', text2: `₹${payload.amount.toFixed(0)} re-split` });
      } else {
        await createExpense({ group_id: selectedGroup.id, paid_by: user?.id, ...payload });
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
          await deleteExpense(exp.id);
          Toast.show({ type: 'success', text1: 'Deleted ✅' });
          if (selectedGroup) openSummary(selectedGroup);
          fetchData();
        } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Failed' }); }
      }},
    ]);
  };

  // SUMMARY & MANAGE
  const openSummary = async (gr: any) => {
    try { const d = await fetchGroupSummary(gr.id); setGroupSummary(d); setSelectedGroup(gr); setModal('summary'); }
    catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not load' }); }
  };
  const openManage = async (gr: any) => {
    try { const d = await fetchGroupManage(gr.id); setGroupManage(d); setSelectedGroup(gr); setModal('manage'); }
    catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not load' }); }
  };

  // PAYMENTS
  const openPay = (target: { to_id: string; to_name: string; amount: number; group_id?: string }) => {
    setPayTarget(target);
    if (target.group_id) setSelectedGroup({ ...(selectedGroup || {}), id: target.group_id });
    setModal('pay');
  };

  const payViaUPI = async (coinsToUse: number = 0) => {
    if (!payTarget) return;
    const { to_id, to_name, amount, group_id } = payTarget;
    try {
      const r = { data: await fetchPayIntent(to_id, amount) };
      setModal('');
      if (Platform.OS === 'web') {
        setTimeout(() => Alert.alert('Simulated Payment',
          `Pay ₹${amount.toFixed(0)} to ${to_name}?\n(UPI deep-link only works on phone.)`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm Paid', onPress: () => settleReward({ to_id, to_name, amount, method: 'upi', group_id, coins_to_use: coinsToUse }) },
          ]), 100);
        return;
      }
      await Linking.openURL(r.data.upi_link);
      setTimeout(() => Alert.alert('Payment Status', 'Did the payment go through?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Paid', onPress: () => settleReward({ to_id, to_name, amount, method: 'upi', group_id, coins_to_use: coinsToUse }) },
      ]), 2500);
    } catch (e: any) {
      setModal('');
      const msg = e?.response?.data?.detail || '';
      const isUpiErr = msg.toLowerCase().includes('upi');
      Alert.alert(isUpiErr ? 'UPI Not Set Up' : 'Payment Error',
        isUpiErr ? `${to_name} hasn't added their UPI ID yet. Pay in cash instead?` : 'Could not start payment. Try marking as cash?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark as Cash', onPress: () => settleReward({ to_id, to_name, amount, method: 'cash', group_id, coins_to_use: coinsToUse }) },
        ]);
    }
  };

  const settleReward = async (t: any) => {
    try {
      const r = { data: await settleWithRewards({
        target_user_id: t.to_id,
        amount: t.amount,
        method: t.method || 'upi',
        group_id: t.group_id,
        coins_to_use: Number(t.coins_to_use || 0),
      }) };
      setLastReward(r.data.reward); setModal('reward'); fetchData();
    } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not settle' }); }
  };

  const partialSettle = async (partialAmt: number, coinsToUse: number = 0) => {
    if (!payTarget) return;
    const { to_id, to_name, group_id } = payTarget;
    try {
      const r = { data: await partialSettleSrv({
        target_user_id: to_id,
        amount: partialAmt,
        method: 'upi',
        group_id,
        coins_to_use: Number(coinsToUse || 0),
      }) };
      close();
      const coinSuffix = r.data.coins_applied > 0 ? ` · 🪙${r.data.coins_applied}` : '';
      Toast.show({ type: 'success', text1: `Partial ₹${partialAmt.toFixed(0)} paid to ${to_name}${coinSuffix}`, text2: `+${r.data.coins_earned} 🪙 earned` });
      fetchData();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Failed' });
    }
  };

  // Razorpay-backed settlement — opens hosted checkout in expo-web-browser.
  // On success, the backend verifies the signature and auto-inserts the settlement,
  // so we just refresh the data once the browser closes.
  const payViaRazorpay = async (amount: number, coinsToUse: number = 0) => {
    if (!payTarget) return;
    const { to_id, to_name, group_id } = payTarget;
    try {
      const orderRes = { data: await createSplitRazorpayOrder({
        target_user_id: to_id,
        amount,
        group_id,
        coins_to_use: Number(coinsToUse || 0),
      }) };
      const checkoutUrl: string = orderRes.data?.checkout_url;
      if (!checkoutUrl) {
        Toast.show({ type: 'error', text1: 'Payment unavailable', text2: 'Checkout URL not configured' });
        return;
      }
      setModal('');
      const WebBrowser = await import('expo-web-browser');
      const result = await WebBrowser.openBrowserAsync(checkoutUrl);
      // openBrowserAsync resolves with { type: 'cancel'|'dismiss'|'opened' } when the
      // user closes the Razorpay hosted page. Because the actual settlement is only
      // committed by the backend on signature verify, we refresh the data here and
      // let the Splits / Activity refresh reveal the final status rather than
      // claiming success unconditionally.
      if (result) {
        setTimeout(() => {
          fetchData();
          Toast.show({
            type: 'info',
            text1: 'Payment in progress…',
            text2: `Refreshing ₹${amount.toFixed(0)} → ${to_name}. Check Splits for confirmation.`,
          });
        }, 600);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not start Razorpay payment';
      Toast.show({ type: 'error', text1: 'Payment error', text2: msg });
    }
  };

  const markPaidOffline = (row: DebtRow, method: 'cash' | 'bank_transfer' = 'cash') => {
    Alert.alert('Mark as Paid?',
      `Mark ₹${row.amount.toFixed(0)} to ${row.to_name} as paid in ${method === 'cash' ? 'cash' : 'bank transfer'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: async () => {
          try {
            const r = { data: await markPaidOfflineSrv({ target_user_id: row.to_id, amount: row.amount, group_id: row.group_id, method }) };
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
      const r = { data: await sendPaymentReminder({ target_user_id: targetUserId, amount: remindTarget.amount, group_id: remindTarget.group_id, note } as any) };
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
    try { await dismissReminderSrv(rid); fetchData(); } catch {}
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
        {/* HERO — saffron summary card (Phase 2 redesign) */}
        <SplitHero
          balances={balances}
          coins={coins}
          groupCount={groups.length}
          onAddGroup={() => setModal('create')}
        />

        <RemindersBanner received={reminders.received} onDismiss={dismissReminder} />

        {/* AI-powered insights carousel — makes the tab lively & addictive */}
        <SplitInsightsHero />

        <SettleUpCard
          rows={settleRows}
          onPay={(row) => openPay({ to_id: row.to_id, to_name: row.to_name, amount: row.amount, group_id: row.group_id })}
          onRemind={openRemind}
          onMarkPaid={markPaidOffline}
        />

        {/* GROUPS */}
        <Text style={s.section}>{t('groups', lang)}</Text>
        {groups.length === 0 ? (
          <EmptyState
            emoji="👥"
            title={t('no_groups', lang)}
            subtitle={t('create_first_group', lang)}
            ctaLabel="Create group"
            onCta={() => setModal('create')}
          />
        ) : groups.map((gr: any) => {
          const av = getGA(gr.name);
          const displayEmoji = gr.custom_emoji || av.emoji;
          return (
            <PressableGlass
              key={gr.id}
              onPress={() => setChatGroup(gr)}
              feedback="light"
              style={s.groupCard}
            >
              <LinearGradient colors={av.colors.map(c => c + '20') as any} style={s.groupAv}>
                <Text style={s.groupEmoji}>{displayEmoji}</Text>
              </LinearGradient>
              <View style={s.groupInfo}>
                <Text style={s.groupName} numberOfLines={1}>{gr.name}</Text>
                <Text style={s.groupMeta} numberOfLines={1}>{`${gr.members?.length || 0} ${t('members', lang)}`}</Text>
              </View>
              <PressableGlass onPress={() => openAddExpense(gr)} feedback="light" hitSlop={12}>
                <Ionicons name="add-circle" size={30} color={C.accent} />
              </PressableGlass>
              <PressableGlass onPress={() => openManage(gr)} feedback="light" hitSlop={12} style={{ marginLeft: 8 }}>
                <Ionicons name="ellipsis-vertical" size={20} color={C.text3} />
              </PressableGlass>
            </PressableGlass>
          );
        })}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* === SHEETS — lazy-mounted (only the active one renders) === */}
      {modal === 'create' && <ContactPickerSheet visible={true} onClose={close} onCreate={createGroup} />}

      {/* Post-creation invite sheet — WhatsApp / Copy link CTAs */}
      {inviteGroup && (
        <Modal visible={!!inviteGroup} animationType="slide" transparent onRequestClose={() => setInviteGroup(null)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ backgroundColor: COLORS.bg.elevated, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36, gap: 14, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 8 }} />

              <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.accent.moneyIn + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                  <Ionicons name="checkmark-circle" size={38} color={COLORS.accent.moneyIn} />
                </View>
                <Text style={{ fontSize: 19, fontWeight: '800', color: COLORS.text.primary }}>Group Created! 🎉</Text>
                <Text style={{ fontSize: 13, color: COLORS.text.secondary, marginTop: 3, textAlign: 'center' }}>
                  {inviteGroup.name} · {inviteGroup.memberCount} member{inviteGroup.memberCount === 1 ? '' : 's'}
                </Text>
              </View>

              <Text style={{ fontSize: 13, color: COLORS.text.muted, textAlign: 'center', marginTop: 4, marginBottom: 4 }}>
                Invite friends so they can log expenses with you
              </Text>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 999 }}
                onPress={async () => {
                  const url = `https://mintu.app/split/invite/${inviteGroup.id}`;
                  const msg = `Hey! I made a "${inviteGroup.name}" group on MintU to track our shared expenses 💸\n\nJoin here → ${url}`;
                  await shareSmart({ message: msg, title: 'Join my MintU group' });
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Invite via WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.bg.card, paddingVertical: 14, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border.card }}
                onPress={async () => {
                  const url = `https://mintu.app/split/invite/${inviteGroup.id}`;
                  await copyToClipboard(url, '🔗 Invite link copied');
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="copy-outline" size={18} color={COLORS.text.primary} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text.primary }}>Copy invite link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setInviteGroup(null)}
                style={{ paddingVertical: 10, alignItems: 'center', marginTop: 2 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text.muted }}>Do it later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      {modal === 'expense' && <ExpenseSheet visible={true} onClose={close} group={selectedGroup} currentUserId={user?.id} editing={editingExpense} onSubmit={submitExpense} />}
      {modal === 'summary' && (
        <GroupSummarySheet
          visible={true}
          onClose={close}
          summary={groupSummary}
          onAddExpense={() => { close(); setTimeout(() => openAddExpense(selectedGroup), 200); }}
          onEditExpense={(exp: any) => { close(); setTimeout(() => openEditExpense(exp), 200); }}
          onDeleteExpense={deleteExpense}
          onPay={(d: any) => { setPayTarget({ to_id: d.to_id, to_name: d.to_name, amount: d.amount, group_id: selectedGroup?.id }); setModal('pay'); }}
          onRemindLegacy={remindLegacy}
        />
      )}
      {modal === 'manage' && (
        <GroupManageSheet
          visible={true}
          onClose={close}
          manage={groupManage}
          currentUserId={user?.id}
          onRename={renameGroup}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          onDelete={deleteGroup}
          onLeave={leaveGroup}
        />
      )}
      {modal === 'pay' && (
        <PaySheet
          visible={true}
          onClose={close}
          target={payTarget}
          onPayUPI={(coins) => payViaUPI(coins || 0)}
          onPayCash={(coins) => { setModal(''); if (payTarget) settleReward({ ...payTarget, method: 'cash', coins_to_use: coins || 0 }); }}
          onPayPartial={(amt, coins) => partialSettle(amt, coins || 0)}
          onPayRazorpay={(amt, coins) => payViaRazorpay(amt, coins || 0)}
        />
      )}
      {modal === 'remind' && <RemindSheet visible={true} onClose={close} target={remindTarget} onSend={sendReminder} />}
      {modal === 'reward' && <RewardModal visible={true} reward={lastReward} onClose={() => { close(); fetchData(); }} />}

      {/* === GROUP CHAT === */}
      <Modal visible={!!chatGroup} animationType="slide">
        {chatGroup && (
          <GroupChat
            group={chatGroup}
            onClose={() => { setChatGroup(null); fetchData(); }}
            onAddExpense={(gr) => { setChatGroup(null); openAddExpense(gr); }}
            onManage={(gr) => { setChatGroup(null); openManage(gr); }}
            onEditExpense={(exp, gr) => { setChatGroup(null); setSelectedGroup(gr); setTimeout(() => openEditExpense(exp), 150); }}
            onDirectPay={(debt, gr) => {
              if (!debt) return;
              setChatGroup(null);
              setTimeout(() => openPay({
                to_id: debt.to_id,
                to_name: debt.to_name,
                amount: debt.amount,
                group_id: gr?.id || debt.group_id,
              }), 180);
            }}
            onRemind={(debt, gr) => {
              if (!debt) return;
              const row: DebtRow = {
                from_id: debt.from_id,
                from_name: debt.from_name,
                to_id: debt.to_id,
                to_name: debt.to_name,
                amount: debt.amount,
                group_id: gr?.id || debt.group_id,
                group_name: gr?.name || '',
                group_emoji: gr?.custom_emoji || '💰',
                direction: debt.from_id === user?.id ? 'i_owe' : 'owed_to_me',
              } as DebtRow;
              setChatGroup(null);
              setTimeout(() => openRemind(row), 180);
            }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 140 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: C.text1, letterSpacing: -0.5 },
  headerR: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.goldDim, borderWidth: 1, borderColor: 'rgba(255,179,0,0.2)' },
  coinText: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  addBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', ...SHADOW.md },
  balCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24, padding: 22, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    ...SHADOW.lg,
  },
  balRow: { flexDirection: 'row', alignItems: 'center' },
  balH: { flex: 1, alignItems: 'center' },
  balV: { fontSize: 26, fontWeight: '800' },
  balL: { fontSize: 12, color: C.text3, marginTop: 4 },
  balD: { width: 1, height: 40, backgroundColor: C.border },
  section: { fontSize: 16, fontWeight: '700', color: C.text1, marginBottom: 12 },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 24, padding: 40, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', gap: 8,
    ...SHADOW.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3 },
  emptyText: { fontSize: 13, color: C.text4 },
  groupCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)',
    ...SHADOW.sm,
  },
  groupAv: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  groupEmoji: { fontSize: 20 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '700', color: C.text1 },
  groupMeta: { fontSize: 12, color: C.text3, marginTop: 2 },
}));
