import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST } from '../../utils/theme';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import Toast from 'react-native-toast-message';
import { BudgetSkeleton } from '../../components/SkeletonLoader';

const PERIODS = ['daily', 'weekly', 'monthly'];

export default function BudgetScreen() {
  const { lang } = useLangStore();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [formData, setFormData] = useState({ category: 'Food', amount: '', period: 'monthly' });

  const fetchAll = useCallback(async () => {
    try {
      const [budgetRes, suggestRes] = await Promise.all([
        api.get('/budgets/live').catch(() => api.get('/budgets')),
        api.get('/budgets/smart-suggest').catch(() => ({ data: null })),
      ]);
      const raw = budgetRes.data?.budgets || budgetRes.data || [];
      const normalized = raw.map((b: any) => ({
        ...b,
        amount: b.amount ?? b.budget ?? 0,
        spent: b.spent ?? 0,
      }));
      setBudgets(normalized);
      if (suggestRes.data) setSuggestions(suggestRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  const applySmartBudgets = async () => {
    try {
      const res = await api.post('/budgets/auto-apply');
      Toast.show({ type: 'success', text1: 'Smart Budgets Applied!', text2: res.data.message });
      fetchAll();
    } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not apply budgets' }); }
  };

  const openAdd = () => { setEditingBudget(null); setFormData({ category: 'Food', amount: '', period: 'monthly' }); setModalVisible(true); };
  const openEdit = (item: any) => { setEditingBudget(item); setFormData({ category: item.category, amount: String(item.amount), period: item.period }); setModalVisible(true); };

  const handleSave = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      Toast.show({ type: 'error', text1: 'Enter Amount', text2: 'Budget amount must be greater than 0' }); return;
    }
    try {
      if (editingBudget) await api.delete(`/budgets/${editingBudget.id}`).catch(() => {});
      await api.post('/budgets', { ...formData, amount: parseFloat(formData.amount) });
      setModalVisible(false); setEditingBudget(null); fetchAll();
      Toast.show({ type: 'success', text1: editingBudget ? 'Updated!' : 'Created!', text2: `${formData.category} — ₹${formData.amount}` });
    } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to save' }); }
  };

  const handleDelete = (id: string, cat: string) => Alert.alert('Delete?', `Remove ${cat} budget?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await api.delete(`/budgets/${id}`).catch(() => {}); fetchAll(); Toast.show({ type: 'info', text1: 'Removed' }); } },
  ]);

  const totalBudget = budgets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);

  const renderBudget = ({ item }: { item: any }) => {
    const spent = item.spent || 0;
    const limit = item.amount || 0;
    const remaining = Math.max(limit - spent, 0);
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    const cat = CATEGORIES[item.category] || CATEGORIES.Other;
    const isOver = pct >= 100;
    const isWarn = pct >= 80 && !isOver;
    const statusColor = isOver ? COLORS.accent.moneyOut : isWarn ? '#F59E0B' : COLORS.accent.moneyIn;

    return (
      <TouchableOpacity style={s.card} onPress={() => openEdit(item)} onLongPress={() => handleDelete(item.id, item.category)} activeOpacity={0.7}>
        <View style={s.cardRow}>
          <View style={[s.catDot, { backgroundColor: cat.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.catName}>{item.category}</Text>
            <Text style={s.period}>{item.period}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.spentAmt, { color: statusColor }]}>₹{spent.toFixed(0)}</Text>
            <Text style={s.limitAmt}>of ₹{limit.toFixed(0)}</Text>
          </View>
        </View>
        {isOver && (
          <View style={s.overBanner}>
            <Ionicons name="warning" size={13} color={COLORS.accent.moneyOut} />
            <Text style={s.overText}>Over by ₹{(spent - limit).toFixed(0)}</Text>
          </View>
        )}
        {isWarn && !isOver && (
          <View style={[s.overBanner, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="alert-circle" size={13} color="#D97706" />
            <Text style={[s.overText, { color: '#D97706' }]}>₹{remaining.toFixed(0)} left</Text>
          </View>
        )}
        {!isOver && !isWarn && (
          <View style={[s.overBanner, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="checkmark-circle" size={13} color={COLORS.accent.moneyIn} />
            <Text style={[s.overText, { color: COLORS.accent.moneyIn }]}>₹{remaining.toFixed(0)} remaining</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) return <SafeAreaView style={s.bg}><BudgetSkeleton /></SafeAreaView>;

  return (
    <SafeAreaView style={s.bg}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Budgets</Text>
          <Text style={s.sub}>{budgets.length} active</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={budgets}
        renderItem={renderBudget}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
        ListHeaderComponent={
          <>
            {/* Summary */}
            {budgets.length > 0 && (
              <View style={s.summaryRow}>
                <View style={s.summaryBox}>
                  <Text style={s.sumLabel}>Budget</Text>
                  <Text style={s.sumVal}>₹{totalBudget.toFixed(0)}</Text>
                </View>
                <View style={s.summaryBox}>
                  <Text style={s.sumLabel}>Spent</Text>
                  <Text style={[s.sumVal, { color: COLORS.accent.moneyOut }]}>₹{totalSpent.toFixed(0)}</Text>
                </View>
                <View style={s.summaryBox}>
                  <Text style={s.sumLabel}>Left</Text>
                  <Text style={[s.sumVal, { color: totalBudget - totalSpent >= 0 ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]}>₹{Math.abs(totalBudget - totalSpent).toFixed(0)}</Text>
                </View>
              </View>
            )}
            {/* AI Suggestions */}
            {suggestions?.suggestions?.length > 0 && (
              <View style={s.suggestCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="bulb" size={16} color="#F59E0B" />
                  <Text style={s.suggestTitle}>AI Suggestions</Text>
                </View>
                <Text style={s.suggestMsg}>{suggestions.message}</Text>
                {suggestions.suggestions.slice(0, 3).map((sg: any, i: number) => (
                  <View key={i} style={s.suggestRow}>
                    <Text style={s.suggestCat}>{sg.category}</Text>
                    <Text style={s.suggestSave}>Save ₹{sg.savings_potential?.toFixed(0)}</Text>
                  </View>
                ))}
                <TouchableOpacity style={s.applyBtn} onPress={applySmartBudgets}>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <Text style={s.applyText}>Auto-apply</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="wallet-outline" size={48} color={COLORS.accent.primary} />
            <Text style={s.emptyTitle}>No budgets yet</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
              <Text style={s.emptyBtnText}>Create Budget</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={s.sheetTitle}>{editingBudget ? 'Edit Budget' : 'New Budget'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingBudget(null); }}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {CATEGORY_LIST.map((c) => {
                  const ct = CATEGORIES[c]; const on = formData.category === c;
                  return (
                    <TouchableOpacity key={c} style={[s.chip, on && { backgroundColor: ct.color, borderColor: ct.color }]} onPress={() => setFormData({ ...formData, category: c })}>
                      <Ionicons name={ct.icon as any} size={14} color={on ? '#fff' : ct.color} />
                      <Text style={[s.chipText, on && { color: '#fff' }]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={s.formLabel}>Period</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {PERIODS.map(p => (
                  <TouchableOpacity key={p} style={[s.periodBtn, formData.period === p && s.periodOn]} onPress={() => setFormData({ ...formData, period: p })}>
                    <Text style={[s.periodText, formData.period === p && { color: '#fff' }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.formLabel}>Amount</Text>
              <View style={s.amtRow}>
                <Text style={s.rupee}>₹</Text>
                <TextInput style={s.amtInput} placeholder="0" placeholderTextColor={COLORS.text.muted} value={formData.amount} onChangeText={v => setFormData({ ...formData, amount: v })} keyboardType="numeric" />
              </View>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={s.saveBtnText}>{editingBudget ? 'Update' : 'Set Budget'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary },
  sub: { fontSize: 13, color: COLORS.text.muted },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.lg },
  // Summary
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  summaryBox: { flex: 1, backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.card },
  sumLabel: { fontSize: 11, color: COLORS.text.muted, marginBottom: 4 },
  sumVal: { fontSize: 17, fontWeight: '800', color: COLORS.text.primary },
  // Card
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border.card },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary },
  period: { fontSize: 11, color: COLORS.text.muted, marginTop: 1 },
  spentAmt: { fontSize: 18, fontWeight: '800' },
  limitAmt: { fontSize: 12, color: COLORS.text.muted, marginTop: 1 },
  overBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS.sm, backgroundColor: '#FEF2F2' },
  overText: { fontSize: 12, fontWeight: '600', color: COLORS.accent.moneyOut },
  // AI Suggest
  suggestCard: { backgroundColor: '#FFFBEB', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FDE68A' },
  suggestTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  suggestMsg: { fontSize: 12, color: '#78716C', marginBottom: 10 },
  suggestRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  suggestCat: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  suggestSave: { fontSize: 13, fontWeight: '700', color: COLORS.accent.moneyIn },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.accent.primary, paddingVertical: 12, borderRadius: RADIUS.full, marginTop: 10 },
  applyText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // Empty
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text.muted, marginTop: 12 },
  emptyBtn: { backgroundColor: COLORS.accent.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: RADIUS.full, marginTop: 16 },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Modal
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '88%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: 16, opacity: 0.3 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.primary, marginRight: 8, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipText: { fontSize: 13, color: COLORS.text.secondary, fontWeight: '500' },
  periodBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border.subtle, alignItems: 'center' },
  periodOn: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  periodText: { fontSize: 14, color: COLORS.text.muted, fontWeight: '600' },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border.subtle },
  rupee: { fontSize: 24, fontWeight: '700', color: COLORS.accent.primary, marginRight: 8 },
  amtInput: { flex: 1, fontSize: 28, fontWeight: '700', color: COLORS.text.primary, paddingVertical: 16 },
  saveBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
