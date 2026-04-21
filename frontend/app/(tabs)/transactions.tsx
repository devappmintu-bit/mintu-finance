import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../utils/api';
import { format } from 'date-fns';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST, SHADOW, shadowStyle } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { FlashList } from '@shopify/flash-list';
import PressableGlass from '../../components/PressableGlass';
import SwipeableRow from '../../components/SwipeableRow';
import Toast from 'react-native-toast-message';
import { TransactionsSkeleton } from '../../components/SkeletonLoader';
import EmptyState from '../../components/ui/EmptyState';
import SheetHeader from '../../components/ui/SheetHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TapTile from '../../components/ui/TapTile';
import GmailConnectCard from '../../components/transactions/GmailConnectCard';
import {
  fetchTransactions as fetchTxnsSrv, addTransaction, updateTransaction, deleteTransaction,
} from '../../services/transactions';
import { PieChart } from 'react-native-gifted-charts';
import SmartInsightsStrip from '../../components/transactions/SmartInsightsStrip';
import TransactionFilterSheet, { DEFAULT_FILTER, TxnFilter, applyFilterToList, filterActiveCount } from '../../components/transactions/TransactionFilterSheet';
import TransactionsHero from '../../components/transactions/TransactionsHero';

// Pure, memoized row — prevents re-renders on unrelated parent state changes (e.g. modals).
// Per UX spec: Transactions get DELETE-only swipe (no edit gesture).
// Users can still open the edit modal by tapping the row itself.
const TxnRow = memo(function TxnRow({ item, lang, onEdit, onDelete }: { item: any; lang: string; onEdit: (t: any) => void; onDelete: (id: string) => void }) {
  const styles = useStyles();
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
                <Ionicons name="mail" size={9} color="#C14A06" style={{ marginRight: 3 }} />
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

export default function TransactionsScreen() {
  const styles = useStyles();
  const { lang } = useLangStore();
  const params = useLocalSearchParams<{ openAdd?: string; openSmsScan?: string; type?: string }>();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [formData, setFormData] = useState({ id: '', amount: '', category: 'Food', description: '', type: 'debit' });
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [cashText, setCashText] = useState('');
  const [cashLoading, setCashLoading] = useState(false);
  const [notifText, setNotifText] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifExpanded, setNotifExpanded] = useState(false);
  // Insights data
  const [waste, setWaste] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Filter state
  const [filterVisible, setFilterVisible] = useState(false);
  const [filter, setFilter] = useState<TxnFilter>(DEFAULT_FILTER);

  useEffect(() => { fetchAll(); }, []);

  // Auto-open add/SMS modals when arriving via AI Coach CTAs (e.g. /transactions?openAdd=1&type=credit)
  useEffect(() => {
    if (params.openAdd === '1') {
      setFormData(prev => ({
        ...prev,
        type: params.type === 'credit' ? 'credit' : 'debit',
        category: params.type === 'credit' ? 'Other' : 'Food',
      }));
      setModalVisible(true);
      // Clear the query so it doesn't re-trigger on re-render
      try { router.setParams({ openAdd: undefined, type: undefined } as any); } catch {}
    } else if (params.openSmsScan === '1') {
      setSmsModalVisible(true);
      try { router.setParams({ openSmsScan: undefined } as any); } catch {}
    }
  }, [params.openAdd, params.openSmsScan, params.type]);

  const fetchAll = async () => {
    try {
      const [txnRes, wasteRes, statsRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/waste-detector').catch(() => ({ data: null })),
        api.get('/stats/overview').catch(() => ({ data: null })),
      ]);
      setTransactions(txnRes.data);
      if (wasteRes.data) setWaste(wasteRes.data);
      if (statsRes.data) setStats(statsRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const fetchTransactions = fetchAll;

  const handleAdd = async () => {
    if (!formData.amount || !formData.description) { Alert.alert(t('error', lang), t('fill_all_fields', lang)); return; }
    const isEdit = !!editingTxn;
    try {
      if (isEdit) {
        // Optimistic update
        const patched = { ...editingTxn, amount: parseFloat(formData.amount), category: formData.category, description: formData.description, type: formData.type };
        setTransactions(prev => prev.map(tx => tx.id === editingTxn.id ? patched : tx));
        await updateTransaction(editingTxn.id, { amount: parseFloat(formData.amount), category: formData.category, description: formData.description, type: formData.type as any });
        Toast.show({ type: 'success', text1: t('txn_updated', lang) });
      } else {
        await addTransaction({ ...formData, amount: parseFloat(formData.amount) } as any);
        Toast.show({ type: 'success', text1: t('txn_added', lang) });
      }
      setModalVisible(false);
      setEditingTxn(null);
      setFormData({ id: '', amount: '', category: 'Food', description: '', type: 'debit' });
      fetchTransactions();
    } catch (e) { Alert.alert(t('error', lang), t('failed_save', lang)); fetchTransactions(); }
  };

  const openEdit = (tx: any) => {
    setEditingTxn(tx);
    setFormData({ id: tx.id, amount: String(tx.amount), category: tx.category, description: tx.description, type: tx.type });
    setModalVisible(true);
  };

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
        Toast.show({ type: 'success', text1: 'Done!', text2: 'Transaction added from SMS!' });
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
      Toast.show({ type: 'success', text1: 'Done!', text2: 'Expense added from notification!' });
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

  const handleDelete = (id: string) => {
    Alert.alert(t('delete', lang), t('remove_transaction', lang), [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('delete', lang), style: 'destructive', onPress: async () => {
        // Optimistic remove — instantly update UI
        const prev = transactions;
        setTransactions(curr => curr.filter(tx => tx.id !== id));
        try {
          await deleteTransaction(id);
          Toast.show({ type: 'success', text1: t('txn_deleted', lang) });
          fetchTransactions();
        } catch {
          // Rollback if the server rejects
          setTransactions(prev);
          Toast.show({ type: 'error', text1: t('error', lang) });
        }
      } },
    ]);
  };

  const renderTxn = useCallback(({ item }: { item: any }) => (
    <TxnRow item={item} lang={lang} onEdit={openEdit} onDelete={handleDelete} />
  ), [lang, transactions]);

  if (loading) return <SafeAreaView style={styles.container}><TransactionsSkeleton /></SafeAreaView>;

  const filteredTransactions = applyFilterToList(transactions, filter);
  const activeFilterCount = filterActiveCount(filter);

  return (
    <SafeAreaView style={styles.container}>
      {/* HERO — saffron summary card replacing plain header (Phase 2 redesign) */}
      <View style={styles.heroPad}>
        <TransactionsHero
          transactions={transactions}
          onPressAdd={() => setModalVisible(true)}
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
        {/* SMS Paste button — replaces Voice (Phase 10 cleanup) */}
        <TouchableOpacity
          testID="sms-input-btn"
          style={styles.voiceBtn}
          onPress={() => setSmsModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.bg.primary} />
        </TouchableOpacity>
      </View>

      <FlashList
        data={filteredTransactions}
        renderItem={renderTxn}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        estimatedItemSize={74}
        ListHeaderComponent={
          <>
            {/* Gmail auto-import CTA — shows only when not yet connected. */}
            <GmailConnectCard />

            {/* Smart Insights — Data-driven spending summary */}
            <SmartInsightsStrip transactions={transactions} />

            {/* AI Expense Report Card */}
            {waste && waste.ai_recommendation ? (
              <View style={styles.reportCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="sparkles" size={16} color={COLORS.accent.primary} />
                  <Text style={styles.reportTitle}>AI Expense Report</Text>
                </View>
                {waste.overall_trend_pct !== undefined && waste.prev_month_total > 0 && (
                  <View style={[styles.trendRow, { backgroundColor: waste.overall_trend_pct > 0 ? '#FEF2F2' : '#F0FDF4' }]}>
                    <Ionicons name={waste.overall_trend_pct > 0 ? 'trending-up' : 'trending-down'} size={14} color={waste.overall_trend_pct > 0 ? '#EF4444' : '#10B981'} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: waste.overall_trend_pct > 0 ? '#EF4444' : '#10B981' }}>
                      {Math.abs(waste.overall_trend_pct).toFixed(0)}% {waste.overall_trend_pct > 0 ? 'more' : 'less'} than last month
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.text.muted, marginLeft: 'auto' }}>₹{waste.total_monthly_expense?.toLocaleString()}</Text>
                  </View>
                )}
                {waste.category_waste?.slice(0, 3).map((w: any, i: number) => (
                  <View key={i} style={styles.insightRow}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text.primary }}>{w.shock_text}</Text>
                    {w.peer_comparison?.text ? <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>👥 {w.peer_comparison.text}</Text> : null}
                  </View>
                ))}
                <View style={styles.aiRecBox}>
                  <Ionicons name="bulb" size={14} color="#F59E0B" />
                  <Text style={styles.aiRecTxt}>{waste.ai_recommendation}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>Transactions</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            emoji="🧾"
            title={t('no_transactions', lang)}
            subtitle={t('add_first', lang)}
            ctaLabel="Add first transaction"
            onCta={() => setModalVisible(true)}
          />
        }
      />

      {/* Add Transaction Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <SheetHeader
              title={editingTxn ? t('edit_transaction', lang) : t('add_transaction', lang)}
              onClose={() => { setModalVisible(false); setEditingTxn(null); setFormData({ id: '', amount: '', category: 'Food', description: '', type: 'debit' }); }}
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.typeRow}>
                {['debit', 'credit'].map((tp) => (
                  <TapTile key={tp} style={[styles.typeBtn, formData.type === tp && styles.typeBtnActive]} onPress={() => setFormData({ ...formData, type: tp })} feedback="selection">
                    <Ionicons name={tp === 'debit' ? 'arrow-up-circle' : 'arrow-down-circle'} size={18} color={formData.type === tp ? COLORS.bg.primary : COLORS.text.muted} />
                    <Text style={[styles.typeBtnText, formData.type === tp && styles.typeBtnTextActive]}>{tp === 'debit' ? t('expense', lang) : t('income', lang)}</Text>
                  </TapTile>
                ))}
              </View>
              <Text style={styles.formLabel}>{t('amount', lang)}</Text>
              <View style={styles.amountRow}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput style={styles.amountInput} placeholder="0" placeholderTextColor={COLORS.text.muted} value={formData.amount} onChangeText={(v) => setFormData({ ...formData, amount: v })} keyboardType="numeric" />
              </View>
              <Text style={styles.formLabel}>{t('category', lang)}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {CATEGORY_LIST.map((c) => (
                  <TapTile key={c} style={[styles.chip, formData.category === c && styles.chipActive]} onPress={() => setFormData({ ...formData, category: c })} feedback="selection">
                    <Ionicons name={CATEGORIES[c].icon as any} size={14} color={formData.category === c ? COLORS.bg.primary : CATEGORIES[c].color} />
                    <Text style={[styles.chipText, formData.category === c && styles.chipTextActive]}>{c}</Text>
                  </TapTile>
                ))}
              </ScrollView>
              <Text style={styles.formLabel}>{t('description', lang)}</Text>
              <TextInput style={styles.textInput} placeholder="e.g. Lunch at restaurant" placeholderTextColor={COLORS.text.muted} value={formData.description} onChangeText={(v) => setFormData({ ...formData, description: v })} />
              <TouchableOpacity testID="submit-txn-btn" style={styles.submitBtn} onPress={handleAdd}><Text style={styles.submitText}>{editingTxn ? t('update', lang) : t('add_transaction', lang)}</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  heroPad: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  pageTitle: { fontSize: 28, fontWeight: '800', color: c.text.primary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: c.text.muted },
  headerActions: { flexDirection: 'row', gap: 10 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.md },
  filterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,107,26,0.14)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,107,26,0.4)', position: 'relative' },
  filterBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F56E1E', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#FAFAF9' },
  filterBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },
  // Quick bar
  quickBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, gap: 10 },
  quickInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.card, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, borderWidth: 1, borderColor: c.border.card },
  quickRupee: { fontSize: 18, fontWeight: '700', color: c.accent.primary, marginRight: 6 },
  quickInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: c.text.primary },
  voiceBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // List
  listContent: { padding: SPACING.lg, paddingTop: 0, paddingBottom: 140 },
  txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', ...SHADOW.sm },
  txnIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 15, fontWeight: '600', color: c.text.primary, flex: 1 },
  txnDescRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gmailBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,107,26,0.14)', borderColor: 'rgba(255,107,26,0.4)', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  gmailBadgeText: { fontSize: 9, fontWeight: '800', color: '#C14A06', letterSpacing: 0.3 },
  txnMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  txnMeta: { fontSize: 12, color: c.text.muted },
  cashBadge: { backgroundColor: c.accent.warning + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  cashBadgeText: { fontSize: 10, fontWeight: '700', color: c.accent.warning },
  txnAmount: { fontSize: 17, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text.secondary, marginTop: 16 },
  emptyText: { fontSize: 14, color: c.text.muted, marginTop: 6 },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: c.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '88%' },
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
  aiRecTxt: { flex: 1, fontSize: 12, fontWeight: '500', color: '#78716C', lineHeight: 18 },
}));
