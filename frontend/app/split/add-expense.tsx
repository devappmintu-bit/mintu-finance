/**
 * Split · Add Expense — FULL-SCREEN FLOW
 *
 * Next-gen expense-sharing UX. No more bottom-sheet. Users add any
 * expense in <5 seconds with live settlement preview.
 *
 * Query params:
 *   group_id  (required)
 *   expense_id (optional — edit mode)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { fetchGroupSummary, createExpense, updateExpense } from '../../services/split';
import { enqueueExpense, uuid } from '../../services/offlineQueue';
import { triggerSync } from '../../services/syncEngine';
import Confetti from '../../components/Confetti';
import FullScreenLoader from '../../components/FullScreenLoader';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, SPACING, useAppColors } from '../../utils/theme';
import { useIsOnline } from '../../hooks/useIsOnline';
import { showError, showSuccess } from '../../utils/toast';
import { InputAssistantHeader, QuickAmountChips } from '../../components/primitives';

type Member = { id: string; name: string; phone?: string };
type SplitType = 'equal' | 'exact' | 'shares';

const SUGGESTIONS = [
  { label: 'Food',       emoji: '🍔' },
  { label: 'Travel',     emoji: '🚕' },
  { label: 'Rent',       emoji: '🏠' },
  { label: 'Groceries',  emoji: '🛒' },
  { label: 'Movie',      emoji: '🎬' },
  { label: 'Drinks',     emoji: '🍻' },
];

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function AddExpenseScreen() {
  const s = useStyles();
  const c = useAppColors();
  const isOnline = useIsOnline();
  const params = useLocalSearchParams<{ group_id?: string; expense_id?: string }>();
  const { user } = useAuthStore();

  const isEditMode = !!params.expense_id;
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [payerId, setPayerId] = useState<string>('');        // single payer (MVP)
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [exactSplits, setExactSplits] = useState<Record<string, string>>({});
  const [shareSplits, setShareSplits] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Load group & members (+ populate form if editing)
  useEffect(() => {
    (async () => {
      if (!params.group_id) {
        // Graceful recovery when deep-linked without a group_id.
        // Without this, the screen renders as a blank scaffold because
        // router.back() has nowhere to go on a cold navigation.
        Toast.show({
          type: 'error',
          text1: 'No group selected',
          text2: 'Open a group first, then add an expense.',
        });
        router.replace('/split');
        return;
      }
      try {
        const data = await fetchGroupSummary(String(params.group_id));
        setGroup(data);
        const mem: Member[] = (data?.members || []).map((m: any) => ({ id: m.user_id || m.id, name: m.name || 'User', phone: m.phone }));
        setMembers(mem);

        // Default: current user is payer; everyone participates
        const myId = user?.id || mem[0]?.id || '';
        setPayerId(myId);
        setParticipants(new Set(mem.map(m => m.id)));

        // Edit mode: hydrate form from recent_expenses
        if (isEditMode && params.expense_id) {
          const exp = (data?.recent_expenses || []).find((e: any) => (e.id || e._id) === params.expense_id);
          if (exp) {
            setEditingExpenseId(String(params.expense_id));
            setAmount(String(exp.amount ?? ''));
            setDesc(String(exp.description || ''));
            setPayerId(String(exp.paid_by || exp.paid_by_id || myId));
            if (exp.splits && typeof exp.splits === 'object') {
              const keys = Object.keys(exp.splits);
              setParticipants(new Set(keys));
              if (exp.split_type === 'exact') {
                const es: Record<string, string> = {};
                keys.forEach(k => { es[k] = String(exp.splits[k]); });
                setExactSplits(es);
              }
            }
            setSplitType((exp.split_type as SplitType) || 'equal');
          } else {
            showError('Expense not found');
          }
        }
      } catch (e) {
        showError('Could not load group');
        router.back();
      } finally { setLoading(false); }
    })();
  }, [params.group_id, params.expense_id]);

  const amountNum = Number(amount) || 0;

  // === Compute splits live ===
  const splitsMap = useMemo(() => {
    const out: Record<string, number> = {};
    const ids = Array.from(participants);
    if (!ids.length || amountNum <= 0) return out;
    if (splitType === 'equal') {
      const each = +(amountNum / ids.length).toFixed(2);
      ids.forEach(id => { out[id] = each; });
      // Rounding diff → first
      const sum = Object.values(out).reduce((a, b) => a + b, 0);
      const diff = +(amountNum - sum).toFixed(2);
      if (diff !== 0 && ids[0]) out[ids[0]] = +(out[ids[0]] + diff).toFixed(2);
    } else if (splitType === 'exact') {
      ids.forEach(id => { out[id] = +(Number(exactSplits[id] || 0)); });
    } else { // shares
      const totalShares = ids.reduce((a, id) => a + Number(shareSplits[id] || 0), 0);
      if (totalShares > 0) {
        ids.forEach(id => { out[id] = +((Number(shareSplits[id] || 0) / totalShares) * amountNum).toFixed(2); });
      }
    }
    return out;
  }, [amountNum, participants, splitType, exactSplits, shareSplits]);

  // === Live settlement preview ===
  const settlements = useMemo(() => {
    if (!payerId || amountNum <= 0) return [] as { from: string; to: string; amount: number }[];
    const out: { from: string; to: string; amount: number }[] = [];
    const payerName = members.find(m => m.id === payerId)?.name || 'Payer';
    Object.entries(splitsMap).forEach(([uid, owed]) => {
      if (uid !== payerId && owed > 0.01) {
        const uname = members.find(m => m.id === uid)?.name || 'Someone';
        out.push({ from: uname, to: payerName, amount: owed });
      }
    });
    return out;
  }, [splitsMap, payerId, members, amountNum]);

  const splitsSum = Object.values(splitsMap).reduce((a, b) => a + b, 0);
  const splitsValid = Math.abs(splitsSum - amountNum) < 0.5;

  // Validation
  // Phase 2 — submit no longer requires online. New expenses are
  // queued locally and synced in the background; only edits to
  // existing server-side expenses still need a live connection.
  const needsOnlineForEdit = !!editingExpenseId;
  const canSubmit =
    amountNum > 0 &&
    desc.trim().length > 0 &&
    payerId &&
    participants.size > 0 &&
    splitsValid &&
    !submitting &&
    (!needsOnlineForEdit || isOnline);

  const toggleParticipant = (id: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setParticipants(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const setPayer = (id: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setPayerId(id);
  };

  const applySmartSuggestion = (kind: 'equal' | 'you-paid') => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (kind === 'equal') {
      setSplitType('equal');
      setParticipants(new Set(members.map(m => m.id)));
    } else {
      setSplitType('equal');
      setPayerId(user?.id || members[0]?.id || '');
      setParticipants(new Set(members.map(m => m.id)));
    }
  };

  const submit = async () => {
    if (!canSubmit || !group) return;
    setSubmitting(true);
    try {
      if (editingExpenseId) {
        // Edits to server-side expenses still hit the network directly.
        // Offline edit-queue is out of scope for Phase 2; we already
        // gate the submit button on `isOnline` for this branch above.
        await updateExpense(editingExpenseId, {
          description: desc.trim(),
          amount: amountNum,
          split_type: splitType,
          splits: splitsMap,
        });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setShowConfetti(true);
        setTimeout(() => {
          showSuccess('Expense updated');
          router.back();
        }, 800);
        return;
      }

      // ── Phase 2 OFFLINE-FIRST CREATE ───────────────────────────────
      // 1. Generate a stable client_expense_id (doubles as backend
      //    Idempotency-Key on retries).
      // 2. Persist to AsyncStorage queue → survives app kill / reboot.
      // 3. Optimistically dismiss the screen.
      // 4. Kick the sync engine; it'll drain the queue in the background.
      const clientExpenseId = uuid();
      await enqueueExpense({
        client_expense_id: clientExpenseId,
        group_id: group.id,
        payload: {
          group_id: group.id,
          paid_by: payerId,
          description: desc.trim(),
          amount: amountNum,
          split_type: splitType,
          splits: splitsMap,
        },
      });
      // Trigger immediately — if online, the expense ships in <500ms
      // and the user sees the synced toast on the next refresh.
      triggerSync('add_expense_submit');

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowConfetti(true);
      setTimeout(() => {
        Toast.show({
          type: 'success',
          text1: isOnline ? 'Expense added' : 'Saved offline',
          text2: isOnline ? 'Splitting now…' : "Will sync when you're back online",
        });
        router.back();
      }, 800);
    } catch (e: any) {
      setSubmitting(false);
      Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || e?.message || 'Failed' });
    }
  };

  if (loading) return <FullScreenLoader tagline="Loading group…" />;

  // ── Empty-state: group has 0 or 1 member (creator only) ─────────────
  // Rendering the form would leave the user with a permanently-disabled
  // "Split" button (nothing to divide among). Route them to Add Members
  // first with a friendly nudge.
  if (members.length < 2) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }} testID="add-expense-close">
            <Ionicons name="close" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={s.title}>New expense</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accent.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="people" size={36} color={COLORS.accent.primary} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center' }}>
            Add members to split with
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 19, maxWidth: 300 }}>
            {group?.name ? `"${group.name}"` : 'This group'} only has you right now. Invite at least one friend so MintU can split the expense between you.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 999 }}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.replace({ pathname: '/split/add-member', params: { group_id: String(params.group_id) } } as any);
            }}
            testID="add-expense-goto-members"
          >
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Add members</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text.muted }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <Confetti trigger={showConfetti} onDone={() => setShowConfetti(false)} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="close" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.title}>{editingExpenseId ? 'Edit expense' : 'New expense'}</Text>
          <Text style={s.groupName} numberOfLines={1}>{group?.name}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Round 57 — Conversational input header. Adapts microcopy
              to the user's intent (new vs. edit) and reacts to amount
              entry. Mascot lifts to "success" the moment a positive
              amount lands. */}
          <InputAssistantHeader
            prompt={editingExpenseId ? 'Editing this split' : 'How much was the bill?'}
            hint="Tap a chip below or type the amount"
            phase={!!amount && Number(amount) > 0 ? 'success' : 'idle'}
          />

          {/* Round 57 — Quick chips above the amount card. Split-bill
              presets skew larger than personal txns: ₹200 / ₹500 /
              ₹1k / ₹2k / ₹5k / ₹10k covers ~85 % of restaurant tabs
              and trip-share cases. */}
          <QuickAmountChips
            current={amount}
            presets={[200, 500, 1000, 2000, 5000, 10000]}
            onSelect={(n) => setAmount(String(n))}
          />

          {/* 1. AMOUNT */}
          <View style={s.amountCard}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={c.gray[300]}
              style={s.amountInput}
              testID="ae-amount"
            />
          </View>

          {/* 2. DESCRIPTION */}
          <Text style={s.label}>DESCRIPTION</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="What's this for?"
            placeholderTextColor={COLORS.text.muted}
            style={s.descInput}
            testID="ae-desc"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.suggRow} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
            {SUGGESTIONS.map(sg => (
              <TouchableOpacity key={sg.label} style={s.suggChip} onPress={() => setDesc(sg.label)} activeOpacity={0.8}>
                <Text style={s.suggEmoji}>{sg.emoji}</Text>
                <Text style={s.suggTxt}>{sg.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 3. WHO PAID */}
          <Text style={s.label}>WHO PAID</Text>
          <View style={s.chipRow}>
            {members.map(m => {
              const active = m.id === payerId;
              return (
                <TouchableOpacity key={m.id} style={[s.personChip, active && s.personChipActive]} onPress={() => setPayer(m.id)} activeOpacity={0.82}>
                  {active && <Ionicons name="checkmark-circle" size={14} color={c.accent.brandDark} />}
                  <Text style={[s.personTxt, active && s.personTxtActive]} numberOfLines={1}>
                    {m.id === user?.id ? 'You' : m.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 4. SPLIT BETWEEN */}
          <Text style={s.label}>SPLIT BETWEEN ({participants.size})</Text>
          <View style={s.chipRow}>
            {members.map(m => {
              const active = participants.has(m.id);
              return (
                <TouchableOpacity key={m.id} style={[s.personChip, active && s.personChipActive]} onPress={() => toggleParticipant(m.id)} activeOpacity={0.82}>
                  {active && <Ionicons name="checkmark-circle" size={14} color={c.accent.brandDark} />}
                  <Text style={[s.personTxt, active && s.personTxtActive]} numberOfLines={1}>
                    {m.id === user?.id ? 'You' : m.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 5. SPLIT TYPE */}
          <Text style={s.label}>SPLIT TYPE</Text>
          <View style={s.tabRow}>
            {(['equal', 'exact', 'shares'] as SplitType[]).map(t => (
              <TouchableOpacity key={t} style={[s.tab, splitType === t && s.tabActive]} onPress={() => setSplitType(t)} activeOpacity={0.82}>
                <Text style={[s.tabTxt, splitType === t && s.tabTxtActive]}>
                  {t === 'equal' ? 'Equally' : t === 'exact' ? 'Exact' : 'Shares'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 5b. EXACT / SHARES inputs */}
          {splitType === 'exact' && (
            <View style={{ gap: 8 }}>
              {Array.from(participants).map(uid => {
                const m = members.find(x => x.id === uid);
                if (!m) return null;
                return (
                  <View key={uid} style={s.inlineInputRow}>
                    <Text style={s.inlineLbl} numberOfLines={1}>{m.id === user?.id ? 'You' : m.name.split(' ')[0]}</Text>
                    <View style={s.inlineInputWrap}>
                      <Text style={s.inlineRupee}>₹</Text>
                      <TextInput
                        value={exactSplits[uid] || ''}
                        onChangeText={(v) => setExactSplits(p => ({ ...p, [uid]: v.replace(/[^0-9.]/g, '') }))}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        style={s.inlineInput}
                        placeholderTextColor={COLORS.text.muted}
                      />
                    </View>
                  </View>
                );
              })}
              {!splitsValid && amountNum > 0 && (
                <Text style={s.warnTxt}>Splits sum to {fmt(splitsSum)} — should equal {fmt(amountNum)}</Text>
              )}
            </View>
          )}
          {splitType === 'shares' && (
            <View style={{ gap: 8 }}>
              {Array.from(participants).map(uid => {
                const m = members.find(x => x.id === uid);
                if (!m) return null;
                return (
                  <View key={uid} style={s.inlineInputRow}>
                    <Text style={s.inlineLbl}>{m.id === user?.id ? 'You' : m.name.split(' ')[0]}</Text>
                    <View style={s.inlineInputWrap}>
                      <TextInput
                        value={shareSplits[uid] || ''}
                        onChangeText={(v) => setShareSplits(p => ({ ...p, [uid]: v.replace(/[^0-9.]/g, '') }))}
                        keyboardType="numeric"
                        placeholder="1"
                        style={s.inlineInput}
                        placeholderTextColor={COLORS.text.muted}
                      />
                      <Text style={s.inlineRupee}>×</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 6. SMART SUGGESTIONS */}
          <Text style={s.label}>SMART SUGGESTIONS</Text>
          <View style={s.smartRow}>
            <TouchableOpacity style={s.smartChip} onPress={() => applySmartSuggestion('equal')} activeOpacity={0.82}>
              <Ionicons name="people" size={13} color={c.accent.tertiary} />
              <Text style={s.smartTxt}>Split equally</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.smartChip} onPress={() => applySmartSuggestion('you-paid')} activeOpacity={0.82}>
              <Ionicons name="wallet" size={13} color={c.state.success} />
              <Text style={s.smartTxt}>You paid → others owe</Text>
            </TouchableOpacity>
          </View>

          {/* 7. LIVE PREVIEW — differentiator */}
          {settlements.length > 0 && (
            <View style={s.previewCard}>
              <View style={s.previewHead}>
                <Ionicons name="eye" size={14} color={c.accent.brandDark} />
                <Text style={s.previewLbl}>LIVE PREVIEW</Text>
              </View>
              {settlements.slice(0, 5).map((x, i) => (
                <Text key={i} style={s.previewLine}>
                  • <Text style={s.previewStrong}>{x.from}</Text> owes <Text style={s.previewStrong}>{x.to}</Text> <Text style={s.previewAmt}>{fmt(x.amount)}</Text>
                </Text>
              ))}
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* CTA */}
        <View style={s.ctaWrap}>
          <TouchableOpacity
            disabled={!canSubmit}
            onPress={submit}
            activeOpacity={0.88}
            style={[s.ctaBtn, !canSubmit && s.ctaDisabled]}
            testID="ae-submit"
          >
            <LinearGradient colors={canSubmit ? [COLORS.accent.brand, COLORS.accent.brandDark] : ['#D1D5DB', COLORS.text.muted]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaGrad}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={s.ctaTxt}>
                    {(() => {
                      if (amountNum <= 0) return 'Enter amount';
                      if (editingExpenseId && !isOnline) return "Offline — can't edit";
                      const verb = editingExpenseId ? 'Update' : 'Split';
                      const label = `${verb} ${fmt(amountNum)}${desc ? ` for ${desc}` : ''}`;
                      // For new expenses we let the user submit even
                      // when offline; the queue handles delivery.
                      if (!editingExpenseId && !isOnline) {
                        return `Save offline · ${fmt(amountNum)}`;
                      }
                      return label;
                    })()}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.secondary },
  title: { fontSize: 16, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  groupName: { fontSize: 11, fontWeight: '700', color: c.text.muted, marginTop: 1 },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 100, gap: 10 },

  /* Brand-soft border — intentional warm-orange peach tone (Round 50). */
  amountCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20, paddingHorizontal: 18, borderRadius: 20, backgroundColor: c.accent.brandSoft, borderWidth: 1, borderColor: c.accent.brand + '33' },
  rupee: { fontSize: 42, fontWeight: '900', color: c.accent.brandDark },
  amountInput: { flex: 1, fontSize: 44, fontWeight: '900', color: c.text.primary, letterSpacing: -1.5, padding: 0 },

  label: { fontSize: 10, fontWeight: '900', color: c.text.muted, letterSpacing: 1.2, marginTop: 6 },
  descInput: { fontSize: 15, fontWeight: '700', color: c.text.primary, backgroundColor: c.bg.secondary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: c.border.subtle },
  suggRow: { },
  suggChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle },
  suggEmoji: { fontSize: 13 },
  suggTxt: { fontSize: 11.5, fontWeight: '800', color: c.text.secondary },

  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle },
  personChipActive: { backgroundColor: c.accent.brandSoft, borderColor: c.accent.brandDark },
  personTxt: { fontSize: 12, fontWeight: '800', color: c.text.secondary },
  personTxtActive: { color: c.accent.brandDark },

  tabRow: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c.bg.secondary, borderRadius: 12 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: c.bg.elevated, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabTxt: { fontSize: 12, fontWeight: '800', color: c.text.muted },
  tabTxtActive: { color: c.accent.brandDark },

  inlineInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineLbl: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text.primary },
  inlineInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg.secondary, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: c.border.subtle, minWidth: 110 },
  inlineRupee: { fontSize: 13, color: c.text.muted, fontWeight: '700' },
  inlineInput: { flex: 1, paddingVertical: 8, fontSize: 14, fontWeight: '700', color: c.text.primary, padding: 0, textAlign: 'right' },
  warnTxt: { fontSize: 11.5, color: c.state.warning, fontWeight: '700', marginTop: 4 },

  smartRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  smartChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle },
  smartTxt: { fontSize: 11.5, fontWeight: '800', color: c.text.secondary },

  /* Preview block: brand-soft bg + brand-deep ink (intentional warm orange tone). */
  previewCard: { backgroundColor: c.accent.brandSoft, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.accent.brand + '33', gap: 7 },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  previewLbl: { fontSize: 10, fontWeight: '900', color: c.accent.brandDark, letterSpacing: 1.2 },
  /* Deep brand ink — warm chocolate-orange used in preview blocks (intentional brand identity per Round 50). */
  previewLine: { fontSize: 13, color: '#7A2E0A', lineHeight: 19, fontWeight: '500' },
  previewStrong: { fontWeight: '900', color: '#7A2E0A' },
  previewAmt: { fontWeight: '900', color: c.accent.brandDark },

  ctaWrap: { padding: SPACING.lg, borderTopWidth: 1, borderTopColor: c.border.subtle, backgroundColor: c.bg.primary },
  ctaBtn: { borderRadius: 14, overflow: 'hidden' },
  ctaDisabled: { opacity: 0.65 },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  ctaTxt: { fontSize: 15, fontWeight: '900', color: c.bg.elevated, letterSpacing: -0.2 },
}));
