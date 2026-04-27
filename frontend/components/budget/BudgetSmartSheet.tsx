/**
 * BudgetSmartSheet.tsx — AI-assisted Create/Edit budget experience.
 *
 * Replaces the static "New/Edit Budget" form with a smart, high-speed
 * financial-assistant flow:
 *
 *   1. Dynamic header — "Create Budget" / "Edit Budget" + subtitle
 *   2. SMART CATEGORY selector — chip shows last-month spend + AI rec
 *   3. AMOUNT INPUT:
 *        • AI recommendation banner ("₹10,000 based on your spending")
 *        • Quick-pick chips [5K/10K/15K/20K] seeded from backend
 *        • Big editable ₹ display
 *        • Fine-tune slider (pan-responder driven)
 *   4. IMPACT PREVIEW (live):
 *        • Daily budget
 *        • Monthly savings potential (vs last-month spend)
 *        • Risk level chip (low/moderate/high)
 *   5. SMART ROLLOVER — toggle + explanation
 *   6. PERIOD — minimal daily/weekly/monthly
 *   7. CONTEXT — Me / Shared / Someone else (scope tag)
 *   8. ✨ LET AI SET IT — one-tap auto-fill best budget
 *   9. DYNAMIC CTA — "Create Budget" / "Save Changes" /
 *                     "Increase Budget" / "Reduce Budget"
 *
 * Backend data: /api/budgets/smart-setup (new endpoint).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Animated, Easing, Platform, PanResponder, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Round 47 — when this sheet is mounted inside a @gorhom/bottom-sheet
// (GlassSheet), regular RN ScrollView doesn't share gestures with the
// parent sheet — content past the snap point becomes unreachable.
// BottomSheetScrollView fixes scroll propagation and clipping.
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import api from '../../utils/api';
import { fetchGoals, createGoal, Goal } from '../../services/goals';
import { useIsOnline } from '../../hooks/useIsOnline';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, useAppColors } from '../../utils/theme';

const CATEGORY_META: Record<string, { icon: string; color: string; emoji: string }> = {
  Food:           { icon: 'fast-food',       color: COLORS.accent.brand, emoji: '🍔' },
  Transport:      { icon: 'car',             color: '#3B82F6', emoji: '🚗' },
  Shopping:       { icon: 'bag',             color: '#EC4899', emoji: '🛍️' },
  Entertainment:  { icon: 'musical-notes',   color: '#8B5CF6', emoji: '🎬' },
  Bills:          { icon: 'receipt',         color: COLORS.state.danger, emoji: '💡' },
  Health:         { icon: 'heart',           color: COLORS.state.successAlt, emoji: '💊' },
  Travel:         { icon: 'airplane',        color: '#06B6D4', emoji: '✈️' },
  Groceries:      { icon: 'basket',          color: '#65A30D', emoji: '🛒' },
  Education:      { icon: 'school',          color: '#2563EB', emoji: '📚' },
  Other:          { icon: 'ellipsis-horizontal', color: COLORS.text.muted, emoji: '✨' },
};

type SmartCategory = {
  category: string;
  last_month_spend: number;
  three_month_avg: number;
  recommended: number;
  risk_level: 'low' | 'moderate' | 'high';
  preset_amounts: number[];
  existing_budget?: { id: string; amount: number; period: string; recurring: boolean } | null;
};

type Props = {
  /** Edit mode? (prefill from this budget) */
  editing?: {
    id: string;
    category: string;
    amount: number;
    period: 'daily' | 'weekly' | 'monthly';
    recurring: boolean;
    description?: string;
    goal_id?: string | null;
  } | null;
  /** Round 38 — current spent in the period; shown as warning if over limit. */
  currentSpent?: number;
  onSubmit: (payload: {
    category: string;
    amount: number;
    period: 'daily' | 'weekly' | 'monthly';
    recurring: boolean;
    description?: string;
    scope?: 'me' | 'shared' | 'other';
    goal_id?: string | null;
  }) => Promise<void> | void;
  onClose: () => void;
  submitting?: boolean;
};

const PERIODS: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];

