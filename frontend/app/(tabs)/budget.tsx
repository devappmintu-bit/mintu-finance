import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../utils/api';
import {
  fetchBudgets as fetchBudgetsSrv, fetchLiveBudgets, fetchBudgetSuggestions,
  createBudget, updateBudget, deleteBudget,
} from '../../services/budgets';
import { COLORS, RADIUS, SPACING, CATEGORIES, CATEGORY_LIST, SHADOW } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import PressableGlass from '../../components/PressableGlass';
import BudgetCard from '../../components/budget/BudgetCard';
import DeleteBudgetSheet from '../../components/budget/DeleteBudgetSheet';
import BudgetInsightsSheet from '../../components/budget/BudgetInsightsSheet';
import BudgetShareCard from '../../components/budget/BudgetShareCard';
import BudgetSummaryDonut from '../../components/budget/BudgetSummaryDonut';
// BudgetAchievements moved to Profile tab
import EmptyState from '../../components/ui/EmptyState';
import SheetHeader from '../../components/ui/SheetHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import GlassSheet, { GlassSheetHandle } from '../../components/ui/GlassSheet';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import Toast from 'react-native-toast-message';
import { BudgetSkeleton } from '../../components/SkeletonLoader';

const PERIODS = ['daily', 'weekly', 'monthly'];

