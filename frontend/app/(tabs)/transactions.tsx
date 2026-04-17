import React, { useState, useEffect, useRef } from 'react';
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

export default function TransactionsScreen() {
  const { lang } = useLangStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [formData, setFormData] = useState({ amount: '', category: 'Food', description: '', type: 'debit' });
  // Cash quick entry
  const [cashText, setCashText] = useState('');
  const [cashLoading, setCashLoading] = useState(false);
  // Notification paste
  const [notifText, setNotifText] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifExpanded, setNotifExpanded] = useState(false);
  // Voice
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => { fetchTransactions(); }, []);

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

  const fetchTransactions = async () => {
    try { const res = await api.get('/transactions'); setTransactions(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

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

  const renderTxn = ({ item }: { item: any }) => {
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
          {item.type === 'credit' ? '+' : '-'}{'\u20B9'}{item.amount.toFixed(0)}
        </Text>
      </TouchableOpacity>
    );
  };

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
          <Text style={styles.quickRupee}>{'\u20B9'}</Text>
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
        ListHeaderComponent={
          <TouchableOpacity style={styles.notifCard} onPress={() => setNotifExpanded(!notifExpanded)} activeOpacity={0.8}>
            <View style={styles.notifHeader}>
              <Ionicons name="notifications" size={18} color="#6366F1" />
              <Text style={styles.notifTitle}>Paste Bank Notification</Text>
              <Ionicons name={notifExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
            </View>
            <Text style={styles.notifHint}>Copy any bank SMS/notification and paste here to auto-track</Text>
            {notifExpanded && (
              <View style={styles.notifBody}>
                <TextInput
                  style={styles.notifInput}
                  placeholder="e.g. HDFC Bank: Rs 500.00 debited from A/c XX1234..."
                  placeholderTextColor={COLORS.text.muted}
                  value={notifText}
                  onChangeText={setNotifText}
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity style={styles.notifParseBtn} onPress={handleNotifParse} disabled={notifLoading || !notifText.trim()}>
                  {notifLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                    <><Ionicons name="sparkles" size={14} color="#fff" /><Text style={styles.notifParseTxt}>AI Parse & Add</Text></>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
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
                <Text style={styles.rupee}>{'\u20B9'}</Text>
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

      {/* SMS Parse Modal */}
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
});
