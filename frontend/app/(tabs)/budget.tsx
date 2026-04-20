import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST, SHADOW } from '../../utils/theme';
import PressableGlass from '../../components/PressableGlass';
import SwipeableRow from '../../components/SwipeableRow';
import BudgetAIInsights from '../../components/budget/BudgetAIInsights';
import BudgetSummaryDonut from '../../components/budget/BudgetSummaryDonut';
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
  const [formData, setFormData] = useState({ category: 'Food', amount: '', period: 'monthly', recurring: true, description: '' });
  const [aiCategorizing, setAiCategorizing] = useState(false);

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

  const openAdd = () => { setEditingBudget(null); setFormData({ category: 'Food', amount: '', period: 'monthly', recurring: true, description: '' }); setModalVisible(true); };
  const openEdit = (item: any) => { setEditingBudget(item); setFormData({ category: item.category, amount: String(item.amount), period: item.period, recurring: item.recurring !== false, description: item.description || '' }); setModalVisible(true); };

  const handleSave = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      Toast.show({ type: 'error', text1: t('enter_amount', lang), text2: t('amount_gt_zero', lang) }); return;
    }
    // Auto-categorise "Other" when a description is given — feels magical and matches the design ask.
    let category = formData.category;
    if (category === 'Other' && formData.description.trim().length > 2) {
      try {
        setAiCategorizing(true);
        const res = await api.post('/budgets/categorize', { description: formData.description.trim() });
        const suggested = res.data?.category;
        if (suggested && suggested !== 'Other') {
          category = suggested;
          Toast.show({ type: 'info', text1: t('ai_categorized', lang) || 'AI suggested', text2: `${t('moved_to', lang) || 'Categorised as'} ${suggested}` });
        }
      } catch { /* keep Other */ }
      finally { setAiCategorizing(false); }
    }
    try {
      if (editingBudget) {
        const patched = { ...editingBudget, amount: parseFloat(formData.amount), category, period: formData.period, recurring: formData.recurring, description: formData.description };
        setBudgets(prev => prev.map(b => b.id === editingBudget.id ? patched : b));
        await api.put(`/budgets/${editingBudget.id}`, { amount: parseFloat(formData.amount), category, period: formData.period, recurring: formData.recurring, description: formData.description });
      } else {
        await api.post('/budgets', { category, amount: parseFloat(formData.amount), period: formData.period, recurring: formData.recurring, description: formData.description });
      }
      setModalVisible(false); setEditingBudget(null); fetchAll();
      Toast.show({ type: 'success', text1: editingBudget ? t('budget_updated', lang) : t('budget_created', lang), text2: `${category} — ₹${formData.amount}` });
    } catch { Toast.show({ type: 'error', text1: t('error', lang), text2: t('failed_save', lang) }); fetchAll(); }
  };

  const handleDelete = (id: string, cat: string) => Alert.alert(t('delete', lang) + '?', t('remove_budget', lang, { cat }), [
    { text: t('cancel', lang), style: 'cancel' },
    { text: t('delete', lang), style: 'destructive', onPress: async () => {
      // Optimistic delete
      const prev = budgets;
      setBudgets(curr => curr.filter(b => b.id !== id));
      try {
        await api.delete(`/budgets/${id}`);
        Toast.show({ type: 'info', text1: t('budget_removed', lang) });
        fetchAll();
      } catch {
        setBudgets(prev);
        Toast.show({ type: 'error', text1: t('error', lang) });
      }
    } },
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
      <SwipeableRow
        onEdit={() => openEdit(item)}
        onDelete={() => handleDelete(item.id, item.category)}
        editLabel={t('edit', lang)}
        deleteLabel={t('delete', lang)}
      >
        <PressableGlass style={s.card} onPress={() => openEdit(item)} feedback="light">
          <View style={s.cardRow}>
            <View style={[s.catDot, { backgroundColor: cat.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.catName} numberOfLines={1}>{item.category}</Text>
              <Text style={s.period}>{t(item.period, lang)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.spentAmt, { color: statusColor }]} numberOfLines={1}>₹{spent.toFixed(0)}</Text>
              <Text style={s.limitAmt} numberOfLines={1}>{t('total', lang).toLowerCase()} ₹{limit.toFixed(0)}</Text>
            </View>
          </View>
          {isOver && (
            <View style={s.overBanner}>
              <Ionicons name="warning" size={13} color={COLORS.accent.moneyOut} />
              <Text style={s.overText}>{t('over_by', lang)} ₹{(spent - limit).toFixed(0)}</Text>
            </View>
          )}
          {isWarn && !isOver && (
            <View style={[s.overBanner, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="alert-circle" size={13} color="#D97706" />
              <Text style={[s.overText, { color: '#D97706' }]}>₹{remaining.toFixed(0)} {t('left', lang)}</Text>
            </View>
          )}
          {!isOver && !isWarn && (
            <View style={[s.overBanner, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="checkmark-circle" size={13} color={COLORS.accent.moneyIn} />
              <Text style={[s.overText, { color: COLORS.accent.moneyIn }]}>₹{remaining.toFixed(0)} {t('remaining', lang)}</Text>
            </View>
          )}
        </PressableGlass>
      </SwipeableRow>
    );
  };

  if (loading) return <SafeAreaView style={s.bg}><BudgetSkeleton /></SafeAreaView>;

  return (
    <SafeAreaView style={s.bg}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>{t('budgets', lang)}</Text>
          <Text style={s.sub}>{budgets.length} {t('active', lang)}</Text>
        </View>
        <PressableGlass style={s.addBtn} onPress={openAdd} feedback="medium">
          <Ionicons name="add" size={22} color="#fff" />
        </PressableGlass>
      </View>

      <FlatList
        data={budgets}
        renderItem={renderBudget}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
        ListHeaderComponent={
          <>
            {/* Donut chart + legend */}
            <BudgetSummaryDonut budgets={budgets} />
            {/* Graphical, personalised AI insights strip */}
            <BudgetAIInsights budgets={budgets} />
            {/* Summary */}
            {budgets.length > 0 && (
              <View style={s.summaryRow}>
                <View style={s.summaryBox}>
                  <Text style={s.sumLabel}>{t('budgets', lang)}</Text>
                  <Text style={s.sumVal}>₹{totalBudget.toFixed(0)}</Text>
                </View>
                <View style={s.summaryBox}>
                  <Text style={s.sumLabel}>{t('spent', lang)}</Text>
                  <Text style={[s.sumVal, { color: COLORS.accent.moneyOut }]}>₹{totalSpent.toFixed(0)}</Text>
                </View>
                <View style={s.summaryBox}>
                  <Text style={s.sumLabel}>{t('left', lang)}</Text>
                  <Text style={[s.sumVal, { color: totalBudget - totalSpent >= 0 ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]}>₹{Math.abs(totalBudget - totalSpent).toFixed(0)}</Text>
                </View>
              </View>
            )}
            {/* AI Suggestions */}
            {suggestions?.suggestions?.length > 0 && (
              <View style={s.suggestCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="bulb" size={16} color="#F59E0B" />
                  <Text style={s.suggestTitle}>{t('ai_suggestions', lang)}</Text>
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
                  <Text style={s.applyText}>{t('auto_apply', lang)}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="wallet-outline" size={48} color={COLORS.accent.primary} />
            <Text style={s.emptyTitle}>{t('no_budgets', lang)}</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
              <Text style={s.emptyBtnText}>{t('create_budget', lang)}</Text>
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
              <Text style={s.sheetTitle}>{editingBudget ? t('edit_budget', lang) : t('new_budget', lang)}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingBudget(null); }}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>{t('category', lang)}</Text>
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
              <Text style={s.formLabel}>{t('period', lang)}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {PERIODS.map(p => (
                  <TouchableOpacity key={p} style={[s.periodBtn, formData.period === p && s.periodOn]} onPress={() => setFormData({ ...formData, period: p })}>
                    <Text style={[s.periodText, formData.period === p && { color: '#fff' }]}>{t(p, lang)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.formLabel}>{t('amount', lang)}</Text>
              <View style={s.amtRow}>
                <Text style={s.rupee}>₹</Text>
                <TextInput style={s.amtInput} placeholder="0" placeholderTextColor={COLORS.text.muted} value={formData.amount} onChangeText={v => setFormData({ ...formData, amount: v })} keyboardType="numeric" />
              </View>

              {/* Recurring toggle */}
              <TouchableOpacity
                style={[s.recurringRow, formData.recurring && s.recurringRowOn]}
                onPress={() => setFormData({ ...formData, recurring: !formData.recurring })}
                activeOpacity={0.85}
              >
                <View style={[s.recurringIcon, { backgroundColor: formData.recurring ? '#F56E1E' : '#E5E7EB' }]}>
                  <Ionicons name="refresh" size={16} color={formData.recurring ? '#fff' : '#6B7280'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.recurringTitle}>Recurring budget</Text>
                  <Text style={s.recurringSub}>{formData.recurring ? `Rolls over every ${formData.period}` : "One-time only — won't reset"}</Text>
                </View>
                <View style={[s.toggle, formData.recurring && s.toggleOn]}>
                  <View style={[s.toggleKnob, formData.recurring && s.toggleKnobOn]} />
                </View>
              </TouchableOpacity>

              {/* Description (required for Other → AI categorise) */}
              {formData.category === 'Other' && (
                <View style={s.otherDescBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons name="sparkles" size={14} color="#F56E1E" />
                    <Text style={s.formLabel}>Describe what this budget is for (AI will categorise)</Text>
                  </View>
                  <TextInput
                    style={s.descInput}
                    placeholder="e.g. Monthly Netflix & Spotify subscriptions"
                    placeholderTextColor={COLORS.text.muted}
                    value={formData.description}
                    onChangeText={v => setFormData({ ...formData, description: v })}
                    multiline
                  />
                </View>
              )}

              <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={aiCategorizing}>
                {aiCategorizing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnText}>{editingBudget ? t('update', lang) : t('set_budget', lang)}</Text>
                )}
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
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.md },
  list: { padding: SPACING.lg, paddingBottom: 140 },
  // Summary
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  summaryBox: { flex: 1, backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.card },
  sumLabel: { fontSize: 11, color: COLORS.text.muted, marginBottom: 4 },
  sumVal: { fontSize: 17, fontWeight: '800', color: COLORS.text.primary },
  // Card
  card: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', ...SHADOW.sm },
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
  // Recurring toggle
  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 },
  recurringRowOn: { backgroundColor: '#FFF7ED', borderColor: '#F56E1E40' },
  recurringIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recurringTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  recurringSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  toggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#D1D5DB', padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#F56E1E' },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  // Other-category description box
  otherDescBox: { backgroundColor: '#FFF7ED', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#FED7AA', marginBottom: 16 },
  descInput: { fontSize: 14, color: COLORS.text.primary, minHeight: 54, paddingVertical: 6, textAlignVertical: 'top' },
});