export default function BudgetScreen() {
  const s = useStyles();
  const { lang } = useLangStore();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const budgetSheetRef = useRef<GlassSheetHandle>(null);
  // Bridge imperative sheet API ↔ existing boolean state. Keeps every existing
  // call site (`setModalVisible(true)` / `(false)`) working unchanged.
  useEffect(() => {
    if (modalVisible) budgetSheetRef.current?.present();
    else budgetSheetRef.current?.dismiss();
  }, [modalVisible]);
  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [formData, setFormData] = useState({ category: 'Food', amount: '', period: 'monthly', recurring: true, description: '' });
  const [aiCategorizing, setAiCategorizing] = useState(false);
  // Budget achievements moved to Profile — keep a single refresh handler
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const lastDeletedRef = useRef<any>(null);
  // Phase-2: AI insights + share
  const [insightsCat, setInsightsCat] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<View>(null);

  const fetchAll = useCallback(async () => {
    try {
      // Prefer /budgets/live (includes spent/status); fall back gracefully.
      const [budgets, sugg] = await Promise.all([
        fetchLiveBudgets().catch(() => fetchBudgetsSrv()),
        fetchBudgetSuggestions().catch(() => null),
      ]);
      const raw = (budgets as any).budgets || budgets || [];
      const normalized = (raw as any[]).map((b: any) => ({
        ...b,
        amount: b.amount ?? b.budget ?? 0,
        spent: b.spent ?? 0,
      }));
      setBudgets(normalized);
      if (sugg) setSuggestions(sugg);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, []);
  // Budget achievements moved to Profile tab — keep onRefresh simple now
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
        await updateBudget(editingBudget.id, { amount: parseFloat(formData.amount), category, period: formData.period, recurring: formData.recurring, description: formData.description });
      } else {
        await createBudget({ category, amount: parseFloat(formData.amount), period: formData.period, recurring: formData.recurring, description: formData.description });
      }
      setModalVisible(false); setEditingBudget(null); fetchAll();
      Toast.show({ type: 'success', text1: editingBudget ? t('budget_updated', lang) : t('budget_created', lang), text2: `${category} — ₹${formData.amount}` });
    } catch { Toast.show({ type: 'error', text1: t('error', lang), text2: t('failed_save', lang) }); fetchAll(); }
  };

  // Two-step delete: card emits request → parent opens confirmation sheet → confirm triggers optimistic delete with undo-snackbar
  const requestDelete = (item: any) => setDeleteTarget(item);

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    const prev = budgets;
    lastDeletedRef.current = target;
    setBudgets(curr => curr.filter(b => b.id !== target.id));
    setDeleteTarget(null);
    try {
      await deleteBudget(target.id);
      Toast.show({
        type: 'info',
        text1: `${target.category} budget deleted`,
        text2: 'Tap to undo',
        visibilityTime: 4000,
        onPress: async () => {
          const restore = lastDeletedRef.current;
          if (!restore) return;
          try {
            const created = await createBudget({
              category: restore.category,
              amount: Number(restore.amount || restore.budget || 0),
              period: restore.period || 'monthly',
              recurring: restore.recurring !== false,
              description: restore.description || '',
            });
            setBudgets(curr => [{ ...restore, id: (created as any).id }, ...curr]);
            Toast.show({ type: 'success', text1: 'Budget restored' });
            lastDeletedRef.current = null;
            fetchAll();
          } catch {
            Toast.show({ type: 'error', text1: 'Could not restore' });
          }
        },
      });
      fetchAll();
    } catch {
      setBudgets(prev); // revert on failure
      Toast.show({ type: 'error', text1: t('error', lang) });
    }
  };

  const addExpenseShortcut = (item: any) => {
    // Route to Expenses tab with the category pre-filled — state sync (Item 15)
    router.push({ pathname: '/(tabs)/expenses' as any, params: { prefill_category: item.category, prefill_type: 'expense' } });
  };

  const totalBudget = budgets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);

  const renderBudget = ({ item }: { item: any }) => (
    <BudgetCard
      item={item}
      onEdit={() => openEdit(item)}
      onDelete={() => requestDelete(item)}
      onAddExpense={() => addExpenseShortcut(item)}
      onInsights={() => setInsightsCat(item.category)}
    />
  );

  const shareBudgetSnapshot = async () => {
    if (budgets.length === 0) {
      Toast.show({ type: 'info', text1: 'Create a budget first 📊' });
      return;
    }
    setSharing(true);
    try {
      // Build a clean text summary that works reliably on ALL platforms.
      const overBudgets = budgets.filter((b: any) => (b.spent || 0) > (b.amount || 0));
      const topOver = overBudgets.sort(
        (a: any, b: any) => ((b.spent || 0) - (b.amount || 0)) - ((a.spent || 0) - (a.amount || 0)),
      )[0];
      const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const pct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
      const healthEmoji = pct <= 70 ? '💪' : pct <= 100 ? '⚠️' : '🚨';

      const lines = [
        `📊 MintU Budget Snapshot · ${monthLabel}`,
        '',
        `${healthEmoji} Budgeted: ₹${totalBudget.toLocaleString('en-IN')}`,
        `💰 Spent: ₹${totalSpent.toLocaleString('en-IN')} (${pct}%)`,
      ];
      if (topOver) {
        lines.push('', `🔔 Over budget: ${topOver.category} by ₹${Math.round(topOver.spent - topOver.amount).toLocaleString('en-IN')}`);
      } else {
        lines.push('', '✅ All budgets on track');
      }
      lines.push('', `Track yours on MintU — smart Indian money coach.`);
      const msg = lines.join('\n');

      // Prefer native Share (iOS/Android), then Web Share API, then clipboard fallback.
      if (Platform.OS === 'web') {
        if ((navigator as any)?.share) {
          try { await (navigator as any).share({ title: 'MintU Budget', text: msg }); }
          catch { await (navigator as any).clipboard?.writeText(msg); Toast.show({ type: 'success', text1: 'Copied to clipboard' }); }
        } else {
          await (navigator as any).clipboard?.writeText(msg);
          Toast.show({ type: 'success', text1: 'Copied to clipboard' });
        }
      } else {
        const RN = await import('react-native');
        await RN.Share.share({ message: msg, title: 'MintU Budget Snapshot' });
      }
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not share', text2: e?.message || '' });
    } finally { setSharing(false); }
  };

  if (loading) return <SafeAreaView style={s.bg}><BudgetSkeleton /></SafeAreaView>;

  return (
    <SafeAreaView style={s.bg}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>{t('budgets', lang)}</Text>
          <Text style={s.sub}>{budgets.length} {t('active', lang)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.shareBtn} onPress={shareBudgetSnapshot} disabled={sharing} activeOpacity={0.85} accessibilityLabel="Share budget snapshot">
            {sharing ? <ActivityIndicator color="#F56E1E" size="small" /> : <Ionicons name="share-social-outline" size={20} color="#F56E1E" />}
          </TouchableOpacity>
          <PressableGlass style={s.addBtn} onPress={openAdd} feedback="medium">
            <Ionicons name="add" size={22} color="#fff" />
          </PressableGlass>
        </View>
      </View>

      <FlashList
        data={budgets}
        renderItem={renderBudget}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        estimatedItemSize={168}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
        ListHeaderComponent={
          <>
            {/* Budget streak/achievements moved to Profile tab per design ask */}
            {/* Donut chart + legend — primary summary per design ask.
                "Budget Health" + "Watching" cards were removed. */}
            <BudgetSummaryDonut budgets={budgets} />
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
          <EmptyState
            emoji="💰"
            title={t('no_budgets', lang)}
            subtitle="Set your first budget and start tracking spending by category."
            ctaLabel={t('create_budget', lang)}
            onCta={openAdd}
          />
        }
      />

      {/* Add/Edit Budget — native snap-gesture bottom sheet */}
      <GlassSheet
        ref={budgetSheetRef}
        snapPoints={['70%', '95%']}
        onDismiss={() => { setModalVisible(false); setEditingBudget(null); }}
      >
        <SheetHeader
          title={editingBudget ? t('edit_budget', lang) : t('new_budget', lang)}
          onClose={() => { setModalVisible(false); setEditingBudget(null); }}
        />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            <View style={[s.recurringIcon, { backgroundColor: formData.recurring ? '#FF6B1A' : 'rgba(255,255,255,0.08)' }]}>
              <Ionicons name="refresh" size={16} color={formData.recurring ? '#fff' : COLORS.text.muted} />
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
                <Ionicons name="sparkles" size={14} color={COLORS.accent.primary} />
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

          <PrimaryButton
            label={editingBudget ? t('update', lang) : t('set_budget', lang)}
            onPress={handleSave}
            loading={aiCategorizing}
            icon={editingBudget ? 'checkmark' : 'add-circle'}
            size="lg"
          />
          <View style={{ height: 32 }} />
        </ScrollView>
      </GlassSheet>

      <DeleteBudgetSheet
        visible={!!deleteTarget}
        category={deleteTarget?.category}
        amount={deleteTarget?.amount ?? deleteTarget?.budget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <BudgetInsightsSheet
        visible={!!insightsCat}
        category={insightsCat}
        onClose={() => setInsightsCat(null)}
        onApplied={fetchAll}
      />

      {/* Off-screen share card — 1×1 overflow:hidden wrapper keeps it out of
          view while still being in the layout tree so `captureRef` can snapshot it. */}
      <View style={s.offscreen} pointerEvents="none" aria-hidden>
        <BudgetShareCard
          ref={shareRef as any}
          summary={{
            total_budgeted: totalBudget,
            total_spent: totalSpent,
            top_over_category: budgets.find((b: any) => (b.spent || 0) > (b.amount || 0))?.category,
            top_over_amount: (() => {
              const o = budgets.find((b: any) => (b.spent || 0) > (b.amount || 0));
              return o ? (o.spent - o.amount) : 0;
            })(),
            month_label: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: 28, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 13, color: c.text.muted },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.md },
  shareBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,107,26,0.14)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,107,26,0.4)' },
  offscreen: { position: 'absolute', top: -99999, left: -99999, width: 360, opacity: 0 },
  list: { padding: SPACING.lg, paddingBottom: 140 },
  // Summary
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  summaryBox: { flex: 1, backgroundColor: c.bg.card, borderRadius: RADIUS.lg, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: c.border.card },
  sumLabel: { fontSize: 11, color: c.text.muted, marginBottom: 4 },
  sumVal: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  // Card
  card: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', ...SHADOW.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { fontSize: 16, fontWeight: '700', color: c.text.primary },
  period: { fontSize: 11, color: c.text.muted, marginTop: 1 },
  spentAmt: { fontSize: 18, fontWeight: '800' },
  limitAmt: { fontSize: 12, color: c.text.muted, marginTop: 1 },
  overBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS.sm, backgroundColor: 'rgba(255,84,112,0.14)', borderWidth: 1, borderColor: 'rgba(255,84,112,0.4)' },
  overText: { fontSize: 12, fontWeight: '600', color: c.accent.moneyOut },
  // AI Suggest — dark glass
  suggestCard: { backgroundColor: 'rgba(255,176,32,0.1)', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(255,176,32,0.35)' },
  suggestTitle: { fontSize: 14, fontWeight: '800', color: '#FFB547' },
  suggestMsg: { fontSize: 12, color: c.text.secondary, marginBottom: 10 },
  suggestRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,176,32,0.25)' },
  suggestCat: { fontSize: 14, fontWeight: '600', color: c.text.primary },
  suggestSave: { fontSize: 13, fontWeight: '700', color: c.accent.moneyIn },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent.primary, paddingVertical: 12, borderRadius: RADIUS.full, marginTop: 10 },
  applyText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // Empty
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: c.text.muted, marginTop: 12 },
  emptyBtn: { backgroundColor: c.accent.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: RADIUS.full, marginTop: 16 },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Modal — dark sheet
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { backgroundColor: c.bg.elevated, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '88%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.text.muted, alignSelf: 'center', marginBottom: 16, opacity: 0.6 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: c.text.primary },
  formLabel: { fontSize: 13, fontWeight: '600', color: c.text.muted, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipText: { fontSize: 13, color: c.text.secondary, fontWeight: '500' },
  periodBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center' },
  periodOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  periodText: { fontSize: 14, color: c.text.muted, fontWeight: '600' },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  rupee: { fontSize: 24, fontWeight: '700', color: c.accent.primary, marginRight: 8 },
  amtInput: { flex: 1, fontSize: 28, fontWeight: '700', color: c.text.primary, paddingVertical: 16 },
  saveBtn: { backgroundColor: c.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Bar-style category rows — dark glass
  barRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16,
    backgroundColor: 'rgba(26,26,36,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10,
  },
  barIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  barTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  barName: { fontSize: 14.5, fontWeight: '700', color: c.text.primary, flex: 1, marginRight: 8 },
  barAmt: { fontSize: 13.5, fontWeight: '800' },
  barOf: { fontSize: 11, fontWeight: '600', color: c.text.muted },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  barPct: { fontSize: 10.5, color: c.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  barTail: { fontSize: 11, fontWeight: '700' },
  // Recurring toggle — dark
  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16 },
  recurringRowOn: { backgroundColor: 'rgba(255,107,26,0.14)', borderColor: 'rgba(255,107,26,0.4)' },
  recurringIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recurringTitle: { fontSize: 14, fontWeight: '700', color: c.text.primary },
  recurringSub: { fontSize: 11, color: c.text.muted, marginTop: 2 },
  toggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: c.accent.primary },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  // Other-category description box — dark glass orange
  otherDescBox: { backgroundColor: 'rgba(255,107,26,0.1)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,107,26,0.3)', marginBottom: 16 },
  descInput: { fontSize: 14, color: c.text.primary, minHeight: 54, paddingVertical: 6, textAlignVertical: 'top' },
}));