function fmt(n: number) {
  if (!n) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

function fmtCompact(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

export default function BudgetSmartSheet({ editing, currentSpent, onSubmit, onClose, submitting }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const isOnline = useIsOnline();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ monthly_income: number; categories: SmartCategory[] } | null>(null);
  const [category, setCategory] = useState<string>(editing?.category || 'Food');
  const [amountStr, setAmountStr] = useState<string>(editing?.amount ? String(editing.amount) : '');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>(editing?.period || 'monthly');
  const [recurring, setRecurring] = useState<boolean>(editing?.recurring ?? true);
  const [description, setDescription] = useState<string>(editing?.description || '');
  const [scope, setScope] = useState<'me' | 'shared' | 'other'>('me');
  // Round 36 — inline blur validation for the budget amount field.
  const [amountError, setAmountError] = useState<string | null>(null);
  const validateAmountOnBlur = (raw: string) => {
    const v = (raw || '').trim();
    if (!v) { setAmountError('Amount is required'); return; }
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) { setAmountError('Enter an amount greater than 0'); return; }
    if (n > 10_000_000) { setAmountError('Amount too large (max ₹1cr)'); return; }
    setAmountError(null);
  };
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState<string | null>(editing?.goal_id || null);
  const [showNewGoal, setShowNewGoal] = useState<boolean>(false);
  const [newGoalName, setNewGoalName] = useState<string>('');
  const [newGoalTarget, setNewGoalTarget] = useState<string>('');
  const [creatingGoal, setCreatingGoal] = useState<boolean>(false);

  const amount = useMemo(() => parseFloat(amountStr) || 0, [amountStr]);
  const originalAmount = editing?.amount || 0;

  // Animated amount ticker
  const displayAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(displayAnim, { toValue: amount, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.quad) }).start();
  }, [amount, displayAnim]);

  // Round 51d — Static category fallback.
  // The form must render even if /budgets/smart-setup is slow or fails.
  // Categories are intrinsically static; the API only adds last-month
  // spend + AI recommendations. We seed with a baseline catalog so the
  // user can ALWAYS create a budget within 5 seconds of opening the
  // sheet, regardless of network conditions.
  const STATIC_CATEGORIES: SmartCategory[] = useMemo(() => (
    Object.keys(CATEGORY_META).map((cat) => ({
      category: cat,
      last_month_spend: 0,
      three_month_avg: 0,
      recommended: 0,
      risk_level: 'low' as const,
      preset_amounts: [5000, 10000, 15000, 20000],
      existing_budget: null,
    }))
  ), []);

  // Load smart setup data — but never block the form longer than 5s.
  useEffect(() => {
    let mounted = true;
    let resolved = false;

    // Hard 5-second deadline. If the API hasn't returned by then, render
    // the form with the static fallback so the user is never stuck on a
    // spinner. The async response (if it arrives later) will then upgrade
    // the chips with real spend numbers via the data setter below.
    const deadline = setTimeout(() => {
      if (!mounted || resolved) return;
      resolved = true;
      setData({ monthly_income: 0, categories: STATIC_CATEGORIES });
      setLoading(false);
    }, 5_000);

    (async () => {
      try {
        const r = await api.get('/budgets/smart-setup');
        if (!mounted) return;
        resolved = true;
        clearTimeout(deadline);
        // Merge: keep static catalog (full set) but overlay real data
        // for categories the backend returned, so the user has a
        // comprehensive list even if the backend filtered some out.
        const apiCats: SmartCategory[] = Array.isArray(r.data?.categories) ? r.data.categories : [];
        const byName: Record<string, SmartCategory> = {};
        for (const c of STATIC_CATEGORIES) byName[c.category] = c;
        for (const c of apiCats) byName[c.category] = c;
        setData({
          monthly_income: r.data?.monthly_income || 0,
          categories: Object.values(byName),
        });
      } catch {
        if (!mounted || resolved) return;
        resolved = true;
        clearTimeout(deadline);
        // Soft fallback — same static catalog the deadline would have set.
        setData({ monthly_income: 0, categories: STATIC_CATEGORIES });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    // Load goals in parallel (optional — errors are non-blocking)
    (async () => {
      try {
        const g = await fetchGoals();
        if (!mounted) return;
        setGoals(g.goals || []);
      } catch { /* no-op */ }
    })();

    return () => { mounted = false; clearTimeout(deadline); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentCat: SmartCategory | undefined = useMemo(
    () => data?.categories.find(c => c.category === category),
    [data, category]
  );

  const presets: number[] = currentCat?.preset_amounts || [5000, 10000, 15000, 20000];
  const recommended = currentCat?.recommended || 0;
  const lastMonth = currentCat?.last_month_spend || 0;
  const monthlyIncome = data?.monthly_income || 0;

  // === IMPACT PREVIEW CALCULATIONS ===
  const impact = useMemo(() => {
    const daysInPeriod = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const daily = amount / daysInPeriod;
    const savings = Math.max(0, lastMonth - amount);
    // Risk: (amount / monthly_income) or fallback (amount / last_month_spend)
    let riskPct = 0;
    if (monthlyIncome > 0) riskPct = (amount / monthlyIncome) * 100;
    else if (lastMonth > 0) riskPct = (amount / (lastMonth * 1.1)) * 100;
    const risk: 'low' | 'moderate' | 'high' =
      riskPct < 10 ? 'low' : riskPct < 25 ? 'moderate' : 'high';
    return { daily, savings, risk, riskPct };
  }, [amount, lastMonth, monthlyIncome, period]);

  const riskColor = impact.risk === 'low' ? COLORS.state.successAlt : impact.risk === 'moderate' ? COLORS.accent.secondary : COLORS.state.danger;
  const riskLabel = impact.risk === 'low' ? 'Low risk' : impact.risk === 'moderate' ? 'Moderate risk' : 'High risk';

  // === DYNAMIC CTA TEXT ===
  const ctaText = useMemo(() => {
    if (!editing) return 'Create Budget';
    if (amount > originalAmount * 1.05) return 'Increase Budget';
    if (amount < originalAmount * 0.95) return 'Reduce Budget';
    return 'Save Changes';
  }, [editing, amount, originalAmount]);

  const canSubmit = amount > 0 && !submitting && isOnline;

  // === ONE-TAP AI SET ===
  const aiSet = () => {
    if (!recommended) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setAmountStr(String(recommended));
  };

  const tapPreset = (n: number) => {
    try { Haptics.selectionAsync(); } catch {}
    setAmountStr(String(n));
  };

  // === SLIDER (pan-responder) ===
  const sliderWidth = useRef(1).current;
  const [sliderW, setSliderW] = useState(1);
  const maxAmount = Math.max(presets[presets.length - 1] || 20000, recommended * 2, amount * 1.5, 50000);
  const sliderPct = Math.min(100, (amount / maxAmount) * 100);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const pct = Math.max(0, Math.min(1, g.x0 && sliderW ? (g.moveX / sliderW) : 0));
        const val = Math.round((pct * maxAmount) / 100) * 100;
        setAmountStr(String(val));
      },
    })
  ).current;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    await onSubmit({
      category,
      amount,
      period,
      recurring,
      description: description.trim() || undefined,
      scope,
      goal_id: goalId,
    });
  };

  const createInlineGoal = async () => {
    if (!newGoalName.trim() || parseFloat(newGoalTarget) <= 0) return;
    try {
      setCreatingGoal(true);
      const res = await createGoal({
        name: newGoalName.trim(),
        target_amount: parseFloat(newGoalTarget),
        emoji: '🎯',
        color: COLORS.accent.brand,
      });
      setGoals(prev => [res.goal, ...prev]);
      setGoalId(res.goal.id);
      setShowNewGoal(false);
      setNewGoalName('');
      setNewGoalTarget('');
    } catch { /* silently fail — user can retry */ }
    finally { setCreatingGoal(false); }
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{editing ? 'Edit Budget' : 'Create Budget'}</Text>
          <Text style={s.subtitle}>Plan smarter, save better</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={14} style={s.closeBtn} testID="bs-close">
          <Ionicons name="close" size={20} color={c.text.muted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.accent.brand} />
        </View>
      ) : (
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Round 38 — over-limit warning, only when editing an existing
              budget that's already been overspent. Surfaces the gap in
              red so users see the urgency before tweaking the limit. */}
          {editing && typeof currentSpent === 'number' && currentSpent > editing.amount && (
            <View style={s.overLimitBanner} accessibilityLiveRegion="polite">
              <Ionicons name="warning" size={20} color={c.state.danger} />
              <View style={{ flex: 1 }}>
                <Text style={s.overLimitTitle}>You've exceeded this budget</Text>
                <Text style={s.overLimitBody}>
                  Spent ₹{fmt(currentSpent)} of ₹{fmt(editing.amount)} ·
                  <Text style={{ fontWeight: '900' }}> ₹{fmt(currentSpent - editing.amount)} over</Text>
                </Text>
              </View>
            </View>
          )}
          {/* 1. Smart Category Selector */}
          <Text style={s.label}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {(data?.categories || []).map(c => {
              const meta = CATEGORY_META[c.category] || CATEGORY_META.Other;
              const on = c.category === category;
              return (
                <TouchableOpacity
                  key={c.category}
                  onPress={() => { try { Haptics.selectionAsync(); } catch {} setCategory(c.category); }}
                  activeOpacity={0.88}
                  testID={`cat-${c.category}`}
                >
                  <View style={[
                    s.catChip,
                    on && { borderColor: meta.color, backgroundColor: meta.color + '12', shadowColor: meta.color, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
                  ]}>
                    <View style={s.catHead}>
                      <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
                      <Text style={[s.catName, on && { color: meta.color, fontWeight: '900' }]}>{c.category}</Text>
                    </View>
                    {c.last_month_spend > 0 ? (
                      <Text style={s.catMeta}>Last mo: ₹{fmtCompact(c.last_month_spend)}</Text>
                    ) : (
                      <Text style={s.catMeta}>No prior spend</Text>
                    )}
                    {c.recommended > 0 && (
                      <View style={[s.catRecPill, on && { backgroundColor: meta.color + '22' }]}>
                        <Ionicons name="sparkles" size={9} color={on ? meta.color : COLORS.text.muted} />
                        <Text style={[s.catRecTxt, on && { color: meta.color }]}>AI ₹{fmtCompact(c.recommended)}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 2. AI RECOMMENDATION BANNER */}
          {recommended > 0 && (
            <TouchableOpacity onPress={aiSet} activeOpacity={0.88} testID="ai-set">
              <LinearGradient colors={['#EEF2FF', '#EDE9FE']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.aiBanner}>
                <View style={s.aiEmojiPill}>
                  <Text style={{ fontSize: 18 }}>✨</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.aiTitle}>AI suggests ₹{fmt(recommended)}</Text>
                  <Text style={s.aiSub}>Based on 3-month spending · 10% savings nudge</Text>
                </View>
                <View style={s.aiCta}>
                  <Text style={s.aiCtaTxt}>Apply</Text>
                  <Ionicons name="arrow-forward" size={12} color={c.accent.tertiary} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* 3. AMOUNT DISPLAY */}
          <View style={s.amountCard}>
            <Text style={s.amountEyebrow}>BUDGET AMOUNT</Text>
            <View style={s.amountRow}>
              <Text style={s.amountRupee}>₹</Text>
              <TextInput
                value={amountStr}
                onChangeText={v => { setAmountStr(v.replace(/[^0-9]/g, '')); if (amountError) setAmountError(null); }}
                onBlur={() => validateAmountOnBlur(amountStr)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={c.border.subtle}
                style={s.amountInput}
                testID="bs-amount"
              />
            </View>
            {amountError && <Text style={{ color: COLORS.state.danger, fontSize: 12, fontWeight: '600', marginTop: 6 }}>{amountError}</Text>}
            {/* Quick presets */}
            <View style={s.presetRow}>
              {presets.map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => tapPreset(p)}
                  style={[s.presetChip, amount === p && s.presetChipOn]}
                  testID={`preset-${p}`}
                >
                  <Text style={[s.presetTxt, amount === p && { color: '#FFFFFF' }]}>₹{fmtCompact(p)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Slider */}
            <View
              style={s.sliderTrack}
              onLayout={(e) => setSliderW(e.nativeEvent.layout.width)}
              {...panResponder.panHandlers}
            >
              <LinearGradient colors={[COLORS.accent.secondary, COLORS.accent.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.sliderFill, { width: `${sliderPct}%` }]} />
              <View style={[s.sliderThumb, { left: `${Math.max(0, Math.min(95, sliderPct - 2))}%` }]} />
            </View>
            <View style={s.sliderLblRow}>
              <Text style={s.sliderLbl}>₹0</Text>
              <Text style={s.sliderLbl}>₹{fmtCompact(maxAmount)}</Text>
            </View>
          </View>

          {/* 4. IMPACT PREVIEW */}
          {amount > 0 && (
            <View style={s.impact}>
              <View style={s.impactRow}>
                <Text style={s.impactEmoji}>📊</Text>
                <Text style={s.impactTitle}>If you set ₹{fmt(amount)}:</Text>
              </View>
              <View style={s.impactGrid}>
                <View style={s.impactCell}>
                  <Text style={s.impactK}>{period === 'monthly' ? 'Per day' : period === 'weekly' ? 'Per day' : 'Period'}</Text>
                  <Text style={s.impactV}>₹{fmt(impact.daily)}</Text>
                </View>
                <View style={s.impactCell}>
                  <Text style={s.impactK}>Savings</Text>
                  <Text style={[s.impactV, { color: impact.savings > 0 ? COLORS.state.successAlt : COLORS.text.muted }]}>
                    ₹{fmt(impact.savings)}/mo
                  </Text>
                </View>
                <View style={s.impactCell}>
                  <Text style={s.impactK}>Risk</Text>
                  <View style={[s.riskPill, { backgroundColor: riskColor + '1A' }]}>
                    <View style={[s.riskDot, { backgroundColor: riskColor }]} />
                    <Text style={[s.riskTxt, { color: riskColor }]}>{riskLabel}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* 5. SMART ROLLOVER */}
          <View style={s.rolloverCard}>
            <View style={s.rolloverHead}>
              <View style={s.rolloverIcon}>
                <Ionicons name="refresh" size={16} color={COLORS.accent.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rolloverTitle}>Smart Rollover 🔁</Text>
                <Text style={s.rolloverSub}>Unused budget carries forward next {period === 'monthly' ? 'month' : period === 'weekly' ? 'week' : 'day'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setRecurring(!recurring); }}
                style={[s.toggle, recurring && s.toggleOn]}
                testID="bs-recurring"
              >
                <View style={[s.knob, recurring && s.knobOn]} />
              </TouchableOpacity>
            </View>
            <View style={s.rolloverOpts}>
              <TouchableOpacity
                style={[s.rolloverOpt, !recurring && s.rolloverOptOn]}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setRecurring(false); }}
              >
                <Ionicons name={!recurring ? 'radio-button-on' : 'radio-button-off'} size={14} color={!recurring ? COLORS.accent.brand : COLORS.text.muted} />
                <Text style={[s.rolloverOptTxt, !recurring && { color: COLORS.text.primary, fontWeight: '800' }]}>Reset monthly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.rolloverOpt, recurring && s.rolloverOptOn]}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setRecurring(true); }}
              >
                <Ionicons name={recurring ? 'radio-button-on' : 'radio-button-off'} size={14} color={recurring ? COLORS.accent.brand : COLORS.text.muted} />
                <Text style={[s.rolloverOptTxt, recurring && { color: COLORS.text.primary, fontWeight: '800' }]}>Carry forward</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 6. PERIOD — minimal */}
          <View style={s.periodRow}>
            <Text style={s.periodLbl}>Period:</Text>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setPeriod(p); }}
                style={[s.periodChip, period === p && s.periodChipOn]}
                testID={`period-${p}`}
              >
                <Text style={[s.periodTxt, period === p && { color: '#FFFFFF' }]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 7. CONTEXT */}
          <Text style={s.label}>BUDGET FOR</Text>
          <View style={s.scopeRow}>
            {[
              { id: 'me', label: 'Me', icon: 'person' },
              { id: 'shared', label: 'Shared', icon: 'people' },
              { id: 'other', label: 'Someone else', icon: 'person-add' },
            ].map((o) => (
              <TouchableOpacity
                key={o.id}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setScope(o.id as any); }}
                style={[s.scopeChip, scope === o.id && s.scopeChipOn]}
                testID={`scope-${o.id}`}
              >
                <Ionicons name={o.icon as any} size={14} color={scope === o.id ? '#FFFFFF' : COLORS.text.muted} />
                <Text style={[s.scopeTxt, scope === o.id && { color: '#FFFFFF' }]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 8. Description (Other only) */}
          {category === 'Other' && (
            <View style={s.otherDesc}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Ionicons name="sparkles" size={13} color={c.accent.tertiary} />
                <Text style={s.otherLbl}>AI will auto-categorise this</Text>
              </View>
              <TextInput
                placeholder="e.g. Monthly Netflix & Spotify"
                placeholderTextColor={c.text.muted}
                value={description}
                onChangeText={setDescription}
                style={s.descInput}
                multiline
              />
            </View>
          )}

          {/* 8.5 SAVINGS GOAL LINK (optional) */}
          <Text style={s.label}>SAVINGS GOAL (OPTIONAL)</Text>
          <View style={s.goalRow}>
            <TouchableOpacity
              style={[s.goalChip, !goalId && s.goalChipOn]}
              onPress={() => { try { Haptics.selectionAsync(); } catch {} setGoalId(null); }}
              testID="goal-none"
            >
              <Ionicons name="close-circle-outline" size={13} color={!goalId ? COLORS.text.primary : COLORS.text.muted} />
              <Text style={[s.goalTxt, !goalId && { color: COLORS.text.primary, fontWeight: '800' }]}>No goal</Text>
            </TouchableOpacity>
            {goals.map((g) => {
              const on = goalId === g.id;
              const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100)) : 0;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[s.goalChip, on && { borderColor: g.color || COLORS.accent.brand, backgroundColor: (g.color || COLORS.accent.brand) + '14' }]}
                  onPress={() => { try { Haptics.selectionAsync(); } catch {} setGoalId(g.id); }}
                  testID={`goal-${g.id}`}
                >
                  <Text style={{ fontSize: 14 }}>{g.emoji || '🎯'}</Text>
                  <View>
                    <Text style={[s.goalTxt, on && { color: g.color || COLORS.accent.brand, fontWeight: '900' }]} numberOfLines={1}>{g.name}</Text>
                    <Text style={s.goalProg}>{pct}% · ₹{fmtCompact(g.saved_amount)}/{fmtCompact(g.target_amount)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[s.goalChip, s.goalChipAdd]}
              onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowNewGoal(v => !v); }}
              testID="goal-add"
            >
              <Ionicons name="add-circle" size={14} color={COLORS.accent.brand} />
              <Text style={[s.goalTxt, { color: COLORS.accent.brand, fontWeight: '900' }]}>New goal</Text>
            </TouchableOpacity>
          </View>

          {showNewGoal && (
            <View style={s.goalForm}>
              <View style={s.goalFormRow}>
                <TextInput
                  placeholder="Goal name (e.g. Trip to Goa)"
                  placeholderTextColor={c.text.muted}
                  value={newGoalName}
                  onChangeText={setNewGoalName}
                  style={[s.goalFormInput, { flex: 2 }]}
                />
                <View style={s.goalTargetWrap}>
                  <Text style={s.goalRupee}>₹</Text>
                  <TextInput
                    placeholder="Target"
                    placeholderTextColor={c.text.muted}
                    value={newGoalTarget}
                    onChangeText={(v) => setNewGoalTarget(v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    style={[s.goalFormInput, { paddingLeft: 2 }]}
                  />
                </View>
              </View>
              <TouchableOpacity
                onPress={createInlineGoal}
                disabled={creatingGoal || !newGoalName.trim() || parseFloat(newGoalTarget) <= 0}
                style={[s.goalFormCta, (creatingGoal || !newGoalName.trim() || parseFloat(newGoalTarget) <= 0) && { opacity: 0.6 }]}
                testID="goal-create"
              >
                <Ionicons name="add-circle" size={14} color="#FFFFFF" />
                <Text style={s.goalFormCtaTxt}>{creatingGoal ? 'Creating…' : 'Create & link'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 9. Dynamic CTA */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.9}
            testID="bs-submit"
            style={{ marginTop: 24 }}
          >
            <LinearGradient
              colors={canSubmit ? [COLORS.accent.secondary, COLORS.accent.brand, COLORS.state.danger] : ['#D1D5DB', COLORS.text.muted]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[s.cta, canSubmit && s.ctaGlow]}
            >
              <Ionicons
                name={editing ? (ctaText.includes('Increase') ? 'trending-up' : ctaText.includes('Reduce') ? 'trending-down' : 'checkmark-circle') : 'add-circle'}
                size={20}
                color="#FFFFFF"
              />
              <Text style={s.ctaTxt}>{submitting ? 'Saving…' : !isOnline ? "Offline — can't save" : ctaText}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </BottomSheetScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.elevated, paddingHorizontal: 20, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '900', color: c.text.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: 12.5, color: c.text.muted, fontWeight: '600', marginTop: 3 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.gray[100], alignItems: 'center', justifyContent: 'center' },

  label: { fontSize: 10.5, fontWeight: '900', color: c.text.muted, letterSpacing: 1.2, marginTop: 18, marginBottom: 10 },

  // Category chip
  catChip: { width: 132, backgroundColor: c.bg.elevated, borderWidth: 1.5, borderColor: c.gray[200], borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catName: { fontSize: 12.5, fontWeight: '800', color: c.text.primary },
  catMeta: { fontSize: 10.5, color: c.gray[400], fontWeight: '600', marginTop: 1 },
  catRecPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: c.gray[100], alignSelf: 'flex-start', marginTop: 2 },
  catRecTxt: { fontSize: 9.5, fontWeight: '900', color: c.text.muted, letterSpacing: 0.2 },

  // AI banner
  aiBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, marginTop: 14 },
  aiEmojiPill: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { fontSize: 14, fontWeight: '900', color: '#4C1D95', letterSpacing: -0.1 },
  aiSub: { fontSize: 11, color: c.text.muted, fontWeight: '600', marginTop: 1 },
  aiCta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: c.bg.elevated },
  aiCtaTxt: { fontSize: 11, fontWeight: '900', color: '#7C3AED', letterSpacing: 0.2 },

  // Amount card
  amountCard: { backgroundColor: '#FFFBEB', borderRadius: 20, padding: 16, marginTop: 16, gap: 12, borderWidth: 1.5, borderColor: '#FDE68A' },
  amountEyebrow: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1.2, color: '#92400E' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  amountRupee: { fontSize: 40, fontWeight: '900', color: c.text.primary, letterSpacing: -1.5 },
  amountInput: { flex: 1, fontSize: 40, fontWeight: '900', color: c.text.primary, letterSpacing: -1.5, padding: 0 },
  // Round 38 — over-limit warning banner.
  overLimitBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.35)',
    borderWidth: 1, borderRadius: 12, padding: 12,
    marginBottom: 16,
  },
  overLimitTitle: { fontSize: 13, fontWeight: '900', color: c.state.danger, marginBottom: 2 },
  overLimitBody: { fontSize: 12, color: '#7F1D1D', lineHeight: 16 },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: '#FDE68A' },
  presetChipOn: { backgroundColor: c.accent.brand, borderColor: c.accent.brand },
  presetTxt: { fontSize: 12, fontWeight: '800', color: '#92400E' },

  sliderTrack: { height: 8, borderRadius: 4, backgroundColor: '#FEF3C7', position: 'relative', overflow: 'visible', marginTop: 4 },
  sliderFill: { height: '100%', borderRadius: 4 },
  sliderThumb: { position: 'absolute', top: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: c.bg.elevated, borderWidth: 3, borderColor: c.accent.brand, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  sliderLblRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  sliderLbl: { fontSize: 10, color: c.gray[400], fontWeight: '700' },

  // Impact
  impact: { backgroundColor: c.gray[50], borderRadius: 16, padding: 14, marginTop: 14, gap: 10 },
  impactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  impactEmoji: { fontSize: 15 },
  impactTitle: { fontSize: 13, fontWeight: '900', color: c.text.primary },
  impactGrid: { flexDirection: 'row', gap: 10 },
  impactCell: { flex: 1, backgroundColor: c.bg.elevated, borderRadius: 12, padding: 10, gap: 4 },
  impactK: { fontSize: 10, fontWeight: '900', color: c.text.muted, letterSpacing: 0.5 },
  impactV: { fontSize: 14, fontWeight: '900', color: c.text.primary },
  riskPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  riskDot: { width: 6, height: 6, borderRadius: 3 },
  riskTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },

  // Rollover
  rolloverCard: { backgroundColor: c.bg.elevated, borderRadius: 16, padding: 14, marginTop: 14, borderWidth: 1, borderColor: c.gray[100], gap: 10 },
  rolloverHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rolloverIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  rolloverTitle: { fontSize: 13.5, fontWeight: '900', color: c.text.primary },
  rolloverSub: { fontSize: 11, color: c.text.muted, fontWeight: '600', marginTop: 1 },
  toggle: { width: 42, height: 26, borderRadius: 13, backgroundColor: c.gray[200], padding: 3 },
  toggleOn: { backgroundColor: c.accent.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.bg.elevated, shadowColor: '#000000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  knobOn: { transform: [{ translateX: 16 }] },
  rolloverOpts: { flexDirection: 'row', gap: 8, marginTop: 2 },
  rolloverOpt: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: c.gray[50], borderWidth: 1, borderColor: c.gray[100] },
  rolloverOptOn: { backgroundColor: '#FEF3C7', borderColor: c.accent.secondary },
  rolloverOptTxt: { fontSize: 11.5, color: c.text.muted, fontWeight: '700' },

  // Period
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  periodLbl: { fontSize: 11, color: c.text.muted, fontWeight: '800', letterSpacing: 0.5 },
  periodChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: c.gray[100] },
  periodChipOn: { backgroundColor: c.text.primary },
  periodTxt: { fontSize: 11, color: c.text.muted, fontWeight: '800' },

  // Scope
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: c.gray[100] },
  scopeChipOn: { backgroundColor: c.text.primary },
  scopeTxt: { fontSize: 12, color: c.text.muted, fontWeight: '800' },

  // Other description
  otherDesc: { marginTop: 14, backgroundColor: '#F5F3FF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#DDD6FE' },
  otherLbl: { fontSize: 11, fontWeight: '800', color: '#7C3AED', letterSpacing: 0.3 },
  descInput: { minHeight: 44, fontSize: 13, color: c.text.primary, padding: 0 },

  // Goal
  goalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: c.gray[50], borderWidth: 1, borderColor: c.gray[200] },
  goalChipOn: { backgroundColor: c.gray[100], borderColor: c.text.primary },
  goalChipAdd: { backgroundColor: '#FEF3C7', borderColor: c.accent.secondary, borderStyle: 'dashed' },
  goalTxt: { fontSize: 11.5, color: c.text.muted, fontWeight: '700' },
  goalProg: { fontSize: 9.5, color: c.gray[400], fontWeight: '700', marginTop: 1 },
  // Round 51e — standardised New-Goal form spacing (label→input 8px,
  // between fields 24px). Increased internal padding so the form feels
  // breathable instead of cramped.
  goalForm: { marginTop: 12, padding: 16, backgroundColor: '#FFFBEB', borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', gap: 24 },
  goalFormRow: { flexDirection: 'row', gap: 24 },
  goalFormInput: { flex: 1, fontSize: 13, color: c.text.primary, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: c.bg.elevated, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', marginTop: 8 },
  goalTargetWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, backgroundColor: c.bg.elevated, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A' },
  goalRupee: { fontSize: 13, fontWeight: '900', color: '#92400E' },
  goalFormCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent.brand, paddingVertical: 10, borderRadius: 12 },
  goalFormCtaTxt: { fontSize: 12.5, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.3 },

  // CTA
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 999 },
  ctaGlow: { shadowColor: c.accent.brand, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  ctaTxt: { fontSize: 15.5, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.3 },
}));
