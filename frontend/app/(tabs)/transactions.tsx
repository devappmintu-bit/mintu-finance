import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../utils/api';
import { format } from 'date-fns/format';
import { useLangStore } from '../../store/langStore';
import { t, type LangCode } from '../../utils/i18n';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST, SHADOW, shadowStyle, useAppColors } from '../../utils/theme';
// R100AC — Neo palette for theme-aware bg.
import { useNeoPalette } from '../../store/neoTheme';
import { makeStyles } from '../../utils/makeStyles';
import { FlashList } from '@shopify/flash-list';
import PressableGlass from '../../components/PressableGlass';
import SwipeableRow from '../../components/SwipeableRow';
import Toast from 'react-native-toast-message';
import { TransactionsSkeleton } from '../../components/SkeletonLoader';
import EmptyState from '../../components/ui/EmptyState';
import SheetHeader from '../../components/ui/SheetHeader';
// PrimaryButton removed (Round 81). Use <BrutalButton> from components/brutal.
import TapTile from '../../components/ui/TapTile';
import GmailConnectCard from '../../components/transactions/GmailConnectCard';
import { PassivePane, StructureCard } from '../../components/brutalist/primitives';
import TransactionSheet from '../../components/transactions/TransactionSheet';
import {
  fetchTransactions as fetchTxnsSrv, addTransaction, updateTransaction, deleteTransaction,
} from '../../services/transactions';
import { PieChart } from 'react-native-gifted-charts';
import SmartInsightsStrip from '../../components/transactions/SmartInsightsStrip';
import TransactionFilterSheet, { DEFAULT_FILTER, TxnFilter, applyFilterToList, filterActiveCount } from '../../components/transactions/TransactionFilterSheet';
import TransactionsHero from '../../components/transactions/TransactionsHeroBrutalist';
// QuickScanFAB removed (Round 83) — input bar is now the single primary CTA.
import { StaggeredEntrance, SegmentedToggle, CurrencyField, CategorySelector, QuickAmountChips, InputAssistantHeader } from '../../components/primitives';
import useSwr from '../../hooks/useSwr';
import { useIsOnline } from '../../hooks/useIsOnline';
import { groupTransactionsByDate, type TxnRowItem } from '../../utils/groupTransactionsByDate';
import { showSuccess } from '../../utils/toast';


// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  heroPad: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  pageTitle: { fontSize: 28, fontWeight: '800', color: c.text.primary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: c.text.muted },
  headerActions: { flexDirection: 'row', gap: 10 },
  addBtn: { width: 44, height: 44, borderRadius: 0, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.md },
  filterBtn: { width: 44, height: 44, borderRadius: 0, backgroundColor: 'rgba(255,107,26,0.14)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,107,26,0.4)', position: 'relative' },
  filterBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 0, backgroundColor: c.accent.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: c.bg.primary },
  filterBadgeTxt: { fontSize: 10, fontWeight: '800', color: c.bg.elevated },
  // Quick bar
  quickBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, gap: 10 },
  quickInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.card, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, borderWidth: 1, borderColor: c.border.card },
  quickRupee: { fontSize: 18, fontWeight: '700', color: c.accent.primary, marginRight: 6 },
  quickInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: c.text.primary },
  voiceBtn: { width: 48, height: 48, borderRadius: 0, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // List
  listContent: { padding: SPACING.lg, paddingTop: 0, paddingBottom: 140 },
  // R101C — "View all" footer button. Brutalist hairline pill that
  // sits below the (capped) transaction list and tells the user there
  // are N more receipts they can pull in. Designed to be clearly
  // tappable but visually quieter than the primary input bar.
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    marginHorizontal: 6,
    borderWidth: 1.5,
    borderColor: c.text.primary,
    backgroundColor: c.bg.elevated,
  },
  viewAllT: {
    fontSize: 11,
    fontWeight: '900',
    color: c.text.primary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 0, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', ...SHADOW.sm },
  txnIcon: { width: 44, height: 44, borderRadius: 0, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 15, fontWeight: '600', color: c.text.primary, flex: 1 },
  txnDescRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gmailBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,107,26,0.14)', borderColor: 'rgba(255,107,26,0.4)', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 0 },
  gmailBadgeText: { fontSize: 9, fontWeight: '800', color: c.accent.brandDark, letterSpacing: 0.3 },
  txnMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  txnMeta: { fontSize: 12, color: c.text.muted },
  cashBadge: { backgroundColor: c.accent.warning + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 0 },
  cashBadgeText: { fontSize: 10, fontWeight: '700', color: c.accent.warning },
  txnAmount: { fontSize: 17, fontWeight: '700' },
  // Smart-grouping section header — Today / Yesterday / This Week / <Month>
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionHeaderLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: c.text.muted,
    textTransform: 'uppercase',
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '700',
    color: c.text.muted,
    opacity: 0.75,
  },
  sectionHeaderTotal: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text.secondary, marginTop: 16 },
  emptyText: { fontSize: 14, color: c.text.muted, marginTop: 6 },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: c.bg.secondary, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: SPACING.xxl, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  modalTitle: { fontSize: 22, fontWeight: '700', color: c.text.primary },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: SPACING.xxl },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: c.border.subtle },
  typeBtnActive: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  typeBtnText: { fontSize: 15, color: c.text.muted, fontWeight: '600' },
  typeBtnTextActive: { color: c.bg.primary },
  formLabel: { fontSize: 13, fontWeight: '600', color: c.text.muted, marginBottom: 10, letterSpacing: 0.3 },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.xxl, borderWidth: 1, borderColor: c.border.subtle },
  rupee: { fontSize: 24, fontWeight: '700', color: c.accent.primary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: c.text.primary, paddingVertical: 16 },
  chipScroll: { marginBottom: SPACING.xxl },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: c.bg.primary, marginRight: 8, borderWidth: 1, borderColor: c.border.subtle },
  chipActive: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  chipText: { fontSize: 13, color: c.text.secondary, fontWeight: '500' },
  chipTextActive: { color: c.bg.primary, fontWeight: '600' },
  textInput: { backgroundColor: c.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: 16, fontSize: 16, color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle, marginBottom: SPACING.xxl },
  submitBtn: { backgroundColor: c.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center' },
  submitText: { fontSize: 16, fontWeight: '700', color: c.bg.primary },
  // Round 38 — destructive delete button inside the edit sheet.
  deleteSheetBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 12,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: 'rgba(220,38,38,0.4)',
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  deleteSheetTxt: { fontSize: 14, fontWeight: '700', color: c.state.danger, letterSpacing: 0.2 },
  smsBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.accent.warning + '12', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  smsBannerText: { fontSize: 13, color: c.accent.warning, fontWeight: '500' },
  smsInput: { backgroundColor: c.bg.primary, borderRadius: RADIUS.xl, padding: SPACING.lg, fontSize: 15, color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle, minHeight: 120, marginBottom: SPACING.sm },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.accent.primary + '12', borderRadius: RADIUS.full, borderWidth: 1, borderColor: c.accent.primary + '30', alignSelf: 'flex-start', marginBottom: SPACING.lg },
  pasteBtnText: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
  // Notification paste card
  // Waste Detector & Pie Chart
  sectionLabel: { fontSize: 14, fontWeight: '700', color: c.text.muted, marginBottom: 8, marginTop: 4 },
  // AI Report Card
  reportCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 2) },
  reportTitle: { fontSize: 15, fontWeight: '700', color: c.text.primary },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, marginBottom: 10 },
  insightRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  aiRecBox: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(255,176,32,0.12)', padding: 12, borderRadius: RADIUS.lg, marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,176,32,0.4)' },
  aiRecTxt: { flex: 1, fontSize: 12, fontWeight: '500', color: c.text.muted, lineHeight: 18 },
}));

