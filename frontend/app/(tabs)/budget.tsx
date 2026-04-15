import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST } from '../../utils/theme';

const PERIODS = ['daily', 'weekly', 'monthly'];

export default function BudgetScreen() {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({ category: 'Food', amount: '', period: 'monthly' });

  useEffect(() => { fetchBudgets(); }, []);

  const fetchBudgets = async () => {
    try { const res = await api.get('/budgets'); setBudgets(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!formData.amount) { Alert.alert('Oops!', 'Enter budget amount'); return; }
    try {
      await api.post('/budgets', { ...formData, amount: parseFloat(formData.amount) });
      setModalVisible(false);
      setFormData({ category: 'Food', amount: '', period: 'monthly' });
      fetchBudgets();
    } catch (e) { Alert.alert('Error', 'Failed to set budget'); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Budget?', 'This will remove the budget limit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.delete(`/budgets/${id}`); fetchBudgets(); } },
    ]);
  };

  const renderBudget = ({ item }: { item: any }) => {
    const pct = Math.min((item.spent / item.amount) * 100, 100);
    const remaining = Math.max(item.amount - item.spent, 0);
    const barColor = pct >= 100 ? COLORS.accent.moneyOut : pct >= 80 ? COLORS.accent.warning : COLORS.accent.primary;
    const cat = CATEGORIES[item.category] || CATEGORIES.Other;

    return (
      <TouchableOpacity testID={`budget-${item.id}`} style={styles.budgetCard} onLongPress={() => handleDelete(item.id)} activeOpacity={0.7}>
        <View style={styles.budgetTop}>
          <View style={[styles.catIcon, { backgroundColor: cat.color + '18' }]}>
            <Ionicons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <View style={styles.budgetInfo}>
            <Text style={styles.budgetCategory}>{item.category}</Text>
            <Text style={styles.budgetPeriod}>{item.period.charAt(0).toUpperCase() + item.period.slice(1)}</Text>
          </View>
          <View style={styles.budgetLimit}>
            <Text style={styles.budgetLimitText}>{'\u20B9'}{item.amount.toFixed(0)}</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
        </View>

        <View style={styles.budgetBottom}>
          <View>
            <Text style={styles.metaLabel}>Spent</Text>
            <Text style={[styles.metaValue, { color: COLORS.accent.moneyOut }]}>{'\u20B9'}{item.spent.toFixed(0)}</Text>
          </View>
          <View>
            <Text style={[styles.metaLabel, { textAlign: 'right' }]}>Left</Text>
            <Text style={[styles.metaValue, { color: COLORS.accent.moneyIn, textAlign: 'right' }]}>{'\u20B9'}{remaining.toFixed(0)}</Text>
          </View>
        </View>

        {pct >= 80 && (
          <View style={[styles.alertBanner, { backgroundColor: pct >= 100 ? COLORS.accent.moneyOut + '12' : COLORS.accent.warning + '12' }]}>
            <Ionicons name="alert-circle" size={16} color={pct >= 100 ? COLORS.accent.moneyOut : COLORS.accent.warning} />
            <Text style={[styles.alertText, { color: pct >= 100 ? COLORS.accent.moneyOut : COLORS.accent.warning }]}>
              {pct >= 100 ? 'Budget exceeded!' : 'Almost at limit'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 100 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Budgets</Text>
          <Text style={styles.pageSubtitle}>{budgets.length} active</Text>
        </View>
        <TouchableOpacity testID="add-budget-btn" style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color={COLORS.bg.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={budgets}
        renderItem={renderBudget}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={56} color={COLORS.text.muted} />
            <Text style={styles.emptyTitle}>No budgets set</Text>
            <Text style={styles.emptyText}>Tap + to set your first budget</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Budget</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {CATEGORY_LIST.map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, formData.category === c && styles.chipActive]} onPress={() => setFormData({ ...formData, category: c })}>
                    <Ionicons name={CATEGORIES[c].icon as any} size={14} color={formData.category === c ? COLORS.bg.primary : CATEGORIES[c].color} />
                    <Text style={[styles.chipText, formData.category === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.formLabel}>Period</Text>
              <View style={styles.periodRow}>
                {PERIODS.map((p) => (
                  <TouchableOpacity key={p} style={[styles.periodBtn, formData.period === p && styles.periodBtnActive]} onPress={() => setFormData({ ...formData, period: p })}>
                    <Text style={[styles.periodBtnText, formData.period === p && styles.periodBtnTextActive]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formLabel}>Amount</Text>
              <View style={styles.amountRow}>
                <Text style={styles.rupee}>{'\u20B9'}</Text>
                <TextInput style={styles.amountInput} placeholder="0" placeholderTextColor={COLORS.text.muted} value={formData.amount} onChangeText={(v) => setFormData({ ...formData, amount: v })} keyboardType="numeric" />
              </View>
              <TouchableOpacity testID="submit-budget-btn" style={styles.submitBtn} onPress={handleAdd}><Text style={styles.submitText}>Set Budget</Text></TouchableOpacity>
            </ScrollView>
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
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: SPACING.lg },
  budgetCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  budgetTop: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  catIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  budgetInfo: { flex: 1 },
  budgetCategory: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary },
  budgetPeriod: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  budgetLimit: { backgroundColor: COLORS.bg.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.sm },
  budgetLimitText: { fontSize: 15, fontWeight: '700', color: COLORS.accent.primary },
  progressTrack: { height: 8, backgroundColor: COLORS.bg.primary, borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.md },
  progressFill: { height: '100%', borderRadius: 4 },
  budgetBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { fontSize: 12, color: COLORS.text.muted, marginBottom: 2 },
  metaValue: { fontSize: 18, fontWeight: '700' },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: SPACING.md, borderRadius: RADIUS.lg, marginTop: SPACING.md },
  alertText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.secondary, marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.text.muted, marginTop: 6 },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted, marginBottom: 10, letterSpacing: 0.3 },
  chipScroll: { marginBottom: SPACING.xxl },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.primary, marginRight: 8, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  chipText: { fontSize: 13, color: COLORS.text.secondary, fontWeight: '500' },
  chipTextActive: { color: COLORS.bg.primary, fontWeight: '600' },
  periodRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.xxl },
  periodBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border.subtle, alignItems: 'center' },
  periodBtnActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  periodBtnText: { fontSize: 14, color: COLORS.text.muted, fontWeight: '600' },
  periodBtnTextActive: { color: COLORS.bg.primary },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.xxl, borderWidth: 1, borderColor: COLORS.border.subtle },
  rupee: { fontSize: 24, fontWeight: '700', color: COLORS.accent.primary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: COLORS.text.primary, paddingVertical: 16 },
  submitBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center', shadowColor: COLORS.accent.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.bg.primary },
});
