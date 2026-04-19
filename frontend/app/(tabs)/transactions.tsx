import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
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
import PressableGlass from '../../components/PressableGlass';
import Toast from 'react-native-toast-message';
import { TransactionsSkeleton } from '../../components/SkeletonLoader';
import { PieChart } from 'react-native-gifted-charts';
import SmartInsightsStrip from '../../components/transactions/SmartInsightsStrip';

// Pure, memoized row — prevents re-renders on unrelated parent state changes (e.g. modals).
const TxnRow = memo(function TxnRow({ item, lang, onLongPress }: { item: any; lang: string; onLongPress: (id: string) => void }) {
  const cat = CATEGORIES[item.category] || CATEGORIES.Other;
  const isCash = item.source === 'cash' || item.source === 'cash_recurring';
  return (
    <PressableGlass testID={`txn-${item.id}`} feedback="light" onLongPress={() => onLongPress(item.id)} style={styles.txnCard}>
      <View style={[styles.txnIcon, { backgroundColor: cat.color + '18' }]}>
        <Ionicons name={cat.icon as any} size={20} color={cat.color} />
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
        <View style={styles.txnMetaRow}>
          <Text style={styles.txnMeta} numberOfLines={1}>{item.category} · {format(new Date(item.date), 'MMM dd')}</Text>
          {isCash && <View style={styles.cashBadge}><Text style={styles.cashBadgeText}>{t('cash', lang)}</Text></View>}
        </View>
      </View>
      <Text style={[styles.txnAmount, { color: item.type === 'credit' ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]} numberOfLines={1}>
        {item.type === 'credit' ? '+' : '-'}₹{item.amount.toFixed(0)}
      </Text>
    </PressableGlass>
  );
});

export default function TransactionsScreen() {
  const { lang } = useLangStore();
  const params = useLocalSearchParams<{ openAdd?: string; openSmsScan?: string; type?: string }>();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [formData, setFormData] = useState({ amount: '', category: 'Food', description: '', type: 'debit' });
  const [cashText, setCashText] = useState('');
  const [cashLoading, setCashLoading] = useState(false);
  const [notifText, setNotifText] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifExpanded, setNotifExpanded] = useState(false);
  // Insights data
  const [waste, setWaste] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    if (!formData.amount || !formData.description) { Alert.alert(t('error', lang), 'Please fill all fields'); return; }
    try {
      await api.post('/transactions', { ...formData, amount: parseFloat(formData.amount) });
      setModalVisible(false);
      setFormData({ amount: '', category: 'Food', description: '', type: 'debit' });
      fetchTransactions();
    } catch (e) { Alert.alert(t('error', lang), 'Failed to add'); }
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
        const res = await api.post('/sms/parse-bulk', { messages: parts });
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
    Alert.alert(t('delete', lang), 'Remove this transaction?', [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('delete', lang), style: 'destructive', onPress: async () => { await api.delete(`/transactions/${id}`); fetchTransactions(); } },
    ]);
  };

  const renderTxn = useCallback(({ item }: { item: any }) => (
    <TxnRow item={item} lang={lang} onLongPress={handleDelete} />
  ), [lang]);

  if (loading) return <SafeAreaView style={styles.container}><TransactionsSkeleton /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>{t('transactions', lang)}</Text>
          <Text style={styles.pageSubtitle}>{transactions.length} {t('entries', lang)}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity testID="add-txn-btn" style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={22} color={COLORS.bg.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Cash + Voice Bar */}
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

      <FlatList
        data={transactions}
        renderItem={renderTxn}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={true}
        maxToRenderPerBatch={15}
        windowSize={10}
        initialNumToRender={10}
        ListHeaderComponent={
          <>
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
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={56} color={COLORS.text.muted} />
            <Text style={styles.emptyTitle}>{t('no_transactions', lang)}</Text>
            <Text style={styles.emptyText}>{t('add_first', lang)}</Text>
          </View>
        }
      />

      {/* Add Transaction Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add_transaction', lang)}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.typeRow}>
                {['debit', 'credit'].map((tp) => (
                  <TouchableOpacity key={tp} style={[styles.typeBtn, formData.type === tp && styles.typeBtnActive]} onPress={() => setFormData({ ...formData, type: tp })}>
                    <Ionicons name={tp === 'debit' ? 'arrow-up-circle' : 'arrow-down-circle'} size={18} color={formData.type === tp ? COLORS.bg.primary : COLORS.text.muted} />
                    <Text style={[styles.typeBtnText, formData.type === tp && styles.typeBtnTextActive]}>{tp === 'debit' ? t('expense', lang) : t('income', lang)}</Text>
                  </TouchableOpacity>
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
                  <TouchableOpacity key={c} style={[styles.chip, formData.category === c && styles.chipActive]} onPress={() => setFormData({ ...formData, category: c })}>
                    <Ionicons name={CATEGORIES[c].icon as any} size={14} color={formData.category === c ? COLORS.bg.primary : CATEGORIES[c].color} />
                    <Text style={[styles.chipText, formData.category === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.formLabel}>{t('description', lang)}</Text>
              <TextInput style={styles.textInput} placeholder="e.g. Lunch at restaurant" placeholderTextColor={COLORS.text.muted} value={formData.description} onChangeText={(v) => setFormData({ ...formData, description: v })} />
              <TouchableOpacity testID="submit-txn-btn" style={styles.submitBtn} onPress={handleAdd}><Text style={styles.submitText}>{t('add_transaction', lang)}</Text></TouchableOpacity>
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
            <Text style={{ fontSize: 11, color: COLORS.text.muted, marginBottom: 8 }}>\ud83d\udca1 Paste multiple by separating with blank lines — AI detects and parses each</Text>
            <TextInput
              style={[styles.smsInput, { minHeight: 140 }]}
              placeholder={`HDFC Bank: Rs 500.00 debited from A/c XX1234...\n\nSBI: Rs 120 UPI paid to SWIGGY\n\nICICI: Credit card XX9876 charged Rs 2,499 at AMAZON`}
              placeholderTextColor={COLORS.text.muted}
              value={smsText}
              onChangeText={setSmsText}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: COLORS.text.muted },
  headerActions: { flexDirection: 'row', gap: 10 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.md },
  // Quick bar
  quickBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, gap: 10 },
  quickInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  quickRupee: { fontSize: 18, fontWeight: '700', color: COLORS.accent.primary, marginRight: 6 },
  quickInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: COLORS.text.primary },
  voiceBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // List
  listContent: { padding: SPACING.lg, paddingTop: 0 },
  txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', ...SHADOW.sm },
  txnIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 15, fontWeight: '600', color: COLORS.text.primary },
  txnMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  txnMeta: { fontSize: 12, color: COLORS.text.muted },
  cashBadge: { backgroundColor: COLORS.accent.warning + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  cashBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.accent.warning },
  txnAmount: { fontSize: 17, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.secondary, marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.text.muted, marginTop: 6 },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: SPACING.xxl },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border.subtle },
  typeBtnActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  typeBtnText: { fontSize: 15, color: COLORS.text.muted, fontWeight: '600' },
  typeBtnTextActive: { color: COLORS.bg.primary },
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted, marginBottom: 10, letterSpacing: 0.3 },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.xxl, borderWidth: 1, borderColor: COLORS.border.subtle },
  rupee: { fontSize: 24, fontWeight: '700', color: COLORS.accent.primary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: COLORS.text.primary, paddingVertical: 16 },
  chipScroll: { marginBottom: SPACING.xxl },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.primary, marginRight: 8, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  chipText: { fontSize: 13, color: COLORS.text.secondary, fontWeight: '500' },
  chipTextActive: { color: COLORS.bg.primary, fontWeight: '600' },
  textInput: { backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: 16, fontSize: 16, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, marginBottom: SPACING.xxl },
  submitBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center' },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.bg.primary },
  smsBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.accent.warning + '12', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  smsBannerText: { fontSize: 13, color: COLORS.accent.warning, fontWeight: '500' },
  smsInput: { backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, padding: SPACING.lg, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, minHeight: 120, marginBottom: SPACING.xxl },
  // Notification paste card
  // Waste Detector & Pie Chart
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text.muted, marginBottom: 8, marginTop: 4 },
  // AI Report Card
  reportCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 2) },
  reportTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text.primary },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, marginBottom: 10 },
  insightRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  aiRecBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFFBEB', padding: 12, borderRadius: RADIUS.lg, marginTop: 10, borderWidth: 1, borderColor: '#FDE68A' },
  aiRecTxt: { flex: 1, fontSize: 12, fontWeight: '500', color: '#78716C', lineHeight: 18 },
});
