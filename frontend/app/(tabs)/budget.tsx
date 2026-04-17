import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView,
  RefreshControl, Animated,
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

// Animated progress bar component
const AnimatedBar = ({ pct, color }: { pct: number; color: string }) => {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 800, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={bs.progressTrack}>
      <Animated.View style={[bs.progressFill, { backgroundColor: color, width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
      {pct > 15 && (
        <View style={[bs.progressLabel, { left: `${Math.min(pct, 95) - 8}%` as any }]}>
          <Text style={bs.progressPct}>{Math.round(pct)}%</Text>
        </View>
      )}
    </View>
  );
};

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
      // Normalize: API uses 'budget' field, frontend expects 'amount'
      const normalized = raw.map((b: any) => ({
        ...b,
        amount: b.amount ?? b.budget ?? 0,
        spent: b.spent ?? 0,
        remaining: b.remaining ?? Math.max((b.amount ?? b.budget ?? 0) - (b.spent ?? 0), 0),
        percentage: b.percentage ?? 0,
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

  const openAdd = () => {
    setEditingBudget(null);
    setFormData({ category: 'Food', amount: '', period: 'monthly' });
    setModalVisible(true);
  };

  const openEdit = (item: any) => {
    setEditingBudget(item);
    setFormData({ category: item.category, amount: String(item.amount), period: item.period });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      Toast.show({ type: 'error', text1: 'Enter Amount', text2: 'Budget amount must be greater than 0' });
      return;
    }
    try {
      if (editingBudget) {
        // Delete old and create new (update pattern)
        await api.delete(`/budgets/${editingBudget.id}`).catch(() => {});
      }
      await api.post('/budgets', { ...formData, amount: parseFloat(formData.amount) });
      setModalVisible(false);
      setEditingBudget(null);
      fetchAll();
      Toast.show({ type: 'success', text1: editingBudget ? 'Budget Updated!' : 'Budget Created!', text2: `${formData.category} - ₹${formData.amount}/${formData.period}` });
    } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to save budget' }); }
  };

  const handleDelete = (id: string, category: string) => {
    Alert.alert('Delete Budget?', `Remove ${category} budget limit?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await api.delete(`/budgets/${id}`).catch(() => {});
        fetchAll();
        Toast.show({ type: 'info', text1: 'Budget Removed', text2: `${category} budget deleted` });
      }},
    ]);
  };

  // Summary calculations
  const totalBudget = budgets.reduce((sum, b) => sum + (b.amount || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0), 0);
  const totalPct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  const summaryColor = totalPct >= 100 ? COLORS.accent.moneyOut : totalPct >= 75 ? COLORS.accent.warning : COLORS.accent.moneyIn;

  const renderBudget = ({ item }: { item: any }) => {
    const pct = item.amount > 0 ? Math.min(((item.spent || 0) / item.amount) * 100, 100) : 0;
    const remaining = Math.max(item.amount - (item.spent || 0), 0);
    const barColor = pct >= 100 ? COLORS.accent.moneyOut : pct >= 80 ? COLORS.accent.warning : COLORS.accent.moneyIn;
    const cat = CATEGORIES[item.category] || CATEGORIES.Other;
    const statusIcon = pct >= 100 ? 'alert-circle' : pct >= 80 ? 'warning' : 'checkmark-circle';
    const statusColor = pct >= 100 ? COLORS.accent.moneyOut : pct >= 80 ? COLORS.accent.warning : COLORS.accent.moneyIn;

    return (
      <TouchableOpacity style={bs.budgetCard} onPress={() => openEdit(item)} onLongPress={() => handleDelete(item.id, item.category)} activeOpacity={0.7}>
        <View style={bs.budgetTop}>
          <View style={[bs.catIcon, { backgroundColor: cat.color + '12' }]}>
            <Ionicons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <View style={bs.budgetInfo}>
            <Text style={bs.budgetCategory}>{item.category}</Text>
            <Text style={bs.budgetPeriod}>{item.period.charAt(0).toUpperCase() + item.period.slice(1)}</Text>
          </View>
          <Ionicons name={statusIcon as any} size={20} color={statusColor} />
        </View>

        <AnimatedBar pct={pct} color={barColor} />

        <View style={bs.budgetBottom}>
          <View>
            <Text style={bs.metaLabel}>Spent</Text>
            <Text style={[bs.metaValue, { color: COLORS.accent.moneyOut }]}>₹{item.spent?.toFixed(0) || 0}</Text>
          </View>
          <View style={bs.budgetLimit}>
            <Text style={bs.budgetLimitText}>₹{item.amount?.toFixed(0)}</Text>
          </View>
          <View>
            <Text style={[bs.metaLabel, { textAlign: 'right' }]}>Left</Text>
            <Text style={[bs.metaValue, { color: COLORS.accent.moneyIn, textAlign: 'right' }]}>₹{remaining.toFixed(0)}</Text>
          </View>
        </View>

        {pct >= 80 && (
          <View style={[bs.alertBanner, { backgroundColor: pct >= 100 ? '#FEF2F2' : '#FFFBEB' }]}>
            <Ionicons name="alert-circle" size={14} color={pct >= 100 ? COLORS.accent.moneyOut : COLORS.accent.warning} />
            <Text style={[bs.alertText, { color: pct >= 100 ? COLORS.accent.moneyOut : COLORS.accent.warning }]}>
              {pct >= 100 ? `Over by ₹${(item.spent - item.amount).toFixed(0)}` : `${(100 - pct).toFixed(0)}% remaining`}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) return <SafeAreaView style={bs.container}><BudgetSkeleton /></SafeAreaView>;

  return (
    <SafeAreaView style={bs.container}>
      <View style={bs.header}>
        <View>
          <Text style={bs.pageTitle}>Budgets</Text>
          <Text style={bs.pageSubtitle}>{budgets.length} active</Text>
        </View>
        <TouchableOpacity style={bs.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={budgets}
        renderItem={renderBudget}
        keyExtractor={(item) => item.id}
        contentContainerStyle={bs.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
        ListHeaderComponent={
          <>
            {/* Overall Summary Card */}
            {budgets.length > 0 && (
              <View style={bs.summaryCard}>
                <View style={bs.summaryRow}>
                  <View style={bs.summaryItem}>
                    <Text style={bs.summaryLabel}>Total Budget</Text>
                    <Text style={bs.summaryVal}>₹{totalBudget.toFixed(0)}</Text>
                  </View>
                  <View style={[bs.summaryDivider, { backgroundColor: summaryColor + '30' }]} />
                  <View style={bs.summaryItem}>
                    <Text style={bs.summaryLabel}>Total Spent</Text>
                    <Text style={[bs.summaryVal, { color: summaryColor }]}>₹{totalSpent.toFixed(0)}</Text>
                  </View>
                  <View style={[bs.summaryDivider, { backgroundColor: summaryColor + '30' }]} />
                  <View style={bs.summaryItem}>
                    <Text style={bs.summaryLabel}>Health</Text>
                    <View style={[bs.healthPill, { backgroundColor: summaryColor + '12' }]}>
                      <Ionicons name={totalPct >= 100 ? 'close-circle' : totalPct >= 75 ? 'warning' : 'checkmark-circle'} size={14} color={summaryColor} />
                      <Text style={[bs.healthText, { color: summaryColor }]}>{Math.round(totalPct)}%</Text>
                    </View>
                  </View>
                </View>
                <AnimatedBar pct={totalPct} color={summaryColor} />
              </View>
            )}

            {/* Smart Suggestions */}
            {suggestions?.suggestions?.length > 0 && (
              <View style={bs.suggestCard}>
                <View style={bs.suggestHeader}>
                  <Ionicons name="bulb" size={18} color="#F59E0B" />
                  <Text style={bs.suggestTitle}>AI Budget Suggestions</Text>
                </View>
                <Text style={bs.suggestMsg}>{suggestions.message}</Text>
                {suggestions.suggestions.slice(0, 3).map((s: any, i: number) => (
                  <View key={i} style={bs.suggestRow}>
                    <View style={bs.suggestInfo}>
                      <Text style={bs.suggestCat}>{s.category}</Text>
                      <Text style={bs.suggestDetail}>{s.message}</Text>
                    </View>
                    <Text style={bs.suggestSave}>Save ₹{s.savings_potential?.toFixed(0)}</Text>
                  </View>
                ))}
                <TouchableOpacity style={bs.suggestApply} onPress={applySmartBudgets}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={bs.suggestApplyText}>Auto-apply AI Budgets</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={bs.empty}>
            <View style={bs.emptyIcon}>
              <Ionicons name="wallet-outline" size={48} color={COLORS.accent.primary} />
            </View>
            <Text style={bs.emptyTitle}>No budgets yet</Text>
            <Text style={bs.emptyText}>Create your first budget to start tracking spending</Text>
            <TouchableOpacity style={bs.emptyBtn} onPress={openAdd}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={bs.emptyBtnText}>Create Budget</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Create / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={bs.modalBg}>
          <View style={bs.modalSheet}>
            <View style={bs.sheetHandle} />
            <View style={bs.modalHeader}>
              <Text style={bs.modalTitle}>{editingBudget ? 'Edit Budget' : 'New Budget'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingBudget(null); }}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={bs.formLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {CATEGORY_LIST.map((c) => {
                  const cat = CATEGORIES[c];
                  const active = formData.category === c;
                  return (
                    <TouchableOpacity key={c} style={[bs.chip, active && { backgroundColor: cat.color, borderColor: cat.color }]} onPress={() => setFormData({ ...formData, category: c })}>
                      <Ionicons name={cat.icon as any} size={14} color={active ? '#fff' : cat.color} />
                      <Text style={[bs.chipText, active && { color: '#fff', fontWeight: '600' }]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={bs.formLabel}>Period</Text>
              <View style={bs.periodRow}>
                {PERIODS.map((p) => (
                  <TouchableOpacity key={p} style={[bs.periodBtn, formData.period === p && bs.periodBtnActive]} onPress={() => setFormData({ ...formData, period: p })}>
                    <Text style={[bs.periodBtnText, formData.period === p && bs.periodBtnTextActive]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={bs.formLabel}>Budget Amount</Text>
              <View style={bs.amountRow}>
                <Text style={bs.rupee}>₹</Text>
                <TextInput style={bs.amountInput} placeholder="0" placeholderTextColor={COLORS.text.muted} value={formData.amount} onChangeText={(v) => setFormData({ ...formData, amount: v })} keyboardType="numeric" />
              </View>
              <TouchableOpacity style={bs.submitBtn} onPress={handleSave}>
                <Text style={bs.submitText}>{editingBudget ? 'Update Budget' : 'Set Budget'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const bs = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: COLORS.text.muted },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: SPACING.lg },
  // Summary card
  summaryCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: COLORS.text.muted, marginBottom: 4 },
  summaryVal: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary },
  summaryDivider: { width: 1, height: 30 },
  healthPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  healthText: { fontSize: 14, fontWeight: '700' },
  // Budget card
  budgetCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border.card },
  budgetTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  budgetInfo: { flex: 1 },
  budgetCategory: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary },
  budgetPeriod: { fontSize: 11, color: COLORS.text.muted, marginTop: 1 },
  budgetLimit: { backgroundColor: COLORS.bg.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm },
  budgetLimitText: { fontSize: 13, fontWeight: '700', color: COLORS.accent.primary },
  // Progress
  progressTrack: { height: 10, backgroundColor: COLORS.bg.primary, borderRadius: 5, overflow: 'hidden', marginBottom: 12, position: 'relative' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { position: 'absolute', top: -1, height: 12 },
  progressPct: { fontSize: 8, fontWeight: '700', color: '#fff' },
  // Bottom
  budgetBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 11, color: COLORS.text.muted, marginBottom: 2 },
  metaValue: { fontSize: 16, fontWeight: '700' },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: RADIUS.lg, marginTop: 10 },
  alertText: { fontSize: 12, fontWeight: '600' },
  // Empty
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accent.primary + '10', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary },
  emptyText: { fontSize: 14, color: COLORS.text.muted, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: RADIUS.full, marginTop: 20 },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted, marginBottom: 10, letterSpacing: 0.3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.primary, marginRight: 8, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipText: { fontSize: 13, color: COLORS.text.secondary, fontWeight: '500' },
  periodRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  periodBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border.subtle, alignItems: 'center' },
  periodBtnActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  periodBtnText: { fontSize: 14, color: COLORS.text.muted, fontWeight: '600' },
  periodBtnTextActive: { color: '#fff' },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border.subtle },
  rupee: { fontSize: 24, fontWeight: '700', color: COLORS.accent.primary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: COLORS.text.primary, paddingVertical: 16 },
  submitBtn: { backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center' },
  submitText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Smart suggestions
  suggestCard: { backgroundColor: '#FFFBEB', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FDE68A' },
  suggestHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  suggestTitle: { fontSize: 15, fontWeight: '700', color: '#92400E' },
  suggestMsg: { fontSize: 12, color: '#78716C', marginBottom: 12 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  suggestInfo: { flex: 1 },
  suggestCat: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  suggestDetail: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  suggestSave: { fontSize: 12, fontWeight: '700', color: COLORS.accent.moneyIn },
  suggestApply: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.accent.primary, paddingVertical: 14, borderRadius: RADIUS.full, marginTop: 12 },
  suggestApplyText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
