/**
 * BudgetSmartSheet.tsx — Round 65 redesign
 *
 * Modern fintech UX with a single primary action: enter the amount.
 *
 *   • Slim header row: close X + tiny Mintu mascot
 *   • Conversational hero prompt
 *   • Horizontal animated category chips (active chip uses Reanimated
 *     spring underline)
 *   • Auto-focused HERO ₹ input (the primary action)
 *   • AI suggestion as a single subtle pill (one-tap apply)
 *   • Quick-amount chip row
 *   • ALL secondary options collapsed into a single ExpandableSection
 *     ("More options"): period, rollover, scope, goals, description
 *   • Sticky full-width bottom CTA
 *
 * Design intent (light theme, soft elevation, minimal borders):
 *   – No heavy cards. Sections separate via spacing only.
 *   – Strong vertical hierarchy: prompt → chips → amount → AI → quick
 *   – Progressive disclosure for everything else.
 *
 * Backend contract unchanged: still POSTs the same payload shape
 * via onSubmit (category, amount, period, recurring, description?,
 * scope?, goal_id?).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Animated as RNAnimated, Easing as RNEasing, Platform, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, FadeIn, FadeOut,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { haptic as h } from '../../utils/haptics';
import api from '../../utils/api';
import { fetchGoals, createGoal, Goal } from '../../services/goals';
import { useIsOnline } from '../../hooks/useIsOnline';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, useAppColors } from '../../utils/theme';
import { ExpandableSection, InputMascot } from '../primitives';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  kavRoot: { flex: 1 },
  container: { flex: 1, backgroundColor: c.bg.elevated, paddingHorizontal: 20, paddingTop: 8 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },

  loadingWrap: { paddingVertical: 80, alignItems: 'center' },

  // Hero
  eyebrow: { marginTop: 8, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.4, color: c.text.muted },
  hero: { marginTop: 4, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, color: c.text.primary, lineHeight: 32 },

  // Category strip
  catStrip: { paddingHorizontal: 20, gap: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.gray[100], marginHorizontal: -20, marginTop: 4 },

  // Warn (over-limit)
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: -4 },
  warnTxt: { fontSize: 12, color: '#7F1D1D', fontWeight: '600' },

  // Amount hero
  amountWrap: { marginTop: 30, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  rupee: { fontSize: 44, fontWeight: '300', color: c.text.muted, letterSpacing: -1, marginRight: 4 },
  amountInput: { fontSize: 64, fontWeight: '900', color: c.text.primary, letterSpacing: -2.4, padding: 0, minWidth: 80, textAlign: 'left' },
  dailyHint: { textAlign: 'center', fontSize: 12, color: c.text.muted, fontWeight: '600', marginTop: 6 },
  errorTxt: { textAlign: 'center', color: c.state.danger, fontSize: 12, fontWeight: '700', marginTop: 6 },

  // Quick chips
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 18, flexWrap: 'wrap' },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 0, backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.gray[200] },
  quickTxt: { fontSize: 13, fontWeight: '700', color: c.text.primary },

  // AI pill
  aiPill: {
    marginTop: 18, marginHorizontal: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#FAFAFB',
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.gray[100],
  },
  aiPillTxt: { flex: 1, fontSize: 12.5, color: c.text.muted, fontWeight: '600' },
  aiPillCta: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.text.primary, borderRadius: 0 },
  aiPillCtaTxt: { fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 },

  // Section labels (inside ExpandableSection)
  sectLbl: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2, color: c.text.muted, marginBottom: 10 },

  // Segmented row (period & scope)
  segRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  seg: { flex: 1, minWidth: 78, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 0, backgroundColor: c.gray[50], alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: c.text.primary },
  segTxt: { fontSize: 12.5, fontWeight: '700', color: c.text.muted },
  segTxtOn: { color: '#FFFFFF' },

  // Toggle row (rollover)
  kvRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kvK: { fontSize: 13.5, fontWeight: '800', color: c.text.primary },
  kvV: { fontSize: 11.5, color: c.text.muted, fontWeight: '600', marginTop: 2 },
  toggle: { width: 42, height: 26, borderRadius: 0, backgroundColor: c.gray[200], padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 0, backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },

  // Description input
  descInput: { minHeight: 44, fontSize: 13.5, color: c.text.primary, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.gray[50], borderRadius: 0 },

  // Goals chips
  goalChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 0, backgroundColor: c.gray[50], borderWidth: 1, borderColor: c.gray[100] },
  goalChipOn: { backgroundColor: c.gray[100], borderColor: c.text.primary },
  goalTxt: { fontSize: 12, color: c.text.muted, fontWeight: '700' },

  // Sticky CTA
  ctaBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    backgroundColor: c.bg.elevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.gray[100],
  },
  ctaBtnTouch: {},
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 0 },
  ctaTxt: { fontSize: 15.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.2 },
}));

const CATEGORY_META: Record<string, { color: string; emoji: string }> = {
  Food:           { color: COLORS.accent.brand,        emoji: '🍔' },
  Transport:      { color: '#3B82F6',                  emoji: '🚗' },
  Shopping:       { color: '#EC4899',                  emoji: '🛍️' },
  Entertainment:  { color: '#8B5CF6',                  emoji: '🎬' },
  Bills:          { color: COLORS.state.danger,        emoji: '💡' },
  Health:         { color: COLORS.state.successAlt,    emoji: '💊' },
  Travel:         { color: '#06B6D4',                  emoji: '✈️' },
  Groceries:      { color: '#65A30D',                  emoji: '🛒' },
  Education:      { color: '#2563EB',                  emoji: '📚' },
  Other:          { color: COLORS.text.muted,          emoji: '✨' },
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
  editing?: {
    id: string;
    category: string;
    amount: number;
    period: 'daily' | 'weekly' | 'monthly';
    recurring: boolean;
    description?: string;
    goal_id?: string | null;
  } | null;
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

// Animated category chip — active state lifts into bold colored
// underline via reanimated spring (clean micro-interaction).
function CategoryChip({
  label, emoji, color, active, onPress,
}: {
  label: string; emoji: string; color: string; active: boolean; onPress: () => void;
}) {
  const u = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    u.value = withSpring(active ? 1 : 0, { damping: 18, stiffness: 240 });
  }, [active, u]);

  const underline = useAnimatedStyle(() => ({
    width: `${u.value * 100}%`,
    backgroundColor: color,
    opacity: u.value,
  }));
  const txt = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + u.value * 0.04 }],
  }));

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={chipS.wrap} testID={`cat-${label}`}>
      <Animated.View style={[chipS.row, txt]}>
        <Text style={chipS.emoji}>{emoji}</Text>
        <Text style={[chipS.label, active && { color: color, fontWeight: '900' }]}>{label}</Text>
      </Animated.View>
      <Animated.View style={[chipS.underline, underline]} />
    </TouchableOpacity>
  );
}

const chipS = StyleSheet.create({
  wrap: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6, alignItems: 'center', minWidth: 72 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 16 },
  label: { fontSize: 13.5, fontWeight: '700', color: COLORS.text.muted, letterSpacing: -0.1 },
  underline: { height: 2.5, borderRadius: 2, marginTop: 8 },
});

export default function BudgetSmartSheet({ editing, currentSpent, onSubmit, onClose, submitting }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const isOnline = useIsOnline();
  const inputRef = useRef<TextInput | null>(null);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ monthly_income: number; categories: SmartCategory[] } | null>(null);
  const [category, setCategory] = useState<string>(editing?.category || 'Food');
  const [amountStr, setAmountStr] = useState<string>(editing?.amount ? String(editing.amount) : '');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>(editing?.period || 'monthly');
  const [recurring, setRecurring] = useState<boolean>(editing?.recurring ?? true);
  const [description, setDescription] = useState<string>(editing?.description || '');
  const [scope, setScope] = useState<'me' | 'shared' | 'other'>('me');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState<string | null>(editing?.goal_id || null);

  const validateAmountOnBlur = (raw: string) => {
    const v = (raw || '').trim();
    if (!v) { setAmountError(null); return; }
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) { setAmountError('Enter an amount greater than 0'); return; }
    if (n > 10_000_000) { setAmountError('Amount too large (max ₹1cr)'); return; }
    setAmountError(null);
  };

  const amount = useMemo(() => parseFloat(amountStr) || 0, [amountStr]);
  const originalAmount = editing?.amount || 0;

  // Auto-focus the amount input ~250ms after mount (so the bottom-sheet
  // animation completes first; otherwise keyboard fights the entry).
  useEffect(() => {
    const t = setTimeout(() => { inputRef.current?.focus?.(); }, 280);
    return () => clearTimeout(t);
  }, []);

  // Static category fallback so the form ALWAYS renders quickly.
  const STATIC_CATEGORIES: SmartCategory[] = useMemo(() => (
    Object.keys(CATEGORY_META).map((cat) => ({
      category: cat, last_month_spend: 0, three_month_avg: 0, recommended: 0,
      risk_level: 'low' as const, preset_amounts: [500, 1000, 2000, 5000], existing_budget: null,
    }))
  ), []);

  useEffect(() => {
    let mounted = true; let resolved = false;
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
        resolved = true; clearTimeout(deadline);
        const apiCats: SmartCategory[] = Array.isArray(r.data?.categories) ? r.data.categories : [];
        const byName: Record<string, SmartCategory> = {};
        for (const c of STATIC_CATEGORIES) byName[c.category] = c;
        for (const c of apiCats) byName[c.category] = c;
        setData({ monthly_income: r.data?.monthly_income || 0, categories: Object.values(byName) });
      } catch {
        if (!mounted || resolved) return;
        resolved = true; clearTimeout(deadline);
        setData({ monthly_income: 0, categories: STATIC_CATEGORIES });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    (async () => { try { const g = await fetchGoals(); if (mounted) setGoals(g.goals || []); } catch {} })();

    return () => { mounted = false; clearTimeout(deadline); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentCat = useMemo(
    () => data?.categories.find(c => c.category === category),
    [data, category]
  );
  const presets: number[] = currentCat?.preset_amounts || [500, 1000, 2000, 5000];
  const recommended = currentCat?.recommended || 0;
  const lastMonth = currentCat?.last_month_spend || 0;
  const meta = CATEGORY_META[category] || CATEGORY_META.Other;

  // Number ticker — gentle bounce when amount changes
  const tickAnim = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    RNAnimated.sequence([
      RNAnimated.timing(tickAnim, { toValue: 1.03, duration: 90, useNativeDriver: true, easing: RNEasing.out(RNEasing.quad) }),
      RNAnimated.timing(tickAnim, { toValue: 1, duration: 140, useNativeDriver: true, easing: RNEasing.inOut(RNEasing.quad) }),
    ]).start();
  }, [amountStr, tickAnim]);

  const ctaText = useMemo(() => {
    if (!editing) return amount > 0 ? `Create ${category} budget` : 'Create Budget';
    if (amount > originalAmount * 1.05) return 'Increase Budget';
    if (amount < originalAmount * 0.95) return 'Reduce Budget';
    return 'Save Changes';
  }, [editing, amount, originalAmount, category]);

  const canSubmit = amount > 0 && !submitting && isOnline && !amountError;

  const aiSet = () => {
    if (!recommended) return;
    if (Platform.OS !== 'web') h.tap();
    setAmountStr(String(recommended));
  };

  const tapPreset = (n: number) => {
    try { h.select(); } catch {}
    setAmountStr(String(n));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try { if (Platform.OS !== 'web') h.press(); } catch {}
    await onSubmit({
      category, amount, period, recurring,
      description: description.trim() || undefined,
      scope,
      goal_id: goalId,
    });
  };

  // Daily-equivalent helper for the subtle hint line under the amount
  const dailyHint = useMemo(() => {
    if (!amount) return null;
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    if (period === 'daily') return null;
    return `≈ ₹${fmt(amount / days)} / day`;
  }, [amount, period]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.kavRoot}
    >
      <View style={s.container}>
        {/* ── 1. Slim top row ─────────────────────────────── */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={14} style={s.closeBtn} testID="bs-close">
            <Ionicons name="close" size={22} color={c.text.primary} />
          </TouchableOpacity>
          <InputMascot
            phase={amountError ? 'error' : amount > 0 ? 'success' : 'idle'}
            size={36}
            position="inline"
          />
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={COLORS.accent.brand} />
          </View>
        ) : (
          <BottomSheetScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
          >
            {/* ── 2. Conversational hero prompt ────────────── */}
            <Animated.View entering={FadeIn.duration(220)}>
              <Text style={s.eyebrow}>{editing ? 'EDITING' : 'NEW BUDGET'}</Text>
              <Text style={s.hero}>
                {editing ? 'Tweak your budget' : "How much for"}
                {!editing && (
                  <Text style={[s.hero, { color: meta.color }]}>{` ${category}?`}</Text>
                )}
              </Text>
            </Animated.View>

            {/* ── 3. Animated category chips (no card borders) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.catStrip}
              style={{ marginTop: 18, marginHorizontal: -20 }}
            >
              {(data?.categories || []).map(cc => {
                const m = CATEGORY_META[cc.category] || CATEGORY_META.Other;
                return (
                  <CategoryChip
                    key={cc.category}
                    label={cc.category}
                    emoji={m.emoji}
                    color={m.color}
                    active={cc.category === category}
                    onPress={() => {
                      try { h.select(); } catch {}
                      setCategory(cc.category);
                    }}
                  />
                );
              })}
            </ScrollView>

            <View style={s.divider} />

            {/* ── 4. Hero amount input ───────────────────────── */}
            {editing && typeof currentSpent === 'number' && currentSpent > editing.amount && (
              <Animated.View entering={FadeIn} style={s.warnRow}>
                <Ionicons name="warning" size={14} color={c.state.danger} />
                <Text style={s.warnTxt}>
                  Spent ₹{fmt(currentSpent)} of ₹{fmt(editing.amount)} —{' '}
                  <Text style={{ fontWeight: '900' }}>₹{fmt(currentSpent - editing.amount)} over</Text>
                </Text>
              </Animated.View>
            )}

            <RNAnimated.View style={[s.amountWrap, { transform: [{ scale: tickAnim }] }]}>
              <Text style={s.rupee}>₹</Text>
              <TextInput
                ref={inputRef}
                value={amountStr}
                onChangeText={(v) => { setAmountStr(v.replace(/[^0-9]/g, '')); if (amountError) setAmountError(null); }}
                onBlur={() => validateAmountOnBlur(amountStr)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={c.gray[300]}
                style={s.amountInput}
                testID="bs-amount"
                autoFocus={Platform.OS !== 'web'}
                selectionColor={meta.color}
              />
            </RNAnimated.View>

            {/* Daily-equivalent hint */}
            {dailyHint ? (
              <Text style={s.dailyHint}>{dailyHint}</Text>
            ) : (
              <View style={{ height: 18 }} />
            )}

            {amountError ? (
              <Animated.Text entering={FadeIn} exiting={FadeOut} style={s.errorTxt}>{amountError}</Animated.Text>
            ) : null}

            {/* ── 5. Quick-amount chips (single subtle row) ─── */}
            <View style={s.quickRow}>
              {presets.map(p => {
                const on = amount === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => tapPreset(p)}
                    activeOpacity={0.78}
                    style={[s.quickChip, on && { backgroundColor: meta.color, borderColor: meta.color }]}
                    testID={`preset-${p}`}
                  >
                    <Text style={[s.quickTxt, on && { color: '#FFFFFF', fontWeight: '900' }]}>₹{fmtCompact(p)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── 6. AI suggestion (subtle pill) ─────────────── */}
            {recommended > 0 && amount !== recommended && (
              <Animated.View entering={FadeIn.duration(280)}>
                <TouchableOpacity onPress={aiSet} activeOpacity={0.85} style={s.aiPill} testID="ai-set">
                  <Ionicons name="sparkles" size={14} color={COLORS.accent.brand} />
                  <Text style={s.aiPillTxt}>
                    Mintu suggests{' '}
                    <Text style={{ fontWeight: '900', color: COLORS.text.primary }}>₹{fmt(recommended)}</Text>
                    {lastMonth > 0 ? ` · last month ₹${fmtCompact(lastMonth)}` : ''}
                  </Text>
                  <View style={s.aiPillCta}>
                    <Text style={s.aiPillCtaTxt}>Apply</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── 7. ALL secondary options collapsed ──────────── */}
            <View style={{ marginTop: 22 }}>
              <ExpandableSection title="More options" subtitle="Period, rollover, sharing, savings goal" icon="options-outline">
                {/* Period */}
                <Text style={s.sectLbl}>PERIOD</Text>
                <View style={s.segRow}>
                  {PERIODS.map(p => {
                    const on = period === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[s.seg, on && s.segOn]}
                        onPress={() => { try { h.select(); } catch {} setPeriod(p); }}
                        testID={`period-${p}`}
                      >
                        <Text style={[s.segTxt, on && s.segTxtOn]}>{p[0].toUpperCase() + p.slice(1)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Rollover */}
                <View style={[s.kvRow, { marginTop: 18 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.kvK}>Smart rollover</Text>
                    <Text style={s.kvV}>Carry unused budget to next {period === 'monthly' ? 'month' : period === 'weekly' ? 'week' : 'day'}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { try { h.select(); } catch {} setRecurring(!recurring); }}
                    style={[s.toggle, recurring && { backgroundColor: meta.color }]}
                    testID="bs-recurring"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: recurring }}
                  >
                    <View style={[s.knob, recurring && { transform: [{ translateX: 16 }] }]} />
                  </TouchableOpacity>
                </View>

                {/* Scope */}
                <Text style={[s.sectLbl, { marginTop: 18 }]}>BUDGET FOR</Text>
                <View style={s.segRow}>
                  {([
                    { id: 'me', label: 'Me', icon: 'person-outline' },
                    { id: 'shared', label: 'Shared', icon: 'people-outline' },
                    { id: 'other', label: 'Someone else', icon: 'person-add-outline' },
                  ] as const).map((o) => {
                    const on = scope === o.id;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        onPress={() => { try { h.select(); } catch {} setScope(o.id); }}
                        style={[s.seg, on && s.segOn, { flexDirection: 'row', gap: 6 }]}
                        testID={`scope-${o.id}`}
                      >
                        <Ionicons name={o.icon as any} size={14} color={on ? '#FFFFFF' : c.text.muted} />
                        <Text style={[s.segTxt, on && s.segTxtOn]}>{o.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Description (Other only) */}
                {category === 'Other' && (
                  <View style={{ marginTop: 18 }}>
                    <Text style={s.sectLbl}>WHAT IS THIS FOR?</Text>
                    <TextInput
                      placeholder="e.g. Monthly subscriptions"
                      placeholderTextColor={c.text.muted}
                      value={description}
                      onChangeText={setDescription}
                      style={s.descInput}
                      multiline
                    />
                  </View>
                )}

                {/* Goals */}
                {goals.length > 0 && (
                  <View style={{ marginTop: 18 }}>
                    <Text style={s.sectLbl}>LINK TO GOAL</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                      <TouchableOpacity
                        style={[s.goalChip, !goalId && s.goalChipOn]}
                        onPress={() => { try { h.select(); } catch {} setGoalId(null); }}
                        testID="goal-none"
                      >
                        <Text style={[s.goalTxt, !goalId && { color: c.text.primary, fontWeight: '900' }]}>No goal</Text>
                      </TouchableOpacity>
                      {goals.map((g) => {
                        const on = goalId === g.id;
                        return (
                          <TouchableOpacity
                            key={g.id}
                            style={[s.goalChip, on && { borderColor: g.color || meta.color, backgroundColor: (g.color || meta.color) + '14' }]}
                            onPress={() => { try { h.select(); } catch {} setGoalId(g.id); }}
                            testID={`goal-${g.id}`}
                          >
                            <Text style={{ fontSize: 14 }}>{g.emoji || '🎯'}</Text>
                            <Text style={[s.goalTxt, on && { color: g.color || meta.color, fontWeight: '900' }]} numberOfLines={1}>{g.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </ExpandableSection>
            </View>
          </BottomSheetScrollView>
        )}

        {/* ── 8. Sticky bottom CTA ─────────────────────────── */}
        <View style={s.ctaBar} pointerEvents="box-none">
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.9}
            testID="bs-submit"
            style={s.ctaBtnTouch}
          >
            <View
              style={[s.cta, canSubmit && { shadowColor: meta.color, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5, backgroundColor: '#0A0A0A' }]}>
              <Text style={s.ctaTxt}>
                {submitting ? 'Saving…' : !isOnline ? "Offline — can't save" : ctaText}
              </Text>
              {canSubmit && !submitting ? (
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

