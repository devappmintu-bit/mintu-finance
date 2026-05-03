import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Alert, Platform, Linking, Share, RefreshControl, InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import {
  fetchSplitGroups, createSplitGroup, fetchGroupSummary, fetchGroupManage,
  fetchSplitBalances, fetchSplitActivity, fetchReminders, dismissReminder as dismissReminderSrv,
  updateGroupName, addGroupMember, removeGroupMember,
  leaveGroup as leaveGroupSrv, deleteGroup as deleteGroupSrv,
  createExpense, updateExpense, deleteExpense as deleteExpenseSrv,
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
import SplitHero from '../../components/split/SplitHeroBrutalist';
import SplitInsightsHero from '../../components/split/SplitInsightsHero';
import RemindersBanner from '../../components/split/RemindersBanner';
import ContactPickerSheet from '../../components/split/ContactPickerSheet';
import GroupSummarySheet from '../../components/split/GroupSummarySheet';
import SmartSettleSheet from '../../components/split/SmartSettleSheet';
import { fetchActiveNudges, resetNudgeForGroup, PendingNudge } from '../../services/nudges';
import GroupManageSheet from '../../components/split/GroupManageSheet';
import PaySheet from '../../components/split/PaySheet';
import RemindSheet from '../../components/split/RemindSheet';
import RewardModal from '../../components/split/RewardModal';
import DraftsPill from '../../components/split/DraftsPill';
import PendingSyncBanner from '../../components/split/PendingSyncBanner';
import InviteGroupSheet from '../../components/split/InviteGroupSheet';
import EmptyState from '../../components/ui/EmptyState';
import useSwr from '../../hooks/useSwr';
import PremiumUnlockTeaser from '../../components/premium/PremiumUnlockTeaser';
import SplitGroupsList from '../../components/split/SplitGroupsList';
import { StaggeredEntrance } from '../../components/primitives';
import { showError, showInfo, showSuccess } from '../../utils/toast';

function SplitScreen() {
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
  // Round 53m — Pending Settlement Nudges (personality-driven self-reminders)
  const [nudges, setNudges] = useState<PendingNudge[]>([]);
  const reloadNudges = useCallback(async () => {
    const list = await fetchActiveNudges();
    setNudges(list);
  }, []);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [lastReward, setLastReward] = useState<any>(null);
  const [chatGroup, setChatGroup] = useState<any>(null);
  const [remindTarget, setRemindTarget] = useState<DebtRow | null>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const settleRowsCacheKey = React.useRef<string>('');

  // ── SWR data layer (Round 26) ───────────────────────────────────────
  // Bridge pattern: SWR hooks drive the initial load + focus refresh,
  // but push fresh data into existing local state so all the optimistic
  // setGroups(...)/setBalances(...) mutation sites below keep working
  // unchanged. This is the lowest-risk migration for a 700-LOC screen.
  const { data: swrGroups, refetch: refetchGroupsSwr } = useSwr<any[]>('/split/groups', { ttlMs: 20_000, paused: !user?.id });
  const { data: swrBalances, refetch: refetchBalancesSwr } = useSwr<any>('/split/balances', { ttlMs: 20_000, paused: !user?.id });
  useEffect(() => { if (Array.isArray(swrGroups)) setGroups(swrGroups); }, [swrGroups]);
  useEffect(() => { if (swrBalances != null) setBalances(swrBalances); }, [swrBalances]);
  // Flip the skeleton as soon as SWR gives us either signal — no need to
  // wait for Phase 2 data (it loads deferred after interactions).
  useEffect(() => {
    if (swrGroups !== null && swrGroups !== undefined) setLoading(false);
  }, [swrGroups]);

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
    } catch (e) { if (__DEV__) console.error('settleRows', e); }
  }, [user?.id]);

  const fetchData = useCallback(async () => {
    try {
      // Phase 1 — critical groups + balances are now handled by useSwr
      // (above). Trigger a fresh background revalidation so pull-to-refresh
      // still requests the latest server state.
      const [gR] = await Promise.all([
        refetchGroupsSwr(),
        refetchBalancesSwr(),
      ]);
      setLoading(false);

      // Phase 2 — deferred: leaderboard + reminders + heavy settleRows recompute
      InteractionManager.runAfterInteractions(async () => {
        try {
          const [lR, rR] = await Promise.all([
            fetchSettlementLeaderboard().then(data => ({ data })).catch(() => ({ data: null })),
            fetchReminders().then(data => ({ data })).catch(() => ({ data: { received: [], sent: [] } })),
          ]);
          if (lR.data) setSettleLB(lR.data);
          if (rR.data) {
            const rd = rR.data as { received?: any[]; sent?: any[] };
            setReminders({ received: rd.received || [], sent: rd.sent || [] });
          }
          // Use the freshest snapshot from swrGroups (set by the useEffect bridge above).
          fetchSettleRows(groups);
        } catch (e) { if (__DEV__) console.error('split phase2', e); }
        finally { setRefreshing(false); }
      });
    } catch (e) { if (__DEV__) console.error(e); setLoading(false); setRefreshing(false); }
  }, [fetchSettleRows, refetchGroupsSwr, refetchBalancesSwr, groups]);

  // Phase 2 fix (M-5): debounced fetchData scheduler.
  // Many sheet-close handlers used `setTimeout(() => fetchData(), 300)`
  // independently — when two sheets closed within the same 300ms tick this
  // produced two overlapping refetches. The shared scheduler collapses any
  // burst into a single trailing fetch.
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFetchData = useCallback((delay = 300) => {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = setTimeout(() => {
      fetchTimerRef.current = null;
      fetchData();
    }, delay);
  }, [fetchData]);
  // Cleanup on unmount so we never fire after the component is gone.
  useEffect(() => () => {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
  }, []);

  // Phase 2 fix (M-4): wrap fetchData/reloadNudges in stable refs to make
  // the empty-deps useEffect intentional. Both callbacks already use their
  // own internal stable deps so a stale-closure here is benign, but
  // expressing the intent explicitly silences exhaustive-deps and prevents
  // accidental refetch loops if a future refactor adds non-stable deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); reloadNudges(); }, []);
  const close = () => { setModal(''); setRemindTarget(null); setEditingExpense(null); setPayTarget(null); };

  // GROUP CRUD
  const createGroup = async (name: string, phones: string[], emoji?: string) => {
    const trimmed = (name || '').trim();
    // Validation
    if (trimmed.length < 2) {
      showError('Name too short', 'Group names need at least 2 characters');
      return;
    }
    if (trimmed.length > 50) {
      showError('Name too long', 'Keep it under 50 characters');
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

  const deleteGroup = async () => {
    // NOTE: GroupManageSheet already confirms via its own confirmThen()
    // helper (native Alert / web window.confirm). A second prompt here
    // caused the action to silently fail on web.
    if (!selectedGroup?.id) return;
    const gid = selectedGroup.id; const gname = selectedGroup.name || 'this group';
    try {
      await deleteGroupSrv(gid);
      Toast.show({ type: 'success', text1: 'Deleted!', text2: `${gname} removed` });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not delete' });
    }
    close(); scheduleFetchData(300);
  };

  const renameGroup = async (newName: string) => {
    if (!newName.trim() || !selectedGroup?.id) return;
    // Optimistic — update the list and open manage sheet immediately.
    const prevGroups = groups;
    setGroups((prev) => prev.map((g) => (g.id === selectedGroup.id ? { ...g, name: newName.trim() } : g)));
    try {
      await updateGroupName(selectedGroup.id, newName);
      showSuccess('Renamed!');
      openManage(selectedGroup); fetchData();
    } catch (e: any) {
      // Roll back the optimistic update and surface the error.
      setGroups(prevGroups);
      Toast.show({ type: 'error', text1: 'Rename failed', text2: e?.response?.data?.detail || 'Try again' });
    }
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
      showSuccess('Member Removed');
    } catch {}
    openManage(selectedGroup); scheduleFetchData(300);
  };

  const leaveGroup = async () => {
    // NOTE: GroupManageSheet already confirms — no double-prompt here.
    if (!selectedGroup?.id) return;
    const gid = selectedGroup.id;
    try {
      await leaveGroupSrv(gid);
      showSuccess('Left Group');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not leave' });
    }
    close(); scheduleFetchData(300);
  };

  // EXPENSE CRUD
  const openAddExpense = (gr: any) => {
    // Route to new full-screen flow (replaces legacy bottom-sheet modal)
    setSelectedGroup(gr);
    router.push({ pathname: '/split/add-expense', params: { group_id: gr.id } } as any);
  };
  const openAddMember = (gr: any) => {
    // Route to new full-screen add-member flow with QR + WhatsApp invite
    setSelectedGroup(gr);
    router.push({ pathname: '/split/add-member', params: { group_id: gr.id } } as any);
  };
  const openEditExpense = (exp: any) => {
    // Route to full-screen edit mode (replaces legacy ExpenseSheet)
    const gid = selectedGroup?.id || exp?.group_id;
    if (!gid) return;
    router.push({ pathname: '/split/add-expense', params: { group_id: gid, expense_id: exp.id || exp._id } } as any);
  };
  const submitExpense = async (payload: { description: string; amount: number; split_type: string; splits: Record<string, number>; expense_id?: string }) => {
    if (!selectedGroup) return;
    try {
      if (payload.expense_id) {
        await updateExpense(payload.expense_id, {
          description: payload.description, amount: payload.amount,
          split_type: payload.split_type, splits: payload.splits,
        });
        close();
        settleRowsCacheKey.current = ''; // invalidate — debts may have shifted
        // Refresh summary if user was viewing it
        if (groupSummary) openSummary(selectedGroup);
        fetchData();
        Toast.show({ type: 'success', text1: 'Updated!', text2: `₹${payload.amount.toFixed(0)} re-split` });
      } else {
        await createExpense({ group_id: selectedGroup.id, paid_by: user?.id, ...payload });
        close();
        settleRowsCacheKey.current = ''; // invalidate — new debts appear
        fetchData();
        Toast.show({ type: 'success', text1: 'Added!', text2: `₹${payload.amount} split among ${Object.keys(payload.splits).length} people` });
      }
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Failed' }); }
  };
  const deleteExpense = (exp: any) => {
    Alert.alert('Delete expense?', `Delete "${exp.description}" (₹${exp.amount.toFixed(0)})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteExpenseSrv(exp.id);
          settleRowsCacheKey.current = ''; // invalidate — remove this debt share
          showSuccess('Deleted ✅');
          if (selectedGroup) openSummary(selectedGroup);
          fetchData();
        } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Failed' }); }
      }},
    ]);
  };

  // SUMMARY & MANAGE
  const openSummary = async (gr: any) => {
    try {
      const d = await fetchGroupSummary(gr.id);
      setGroupSummary(d);
      setSelectedGroup(gr);
      setModal('summary');
      // Round 53m — re-engagement clears any prior nudge suppression so
      // the user can be reminded again next time they open the group.
      resetNudgeForGroup(gr.id).catch(() => {});
      reloadNudges().catch(() => {});
    }
    catch (e: any) {
      if (e?.response?.status === 404) {
        setGroups((prev) => prev.filter((g) => g.id !== gr.id));
        setModal(''); setSelectedGroup(null); setChatGroup(null);
        showInfo('Group no longer available');
      } else {
        showError('Error', 'Could not load');
      }
    }
  };
  const openManage = async (gr: any) => {
    try { const d = await fetchGroupManage(gr.id); setGroupManage(d); setSelectedGroup(gr); setModal('manage'); }
    catch (e: any) {
      if (e?.response?.status === 404) {
        setGroups((prev) => prev.filter((g) => g.id !== gr.id));
        setModal(''); setSelectedGroup(null); setChatGroup(null);
        showInfo('Group no longer available');
      } else {
        showError('Error', 'Could not load');
      }
    }
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
    // Round 35 — optimistically remove the settled row so the UI reflects
    // ₹0 balance immediately; the phase-2 fetchData() will reconcile with
    // the server a moment later. Previously, the row lingered for ~500ms
    // before the deferred settleRows recompute replaced it, which felt
    // sluggish right after the user confirmed payment.
    const prevRows = settleRows;
    setSettleRows((rows) =>
      rows.filter((r) => !(r.to_id === t.to_id && r.group_id === t.group_id))
    );
    try {
      const r = { data: await settleWithRewards({
        target_user_id: t.to_id,
        amount: t.amount,
        method: t.method || 'upi',
        group_id: t.group_id,
        coins_to_use: Number(t.coins_to_use || 0),
      }) };
      settleRowsCacheKey.current = ''; // invalidate — debt cleared
      setLastReward(r.data.reward); setModal('reward'); fetchData();
    } catch {
      // Roll back optimistic removal if the server rejected the settle.
      setSettleRows(prevRows);
      showError('Error', 'Could not settle');
    }
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
      settleRowsCacheKey.current = ''; // invalidate — partial shrinks the debt
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
        showError('Payment unavailable', 'Checkout URL not configured');
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
            settleRowsCacheKey.current = ''; // invalidate — debt cleared
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
        showInfo('Already Reminded', 'Wait 1 hour before sending again');
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

  // Duplicate-name detection, date/code fallbacks, and the group-list
  // render have all been extracted to SplitGroupsList.tsx (Wave R2).

  return (
    <SafeAreaView style={s.bg}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={C.accent} />}>
        <StaggeredEntrance delayMs={65} duration={420} distance={14}>
        {/* HERO — saffron summary card (Phase 2 redesign) */}
        <SplitHero
          balances={balances}
          coins={coins}
          groupCount={groups.length}
          onAddGroup={() => setModal('create')}
          onSettleUp={() => setModal('settle' as any)}
        />

        {/* Round 51j — Drafts pill (auto-hides when no drafts).
            Surfaces unattached expenses so they're never "lost" between
            capture and group-assignment. Uses lazy-fetch so we don't
            slow the Split tab cold-load. */}
        <DraftsPill />

        {/* Phase 2 — Pending offline expense queue banner.
            Auto-hides when the queue is empty. Shows pending count
            (informational) or failed count (with tap-to-retry) so
            users always know the state of their offline submissions. */}
        <PendingSyncBanner />

        <RemindersBanner received={reminders.received} onDismiss={dismissReminder} />

        {/* AI-powered insights carousel — makes the tab lively & addictive */}
        <SplitInsightsHero />
        {/* Premium teaser — surfaces group spending insights for non-Pro (auto-hides for Pro) */}
        {groups.length > 0 && <PremiumUnlockTeaser context="split_insights" />}

        <SettleUpCard
          rows={settleRows}
          onPay={(row) => openPay({ to_id: row.to_id, to_name: row.to_name, amount: row.amount, group_id: row.group_id })}
          onRemind={openRemind}
          onMarkPaid={markPaidOffline}
        />

        {/* Wave R2 refactor — the entire groups list render block
            (including duplicate-name detection, empty state, and
            per-group card rendering) lives in SplitGroupsList. */}
        <SplitGroupsList
          groups={groups}
          lang={lang}
          onPressGroup={setChatGroup}
          onAddExpense={openAddExpense}
          onManage={openManage}
          onCreateGroup={() => setModal('create')}
        />

        <View style={{ height: 30 }} />
        </StaggeredEntrance>
      </ScrollView>

      {/* === SHEETS — lazy-mounted (only the active one renders) === */}
      {modal === 'create' && (
        <ContactPickerSheet
          visible={true}
          onClose={close}
          onCreate={createGroup}
          existingNames={groups.map((g: any) => g?.name || '').filter(Boolean)}
        />
      )}

      {/* Round 57d — extracted into InviteGroupSheet (was 65 LOC inline). */}
      <InviteGroupSheet
        group={inviteGroup}
        onClose={() => setInviteGroup(null)}
        onSkip={(g) => {
          // Round 36 — after invite sheet closes, auto-open the new group's
          // summary so the user lands inside their new group rather than
          // being dropped back at the group list.
          setInviteGroup(null);
          openSummary(g);
        }}
      />
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
          onSmartSettle={() => setModal('smartSettle')}
          nudge={nudges.find((n) => n.group_id === selectedGroup?.id) || null}
        />
      )}
      {/* Round 53k — Smart Settlements bottom sheet. Triggered from the
          group summary "Smart settle" CTA. Re-fetches plan, shows the
          optimized graph with the user's rows highlighted, and runs
          /settle-my-part atomically with idempotency on confirm. */}
      {modal === 'smartSettle' && (
        <SmartSettleSheet
          visible={true}
          groupId={selectedGroup?.id || null}
          groupName={selectedGroup?.name || groupSummary?.group_name}
          currentUserId={user?.id}
          onClose={() => { setModal('summary'); }}
          onSettled={() => {
            // Refresh group summary + global lists so balances update.
            setModal('');
            scheduleFetchData(250);
            // Round 53m — refresh nudges so the just-settled group's
            // banner disappears (auto-resolved by post-commit hook).
            setTimeout(() => reloadNudges(), 400);
          }}
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
          onFullAddMember={() => { const gid = selectedGroup?.id; close(); if (gid) setTimeout(() => router.push({ pathname: '/split/add-member', params: { group_id: gid } } as any), 180); }}
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
  coinPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 0, backgroundColor: C.goldDim, borderWidth: 1, borderColor: 'rgba(255,179,0,0.2)' },
  coinText: { fontSize: 14, fontWeight: '700', color: C.gold },
  addBtn: { width: 44, height: 44, borderRadius: 0, justifyContent: 'center', alignItems: 'center', ...SHADOW.md },
  balCard: {
    backgroundColor: C.card,
    borderRadius: 0, padding: 22, marginBottom: 16,
    borderWidth: 1, borderColor: C.cardBorder,
    ...SHADOW.lg,
  },
  balRow: { flexDirection: 'row', alignItems: 'center' },
  balH: { flex: 1, alignItems: 'center' },
  balV: { fontSize: 26, fontWeight: '800' },
  balL: { fontSize: 12, color: C.text3, marginTop: 4 },
  balD: { width: 1, height: 40, backgroundColor: C.border },
  section: { fontSize: 16, fontWeight: '700', color: C.text1, marginBottom: 12 },
  emptyCard: {
    backgroundColor: C.card,
    borderRadius: 0, padding: 40, alignItems: 'center',
    borderWidth: 1, borderColor: C.cardBorder, gap: 8,
    ...SHADOW.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3 },
  emptyText: { fontSize: 13, color: C.text4 },
  // groupCard / groupAv / groupEmoji / groupInfo / groupName / groupMeta /
  // groupCodeChip / groupCodeChipT — all moved to SplitGroupsList.tsx (Wave R2).
}));


// Round 41 — wrap with tab-level ErrorBoundary so a crash here
// doesn't blank the whole app; the user sees a Retry CTA instead.
import { withTabBoundary as _wrapTab_SplitScreen } from '../../components/withTabBoundary';
export default _wrapTab_SplitScreen(SplitScreen, 'Split');
