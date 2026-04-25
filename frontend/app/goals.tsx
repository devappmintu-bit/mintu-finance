/**
 * /goals — Savings Goals Screen.
 *
 * Grid of goals with animated progress rings, linked-budget badges,
 * quick actions (add money, edit, delete), and a prominent “New goal”
 * CTA. Hooks up to /api/goals CRUD.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import api from '../utils/api';
import FullScreenLoader from '../components/FullScreenLoader';
import Confetti from '../components/Confetti';
import EmptyState from '../components/ui/EmptyState';
import { useIsOnline } from '../hooks/useIsOnline';

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  target_date?: string | null;
  color: string;
  emoji: string;
  linked_budget_id?: string | null;
};

const EMOJI_OPTIONS = ['🎯', '🏠', '✈️', '🚗', '💻', '🎓', '💍', '🏝️', '👶', '💊', '📚', '🎁'];
const COLOR_OPTIONS = ['#F56E1E', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#EF4444'];

function ProgressRing({ pct, color, size = 88, stroke = 8 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePct = Math.min(100, Math.max(0, pct));
  const dashOffset = circumference - (circumference * safePct) / 100;
  return (
    // Round 38 — wrap SVG so screen readers announce progress meaningfully
    // ("47 percent of goal completed") rather than reading nothing.
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Goal progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(safePct) }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#F3F4F6" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}

export default function GoalsScreen() {
  const isOnline = useIsOnline();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  // Round 36 — inline blur validation so the user sees errors the moment
  // they leave the field, not only after pressing Save.
  const [targetError, setTargetError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const validateTargetOnBlur = () => {
    const v = (target || '').trim();
    if (!v) { setTargetError('Target amount is required'); return; }
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) { setTargetError('Must be greater than 0'); return; }
    if (n > 100_000_000) { setTargetError('Max ₹10cr'); return; }
    setTargetError(null);
  };
  const validateSavedOnBlur = () => {
    const v = (saved || '').trim();
    if (!v) { setSavedError(null); return; }  // optional field
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n < 0) { setSavedError('Must be 0 or greater'); return; }
    const tn = parseFloat(target || '0');
    if (Number.isFinite(tn) && tn > 0 && n > tn) { setSavedError('Cannot exceed target'); return; }
    setSavedError(null);
  };
  const [color, setColor] = useState('#F56E1E');
  const [saving, setSaving] = useState(false);
  // Milestone celebration — fires a confetti burst + haptic the moment any
  // goal crosses 100% (previous snapshot of that goal was < 100%). Also
  // respects 50%/75% softer nudges via toast (no confetti — less noisy).
  const [showConfetti, setShowConfetti] = useState(false);

  const loadGoals = useCallback(async () => {
    try {
      const r = await api.get('/goals');
      const newGoals: Goal[] = r.data?.goals || [];

      // Diff against previous snapshot to detect newly-crossed milestones
      setGoals((prev) => {
        try {
          const prevMap = new Map(prev.map((g) => [g.id, g]));
          for (const g of newGoals) {
            const pct = g.target_amount > 0 ? (g.saved_amount / g.target_amount) * 100 : 0;
            const prevG = prevMap.get(g.id);
            const prevPct = prevG && prevG.target_amount > 0
              ? (prevG.saved_amount / prevG.target_amount) * 100
              : 0;
            // 100% crossing → full celebration
            if (prevPct < 100 && pct >= 100) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setShowConfetti(true);
              Toast.show({
                type: 'success',
                text1: `🎉 Goal reached: ${g.name}!`,
                text2: `You saved ₹${g.saved_amount.toLocaleString('en-IN')}`,
              });
              break; // only celebrate one at a time to avoid toast pile-up
            }
            // 75% crossing → soft nudge
            if (prevPct < 75 && pct >= 75 && pct < 100) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              Toast.show({
                type: 'info',
                text1: `Almost there on ${g.name}! ${Math.floor(pct)}% done 🔥`,
              });
              break;
            }
            // 50% crossing → light nudge
            if (prevPct < 50 && pct >= 50 && pct < 75) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              Toast.show({
                type: 'info',
                text1: `Halfway on ${g.name} 🎯`,
              });
              break;
            }
          }
        } catch { /* diff is best-effort — never block the refresh */ }
        return newGoals;
      });
    } catch (e) {
      // fail silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadGoals(); }, [loadGoals]);
  useFocusEffect(useCallback(() => { loadGoals(); }, [loadGoals]));

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  const openNew = () => {
    setEditingGoal(null);
    setName(''); setTarget(''); setSaved('');
    setEmoji('🎯'); setColor('#F56E1E');
    setFormVisible(true);
  };

  const openEdit = (g: Goal) => {
    setEditingGoal(g);
    setName(g.name);
    setTarget(String(g.target_amount));
    setSaved(String(g.saved_amount));
    setEmoji(g.emoji || '🎯');
    setColor(g.color || '#F56E1E');
    setFormVisible(true);
  };

  const onSave = async () => {
    // Field-specific validation so the toast message is actionable instead
    // of the generic "Name and target required" that fired even when only
    // one field was wrong (e.g. a negative amount with a valid name).
    const trimmedName = name.trim();
    const numericTarget = Number(target);
    const numericSaved = Number(saved) || 0;

    // Validation failure → light warning buzz to confirm "I saw you, but…"
    const bail = (msg: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Toast.show({ type: 'error', text1: msg });
    };

    if (!trimmedName) return bail('Goal name is required');
    if (trimmedName.length > 100) return bail('Name is too long (max 100)');
    if (!target) return bail('Target amount is required');
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) return bail('Target must be a positive number');
    if (numericTarget > 100000000) return bail('Target too large (max ₹10 crore)');
    if (numericSaved < 0) return bail('Saved amount cannot be negative');
    if (numericSaved > numericTarget) return bail('Already saved cannot exceed target');

    // Good inputs → confirm button press with a soft tap
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        target_amount: numericTarget,
        saved_amount: numericSaved,
        emoji, color,
      };
      if (editingGoal) {
        await api.patch(`/goals/${editingGoal.id}`, payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Toast.show({ type: 'success', text1: 'Goal updated!' });
      } else {
        await api.post('/goals', payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Toast.show({ type: 'success', text1: 'Goal created 🎉' });
      }
      setFormVisible(false);
      loadGoals();
    } catch (e: any) {
      // Surface the server-side validation message when possible so the
      // user knows what to change instead of a generic "could not save".
      const detail = e?.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail[0]?.msg : detail;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({
        type: 'error',
        text1: msg ? 'Invalid goal' : 'Could not save goal',
        text2: typeof msg === 'string' ? msg.slice(0, 90) : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (g: Goal) => {
    const doDelete = async () => {
      try {
        await api.delete(`/goals/${g.id}`);
        Toast.show({ type: 'success', text1: 'Goal deleted' });
        loadGoals();
      } catch {
        Toast.show({ type: 'error', text1: 'Could not delete' });
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Delete "${g.name}"?`)) doDelete();
    } else {
      Alert.alert('Delete goal?', g.name, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const totalSaved = goals.reduce((sum, g) => sum + (g.saved_amount || 0), 0);
  const totalTarget = goals.reduce((sum, g) => sum + (g.target_amount || 0), 0);
  const overallPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  if (loading) {
    return <FullScreenLoader tagline="Loading your goals…" />;
  }

  return (
    <SafeAreaView style={s.bg} edges={['top']}>
      {/* Milestone celebration — fires full-screen when a goal hits 100% */}
      <Confetti trigger={showConfetti} onDone={() => setShowConfetti(false)} />
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.title}>My Goals</Text>
        <TouchableOpacity onPress={() => { haptic(); openNew(); }} hitSlop={10} style={s.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGoals(); }} tintColor="#F56E1E" />}
      >
        {/* Overall summary */}
        <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.summaryCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.sumLbl}>Total saved across goals</Text>
            <Text style={s.sumAmt}>₹{totalSaved.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            <Text style={s.sumSub}>of ₹{totalTarget.toLocaleString('en-IN', { maximumFractionDigits: 0 })} target</Text>
            <View style={s.sumBar}>
              <View style={[s.sumFill, { width: `${Math.min(100, overallPct)}%` }]} />
            </View>
          </View>
          <View style={s.sumRing}>
            <ProgressRing pct={overallPct} color="#fff" size={72} stroke={7} />
            <Text style={s.sumRingPct}>{Math.round(overallPct)}%</Text>
          </View>
        </LinearGradient>

        {goals.length === 0 ? (
          <EmptyState
            emoji="🎯"
            title="No goals yet"
            subtitle="Set savings goals — vacation, emergency fund, gadgets — and watch them grow"
            ctaLabel="Create your first goal"
            onCta={openNew}
          />
        ) : (
          <View style={s.grid}>
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? (g.saved_amount / g.target_amount) * 100 : 0;
              const done = pct >= 100;
              return (
                <TouchableOpacity key={g.id} style={s.goalCard} activeOpacity={0.9} onPress={() => openEdit(g)}>
                  <View style={s.ringWrap}>
                    <ProgressRing pct={pct} color={g.color || '#F56E1E'} size={88} stroke={8} />
                    <View style={s.ringCenter}>
                      <Text style={s.ringEmoji}>{g.emoji || '🎯'}</Text>
                    </View>
                    {done && <View style={s.doneBadge}><Ionicons name="checkmark" size={12} color="#fff" /></View>}
                  </View>
                  <Text style={s.goalName} numberOfLines={1}>{g.name}</Text>
                  <Text style={s.goalAmt}>₹{(g.saved_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
                  <Text style={s.goalTarget}>of ₹{(g.target_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
                  {g.linked_budget_id ? (
                    <View style={s.linkedChip}>
                      <Ionicons name="link" size={9} color="#059669" />
                      <Text style={s.linkedChipTxt}>Linked to budget</Text>
                    </View>
                  ) : null}
                  <View style={s.goalActions}>
                    <TouchableOpacity
                      style={s.goalAct}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit goal ${g.name}`}
                      onPress={(e) => { e.stopPropagation(); openEdit(g); }}>
                      <Ionicons name="create-outline" size={13} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.goalAct}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete goal ${g.name}`}
                      onPress={(e) => { e.stopPropagation(); confirmDelete(g); }}>
                      <Ionicons name="trash-outline" size={13} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* New/Edit Goal bottom sheet */}
      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <View style={s.sheetBg}>
          <TouchableOpacity activeOpacity={1} onPress={() => setFormVisible(false)} style={s.sheetBgTap} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{editingGoal ? 'Edit goal' : 'New goal'}</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLbl}>Name</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Goa trip"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={s.fieldLbl}>Target amount</Text>
              <TextInput
                style={[s.input, targetError && { borderColor: '#DC2626' }]}
                value={target}
                onChangeText={(v) => { setTarget(v); if (targetError) setTargetError(null); }}
                onBlur={validateTargetOnBlur}
                placeholder="25000"
                keyboardType="numeric"
                placeholderTextColor="#9CA3AF"
              />
              {targetError && <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600', marginTop: 4 }}>{targetError}</Text>}

              <Text style={s.fieldLbl}>Already saved (optional)</Text>
              <TextInput
                style={[s.input, savedError && { borderColor: '#DC2626' }]}
                value={saved}
                onChangeText={(v) => { setSaved(v); if (savedError) setSavedError(null); }}
                onBlur={validateSavedOnBlur}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor="#9CA3AF"
              />
              {savedError && <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600', marginTop: 4 }}>{savedError}</Text>}

              <Text style={s.fieldLbl}>Emoji</Text>
              <View style={s.emojiRow}>
                {EMOJI_OPTIONS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[s.emojiBtn, emoji === e && s.emojiBtnOn]}
                    onPress={() => { haptic(); setEmoji(e); }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLbl}>Color</Text>
              <View style={s.colorRow}>
                {COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[s.colorBtn, { backgroundColor: c }, color === c && s.colorBtnOn]}
                    onPress={() => { haptic(); setColor(c); }}
                    activeOpacity={0.8}
                  />
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={[s.saveBtn, (saving || !isOnline) && { opacity: 0.7 }]} onPress={onSave} disabled={saving || !isOnline} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={s.saveBtnTxt}>{!isOnline ? "Offline — can't save" : (editingGoal ? 'Save changes' : 'Create goal')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFormVisible(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#FFFBF7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F56E1E', alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 80 },

  // Summary card
  summaryCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 22, marginBottom: 20, gap: 14 },
  sumLbl: { fontSize: 10.5, fontWeight: '900', color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  sumAmt: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.8, marginTop: 4 },
  sumSub: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  sumBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.3)', marginTop: 10, overflow: 'hidden' },
  sumFill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  sumRing: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  sumRingPct: { position: 'absolute', fontSize: 14, fontWeight: '900', color: '#fff' },

  // Empty state
  emptyCard: { alignItems: 'center', padding: 30, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#FED7AA', gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: '#111827' },
  emptySub: { fontSize: 12.5, fontWeight: '600', color: '#6B7280', textAlign: 'center', lineHeight: 17 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F56E1E', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, marginTop: 6 },
  emptyBtnTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  goalCard: { width: '47.5%', backgroundColor: '#fff', borderRadius: 18, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  ringWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute' },
  ringEmoji: { fontSize: 32 },
  doneBadge: { position: 'absolute', top: -2, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  goalName: { fontSize: 14, fontWeight: '900', color: '#111827', marginTop: 8 },
  goalAmt: { fontSize: 17, fontWeight: '900', color: '#111827', marginTop: 4, letterSpacing: -0.3 },
  goalTarget: { fontSize: 10.5, fontWeight: '700', color: '#6B7280', marginTop: 1 },
  linkedChip: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: '#D1FAE5' },
  linkedChipTxt: { fontSize: 9, fontWeight: '800', color: '#065F46' },
  goalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  goalAct: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },

  // Sheet
  sheetBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetBgTap: { ...StyleSheet.absoluteFillObject },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 19, fontWeight: '900', color: '#111827', marginBottom: 14 },
  fieldLbl: { fontSize: 11, fontWeight: '900', color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827' },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnOn: { borderColor: '#F56E1E', backgroundColor: '#FFF7ED' },
  colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  colorBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, borderColor: 'transparent' },
  colorBtnOn: { borderColor: '#111827' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F56E1E', paddingVertical: 14, borderRadius: 999, marginTop: 16 },
  saveBtnTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },
});