// Pure, memoized row — prevents re-renders on unrelated parent state changes (e.g. modals).
// Per UX spec: Transactions get DELETE-only swipe (no edit gesture).
// Users can still open the edit modal by tapping the row itself.
const TxnRow = memo(function TxnRow({ item, lang, onEdit, onDelete }: { item: any; lang: LangCode; onEdit: (t: any) => void; onDelete: (id: string) => void }) {
  const styles = useStyles();
  const c = useAppColors();
  const cat = CATEGORIES[item.category] || CATEGORIES.Other;
  const isCash = item.source === 'cash' || item.source === 'cash_recurring';
  const isGmail = item.source === 'gmail';
  return (
    <SwipeableRow
      onDelete={() => onDelete(item.id)}
      deleteLabel={t('delete', lang)}
    >
      <PressableGlass testID={`txn-${item.id}`} feedback="light" onPress={() => onEdit(item)} style={styles.txnCard}>
        <View style={[styles.txnIcon, { backgroundColor: cat.color + '18' }]}>
          <Ionicons name={cat.icon as any} size={20} color={cat.color} />
        </View>
        <View style={styles.txnInfo}>
          <View style={styles.txnDescRow}>
            <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
            {isGmail && (
              <View style={styles.gmailBadge}>
                <Ionicons name="mail" size={9} color={c.accent.brandDark} style={{ marginRight: 3 }} />
                <Text style={styles.gmailBadgeText}>Gmail</Text>
              </View>
            )}
          </View>
          <View style={styles.txnMetaRow}>
            <Text style={styles.txnMeta} numberOfLines={1}>{item.category} · {format(new Date(item.date), 'MMM dd')}</Text>
            {isCash && <View style={styles.cashBadge}><Text style={styles.cashBadgeText}>{t('cash', lang)}</Text></View>}
          </View>
        </View>
        <Text style={[styles.txnAmount, { color: item.type === 'credit' ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]} numberOfLines={1}>
          {item.type === 'credit' ? '+' : '-'}₹{item.amount.toFixed(0)}
        </Text>
      </PressableGlass>
    </SwipeableRow>
  );
});

// Section header — Today / Yesterday / This Week / <Month YYYY>.
// Memoised to avoid re-renders when scrolling through unrelated rows.
// Net total below the label is colored emerald (positive) / crimson (negative)
// so users can glance the day's net at a single fixation point.
const TxnSectionHeader = memo(function TxnSectionHeader({ label, count, total }: { label: string; count: number; total: number }) {
  const styles = useStyles();
  const c = useAppColors();
  const isPositive = total >= 0;
  const sign = total === 0 ? '' : (isPositive ? '+' : '-');
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={styles.sectionHeaderLabel}>{label}</Text>
        <Text style={styles.sectionHeaderCount}>{count} {count === 1 ? 'txn' : 'txns'}</Text>
      </View>
      {total !== 0 && (
        <Text style={[styles.sectionHeaderTotal, { color: isPositive ? c.accent.moneyIn : c.accent.moneyOut }]}>
          {sign}₹{Math.abs(total).toFixed(0)}
        </Text>
      )}
    </View>
  );
});

