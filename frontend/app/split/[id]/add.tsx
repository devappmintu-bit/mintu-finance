/**
 * Add Expense — REBUILD R100K.
 *
 * "Enter amount to split" screen with 3 modes:
 *   • EQUAL    — evenly divides total across selected members
 *   • CUSTOM   — per-member ₹ amounts, must sum to total
 *   • PERCENT  — per-member % shares, must sum to 100% (auto-distributed by default)
 *
 * Each member row has a checkbox; CTA reads "SEND REQUEST" once valid.
 *
 * State machine:
 *   typing       Form is still incomplete (amount or desc missing).
 *   ready        Form valid; primary CTA enabled.
 *   submitting   Posting to backend; CTA disabled.
 *   error        Inline error below the form; user can fix and retry.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  router,
  Stack,
  useLocalSearchParams,
} from 'expo-router';
import Toast from 'react-native-toast-message';
import api from '../../../utils/api';
import { useAuthStore } from '../../../store/authStore';
import { BR_COLORS, BR_FONT } from '../../../utils/brutalist';

const {
  ink:      INK,
  paper:    PAPER,
  accent:   ACCENT,
  line:     LINE,
  muted:    MUTED,
  negative: DANGER,
  positive: POSITIVE,
} = BR_COLORS;
const MONO = BR_FONT.mono;

type Member = { user_id: string; name: string; isPending?: boolean };
// R100Q — PERCENT mode dropped. The 80/20 user wants Equal; the
// 20/80 wants per-person ₹. Percent was a power-user trap that
// caused decision freeze. Hidden behind "Advanced" if we ever revive
// it.
type SplitMode = 'equal' | 'custom';

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt    = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const fmt2   = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function AddExpense() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const myId = user?.id || '';

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState<string>(myId);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [includes, setIncludes] = useState<Record<string, boolean>>({});
  const [customAmts, setCustomAmts] = useState<Record<string, string>>({});
  const [customPcts, setCustomPcts] = useState<Record<string, string>>({});
  // Tracks whether the user has manually edited any percent value;
  // before any edit, percent fields auto-redistribute as members
  // toggle in/out. After any edit, we respect their numbers.
  const [pctTouched, setPctTouched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = useMemo(() => {
    const n = parseFloat(amountStr.replace(/[^\d.]/g, ''));
    return isNaN(n) || n <= 0 ? 0 : round2(n);
  }, [amountStr]);

  // Load members.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(`/split/groups/${groupId}/manage`);
        if (!alive) return;
        const ms: Member[] = (r.data?.members || []).map((m: any) => ({
          user_id: m.user_id,
          name: m.user_id === myId ? 'You' : m.name,
          isPending: false,
        }));
        // R100M — Merge pending invites in as participants too. The
        // backend now accepts synthetic ids of the form `pi:<phone>`
        // for paid_by + splits, so the user can log expenses on
        // behalf of friends who haven't joined MintU yet.
        const pending: Member[] = (r.data?.pending_invites || []).map((p: any) => {
          const tail = (p.phone || '').slice(-4);
          const display = (p.name && p.name.trim()) ? p.name : `Member ${tail}`;
          return {
            user_id: `pi:${p.phone}`,
            name: display,
            isPending: true,
          };
        });
        const all = [...ms, ...pending];
        setMembers(all);
        // Default: include everyone, paid_by = me.
        const inc: Record<string, boolean> = {};
        all.forEach((m) => (inc[m.user_id] = true));
        setIncludes(inc);
        if (!all.find((m) => m.user_id === myId)) {
          setPaidBy(all[0]?.user_id || myId);
        }
      } catch (e: any) {
        if (e?.response?.status === 404) {
          router.replace('/split');
        } else {
          setError('Could not load group.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [groupId, myId]);

  const includedIds = useMemo(
    () => members.filter((m) => includes[m.user_id]).map((m) => m.user_id),
    [members, includes],
  );

  // Equal split helper — recomputed on amount/includes change.
  const equalShare = useMemo(() => {
    if (amount <= 0 || includedIds.length === 0) return 0;
    return round2(amount / includedIds.length);
  }, [amount, includedIds]);

  // Auto-redistribute percent shares when membership changes (and the
  // user hasn't started manually editing). Even split: 100 / N rounded
  // to 2dp; the last included member absorbs any remainder so the sum
  // is exactly 100.00.
  useEffect(() => {
    if (splitMode !== 'percent' || pctTouched) return;
    if (includedIds.length === 0) {
      setCustomPcts({});
      return;
    }
    const each = Math.floor((100 / includedIds.length) * 100) / 100; // 2dp
    const next: Record<string, string> = {};
    let running = 0;
    includedIds.forEach((uid, idx) => {
      const v = idx === includedIds.length - 1 ? round2(100 - running) : each;
      running += each;
      next[uid] = String(v);
    });
    setCustomPcts(next);
  }, [splitMode, includedIds, pctTouched]);

  // Build the splits object the backend wants.
  const splits = useMemo(() => {
    const out: Record<string, number> = {};
    if (splitMode === 'equal') {
      members.forEach((m) => {
        if (includes[m.user_id]) out[m.user_id] = equalShare;
      });
    } else if (splitMode === 'custom') {
      members.forEach((m) => {
        if (!includes[m.user_id]) return;
        const v = parseFloat((customAmts[m.user_id] || '').replace(/[^\d.]/g, ''));
        if (!isNaN(v) && v > 0) out[m.user_id] = round2(v);
      });
    } else {
      // percent: amount = total * pct / 100
      members.forEach((m) => {
        if (!includes[m.user_id]) return;
        const p = parseFloat((customPcts[m.user_id] || '').replace(/[^\d.]/g, ''));
        if (!isNaN(p) && p > 0 && amount > 0) {
          out[m.user_id] = round2((amount * p) / 100);
        }
      });
    }
    return out;
  }, [splitMode, members, includes, customAmts, customPcts, equalShare, amount]);

  const splitsTotal = useMemo(
    () => Object.values(splits).reduce((s, v) => s + v, 0),
    [splits]
  );

  const pctTotal = useMemo(() => {
    if (splitMode !== 'percent') return 0;
    return members.reduce((s, m) => {
      if (!includes[m.user_id]) return s;
      const p = parseFloat((customPcts[m.user_id] || '').replace(/[^\d.]/g, ''));
      return s + (isNaN(p) ? 0 : p);
    }, 0);
  }, [splitMode, members, includes, customPcts]);

  const customMismatch =
    splitMode === 'custom' && amount > 0 && Math.abs(splitsTotal - amount) > 0.5;
  const pctMismatch =
    splitMode === 'percent' && Math.abs(pctTotal - 100) > 0.5;

  const canSubmit =
    !submitting &&
    amount > 0 &&
    description.trim().length >= 1 &&
    Object.keys(splits).length >= 1 &&
    !customMismatch &&
    !pctMismatch;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post(
        '/split/expenses',
        {
          group_id: groupId,
          description: description.trim(),
          amount,
          paid_by: paidBy,
          // Backend accepts 'equal' or 'custom'. PERCENT mode dropped
          // in R100Q to reduce decision fatigue.
          split_type: splitMode,
          splits: splitMode === 'equal' ? undefined : splits,
        },
        {
          headers: {
            'Idempotency-Key': `exp-${groupId}-${Date.now()}`,
          },
        }
      );
      // R100Q — Payoff feedback. Closes SF4: actions stop disappearing
      // into the void. The toast names the recipients + amount so the
      // user feels the action landed.
      const numOthers = Math.max(0, Object.keys(splits).length - 1);
      const payerName =
        members.find((m) => m.user_id === paidBy)?.name || 'You';
      const text1 = payerName === 'You'
        ? `Sent · ₹${Math.round(amount).toLocaleString('en-IN')}`
        : `Logged · ${payerName} paid ₹${Math.round(amount).toLocaleString('en-IN')}`;
      Toast.show({
        type: 'success',
        text1,
        text2: numOthers > 0
          ? `Split with ${numOthers} ${numOthers === 1 ? 'person' : 'people'}`
          : 'Saved to this group',
        position: 'bottom',
        visibilityTime: 2400,
      });
      router.back();
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Could not save expense. Try again.';
      setError(typeof msg === 'string' ? msg : 'Could not save.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={st.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={INK} />
        </Pressable>
        <Text style={st.headerTitle}>ENTER AMOUNT TO SPLIT</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* AMOUNT */}
          <View style={st.amountWrap}>
            <Text style={st.amountKicker}>AMOUNT</Text>
            <View style={st.amountRow}>
              <Text style={st.rupee}>₹</Text>
              <TextInput
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0"
                placeholderTextColor="#C0BBB0"
                keyboardType="numeric"
                style={st.amountInput}
                autoFocus
              />
            </View>
          </View>

          {/* DESCRIPTION */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>WHAT FOR?</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Dinner · Petrol · Rent · …"
              placeholderTextColor={MUTED}
              maxLength={80}
              style={st.input}
              autoCapitalize="sentences"
            />
          </View>

          {/* PAID BY */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>PAID BY</Text>
            <View style={st.chipsRow}>
              {members.map((m) => (
                <Pressable
                  key={m.user_id}
                  onPress={() => setPaidBy(m.user_id)}
                  style={[
                    st.chip,
                    paidBy === m.user_id && st.chipOn,
                    m.isPending && !(paidBy === m.user_id) && st.chipPending,
                  ]}
                >
                  <Text
                    style={[
                      st.chipText,
                      paidBy === m.user_id && st.chipTextOn,
                    ]}
                    numberOfLines={1}
                  >
                    {m.name}
                    {m.isPending ? ' · INVITE' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* SPLIT — 3 modes */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>SPLIT</Text>
            <View style={st.modeRow}>
              <ModeBtn
                label="EQUAL"
                active={splitMode === 'equal'}
                onPress={() => { setSplitMode('equal'); }}
                first
              />
              <ModeBtn
                label="CUSTOM"
                active={splitMode === 'custom'}
                onPress={() => { setSplitMode('custom'); }}
                last
              />
            </View>

            {members.map((m) => {
              const on = !!includes[m.user_id];
              const equalLabel = on && splitMode === 'equal' ? fmt(equalShare) : '';
              const pct = parseFloat((customPcts[m.user_id] || '').replace(/[^\d.]/g, ''));
              const pctRupee = on && splitMode === 'percent' && !isNaN(pct) && amount > 0
                ? fmt2((amount * pct) / 100)
                : '';

              return (
                <View key={m.user_id} style={st.memberLine}>
                  <Pressable
                    onPress={() => {
                      setIncludes((prev) => ({ ...prev, [m.user_id]: !on }));
                      if (splitMode === 'percent') setPctTouched(false);
                    }}
                    style={[st.checkbox, on && st.checkboxOn]}
                    hitSlop={6}
                  >
                    {on ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : null}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={st.memberLineName}>{m.name}</Text>
                    {pctRupee ? (
                      <Text style={st.memberSub}>{pctRupee}</Text>
                    ) : null}
                  </View>

                  {splitMode === 'equal' ? (
                    <Text style={st.memberLineRight}>{equalLabel}</Text>
                  ) : splitMode === 'custom' ? (
                    <TextInput
                      value={customAmts[m.user_id] || ''}
                      onChangeText={(v) =>
                        setCustomAmts((prev) => ({ ...prev, [m.user_id]: v }))
                      }
                      keyboardType="numeric"
                      placeholder={on ? '₹0' : '—'}
                      placeholderTextColor={MUTED}
                      editable={on}
                      style={[
                        st.customAmtInput,
                        !on && { opacity: 0.4 },
                      ]}
                    />
                  ) : (
                    <View style={[st.pctInputWrap, !on && { opacity: 0.4 }]}>
                      <TextInput
                        value={customPcts[m.user_id] || ''}
                        onChangeText={(v) => {
                          setPctTouched(true);
                          setCustomPcts((prev) => ({ ...prev, [m.user_id]: v }));
                        }}
                        keyboardType="numeric"
                        placeholder={on ? '0' : '—'}
                        placeholderTextColor={MUTED}
                        editable={on}
                        style={st.pctInput}
                      />
                      <Text style={st.pctSign}>%</Text>
                    </View>
                  )}
                </View>
              );
            })}

            {splitMode === 'custom' && amount > 0 && (
              <Text
                style={[
                  st.customSummary,
                  customMismatch ? { color: DANGER } : { color: POSITIVE },
                ]}
              >
                {fmt(splitsTotal)} of {fmt(amount)}{' '}
                {customMismatch
                  ? `(${splitsTotal > amount ? 'over' : 'under'} by ${fmt(
                      Math.abs(amount - splitsTotal)
                    )})`
                  : '✓'}
              </Text>
            )}

            {splitMode === 'percent' && (
              <Text
                style={[
                  st.customSummary,
                  pctMismatch ? { color: DANGER } : { color: POSITIVE },
                ]}
              >
                {Math.round(pctTotal * 100) / 100}% of 100%{' '}
                {pctMismatch
                  ? `(${pctTotal > 100 ? 'over' : 'under'} by ${
                      Math.round(Math.abs(100 - pctTotal) * 100) / 100
                    }%)`
                  : '✓'}
              </Text>
            )}
          </View>

          {error ? <Text style={st.error}>{error}</Text> : null}
        </ScrollView>

        <View style={st.footer}>
          <Pressable
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              st.submit,
              !canSubmit && st.submitDisabled,
              pressed && canSubmit && st.submitPressed,
            ]}
          >
            <Text style={st.submitText}>
              {submitting ? 'SENDING…' : 'SEND REQUEST'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Mode toggle button ────────────────────────────────────────────
function ModeBtn({
  label, active, onPress, first, last,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        st.modeBtn,
        active && st.modeBtnOn,
        !first && { borderLeftWidth: 0 },
      ]}
    >
      <Text style={[st.modeText, active && st.modeTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 2, color: INK },
  scroll: { paddingTop: 16, paddingBottom: 24 },
  amountWrap: { paddingHorizontal: 20, marginBottom: 24 },
  amountKicker: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    color: MUTED,
    marginBottom: 6,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  rupee: {
    fontSize: 36,
    fontWeight: '900',
    color: INK,
    marginRight: 4,
    fontFamily: MONO,
  },
  amountInput: {
    flex: 1,
    fontSize: 48,
    fontWeight: '900',
    color: INK,
    paddingVertical: 0,
    fontFamily: MONO,
  },
  section: { paddingHorizontal: 20, marginBottom: 22 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    color: INK,
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: INK,
    fontWeight: '700',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    marginRight: 6,
    marginBottom: 6,
  },
  chipOn: { backgroundColor: INK },
  chipPending: { borderStyle: 'dashed', backgroundColor: '#F5F0E5' },
  chipText: { fontSize: 13, fontWeight: '800', color: INK },
  chipTextOn: { color: '#fff' },
  modeRow: { flexDirection: 'row', marginBottom: 10 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  modeBtnOn: { backgroundColor: INK },
  modeText: { fontSize: 12, fontWeight: '900', color: INK, letterSpacing: 1.5 },
  modeTextOn: { color: '#fff' },
  memberLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  memberLineName: { fontSize: 15, fontWeight: '700', color: INK },
  memberSub: { fontSize: 11, fontWeight: '700', color: MUTED, fontFamily: MONO, marginTop: 1 },
  memberLineRight: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
    fontFamily: MONO,
  },
  customAmtInput: {
    minWidth: 90,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    color: INK,
    fontFamily: MONO,
  },
  pctInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 80,
  },
  pctInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    color: INK,
    fontFamily: MONO,
    paddingVertical: 0,
    minWidth: 36,
  },
  pctSign: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
    marginLeft: 4,
    fontFamily: MONO,
  },
  customSummary: {
    fontSize: 12,
    fontWeight: '800',
    color: MUTED,
    marginTop: 8,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  error: {
    color: DANGER,
    fontSize: 13,
    paddingHorizontal: 20,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: PAPER,
  },
  submit: {
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: { backgroundColor: '#E5E0D5' },
  submitPressed: { transform: [{ translateY: 1 }] },
  submitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
