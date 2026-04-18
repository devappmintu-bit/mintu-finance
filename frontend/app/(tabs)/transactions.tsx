import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import api from '../../utils/api';
import { format } from 'date-fns';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST } from '../../utils/theme';
import Toast from 'react-native-toast-message';
import { TransactionsSkeleton } from '../../components/SkeletonLoader';
import { PieChart } from 'react-native-gifted-charts';

export default function TransactionsScreen() {
  const { lang } = useLangStore();
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
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Insights data
  const [waste, setWaste] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchAll(); }, []);

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

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const handleAdd = async () => {
    if (!formData.amount || !formData.description) { Alert.alert(t('error', lang), 'Please fill all fields'); return; }
    try {
      await api.post('/transactions', { ...formData, amount: parseFloat(formData.amount) });
      setModalVisible(false);
      setFormData({ amount: '', category: 'Food', description: '', type: 'debit' });
      fetchTransactions();
    } catch (e) { Alert.alert(t('error', lang), 'Failed to add'); }
  };

  const handleParseSMS = async () => {
    if (!smsText.trim()) { Alert.alert(t('error', lang), 'Paste SMS text'); return; }
    setSmsLoading(true);
    try {
      await api.post('/transactions/parse-sms', { sms_text: smsText });
      setSmsModalVisible(false); setSmsText(''); fetchTransactions();
      Toast.show({ type: 'success', text1: 'Done!', text2: 'Transaction added from SMS!' });
    } catch (e: any) { Alert.alert(t('error', lang), e.response?.data?.detail || 'Could not parse'); }
    finally { setSmsLoading(false); }
  };

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

  // Voice recording
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('error', lang), 'Microphone permission needed'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
    } catch (e) { Alert.alert(t('error', lang), 'Failed to start recording'); }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setVoiceLoading(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) { Alert.alert(t('error', lang), 'No audio recorded'); setVoiceLoading(false); return; }

      // Upload to backend for Whisper transcription
      const formData = new FormData();
      formData.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' } as any);
      const res = await api.post('/voice/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      const text = res.data.transcribed_text;
      if (text) {
        setCashText(text);
        // Auto-submit
        try {
          await api.post('/cash/quick-entry', { text });
          setCashText(''); fetchTransactions();
          Alert.alert(t('success', lang), `Added: "${text}"`);
        } catch (e2: any) {
          // If auto-parse fails, just put text in input
          setCashText(text);
        }
      }
    } catch (e: any) { Alert.alert(t('error', lang), 'Voice processing failed. Try again.'); }
    finally { setVoiceLoading(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert(t('delete', lang), 'Remove this transaction?', [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('delete', lang), style: 'destructive', onPress: async () => { await api.delete(`/transactions/${id}`); fetchTransactions(); } },
    ]);
  };

  const renderTxn = useCallback(({ item }: { item: any }) => {
    const cat = CATEGORIES[item.category] || CATEGORIES.Other;
    const isCash = item.source === 'cash' || item.source === 'cash_recurring';
    return (
      <TouchableOpacity testID={`txn-${item.id}`} style={styles.txnCard} onLongPress={() => handleDelete(item.id)} activeOpacity={0.7}>
        <View style={[styles.txnIcon, { backgroundColor: cat.color + '18' }]}>
          <Ionicons name={cat.icon as any} size={20} color={cat.color} />
        </View>
        <View style={styles.txnInfo}>
          <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
          <View style={styles.txnMetaRow}>
            <Text style={styles.txnMeta}>{item.category} · {format(new Date(item.date), 'MMM dd')}</Text>
            {isCash && <View style={styles.cashBadge}><Text style={styles.cashBadgeText}>{t('cash', lang)}</Text></View>}
          </View>
        </View>
        <Text style={[styles.txnAmount, { color: item.type === 'credit' ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]}>
          {item.type === 'credit' ? '+' : '-'}₹{item.amount.toFixed(0)}
        </Text>
      </TouchableOpacity>
    );
  }, [lang]);

  if (loading) return <SafeAreaView style={styles.container}><TransactionsSkeleton /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>{t('transactions', lang)}</Text>
          <Text style={styles.pageSubtitle}>{transactions.length} {t('entries', lang)}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity testID="sms-parse-btn" style={styles.actionBtn} onPress={() => setSmsModalVisible(true)}>
            <Ionicons name="scan-outline" size={20} color={COLORS.accent.primary} />
          </TouchableOpacity>
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
        {/* Voice Button */}
        <TouchableOpacity
          testID="voice-input-btn"
          style={[styles.voiceBtn, isRecording && styles.voiceBtnActive]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={voiceLoading}
        >
          {voiceLoading ? (
            <ActivityIndicator size="small" color={COLORS.bg.primary} />
          ) : (
            <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}>
              <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color={isRecording ? '#fff' : COLORS.bg.primary} />
            </Animated.View>
          )}
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
            {/* AI Waste Detector */}
            {waste && waste.category_waste?.length > 0 && (
              <View style={styles.wasteCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="flame" size={14} color="#EF4444" />
                  <Text style={styles.wasteTitle}>AI Waste Detector</Text>
                </View>
                {waste.category_waste.slice(0, 2).map((w: any, i: number) => (
                  <View key={i} style={{ marginBottom: 6 }}>
                    <Text style={styles.wasteShock}>{w.shock_text}</Text>
                    {w.peer_comparison?.text ? <Text style={styles.wastePeer}>👥 {w.peer_comparison.text}</Text> : null}
                  </View>
                ))}
                {waste.ai_recommendation ? (
                  <View style={styles.aiRecCard}><Ionicons name="sparkles" size={12} color={COLORS.accent.primary} /><Text style={styles.aiRecText}>{waste.ai_recommendation}</Text></View>
                ) : null}
              </View>
            )}
            {/* Expense Breakdown Pie Chart */}
            {stats?.category_breakdown && Object.keys(stats.category_breakdown).length > 0 && (() => {
              const pieData = Object.entries(stats.category_breakdown).map(([cat, amt]: [string, any]) => ({ value: amt, color: CATEGORIES[cat]?.color || '#64748B', text: cat }));
              const total = pieData.reduce((s, d) => s + d.value, 0);
              return (
                <View style={styles.pieCard}>
                  <Text style={styles.pieTitleText}>Expense Breakdown</Text>
                  <View style={{ alignItems: 'center', marginVertical: 10 }}>
                    <PieChart data={pieData} donut radius={60} innerRadius={40} innerCircleColor={COLORS.bg.card}
                      centerLabelComponent={() => (<View style={{ alignItems: 'center' }}><Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text.primary }}>₹{total.toFixed(0)}</Text></View>)} />
                  </View>
                  {pieData.slice(0, 4).map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color, marginRight: 8 }} />
                      <Text style={{ flex: 1, fontSize: 12, color: COLORS.text.secondary }}>{item.text}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text.primary }}>₹{item.value.toFixed(0)}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}
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
              <Text style={styles.smsBannerText}>{t('ai_extract', lang)}</Text>
            </View>
            {/* Bank Notification Paste */}
            <Text style={styles.formLabel}>Paste bank notification or SMS</Text>
            <TextInput style={styles.notifInput} placeholder="e.g. HDFC Bank: Rs 500.00 debited from A/c XX1234..." placeholderTextColor={COLORS.text.muted} value={notifText} onChangeText={setNotifText} multiline numberOfLines={3} textAlignVertical="top" />
            <TouchableOpacity style={[styles.notifParseBtn, (notifLoading || !notifText.trim()) && { opacity: 0.5 }]} onPress={handleNotifParse} disabled={notifLoading || !notifText.trim()}>
              {notifLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                <><Ionicons name="sparkles" size={14} color="#fff" /><Text style={styles.notifParseTxt}>AI Parse & Add</Text></>
              )}
            </TouchableOpacity>
            {/* Bulk SMS Paste */}
            <Text style={[styles.formLabel, { marginTop: 16 }]}>Or paste multiple SMS messages</Text>
            <TextInput style={styles.smsInput} placeholder={t('paste_sms', lang)} placeholderTextColor={COLORS.text.muted} value={smsText} onChangeText={setSmsText} multiline numberOfLines={5} textAlignVertical="top" />
            <TouchableOpacity testID="parse-sms-btn" style={[styles.submitBtn, smsLoading && { opacity: 0.6 }]} onPress={handleParseSMS} disabled={smsLoading}>
              {smsLoading ? <ActivityIndicator color={COLORS.bg.primary} /> : <Text style={styles.submitText}>{t('parse_add', lang)}</Text>}
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
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg.secondary, borderWidth: 1, borderColor: COLORS.border.subtle, justifyContent: 'center', alignItems: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // Quick bar
  quickBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, gap: 10 },
  quickInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  quickRupee: { fontSize: 18, fontWeight: '700', color: COLORS.accent.primary, marginRight: 6 },
  quickInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: COLORS.text.primary },
  voiceBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  voiceBtnActive: { backgroundColor: COLORS.accent.moneyOut },
  // List
  listContent: { padding: SPACING.lg, paddingTop: 0 },
  txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border.card },
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
  notifCard: { backgroundColor: '#EEF2FF', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#C7D2FE' },
  notifHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  notifTitle: { fontSize: 15, fontWeight: '700', color: '#4338CA', flex: 1 },
  notifHint: { fontSize: 12, color: '#6B7280', lineHeight: 18 },
  notifBody: { marginTop: SPACING.md },
  notifInput: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.md, fontSize: 14, color: COLORS.text.primary, borderWidth: 1, borderColor: '#C7D2FE', minHeight: 70, textAlignVertical: 'top', marginBottom: SPACING.sm },
  notifParseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#6366F1', borderRadius: RADIUS.full, paddingVertical: 12 },
  notifParseTxt: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Waste Detector & Pie Chart
  wasteCard: { backgroundColor: '#FEF2F2', borderRadius: RADIUS.xl, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FECACA' },
  wasteTitle: { fontSize: 13, fontWeight: '700', color: '#991B1B' },
  wasteShock: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
  wastePeer: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  aiRecCard: { flexDirection: 'row', gap: 6, backgroundColor: COLORS.accent.primary + '08', padding: 10, borderRadius: RADIUS.lg, marginTop: 6 },
  aiRecText: { flex: 1, fontSize: 12, color: COLORS.text.secondary, lineHeight: 17 },
  pieCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.xl, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)' },
  pieTitleText: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text.muted, marginBottom: 8, marginTop: 4 },
});