function TransactionsScreen() {
  const styles = useStyles();
  const c = useAppColors();
  const { lang } = useLangStore();
  const isOnline = useIsOnline();
  const params = useLocalSearchParams<{ openAdd?: string; openSmsScan?: string; type?: string }>();

  // ── SWR data layer (Round 26) ───────────────────────────────────────
  // Primary list — hot path, 15s TTL for quick revalidation on focus.
  const { data: txnData, isLoading: txnLoading, error: txnError, refetch: refetchTxns, mutate: mutateTxns } =
    useSwr<any[]>('/transactions', { ttlMs: 15_000 });
  // Secondary insights — 60s TTL, non-blocking. These fail open to null.
  const { data: waste, refetch: refetchWaste } = useSwr<any>('/waste-detector', { ttlMs: 60_000 });
  const { data: stats } = useSwr<any>('/stats/overview', { ttlMs: 60_000 });

  const transactions = txnData || [];
  const loading = txnLoading && (txnData == null);
  // Surface hard failure of primary list so users aren't shown a misleading
  // "Add first transaction" empty state when the fetch actually errored.
  const hasLoadError = !!txnError && (txnData == null || transactions.length === 0);

  const [modalVisible, setModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  // Round 68 — formData/handleAdd/amountError were retired in Round 66
  // when TransactionSheet became a self-contained component owning its
  // own form state. We keep only `pendingType` to honour deep-link
  // `?openAdd=1&type=credit` (kicks the sheet open in Income mode).
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [pendingType, setPendingType] = useState<'debit' | 'credit' | null>(null);
  // Submit-in-flight guard so spam-click can't double-fire (Round 32 audit fix).
  // The backend also has an idempotency_key partial-unique index, but this
  // is defence-in-depth to give the user immediate tactile feedback and
  // prevent two requests from ever leaving the device.
  const [submitting, setSubmitting] = useState(false);
  const [cashText, setCashText] = useState('');
  const [cashLoading, setCashLoading] = useState(false);
  const [notifText, setNotifText] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifExpanded, setNotifExpanded] = useState(false);
  // Filter state
  const [filterVisible, setFilterVisible] = useState(false);
  const [filter, setFilter] = useState<TxnFilter>(DEFAULT_FILTER);
  // R101C — Declutter: by default we render only the 15 most recent
  // matching transactions and show a "VIEW ALL N" footer button. The
  // SmartInsightsStrip + Hero already give the user the *meaning* of
  // their spending; an endless scroll of every receipt below it
  // buried the insights. Tapping VIEW ALL flips the cap off.
  const [showAll, setShowAll] = useState(false);
  const RECENT_CAP = 15;

  useEffect(() => {
    if (params.openAdd === '1') {
      setPendingType(params.type === 'credit' ? 'credit' : 'debit');
      setModalVisible(true);
      // Clear the query so it doesn't re-trigger on re-render
      try { router.setParams({ openAdd: undefined, type: undefined } as any); } catch {}
    } else if (params.openSmsScan === '1') {
      setSmsModalVisible(true);
      try { router.setParams({ openSmsScan: undefined } as any); } catch {}
    }
  }, [params.openAdd, params.openSmsScan, params.type]);

  // Unified refetch helper for mutations (replaces legacy fetchAll/fetchTransactions).
  // Round 41 — also invalidate the budgets/live SWR cache so the budget tab's
  // progress bars reflect this transaction's effect immediately when the user
  // switches tabs. Otherwise the budget for the same category would show
  // stale spent/remaining until manual refresh.
  const fetchTransactions = useCallback(async () => {
    await Promise.all([refetchTxns(), refetchWaste()]);
    try {
      const { invalidate } = await import('../../utils/swrGet');
      await invalidate?.('/budgets/live');
      await invalidate?.('/stats/overview');
    } catch {}
  }, [refetchTxns, refetchWaste]);

  const openEdit = useCallback((tx: any) => {
    setEditingTxn(tx);
    setPendingType(null);  // edit mode honours tx.type, not pendingType
    setModalVisible(true);
  }, []);

  // Unified SMS parser — handles both single bank notification AND multiple pasted SMS messages.
  // Splits on blank lines (\n\n) or "---" dividers. Falls back to single-message parse.
  const handleParseSMS = async () => {
    const raw = smsText.trim();
    if (!raw) { Alert.alert(t('error', lang), 'Paste SMS text'); return; }
    setSmsLoading(true);
    try {
      // Split into multiple messages on blank lines or "---" dividers
      const parts = raw.split(/\n\s*\n|^---$/gm).map(s => s.trim()).filter(s => s.length > 10);
      if (parts.length > 1) {
        // Multi-message flow — call bulk parse endpoint
        const res = await api.post('/sms/bulk-parse', { messages: parts });
        setSmsModalVisible(false); setSmsText(''); fetchTransactions();
        Toast.show({ type: 'success', text1: `Parsed ${res.data?.parsed || 0} messages!`, text2: `${res.data?.failed || 0} skipped` });
      } else {
        // Single message
        await api.post('/transactions/parse-sms', { sms_text: raw });
        setSmsModalVisible(false); setSmsText(''); fetchTransactions();
        showSuccess('Done!', 'Transaction added from SMS!');
      }
    } catch (e: any) { Alert.alert(t('error', lang), e.response?.data?.detail || 'Could not parse'); }
    finally { setSmsLoading(false); }
  };

  // Inline bank-notification parse (quick-entry variant) — same logic.
  const handleNotifParse = async () => {
    if (!notifText.trim()) { Alert.alert('Error', 'Paste your bank notification text'); return; }
    setNotifLoading(true);
    try {
      await api.post('/transactions/parse-sms', { sms_text: notifText });
      setNotifText(''); setNotifExpanded(false); fetchTransactions();
      showSuccess('Done!', 'Expense added from notification!');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Could not parse notification'); }
    finally { setNotifLoading(false); }
  };

  const handleQuickCash = async () => {
    if (!cashText.trim()) return;
    setCashLoading(true);
    try {
      await api.post('/cash/quick-entry', { text: cashText });
      setCashText(''); fetchTransactions();
    } catch (e: any) { Alert.alert(t('error', lang), e.response?.data?.detail || 'Could not parse'); }
    finally { setCashLoading(false); }
  };

  // [Voice transcription removed — SMS paste is the primary input method.]

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t('delete', lang), t('remove_transaction', lang), [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('delete', lang), style: 'destructive', onPress: async () => {
        // Optimistic remove via SWR mutate — capture prev snapshot INSIDE the
        // updater to avoid closing over stale `transactions` reference.
        let prev: any[] | null = null;
        mutateTxns((curr) => {
          prev = curr || [];
          return (curr || []).filter((tx: any) => tx.id !== id);
        });
        try {
          await deleteTransaction(id);
          Toast.show({ type: 'success', text1: t('txn_deleted', lang) });
          refetchTxns();
        } catch {
          // Rollback if the server rejects
          if (prev) mutateTxns(prev);
          Toast.show({ type: 'error', text1: t('error', lang) });
        }
      } },
    ]);
  }, [lang, mutateTxns, refetchTxns]);

  const renderTxn = useCallback(({ item }: { item: TxnRowItem }) => {
    if (item.type === 'header') {
      return <TxnSectionHeader label={item.label} count={item.count} total={item.total} />;
    }
    return <TxnRow item={item.data} lang={lang} onEdit={openEdit} onDelete={handleDelete} />;
  }, [lang, openEdit, handleDelete]);

  // Phase 2 fix — Memoise filter + grouping BEFORE the early loading-return
  // so we don't violate Rules of Hooks. Recomputes only when the source
  // transactions list, the filter object, or the grouping logic changes.
  const filteredTransactions = useMemo(
    () => applyFilterToList(transactions, filter),
    [transactions, filter]
  );
  const activeFilterCount = filterActiveCount(filter);
  // R101C — Declutter cap. When the user has more than RECENT_CAP txns
  // and hasn't tapped "VIEW ALL", we show only the most recent slice.
  // Backend already returns these in date-desc order so a simple
  // .slice(0, N) on the filtered list is correct.
  const visibleTransactions = useMemo(() => {
    if (showAll || filteredTransactions.length <= RECENT_CAP) return filteredTransactions;
    return filteredTransactions.slice(0, RECENT_CAP);
  }, [filteredTransactions, showAll]);
  const hiddenCount = Math.max(0, filteredTransactions.length - visibleTransactions.length);
  const groupedItems = useMemo(
    () => groupTransactionsByDate(visibleTransactions),
    [visibleTransactions]
  );

  // R100AC — Theme-aware bg via neo palette. Hook MUST sit ABOVE
  // any early-return below (`if (loading)`) to keep hook count
  // stable across renders (lesson learned in R100Z home crash).
  const neoPalette = useNeoPalette();
  const safeBg = { backgroundColor: neoPalette.bg };

  if (loading) return <SafeAreaView style={[styles.container, safeBg]}><TransactionsSkeleton /></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, safeBg]}>
      {/* HERO — v10 Brutalist ledger card. Onboard via SmartEntry directly. */}
      <View style={styles.heroPad}>
        <TransactionsHero
          transactions={transactions}
          onPressFilter={() => setFilterVisible(true)}
          activeFilterCount={activeFilterCount}
          filteredCount={filteredTransactions.length}
        />
      </View>

      {/* Quick Cash + SMS Bar */}
      <View style={styles.quickBar}>
        <View style={styles.quickInputWrap}>
          <Text style={styles.quickRupee}>₹</Text>
          <TextInput
            testID="quick-cash-input"
            style={styles.quickInput}
            placeholder={t('cash_entry_placeholder', lang)}
            placeholderTextColor={COLORS.text.muted}
            value={cashText}
            onChangeText={setCashText}
            onSubmitEditing={handleQuickCash}
            returnKeyType="done"
          />
          {cashLoading ? (
            <ActivityIndicator size="small" color={COLORS.accent.primary} />
          ) : cashText ? (
            <TouchableOpacity testID="quick-cash-submit" onPress={handleQuickCash}>
              <Ionicons name="send" size={20} color={COLORS.accent.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
        {/* SMS Paste button — replaces Voice (Phase 10 cleanup).
            R106 — Now opens the full-screen Live Scanning experience
            instead of an inline modal. The fullscreen flow runs the
            user through: Trust primer → Live scan animation → Result
            celebration with confidence stamps + dedup counters. */}
        <TouchableOpacity
          testID="sms-input-btn"
          style={styles.voiceBtn}
          onPress={() => router.push('/sms-import' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.bg.primary} />
        </TouchableOpacity>
      </View>

      <FlashList
        data={groupedItems}
        renderItem={renderTxn}
        keyExtractor={(item: TxnRowItem) => item.key}
        getItemType={(item: TxnRowItem) => item.type}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <StaggeredEntrance delayMs={70} duration={420} distance={14}>
            {/* Round 80 — 3-layer cascade.
                GmailConnectCard (setup hint) = Passive.
                SmartInsightsStrip (supporting data) = Structure. */}
            <PassivePane density="compact" style={{ paddingVertical: 0, paddingHorizontal: 0, marginBottom: 8 }}>
              <GmailConnectCard />
            </PassivePane>

            <StructureCard density="compact" style={{ paddingVertical: 0, paddingHorizontal: 0, marginBottom: 12 }}>
              <SmartInsightsStrip transactions={transactions} />
            </StructureCard>

            {/* R101C — AI Expense Report card REMOVED from default
                view. It duplicated SmartInsightsStrip's job, ate
                ~280px of vertical space, and was the single biggest
                contributor to "I have to scroll forever to find a
                receipt". The category-waste data still lives at
                /waste-detector — surfaced via Pulse + Coach. */}
            <Text style={styles.sectionLabel}>
              {showAll ? 'All transactions' : 'Recent transactions'}
            </Text>
          </StaggeredEntrance>
        }
        ListFooterComponent={
          // R101C — "View all" expander. Only renders when there are
          // more transactions hidden than the cap. After expansion,
          // it flips to a "Show recent only" toggle so power users
          // can collapse the list back to the lean view.
          hiddenCount > 0 ? (
            <TouchableOpacity
              testID="txn-view-all-btn"
              activeOpacity={0.85}
              onPress={() => setShowAll(true)}
              style={styles.viewAllBtn}
              accessibilityRole="button"
              accessibilityLabel={`View all ${filteredTransactions.length} transactions`}
            >
              <Ionicons name="chevron-down" size={16} color={c.text.primary} />
              <Text style={styles.viewAllT}>VIEW ALL · {hiddenCount} MORE</Text>
            </TouchableOpacity>
          ) : showAll && filteredTransactions.length > RECENT_CAP ? (
            <TouchableOpacity
              testID="txn-collapse-btn"
              activeOpacity={0.85}
              onPress={() => setShowAll(false)}
              style={styles.viewAllBtn}
              accessibilityRole="button"
              accessibilityLabel="Show recent transactions only"
            >
              <Ionicons name="chevron-up" size={16} color={c.text.primary} />
              <Text style={styles.viewAllT}>SHOW RECENT ONLY</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          hasLoadError ? (
            <EmptyState
              emoji="⚠️"
              title="Couldn't load transactions"
              subtitle={txnError?.message || 'Check your connection and try again'}
              ctaLabel="Retry"
              onCta={() => refetchTxns()}
            />
          ) : (
            <EmptyState
              mascot
              title={t('no_transactions', lang)}
              subtitle={t('add_first', lang)}
              ctaLabel="Add first transaction"
              onCta={() => setModalVisible(true)}
            />
          )
        }
      />

      {/* Add/Edit Transaction Sheet — Round 65 minimalist redesign */}
      <TransactionSheet
        visible={modalVisible}
        editing={editingTxn ? {
          id: editingTxn.id,
          amount: editingTxn.amount,
          category: editingTxn.category,
          description: editingTxn.description || '',
          type: editingTxn.type,
        } : null}
        initialType={pendingType ?? undefined}
        submitting={submitting}
        isOnline={isOnline}
        onClose={() => {
          setModalVisible(false);
          setEditingTxn(null);
          setPendingType(null);
        }}
        onSubmit={async (payload) => {
          if (payload.description.length > 200) {
            Alert.alert(t('error', lang), 'Description too long (max 200 chars)');
            return;
          }
          const isEdit = !!editingTxn;
          setSubmitting(true);
          try {
            if (isEdit && editingTxn) {
              const patched = { ...editingTxn, amount: payload.amount, category: payload.category, description: payload.description, type: payload.type };
              mutateTxns((prev) => (prev || []).map((tx: any) => (tx.id === editingTxn.id ? patched : tx)));
              await updateTransaction(editingTxn.id, { amount: payload.amount, category: payload.category, description: payload.description, type: payload.type as any });
              Toast.show({ type: 'success', text1: t('txn_updated', lang) });
            } else {
              await addTransaction({ amount: payload.amount, category: payload.category, description: payload.description, type: payload.type } as any);
              Toast.show({ type: 'success', text1: t('txn_added', lang) });
            }
            setModalVisible(false);
            setEditingTxn(null);
            setPendingType(null);
            fetchTransactions();
          } catch (e: any) {
            const detail = e?.response?.data?.detail;
            Alert.alert(t('error', lang), typeof detail === 'string' ? detail : t('failed_save', lang));
            fetchTransactions();
          } finally {
            setSubmitting(false);
          }
        }}
        onDelete={(id) => {
          // Mirror legacy: close sheet then prompt to delete (avoid iOS double-modal stacking)
          setModalVisible(false);
          setTimeout(() => handleDelete(id), 220);
        }}
      />

      {/* SMS Parse Modal — includes Paste Bank Notification */}
      <Modal visible={smsModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('scan_sms', lang)}</Text>
              <TouchableOpacity onPress={() => setSmsModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <View style={styles.smsBanner}>
              <Ionicons name="sparkles" size={18} color={COLORS.accent.warning} />
              <Text style={styles.smsBannerText}>AI auto-parses bank SMS, UPI alerts & notifications</Text>
            </View>
            {/* UNIFIED PASTE — one or multiple messages */}
            <Text style={styles.formLabel}>Paste SMS or bank notifications</Text>
            <Text style={{ fontSize: 11, color: COLORS.text.muted, marginBottom: 8 }}>💡 Paste multiple by separating with blank lines — AI detects and parses each</Text>
            <TextInput
              style={[styles.smsInput, { minHeight: 140 }]}
              placeholder={`HDFC Bank: Rs 500.00 debited from A/c XX1234...\n\nSBI: Rs 120 UPI paid to SWIGGY\n\nICICI: Credit card XX9876 charged Rs 2,499 at AMAZON`}
              placeholderTextColor={COLORS.text.muted}
              value={smsText}
              onChangeText={setSmsText}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit={false}
              editable={!smsLoading}
              returnKeyType="default"
            />
            {/* Paste-from-clipboard helper — works on web + mobile */}
            <TouchableOpacity
              style={styles.pasteBtn}
              activeOpacity={0.8}
              onPress={async () => {
                try {
                  const Clipboard = await import('expo-clipboard');
                  const text = await Clipboard.getStringAsync();
                  if (text) {
                    setSmsText(prev => prev ? prev + '\n\n' + text : text);
                    Toast.show({ type: 'success', text1: 'Pasted from clipboard', position: 'bottom' });
                  } else {
                    Toast.show({ type: 'info', text1: 'Clipboard is empty', position: 'bottom' });
                  }
                } catch {
                  Toast.show({ type: 'info', text1: 'Paste manually using ⌘V / Ctrl+V', position: 'bottom' });
                }
              }}
            >
              <Ionicons name="clipboard-outline" size={15} color={COLORS.accent.primary} />
              <Text style={styles.pasteBtnText}>Paste from clipboard</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="parse-sms-btn" style={[styles.submitBtn, smsLoading && { opacity: 0.6 }]} onPress={handleParseSMS} disabled={smsLoading || !smsText.trim()}>
              {smsLoading ? <ActivityIndicator color={COLORS.bg.primary} /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="sparkles" size={16} color={COLORS.bg.primary} />
                  <Text style={styles.submitText}>AI Parse & Add All</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modern filter bottom sheet */}
      <TransactionFilterSheet
        visible={filterVisible}
        value={filter}
        onClose={() => setFilterVisible(false)}
        onApply={setFilter}
      />

      {/* Round 83 — FAB removed (user critique). The in-ledger input
          bar is now the SINGLE primary CTA for adding expenses. SMS
          scan and receipt flows are reached from the EXPENSE tile's
          long-press / overflow menu to keep the primary lane clean. */}
    </SafeAreaView>
  );
}



// Round 41 — wrap with tab-level ErrorBoundary so a crash here
// doesn't blank the whole app; the user sees a Retry CTA instead.
import { withTabBoundary as _wrapTab_TransactionsScreen } from '../../components/withTabBoundary';



export default _wrapTab_TransactionsScreen(TransactionsScreen, 'Transactions');
