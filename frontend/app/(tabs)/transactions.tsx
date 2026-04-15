import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { format } from 'date-fns';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST } from '../../utils/theme';

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [formData, setFormData] = useState({ amount: '', category: 'Food', description: '', type: 'debit' });

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    try {
      const res = await api.get('/transactions');
      setTransactions(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!formData.amount || !formData.description) { Alert.alert('Oops!', 'Fill all fields'); return; }
    try {
      await api.post('/transactions', { ...formData, amount: parseFloat(formData.amount) });
      setModalVisible(false);
      setFormData({ amount: '', category: 'Food', description: '', type: 'debit' });
      fetchTransactions();
    } catch (e) { Alert.alert('Error', 'Failed to add'); }
  };

  const handleParseSMS = async () => {
    if (!smsText.trim()) { Alert.alert('Oops!', 'Paste SMS text'); return; }
    setSmsLoading(true);
    try {
      await api.post('/transactions/parse-sms', { sms_text: smsText });
      setSmsModalVisible(false);
      setSmsText('');
      fetchTransactions();
      Alert.alert('Done!', 'Transaction added from SMS');
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Could not parse'); }
    finally { setSmsLoading(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete?', 'Remove this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.delete(`/transactions/${id}`); fetchTransactions(); } },
    ]);
  };

  const renderTxn = ({ item }: { item: any }) => {
    const cat = CATEGORIES[item.category] || CATEGORIES.Other;
    return (
      <TouchableOpacity testID={`txn-${item.id}`} style={styles.txnCard} onLongPress={() => handleDelete(item.id)} activeOpacity={0.7}>
        <View style={[styles.txnIcon, { backgroundColor: cat.color + '18' }]}>
          <Ionicons name={cat.icon as any} size={20} color={cat.color} />
        </View>
        <View style={styles.txnInfo}>
          <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.txnMeta}>{item.category} · {format(new Date(item.date), 'MMM dd')}</Text>
        </View>
        <Text style={[styles.txnAmount, { color: item.type === 'credit' ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]}>
          {item.type === 'credit' ? '+' : '-'}{'\u20B9'}{item.amount.toFixed(0)}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 100 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Transactions</Text>
          <Text style={styles.pageSubtitle}>{transactions.length} entries</Text>
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

      <FlatList
        data={transactions}
        renderItem={renderTxn}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={56} color={COLORS.text.muted} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>Tap + to add or scan SMS</Text>
          </View>
        }
      />

      {/* Add Transaction Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Transaction</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.typeRow}>
                {['debit', 'credit'].map((t) => (
                  <TouchableOpacity key={t} style={[styles.typeBtn, formData.type === t && styles.typeBtnActive]} onPress={() => setFormData({ ...formData, type: t })}>
                    <Ionicons name={t === 'debit' ? 'arrow-up-circle' : 'arrow-down-circle'} size={18} color={formData.type === t ? COLORS.bg.primary : COLORS.text.muted} />
                    <Text style={[styles.typeBtnText, formData.type === t && styles.typeBtnTextActive]}>{t === 'debit' ? 'Expense' : 'Income'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formLabel}>Amount</Text>
              <View style={styles.amountRow}>
                <Text style={styles.rupee}>{'\u20B9'}</Text>
                <TextInput style={styles.amountInput} placeholder="0" placeholderTextColor={COLORS.text.muted} value={formData.amount} onChangeText={(v) => setFormData({ ...formData, amount: v })} keyboardType="numeric" />
              </View>
              <Text style={styles.formLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {CATEGORY_LIST.map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, formData.category === c && styles.chipActive]} onPress={() => setFormData({ ...formData, category: c })}>
                    <Ionicons name={CATEGORIES[c].icon as any} size={14} color={formData.category === c ? COLORS.bg.primary : CATEGORIES[c].color} />
                    <Text style={[styles.chipText, formData.category === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.formLabel}>Description</Text>
              <TextInput style={styles.textInput} placeholder="e.g. Lunch at restaurant" placeholderTextColor={COLORS.text.muted} value={formData.description} onChangeText={(v) => setFormData({ ...formData, description: v })} />
              <TouchableOpacity testID="submit-txn-btn" style={styles.submitBtn} onPress={handleAdd}><Text style={styles.submitText}>Add Transaction</Text></TouchableOpacity>
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
              <Text style={styles.modalTitle}>Scan SMS</Text>
              <TouchableOpacity onPress={() => setSmsModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <View style={styles.smsBanner}>
              <Ionicons name="sparkles" size={18} color={COLORS.accent.warning} />
              <Text style={styles.smsBannerText}>AI will extract amount, category & merchant</Text>
            </View>
            <TextInput style={styles.smsInput} placeholder="Paste your bank SMS here..." placeholderTextColor={COLORS.text.muted} value={smsText} onChangeText={setSmsText} multiline numberOfLines={5} textAlignVertical="top" />
            <TouchableOpacity testID="parse-sms-btn" style={[styles.submitBtn, smsLoading && { opacity: 0.6 }]} onPress={handleParseSMS} disabled={smsLoading}>
              {smsLoading ? <ActivityIndicator color={COLORS.bg.primary} /> : <Text style={styles.submitText}>Parse & Add</Text>}
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
  listContent: { padding: SPACING.lg },
  txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border.card },
  txnIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 15, fontWeight: '600', color: COLORS.text.primary },
  txnMeta: { fontSize: 12, color: COLORS.text.muted, marginTop: 3 },
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
  submitBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center', shadowColor: COLORS.accent.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.bg.primary },
  // SMS
  smsBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.accent.warning + '12', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  smsBannerText: { fontSize: 13, color: COLORS.accent.warning, fontWeight: '500' },
  smsInput: { backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, padding: SPACING.lg, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, minHeight: 120, marginBottom: SPACING.xxl },
});
