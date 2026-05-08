/**
 * GoalSheet.tsx — Round 65 minimalist redesign
 *
 * Bottom-sheet modal for creating / editing a savings goal. Mirrors
 * the BudgetSmartSheet + TransactionSheet UX language:
 *
 *   • Slim top bar (close X + InputMascot)
 *   • Eyebrow + conversational hero prompt
 *   • Auto-focused MASSIVE ₹ target input as the hero action
 *   • Goal name field (still primary — a goal NEEDS a name)
 *   • Quick-amount chips (goals span ₹10K → ₹5L)
 *   • Animated emoji picker (single horizontal row)
 *   • Single ExpandableSection "More options" → already-saved + color
 *   • Sticky bottom CTA, dynamic per state
 *
 * Pure component. Caller wires:
 *   - editing?: the Goal being edited (or null for new)
 *   - submitting / isOnline / onSubmit / onClose
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Animated as RNAnimated, Easing as RNEasing, Platform,
  KeyboardAvoidingView, Modal, ActivityIndicator,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { ExpandableSection, InputMascot } from '../primitives';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  scrim: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: c.bg.elevated,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    paddingHorizontal: 20, paddingTop: 8,
    maxHeight: '92%', minHeight: '70%',
  },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.gray[200], alignSelf: 'center', marginBottom: 4 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },

  eyebrow: { marginTop: 8, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.4, color: c.text.muted },
  hero: { marginTop: 4, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, color: c.text.primary, lineHeight: 32 },

  // Name row (emoji + input)
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: c.gray[50], borderRadius: 0 },
  emojiSmall: { fontSize: 22 },
  nameInput: { flex: 1, fontSize: 16, fontWeight: '700', color: c.text.primary, padding: 0 },

  // Hero amount
  amountWrap: { marginTop: 26, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  rupee: { fontSize: 44, fontWeight: '300', color: c.text.muted, letterSpacing: -1, marginRight: 4 },
  amountInput: { fontSize: 60, fontWeight: '900', color: c.text.primary, letterSpacing: -2.4, padding: 0, minWidth: 80, textAlign: 'left' },
  amountHint: { textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.text.muted, letterSpacing: 1, marginTop: 4 },
  errorTxt: { textAlign: 'center', color: c.state.danger, fontSize: 12, fontWeight: '700', marginTop: 6 },

  // Quick chips
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.gray[200] },
  quickTxt: { fontSize: 13, fontWeight: '700', color: c.text.primary },

  // Section labels
  sectLbl: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2, color: c.text.muted, marginTop: 22, marginBottom: 10 },

  // Already saved
  savedRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: c.gray[50], borderRadius: 0 },
  rupeeSmall: { fontSize: 16, fontWeight: '600', color: c.text.muted },
  savedInput: { flex: 1, fontSize: 16, fontWeight: '700', color: c.text.primary, padding: 0 },

  // Color row
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorBtn: { width: 36, height: 36, borderRadius: 0 },

  // Sticky CTA
  ctaBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    backgroundColor: c.bg.elevated,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.gray[100],
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 0 },
  ctaTxt: { fontSize: 15.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.2 },
}));

export type GoalFormPayload = {
  name: string;
  target_amount: number;
  saved_amount: number;
  emoji: string;
  color: string;
};

type Props = {
  visible: boolean;
  editing?: {
    id: string;
    name: string;
    target_amount: number;
    saved_amount: number;
    emoji?: string;
    color?: string;
  } | null;
  submitting?: boolean;
  isOnline?: boolean;
  onSubmit: (payload: GoalFormPayload) => Promise<void> | void;
  onClose: () => void;
};

const EMOJI_OPTIONS = ['🎯','✈️','🏠','🚗','💍','📱','🎓','💰','🛒','🎁','🏖️','💪'];
const COLOR_OPTIONS = [
  COLORS.accent.brand, '#3B82F6', '#10B981', '#EF4444',
  '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4',
];
const QUICK_AMOUNTS = [10000, 25000, 50000, 100000, 250000, 500000];

function fmt(n: number) {
  if (!n) return '0';
  return Math.round(n).toLocaleString('en-IN');
}
function fmtCompact(n: number) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

// Emoji chip with smooth scale-in selection animation
function EmojiChip({ emoji, active, onPress }: { emoji: string; active: boolean; onPress: () => void }) {
  const u = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    u.value = withSpring(active ? 1 : 0, { damping: 18, stiffness: 240 });
  }, [active, u]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + u.value * 0.18 }],
    opacity: 1 - u.value * 0.0,
  }));
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={[chipS.emojiBtn, active && chipS.emojiBtnOn]} testID={`emoji-${emoji}`}>
      <Animated.Text style={[{ fontSize: 22 }, style]}>{emoji}</Animated.Text>
    </TouchableOpacity>
  );
}

const chipS = StyleSheet.create({
  emojiBtn: { width: 44, height: 44, borderRadius: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F5' },
  emojiBtnOn: { backgroundColor: '#FFEDD5' },
});

export default function GoalSheet({
  visible, editing, submitting, isOnline = true, onSubmit, onClose,
}: Props) {
  const s = useStyles();
  const c = useAppColors();
  const targetRef = useRef<TextInput | null>(null);
  const nameRef = useRef<TextInput | null>(null);

  const [name, setName] = useState<string>(editing?.name || '');
  const [targetStr, setTargetStr] = useState<string>(editing?.target_amount ? String(editing.target_amount) : '');
  const [savedStr, setSavedStr] = useState<string>(editing?.saved_amount ? String(editing.saved_amount) : '');
  const [emoji, setEmoji] = useState<string>(editing?.emoji || '🎯');
  const [color, setColor] = useState<string>(editing?.color || COLORS.accent.brand);
  const [errorTxt, setErrorTxt] = useState<string | null>(null);

  // Reset on visibility change
  useEffect(() => {
    if (visible) {
      setName(editing?.name || '');
      setTargetStr(editing?.target_amount ? String(editing.target_amount) : '');
      setSavedStr(editing?.saved_amount ? String(editing.saved_amount) : '');
      setEmoji(editing?.emoji || '🎯');
      setColor(editing?.color || COLORS.accent.brand);
      setErrorTxt(null);

      const t = setTimeout(() => {
        // Focus the right field: name if empty, else target
        if (!editing?.name) nameRef.current?.focus?.();
        else targetRef.current?.focus?.();
      }, 280);
      return () => clearTimeout(t);
    }
  }, [visible, editing]);

  const target = useMemo(() => parseFloat(targetStr) || 0, [targetStr]);
  const saved = useMemo(() => parseFloat(savedStr) || 0, [savedStr]);

  const tickAnim = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    RNAnimated.sequence([
      RNAnimated.timing(tickAnim, { toValue: 1.03, duration: 90, useNativeDriver: true, easing: RNEasing.out(RNEasing.quad) }),
      RNAnimated.timing(tickAnim, { toValue: 1, duration: 140, useNativeDriver: true, easing: RNEasing.inOut(RNEasing.quad) }),
    ]).start();
  }, [targetStr, tickAnim]);

  const validate = (): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return 'Goal name is required';
    if (trimmed.length > 100) return 'Name is too long (max 100)';
    if (!Number.isFinite(target) || target <= 0) return 'Target must be greater than 0';
    if (target > 100000000) return 'Target too large (max ₹10 crore)';
    if (saved < 0) return 'Already saved cannot be negative';
    if (saved > target) return 'Already saved cannot exceed target';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setErrorTxt(err); return; }
    setErrorTxt(null);
    try { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    await onSubmit({
      name: name.trim(),
      target_amount: target,
      saved_amount: saved,
      emoji,
      color,
    });
  };

  const ctaText = useMemo(() => {
    if (editing) return 'Save Changes';
    return target > 0 ? `Create goal · ₹${fmt(target)}` : 'Create Goal';
  }, [editing, target]);

  const canSubmit = name.trim().length > 0 && target > 0 && !submitting && isOnline;

  const tapPreset = (n: number) => {
    try { Haptics.selectionAsync(); } catch {}
    setTargetStr(String(n));
    if (errorTxt) setErrorTxt(null);
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

          {/* ── 1. Slim top bar ─────────────────────── */}
          <View style={s.topBar}>
            <TouchableOpacity onPress={onClose} hitSlop={14} style={s.closeBtn} testID="goal-close">
              <Ionicons name="close" size={22} color={c.text.primary} />
            </TouchableOpacity>
            <InputMascot
              phase={errorTxt ? 'error' : target > 0 ? 'success' : 'idle'}
              size={36}
              position="inline"
            />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
          >
            {/* ── 2. Eyebrow + hero prompt ──────────── */}
            <Animated.View entering={FadeIn.duration(220)}>
              <Text style={s.eyebrow}>{editing ? 'EDITING' : 'NEW GOAL'}</Text>
              <Text style={s.hero}>
                {editing ? 'Tweak your goal' : (
                  <>
                    What are you{' '}
                    <Text style={[s.hero, { color }]}>saving for?</Text>
                  </>
                )}
              </Text>
            </Animated.View>

            {/* ── 3. Name field (primary — goal needs a name) */}
            <View style={s.nameRow}>
              <Text style={s.emojiSmall}>{emoji}</Text>
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Goa trip, Emergency fund"
                placeholderTextColor={c.text.muted}
                style={s.nameInput}
                testID="goal-name"
                returnKeyType="next"
                onSubmitEditing={() => targetRef.current?.focus?.()}
              />
            </View>

            {/* ── 4. Hero target amount input ───────── */}
            <RNAnimated.View style={[s.amountWrap, { transform: [{ scale: tickAnim }] }]}>
              <Text style={s.rupee}>₹</Text>
              <TextInput
                ref={targetRef}
                value={targetStr}
                onChangeText={(v) => { setTargetStr(v.replace(/[^0-9]/g, '')); if (errorTxt) setErrorTxt(null); }}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={c.gray[300]}
                style={s.amountInput}
                testID="goal-target"
                selectionColor={color}
              />
            </RNAnimated.View>
            <Text style={s.amountHint}>Target amount</Text>

            {errorTxt ? (
              <Animated.Text entering={FadeIn} style={s.errorTxt}>{errorTxt}</Animated.Text>
            ) : (
              <View style={{ height: 12 }} />
            )}

            {/* ── 5. Quick amount chips ─────────────── */}
            <View style={s.quickRow}>
              {QUICK_AMOUNTS.map(p => {
                const on = target === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => tapPreset(p)}
                    activeOpacity={0.78}
                    style={[s.quickChip, on && { backgroundColor: color, borderColor: color }]}
                    testID={`goal-preset-${p}`}
                  >
                    <Text style={[s.quickTxt, on && { color: '#FFFFFF', fontWeight: '900' }]}>₹{fmtCompact(p)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── 6. Emoji picker (animated horizontal row) ── */}
            <Text style={s.sectLbl}>EMOJI</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              style={{ marginHorizontal: -4 }}
            >
              {EMOJI_OPTIONS.map((e) => (
                <EmojiChip key={e} emoji={e} active={emoji === e} onPress={() => { try { Haptics.selectionAsync(); } catch {} setEmoji(e); }} />
              ))}
            </ScrollView>

            {/* ── 7. ExpandableSection: already saved + color ── */}
            <View style={{ marginTop: 22 }}>
              <ExpandableSection
                title="More options"
                subtitle="Starting balance, color"
                icon="options-outline"
              >
                <Text style={s.sectLbl}>ALREADY SAVED (OPTIONAL)</Text>
                <View style={s.savedRow}>
                  <Text style={s.rupeeSmall}>₹</Text>
                  <TextInput
                    value={savedStr}
                    onChangeText={(v) => setSavedStr(v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={c.text.muted}
                    style={s.savedInput}
                    testID="goal-saved"
                  />
                </View>

                <Text style={[s.sectLbl, { marginTop: 18 }]}>COLOR</Text>
                <View style={s.colorRow}>
                  {COLOR_OPTIONS.map((cc) => (
                    <TouchableOpacity
                      key={cc}
                      onPress={() => { try { Haptics.selectionAsync(); } catch {} setColor(cc); }}
                      style={[
                        s.colorBtn,
                        { backgroundColor: cc },
                        color === cc && { borderWidth: 3, borderColor: '#FFFFFF', shadowColor: cc, shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
                      ]}
                      testID={`goal-color-${cc}`}
                    />
                  ))}
                </View>
              </ExpandableSection>
            </View>
          </ScrollView>

          {/* ── 8. Sticky bottom CTA ─────────────────── */}
          <View style={s.ctaBar} pointerEvents="box-none">
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.9}
              testID="goal-submit"
            >
              <View
                style={[s.cta, canSubmit && { shadowColor: color, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5, backgroundColor: '#0A0A0A' }]}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={s.ctaTxt}>{!isOnline ? "Offline — can't save" : ctaText}</Text>
                    {canSubmit ? <Ionicons name="arrow-forward" size={18} color="#FFFFFF" /> : null}
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

