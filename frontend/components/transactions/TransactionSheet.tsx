/**
 * TransactionSheet.tsx — Round 65 minimalist redesign
 *
 * Mirrors the BudgetSmartSheet (Round 65) UX language:
 *   • Slim top bar (close X + InputMascot)
 *   • Eyebrow + conversational hero prompt
 *   • Income / Expense segmented toggle (the very first decision)
 *   • Auto-focused MASSIVE ₹ input as the single hero action
 *   • Quick-amount chips
 *   • Animated horizontal category chips with colored underline
 *   • Single ExpandableSection "More options" → description + (edit-only) delete
 *   • Sticky bottom CTA, dynamic per state
 *
 * State is fully internal. Callers wire only:
 *   - editing?:   the transaction being edited (or null for new)
 *   - submitting: while async save in flight
 *   - isOnline:   gates submit
 *   - onSubmit({ amount, category, description, type })
 *   - onClose()
 *   - onDelete(id)   // only invoked in edit mode
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Animated as RNAnimated, Easing as RNEasing, Platform,
  KeyboardAvoidingView, Modal,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, FadeIn,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, CATEGORIES, CATEGORY_LIST, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { ExpandableSection, InputMascot, SegmentedToggle } from '../primitives';

export type TxnFormPayload = {
  amount: number;
  category: string;
  description: string;
  type: 'debit' | 'credit';
};

type Props = {
  visible: boolean;
  editing?: { id: string; amount: number; category: string; description: string; type: 'debit' | 'credit' } | null;
  // Round 68 — initialType lets the caller open the sheet pre-set to a
  // particular transaction type (used by the deeplink `?openAdd=1&type=credit`).
  // Ignored when `editing` is provided (edit mode honours editing.type).
  initialType?: 'debit' | 'credit';
  submitting?: boolean;
  isOnline?: boolean;
  onSubmit: (payload: TxnFormPayload) => Promise<void> | void;
  onClose: () => void;
  onDelete?: (id: string) => void;
};

// Category chip with smooth spring underline (mirrors BudgetSmartSheet)
function CategoryChip({
  label, color, icon, active, onPress,
}: {
  label: string;
  color: string;
  icon: string;
  active: boolean;
  onPress: () => void;
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
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={chipS.wrap} testID={`txn-cat-${label}`}>
      <Animated.View style={[chipS.row, txt]}>
        <Ionicons name={icon as any} size={15} color={active ? color : COLORS.text.muted} />
        <Text style={[chipS.label, active && { color: color, fontWeight: '900' }]}>{label}</Text>
      </Animated.View>
      <Animated.View style={[chipS.underline, underline]} />
    </TouchableOpacity>
  );
}

const chipS = StyleSheet.create({
  wrap: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6, alignItems: 'center', minWidth: 78 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted, letterSpacing: -0.1 },
  underline: { height: 2.5, borderRadius: 2, marginTop: 8 },
});

const QUICK_AMOUNTS_DEBIT  = [100, 250, 500, 1000, 2000, 5000];
const QUICK_AMOUNTS_CREDIT = [500, 1000, 5000, 10000, 25000, 50000];

function fmt(n: number) {
  if (!n) return '0';
  return Math.round(n).toLocaleString('en-IN');
}
function fmtCompact(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

export default function TransactionSheet({
  visible, editing, initialType, submitting, isOnline = true, onSubmit, onClose, onDelete,
}: Props) {
  const s = useStyles();
  const c = useAppColors();
  const inputRef = useRef<TextInput | null>(null);

  const [type, setType] = useState<'debit' | 'credit'>(editing?.type || initialType || 'debit');
  const [amountStr, setAmountStr] = useState<string>(editing?.amount ? String(editing.amount) : '');
  const [category, setCategory] = useState<string>(editing?.category || (initialType === 'credit' ? 'Other' : 'Food'));
  const [description, setDescription] = useState<string>(editing?.description || '');
  const [amountError, setAmountError] = useState<string | null>(null);

  // Reset on open / when switching between edit and add
  useEffect(() => {
    if (visible) {
      setType(editing?.type || initialType || 'debit');
      setAmountStr(editing?.amount ? String(editing.amount) : '');
      setCategory(editing?.category || (initialType === 'credit' ? 'Other' : 'Food'));
      setDescription(editing?.description || '');
      setAmountError(null);
      const t = setTimeout(() => { inputRef.current?.focus?.(); }, 280);
      return () => clearTimeout(t);
    }
  }, [visible, editing, initialType]);

  const amount = useMemo(() => parseFloat(amountStr) || 0, [amountStr]);

  const meta = CATEGORIES[category] || CATEGORIES.Other;
  const accent = type === 'credit' ? COLORS.accent.moneyIn : meta.color;

  // Bounce micro-interaction on amount change
  const tickAnim = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    RNAnimated.sequence([
      RNAnimated.timing(tickAnim, { toValue: 1.03, duration: 90, useNativeDriver: true, easing: RNEasing.out(RNEasing.quad) }),
      RNAnimated.timing(tickAnim, { toValue: 1, duration: 140, useNativeDriver: true, easing: RNEasing.inOut(RNEasing.quad) }),
    ]).start();
  }, [amountStr, tickAnim]);

  const validate = (raw: string) => {
    const v = (raw || '').trim();
    if (!v) { setAmountError('Amount is required'); return false; }
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) { setAmountError('Enter an amount greater than 0'); return false; }
    if (n > 10_000_000) { setAmountError('Amount too large (max ₹1cr)'); return false; }
    setAmountError(null);
    return true;
  };

  const presets = type === 'credit' ? QUICK_AMOUNTS_CREDIT : QUICK_AMOUNTS_DEBIT;

  const ctaText = useMemo(() => {
    if (editing) return 'Save Changes';
    if (amount > 0) return type === 'credit' ? `Add ₹${fmt(amount)} income` : `Add ₹${fmt(amount)} expense`;
    return type === 'credit' ? 'Add Income' : 'Add Expense';
  }, [editing, amount, type]);

  const heroPrompt = useMemo(() => {
    if (editing) return 'Editing your transaction';
    return type === 'credit' ? 'How much did you receive?' : 'How much did you spend?';
  }, [editing, type]);

  const canSubmit = amount > 0 && !submitting && isOnline && !amountError;

  const handleSubmit = async () => {
    if (!validate(amountStr)) return;
    if (!canSubmit) return;
    try { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    await onSubmit({
      amount,
      category,
      description: description.trim(),
      type,
    });
  };

  const handleQuickAmount = (n: number) => {
    try { Haptics.selectionAsync(); } catch {}
    setAmountStr(String(n));
    if (amountError) setAmountError(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.modalBg}
      >
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={s.scrim} />
        <View style={s.sheet}>
          <View style={s.handleBar} />

          {/* ── 1. Slim top bar ─────────────────────────── */}
          <View style={s.topBar}>
            <TouchableOpacity onPress={onClose} hitSlop={14} style={s.closeBtn} testID="txn-close">
              <Ionicons name="close" size={22} color={c.text.primary} />
            </TouchableOpacity>
            <InputMascot
              phase={amountError ? 'error' : amount > 0 ? 'success' : 'idle'}
              size={36}
              position="inline"
            />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
          >
            {/* ── 2. Eyebrow + hero prompt ──────────────── */}
            <Animated.View entering={FadeIn.duration(220)}>
              <Text style={s.eyebrow}>{editing ? 'EDITING' : type === 'credit' ? 'NEW INCOME' : 'NEW EXPENSE'}</Text>
              <Text style={s.hero}>{heroPrompt}</Text>
            </Animated.View>

            {/* ── 3. Income / Expense toggle ────────────── */}
            <View style={{ marginTop: 18 }}>
              <SegmentedToggle
                options={[
                  { id: 'debit',  label: 'Expense',
                    icon: <Ionicons name="arrow-up-circle" size={15} color={type === 'debit' ? COLORS.text.primary : COLORS.text.muted} /> },
                  { id: 'credit', label: 'Income',
                    icon: <Ionicons name="arrow-down-circle" size={15} color={type === 'credit' ? COLORS.text.primary : COLORS.text.muted} /> },
                ]}
                value={type}
                onChange={(id) => { setType(id as 'debit' | 'credit'); }}
                fullWidth
              />
            </View>

            {/* ── 4. Hero amount input ──────────────────── */}
            <RNAnimated.View style={[s.amountWrap, { transform: [{ scale: tickAnim }] }]}>
              <Text style={s.rupee}>₹</Text>
              <TextInput
                ref={inputRef}
                value={amountStr}
                onChangeText={(v) => { setAmountStr(v.replace(/[^0-9.]/g, '')); if (amountError) setAmountError(null); }}
                onBlur={() => validate(amountStr)}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={c.gray[300]}
                style={s.amountInput}
                testID="txn-amount"
                autoFocus={Platform.OS !== 'web'}
                selectionColor={accent}
              />
            </RNAnimated.View>
            {amountError ? (
              <Animated.Text entering={FadeIn} style={s.errorTxt}>{amountError}</Animated.Text>
            ) : (
              <View style={{ height: 18 }} />
            )}

            {/* ── 5. Quick amount chips ─────────────────── */}
            <View style={s.quickRow}>
              {presets.map(p => {
                const on = amount === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => handleQuickAmount(p)}
                    activeOpacity={0.78}
                    style={[s.quickChip, on && { backgroundColor: accent, borderColor: accent }]}
                    testID={`txn-preset-${p}`}
                  >
                    <Text style={[s.quickTxt, on && { color: '#FFFFFF', fontWeight: '900' }]}>₹{fmtCompact(p)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── 6. Animated category chips ────────────── */}
            <Text style={s.sectLbl}>CATEGORY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.catStrip}
              style={{ marginHorizontal: -20 }}
            >
              {CATEGORY_LIST.map((cat) => {
                const m = CATEGORIES[cat] || CATEGORIES.Other;
                return (
                  <CategoryChip
                    key={cat}
                    label={cat}
                    color={m.color}
                    icon={m.icon}
                    active={cat === category}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setCategory(cat);
                    }}
                  />
                );
              })}
            </ScrollView>

            {/* ── 7. ExpandableSection: description + (edit-only) delete ── */}
            <View style={{ marginTop: 22 }}>
              <ExpandableSection
                title="More options"
                subtitle={editing ? 'Note, delete' : 'Add a note'}
                icon="options-outline"
              >
                <Text style={s.sectLbl}>NOTE</Text>
                <TextInput
                  placeholder="e.g. Lunch at restaurant"
                  placeholderTextColor={c.text.muted}
                  value={description}
                  onChangeText={setDescription}
                  style={s.descInput}
                  multiline
                />
                {editing && onDelete && (
                  <TouchableOpacity
                    onPress={() => onDelete(editing.id)}
                    style={s.deleteRow}
                    activeOpacity={0.7}
                    testID="txn-delete"
                  >
                    <Ionicons name="trash-outline" size={16} color={c.state.danger} />
                    <Text style={s.deleteTxt}>Delete this transaction</Text>
                  </TouchableOpacity>
                )}
              </ExpandableSection>
            </View>
          </ScrollView>

          {/* ── 8. Sticky bottom CTA ─────────────────────── */}
          <View style={s.ctaBar} pointerEvents="box-none">
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.9}
              testID="txn-submit"
            >
              <View
                style={[s.cta, canSubmit && { shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5, backgroundColor: '#0A0A0A' }]}>
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
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  scrim: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: c.bg.elevated,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '92%',
    minHeight: '70%',
  },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.gray[200], alignSelf: 'center', marginBottom: 4 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },

  // Hero
  eyebrow: { marginTop: 8, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.4, color: c.text.muted },
  hero: { marginTop: 4, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, color: c.text.primary, lineHeight: 32 },

  // Hero amount
  amountWrap: { marginTop: 26, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  rupee: { fontSize: 44, fontWeight: '300', color: c.text.muted, letterSpacing: -1, marginRight: 4 },
  amountInput: { fontSize: 60, fontWeight: '900', color: c.text.primary, letterSpacing: -2.4, padding: 0, minWidth: 80, textAlign: 'left' },
  errorTxt: { textAlign: 'center', color: c.state.danger, fontSize: 12, fontWeight: '700', marginTop: 6, marginBottom: 4 },

  // Quick chips
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.gray[200] },
  quickTxt: { fontSize: 13, fontWeight: '700', color: c.text.primary },

  // Section labels
  sectLbl: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2, color: c.text.muted, marginTop: 22, marginBottom: 10 },

  // Category strip
  catStrip: { paddingHorizontal: 20, gap: 4 },

  // Description
  descInput: { minHeight: 44, fontSize: 13.5, color: c.text.primary, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.gray[50], borderRadius: 0 },

  // Delete (in edit mode)
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: 'rgba(220,38,38,0.06)', borderRadius: 0 },
  deleteTxt: { fontSize: 13, fontWeight: '800', color: c.state.danger },

  // Sticky CTA
  ctaBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    backgroundColor: c.bg.elevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.gray[100],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 0 },
  ctaTxt: { fontSize: 15.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.2 },
}));
