/**
 * Group Detail — REBUILD R100A.
 *
 * The "real engine" of Split per the architecture lock:
 *
 *   STATE                UI
 *   loading              Lightweight skeleton.
 *   no_expenses          Add-first-expense empty pane (single CTA).
 *   all_settled          Expense list, balances row says "All settled",
 *                        Settle button hides.
 *   has_dues_to_others   You-owe rows highlighted, Settle button is
 *                        primary, mission urgency line ("Try to settle
 *                        this week") shown when caller owes.
 *   has_dues_to_me       Owed-to-you rows highlighted, no urgency.
 *
 * Removed surfaces (don't add back):
 *   GroupChat, RewardModal, leaderboard, smart-settle sheet, group manage
 *   sheet, contact picker, reminders banner, premium teaser, drafts,
 *   pending-sync banner, in-app messaging.
 *
 * 3 actions only at the bottom: + Expense · Settle · Invite.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
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
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import BrutalSheet from '../../components/brutalist/primitives/BrutalSheet';
import { BR_COLORS, BR_FONT } from '../../utils/brutalist';
import MintuMascot from '../../components/MintuMascot';
import SettlementCelebration from '../../components/split/SettlementCelebration';
import ExpenseCommentsThread from '../../components/split/ExpenseCommentsThread';

// Brand-kit migration (R100B). Local aliases preserved so the rest of
// this file's StyleSheet entries don't churn — single source of truth
// is `utils/brutalist.ts`.
const {
  ink:      INK,
  paper:    PAPER,
  accent:   ACCENT,
  line:     LINE,
  muted:    MUTED,
  positive: OK,
  negative: DANGER,
} = BR_COLORS;
const MONO = BR_FONT.mono;

// R101E — Centralised Indian-numbering INR. The local `fmt` was
// silently abbreviating any amount ≥ ₹1L into "₹1.3L" mid-row, which
// is bad UX for a finance app: receipts, settlement amounts, single
// debt rows ALL need the precise figure (₹4,79,979 not ₹4.8L). The
// brief codified this rule explicitly. We now route through inr() —
// proper en-IN lakh/crore grouping, no abbreviation.
import { inr as fmt } from '../../utils/inr';

type Member = { user_id: string; name: string; phone?: string };
type Expense = {
  id: string;
  description: string;
  amount: number;
  paid_by: string;
  splits: Record<string, number>;
  created_at: string;
  /** R107 — count of inline comments under this expense (best-effort
   *  hint from the server; UI re-syncs when the thread is opened). */
  comment_count?: number;
};
type Settlement = {
  id?: string;
  group_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  from_name?: string;
  to_name?: string;
  amount: number;
  method?: string;
  created_at?: string;
};
type GroupSummary = {
  id: string;
  name: string;
  members: Member[];
  pending_invites?: { phone: string; name?: string }[];
  custom_emoji?: string;
  group_code?: string;
  created_at?: string;
  balances?: Record<string, number>; // {userId: net} — server convention varies
};

// R100G — Activity feed event model. We synthesize a structured event
// stream from the data we already have (no chat collection needed).
//   - 'group_created'     : timeline anchor from group.created_at
//   - 'expense_added'     : one bubble per expense
//   - 'settlement'        : one bubble per settlement (UPI / cash / offline)
// Events render as GPay-style structured bubbles, sorted newest-first.
//
// R100R — Each `expense_added` event carries `myShare` (amount the
// CALLER owes for that single expense) so the per-bubble "Pay" CTA
// can deep-link UPI for the exact line-item amount, not the group
// aggregate. Pay button only renders when myShare > 0 AND payer is
// the registered MintU user (not a `pi:` pending invite).
type ActivityEvent =
  | {
      kind: 'group_created';
      ts: string;
      group_name: string;
    }
  | {
      kind: 'expense_added';
      ts: string;
      expense_id: string;
      payer_id: string;
      payer_name: string;
      payer_is_pending: boolean;
      amount: number;
      my_share: number;
      description: string;
      members_count: number;
    }
  | {
      kind: 'settlement';
      ts: string;
      from_id?: string;
      from_name: string;
      to_id?: string;
      to_name: string;
      amount: number;
      method: string;
    };

// Compute per-member net for the whole group from raw expenses.
// Positive value for a memberId = group owes them; negative = they owe group.
function computeNet(
  expenses: Expense[]
): Record<string, number> {
  const net: Record<string, number> = {};
  for (const e of expenses) {
    const payer = e.paid_by;
    for (const [uid, amt] of Object.entries(e.splits || {})) {
      const a = Number(amt) || 0;
      if (uid === payer) continue;
      net[payer] = (net[payer] || 0) + a;
      net[uid] = (net[uid] || 0) - a;
    }
  }
  return net;
}

// From raw nets, produce the "you owe X / X owes you" rows for the
// current user, filtered to the OTHER members of the group.
function pairwiseFromNets(
  myId: string,
  members: Member[],
  net: Record<string, number>
): { youOwe: { id: string; name: string; amount: number }[]; owesYou: { id: string; name: string; amount: number }[] } {
  const me = net[myId] || 0;
  const youOwe: { id: string; name: string; amount: number }[] = [];
  const owesYou: { id: string; name: string; amount: number }[] = [];
  // Heuristic: distribute pairwise debts in proportion to others' nets.
  // For a 2-person group this is exact; for N>2 it approximates the true
  // pairwise breakdown but is enough for UI urgency. The server's settle
  // endpoint computes exact pairwise debt at write time so the UI never
  // can lock the user into a wrong settlement.
  const others = members.filter((m) => m.user_id !== myId);
  if (others.length === 0) return { youOwe, owesYou };
  if (me < 0) {
    // I owe the group |me| in total. Distribute across positive-net others.
    const positives = others.filter((m) => (net[m.user_id] || 0) > 0);
    const totalPositive = positives.reduce(
      (s, m) => s + (net[m.user_id] || 0),
      0
    ) || 1;
    for (const m of positives) {
      const share = (Math.abs(me) * (net[m.user_id] || 0)) / totalPositive;
      if (share >= 0.5)
        youOwe.push({ id: m.user_id, name: m.name, amount: round2(share) });
    }
  } else if (me > 0) {
    const negatives = others.filter((m) => (net[m.user_id] || 0) < 0);
    const totalNegative = negatives.reduce(
      (s, m) => s + Math.abs(net[m.user_id] || 0),
      0
    ) || 1;
    for (const m of negatives) {
      const share = (me * Math.abs(net[m.user_id] || 0)) / totalNegative;
      if (share >= 0.5)
        owesYou.push({ id: m.user_id, name: m.name, amount: round2(share) });
    }
  }
  return { youOwe, owesYou };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// R100R — Calendar day bucket key (YYYY-MM-DD, local time) used to
// detect day boundaries when injecting GPay-style date dividers.
function bucketDayKey(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Human-friendly day label: "Today" / "Yesterday" / "06 May" / "06 May 2024"
// (year is appended only when the date is NOT in the current calendar year
// — keeps the chip tight in 95 % of cases).
function dayLabel(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const myId = user?.id || '';
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  // R100N — When the user taps a specific "you owe X" row, scope
  // the SettleSheet down to JUST that person. undefined = show all.
  const [settleTargetId, setSettleTargetId] = useState<string | undefined>(undefined);
  // R107 — Settlement celebration overlay. Fires when `markOffline`
  // resolves successfully so the user gets a screen-filling reward
  // moment instead of just a top toast. Auto-dismiss in 2.2s.
  const [celebrate, setCelebrate] = useState<{ amount: number; name?: string } | null>(null);
  // R100G — Activity / Expenses tab state. Activity is the default
  // because for active groups it answers "what just happened?" — the
  // top-of-mind question when re-opening a group. Expenses tab is the
  // canonical ledger for editing/deleting individual line items.
  const [tab, setTab] = useState<'activity' | 'expenses'>('activity');

  const load = useCallback(
    async (showSpinner = true) => {
      if (!id) return;
      if (showSpinner) setLoading(true);
      try {
        const [g, ex, settles] = await Promise.all([
          api.get(`/split/groups/${id}/manage`).then((r) => r.data),
          api
            .get(`/split/groups/${id}/expenses`)
            .then((r) => r.data?.expenses || r.data || []),
          // Fetch all settlements; filter to this group client-side.
          api
            .get(`/split/settlements`)
            .then((r) => (Array.isArray(r.data) ? r.data : r.data?.settlements || []))
            .catch(() => []),
        ]);
        setGroup(g);
        setExpenses(Array.isArray(ex) ? ex : []);
        const gid = String(id);
        // R100L — STRICT group_id filter. The previous OR clause
        // (`!s.group_id || ...`) was leaking direct user-to-user
        // settlements (which have null group_id) into every group's
        // activity feed — the "Paid Someone ₹32,247" bug. Settlements
        // unattached to a group MUST NOT appear in any group context.
        const filtered = (settles || []).filter((s: Settlement) =>
          !!s.group_id && String(s.group_id) === gid
        );
        setSettlements(filtered);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          // Group deleted or no access — bounce back to list.
          router.replace('/split');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      // Refetch on focus. We DO NOT depend on `group` here — the
      // setState after a successful load mustn't re-trigger this
      // callback (that was the R100A reload-loop bug).
      load(false);
    }, [load])
  );

  useEffect(() => {
    load(true);
  }, [load]);

  const net = useMemo(() => computeNet(expenses), [expenses]);
  // R100N — Unified participant list. pairwiseFromNets needs to see
  // pending invites too; otherwise expenses paid by/owed to a `pi:`
  // participant get silently dropped from the balance breakdown
  // (causing "All settled." while real debts exist on paper).
  // R100O — Friendly name resolver. Never leak full phone numbers.
  // Prefers explicit name → falls back to "Member XXXX" with last 4
  // digits. Used everywhere we render a participant label.
  const friendly = (name?: string, phone?: string): string => {
    const trimmed = (name || '').trim();
    if (trimmed) return trimmed;
    const tail = (phone || '').replace(/\D/g, '').slice(-4);
    return tail ? `Member ${tail}` : 'Member';
  };

  // R101E — TRUST FIX: pending invitees no longer participate in the
  // pairwise net-debt computation. Before this fix, expenses logged on
  // behalf of a pending invite ("pi:<phone>") were folded into the
  // user's "owesYou" totals, simulating debt that no real person had
  // ever accepted ("Haraki owes you ₹1.3L" — except Haraki never
  // joined). We now keep ONLY confirmed members in the math surface
  // and render pending invitees in a dedicated "Waiting to join"
  // section that does NOT contribute to net totals.
  const participants = useMemo<Member[]>(() => {
    if (!group) return [];
    return group.members.map((m) => ({
      user_id: m.user_id,
      name: m.user_id === myId ? 'You' : m.name,
    }));
  }, [group, myId]);

  // Pending invitee rows — rendered separately, never in net-debt totals.
  const pendingInviteRows = useMemo(() => {
    if (!group) return [];
    return (group.pending_invites || []).map((p: any) => ({
      phone: p.phone as string,
      name: friendly(p.name, p.phone),
    }));
  }, [group]);

  const { youOwe, owesYou } = useMemo(
    () =>
      group
        ? pairwiseFromNets(myId, participants, net)
        : { youOwe: [], owesYou: [] },
    [group, myId, net, participants]
  );

  const totalYouOwe = youOwe.reduce((s, r) => s + r.amount, 0);
  const totalOwesYou = owesYou.reduce((s, r) => s + r.amount, 0);

  const mode = useMemo(() => {
    if (loading || !group) return 'loading';
    if (expenses.length === 0) return 'no_expenses';
    if (totalYouOwe < 0.5 && totalOwesYou < 0.5) return 'all_settled';
    if (totalYouOwe >= 0.5) return 'has_dues_to_others';
    return 'has_dues_to_me';
  }, [loading, group, expenses.length, totalYouOwe, totalOwesYou]);

  // R100G — Activity feed: synthesize a structured event timeline
  // from data we already have. No new collection, no chat. Each event
  // renders as a GPay-style payment/settlement bubble.
  const activityEvents = useMemo<ActivityEvent[]>(() => {
    if (!group) return [];
    const events: ActivityEvent[] = [];

    // Group creation anchor (only if we have a timestamp).
    if (group.created_at) {
      events.push({
        kind: 'group_created',
        ts: group.created_at,
        group_name: group.name,
      });
    }

    // R100M — Resolve helper handles both real user_ids AND synthetic
    // `pi:<phone>` ids minted when a user logs an expense on behalf of
    // a pending invite. Without this, those ids fell through to
    // "Someone".
    const resolveName = (uid?: string | null): string => {
      if (!uid) return 'Someone';
      const m = group.members.find((m) => m.user_id === uid);
      if (m) return m.name;
      // Synthetic `pi:<phone>` ids — use friendly name from
      // pending_invites if we have it, else "Member XXXX".
      if (typeof uid === 'string' && uid.startsWith('pi:')) {
        const ph = uid.slice(3);
        const pi = (group.pending_invites || []).find((p: any) => p.phone === ph);
        return friendly(pi?.name, ph);
      }
      const pi = (group.pending_invites || []).find((p) => p.phone === uid);
      if (pi) return friendly((pi as any).name, pi.phone);
      return 'Someone';
    };

    // One bubble per expense.
    for (const e of expenses) {
      const isPayerPending = typeof e.paid_by === 'string' && e.paid_by.startsWith('pi:');
      events.push({
        kind: 'expense_added',
        ts: e.created_at,
        expense_id: e.id || `${e.created_at}-${e.description}`,
        payer_id: e.paid_by,
        payer_name: resolveName(e.paid_by),
        payer_is_pending: isPayerPending,
        amount: Number(e.amount) || 0,
        // Caller's share for THIS expense — the per-bubble "Pay" CTA
        // deep-links UPI for exactly this amount, not the group total.
        my_share: Number(e.splits?.[myId] || 0),
        description: e.description || '(no description)',
        members_count: Object.keys(e.splits || {}).length || group.members.length,
      });
    }

    // One bubble per settlement.
    for (const s of settlements) {
      events.push({
        kind: 'settlement',
        ts: s.created_at || new Date().toISOString(),
        from_id: s.from_user_id,
        from_name: s.from_name || resolveName(s.from_user_id),
        to_id: s.to_user_id,
        to_name: s.to_name || resolveName(s.to_user_id),
        amount: Number(s.amount) || 0,
        method: s.method || 'paid',
      });
    }

    // Newest first.
    return events.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  }, [group, expenses, settlements, myId]);

  // R100R — Direct UPI deep-link from per-bubble Pay button.
  // Routes through the same pay-intent endpoint the SettleSheet uses
  // but is single-tap (no sheet, no confirm) for max GPay-parity.
  // Falls back to the SettleSheet on any failure (no UPI ID, no app
  // installed, network) so the user always has a path forward.
  const payDirect = useCallback(
    async (payerId: string, amount: number) => {
      if (!payerId || amount < 0.5) return;
      // Synthetic pi: identities cannot be paid via UPI — surface
      // the same offline path the balance row uses.
      if (typeof payerId === 'string' && payerId.startsWith('pi:')) {
        Alert.alert(
          'Awaiting MintU sign-up',
          'This person hasn\'t joined MintU yet — UPI settle isn\'t available. Use Settle to mark this paid offline.',
        );
        return;
      }
      try {
        const r = await api.get(
          `/split/pay-intent/${payerId}?amount=${amount.toFixed(2)}`
        );
        const link = r?.data?.upi_link;
        if (link) {
          const can = await Linking.canOpenURL(link);
          if (can) {
            await Linking.openURL(link);
          } else {
            Alert.alert(
              'No UPI app found',
              'Install GPay, PhonePe, Paytm or BHIM to pay via UPI.'
            );
          }
        } else {
          // No UPI ID on file — fall back to settle sheet (offline).
          setSettleTargetId(payerId);
          setSettleOpen(true);
        }
      } catch (e: any) {
        const msg = e?.response?.data?.detail || 'Could not open UPI app.';
        Alert.alert('Pay via UPI', String(msg), [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Settle offline',
            onPress: () => {
              setSettleTargetId(payerId);
              setSettleOpen(true);
            },
          },
        ]);
      }
    },
    []
  );

  return (
    <SafeAreaView style={st.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={INK} />
        </Pressable>
        <View style={st.headerMid}>
          <Text style={st.headerTitle} numberOfLines={1}>
            {group?.name || ' '}
          </Text>
          {group?.group_code ? (
            <Text style={st.headerCode}>{group.group_code}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push(`/split/${id}/settings` as any)}
          hitSlop={10}
          accessibilityLabel="Group settings"
          testID="split-header-settings"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={INK} />
        </Pressable>
      </View>

      {mode === 'loading' ? (
        <View style={st.loadingPane}>
          <ActivityIndicator size="small" color={INK} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(false);
              }}
              tintColor={INK}
            />
          }
        >
          {/* MEMBERS chip row */}
          {group ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.membersRow}
            >
              {group.members.map((m) => (
                <View
                  key={m.user_id}
                  style={[
                    st.memberChip,
                    m.user_id === myId && st.memberChipMe,
                  ]}
                >
                  <Text
                    style={[
                      st.memberChipText,
                      m.user_id === myId && st.memberChipTextMe,
                    ]}
                  >
                    {m.user_id === myId ? 'You' : m.name}
                  </Text>
                </View>
              ))}
              {(group.pending_invites || []).map((p, idx) => (
                <View key={`pi-${idx}`} style={[st.memberChip, st.memberChipPending]}>
                  <Text style={st.memberChipPendingText}>
                    {((p as any).name && (p as any).name.trim())
                      ? (p as any).name
                      : `Member ${(p.phone || '').slice(-4)}`}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {/* R101E — HONESTY BANNER for pending invitees.
              The brief: pending invitees must NEVER appear as finalised
              debt. We now (a) exclude them from net-balance math and
              (b) surface them in their own section that says exactly
              what's true: "this person hasn't joined yet, the bill
              will only count once they do". Replaces the silent debt
              simulation that produced "Haraki owes you ₹1.3L". */}
          {pendingInviteRows.length > 0 && (
            <View style={st.pendingBanner}>
              <View style={st.pendingBannerHead}>
                <Ionicons name="hourglass-outline" size={14} color={INK} />
                <Text style={st.pendingBannerTitle}>
                  WAITING TO JOIN · {pendingInviteRows.length} invite{pendingInviteRows.length === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={st.pendingBannerSub}>
                Splits with these friends activate after they sign up. Until then, nothing is owed.
              </Text>
              <View style={st.pendingBannerList}>
                {pendingInviteRows.map((p) => (
                  <View key={p.phone} style={st.pendingRow}>
                    <View style={st.pendingDot} />
                    <Text style={st.pendingRowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={st.pendingRowState}>PENDING</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* R101I — SMART SETTLE banner. Surfaces ONLY when the
              caller has ≥2 outgoing debts in this group: tells them
              they can clear N debts in one sitting. Tapping opens
              SettleSheet with all of them so partial-pay + Razorpay/
              UPI/offline applies row-by-row. Educational + actionable;
              never lies about consolidating money. */}
          {youOwe.length >= 2 && (
            <Pressable
              onPress={() => {
                setSettleTargetId(undefined);
                setSettleOpen(true);
              }}
              style={({ pressed }) => [
                st.smartSettleBanner,
                pressed && { transform: [{ translateY: 1 }] },
              ]}
              testID="smart-settle-banner"
            >
              <View style={st.smartSettleHead}>
                <Ionicons name="flash" size={14} color={INK} />
                <Text style={st.smartSettleTitle}>SMART SETTLE</Text>
              </View>
              <Text style={st.smartSettleBody}>
                You owe {youOwe.length} people · {fmt(totalYouOwe)} total.
                Clear all in one place — UPI, cards, or offline.
              </Text>
              <View style={st.smartSettleFoot}>
                <Text style={st.smartSettleCta}>SETTLE ALL →</Text>
              </View>
            </Pressable>
          )}

          {/* BALANCE SUMMARY — hidden when there's nothing to summarise. */}
          {mode === 'all_settled' ? (
            <View style={[st.balanceCard, st.allSettledCard]}>
              <Text style={st.allSettledEmoji}>🤝</Text>
              <Text style={st.allSettled}>All settled.</Text>
              <Text style={st.allSettledSub}>
                Nobody owes anybody. High five.
              </Text>
              {settlements.length > 0 && (
                <Pressable
                  onPress={() => setTab('activity')}
                  style={({ pressed }) => [
                    st.allSettledLink,
                    pressed && { opacity: 0.6 },
                  ]}
                  hitSlop={6}
                  testID="view-settlements-link"
                >
                  <Text style={st.allSettledLinkTxt}>
                    SEE ALL {settlements.length} SETTLEMENT{settlements.length === 1 ? '' : 'S'} →
                  </Text>
                </Pressable>
              )}
            </View>
          ) : owesYou.length > 0 || youOwe.length > 0 ? (
            <View style={st.balanceCard}>
              {owesYou.map((r) => {
                const isPending = r.id.startsWith('pi:');
                return (
                  <Pressable
                    key={`o-${r.id}`}
                    onPress={() => {
                      if (isPending) {
                        Alert.alert(
                          'Awaiting MintU sign-up',
                          `${r.name} hasn't joined MintU yet. Once they do, you can mark this collected here. For now, settle offline if they've already paid.`
                        );
                      } else {
                        // Owed-to-you rows are info-only — they need to settle
                        // YOUR way. Tapping just acknowledges the row.
                      }
                    }}
                    style={({ pressed }) => [
                      st.balanceRow,
                      pressed && { opacity: 0.5 },
                    ]}
                    testID={`balance-row-owes-${r.id}`}
                  >
                    <Text style={st.balanceText} numberOfLines={1}>
                      <Text style={st.balanceName}>{r.name}</Text> owes you
                      {isPending ? <Text style={st.balancePending}> · INVITED</Text> : null}
                    </Text>
                    <Text style={[st.balanceAmt, { color: OK }]}>
                      {fmt(r.amount)}
                    </Text>
                  </Pressable>
                );
              })}
              {youOwe.map((r) => {
                const isPending = r.id.startsWith('pi:');
                return (
                  <Pressable
                    key={`y-${r.id}`}
                    onPress={() => {
                      if (isPending) {
                        Alert.alert(
                          'Awaiting MintU sign-up',
                          `${r.name} hasn't joined MintU yet — UPI settle isn't available. Mark this paid offline once you've paid them in cash/UPI.`,
                          [
                            { text: 'OK', style: 'cancel' },
                            {
                              text: 'Mark paid offline',
                              onPress: () => {
                                setSettleTargetId(r.id);
                                setSettleOpen(true);
                              },
                            },
                          ]
                        );
                      } else {
                        setSettleTargetId(r.id);
                        setSettleOpen(true);
                      }
                    }}
                    style={({ pressed }) => [
                      st.balanceRow,
                      pressed && { opacity: 0.5 },
                    ]}
                    testID={`balance-row-youowe-${r.id}`}
                  >
                    <Text style={st.balanceText} numberOfLines={1}>
                      You owe <Text style={st.balanceName}>{r.name}</Text>
                      {isPending ? <Text style={st.balancePending}> · INVITED</Text> : null}
                    </Text>
                    <Text style={[st.balanceAmt, { color: DANGER }]}>
                      {fmt(r.amount)}
                    </Text>
                  </Pressable>
                );
              })}
              {totalYouOwe >= 0.5 && (
                <Text style={st.urgency}>
                  Tap a row to settle — UPI, cards, or just mark it offline.
                </Text>
              )}
            </View>
          ) : null}

          {/* TAB SWITCHER — Chat / Expenses (R100I, GPay-aligned).
              Tab labels match GPay exactly per user directive
              ("Redesign split functions exactly like GPay"). The
              Chat tab shows GPay-style structured payment-request
              bubbles (no free-text). Expenses tab is the canonical
              ledger with "Owed by you / Owed to you" hero. */}
          <View style={st.tabRow}>
            <Pressable
              onPress={() => setTab('activity')}
              style={[st.tabBtn, tab === 'activity' && st.tabBtnActive]}
              testID="split-tab-activity"
            >
              <Text style={[st.tabTxt, tab === 'activity' && st.tabTxtActive]}>
                CHAT
              </Text>
              <Text style={[st.tabCount, tab === 'activity' && st.tabCountActive]}>
                {activityEvents.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('expenses')}
              style={[st.tabBtn, tab === 'expenses' && st.tabBtnActive]}
              testID="split-tab-expenses"
            >
              <Text style={[st.tabTxt, tab === 'expenses' && st.tabTxtActive]}>
                EXPENSES
              </Text>
              <Text style={[st.tabCount, tab === 'expenses' && st.tabCountActive]}>
                {expenses.length}
              </Text>
            </Pressable>
          </View>

          {tab === 'activity' ? (
            // ── ACTIVITY: structured event bubbles, no chat. ─────
            mode === 'no_expenses' ? (
              <View style={st.emptyExpenses}>
                <MintuMascot size={84} state="idle" style={{ marginBottom: 12 }} />
                <Text style={st.emptyExpensesTitle}>Nothing happened yet.</Text>
                <Text style={st.emptyExpensesBody}>
                  Log the first expense — events show up here.
                </Text>
              </View>
            ) : (
              <View style={{ paddingTop: 4 }}>
                {(() => {
                  // R100R — GPay-style date dividers. Walk the event
                  // list (already sorted newest→oldest) and inject a
                  // sticky-style chip whenever the calendar day rolls
                  // over. "Today" / "Yesterday" / "06 May" — short,
                  // unambiguous, matches GPay's Activity grammar.
                  const nodes: React.ReactNode[] = [];
                  let prevDayKey = '';
                  activityEvents.forEach((ev, idx) => {
                    const dayKey = bucketDayKey(ev.ts);
                    if (dayKey && dayKey !== prevDayKey) {
                      nodes.push(
                        <DateDivider
                          key={`d-${dayKey}-${idx}`}
                          label={dayLabel(ev.ts)}
                        />
                      );
                      prevDayKey = dayKey;
                    }
                    // Pay-CTA wiring — only on unpaid expense bubbles
                    // where the caller is a debtor (not the payer)
                    // AND the payer is a registered MintU user.
                    let onPay: (() => void) | undefined;
                    if (
                      ev.kind === 'expense_added' &&
                      ev.payer_id !== myId &&
                      !ev.payer_is_pending &&
                      ev.my_share >= 0.5
                    ) {
                      onPay = () => payDirect(ev.payer_id, ev.my_share);
                    }
                    nodes.push(
                      <ActivityBubble
                        key={`ev-${idx}-${ev.ts}`}
                        event={ev}
                        myId={myId}
                        onPay={onPay}
                      />
                    );
                  });
                  return nodes;
                })()}
              </View>
            )
          ) : (
            // ── EXPENSES: canonical ledger. ──────────────────────
            mode === 'no_expenses' ? (
              <View style={st.emptyExpenses}>
                <MintuMascot size={84} state="idle" style={{ marginBottom: 12 }} />
                <Text style={st.emptyExpensesTitle}>No expenses yet.</Text>
                <Text style={st.emptyExpensesBody}>
                  Log the first one and balances appear instantly.
                </Text>
              </View>
            ) : (
              expenses
                .slice()
                .sort((a, b) =>
                  (b.created_at || '').localeCompare(a.created_at || '')
                )
                .map((e) => (
                  <ExpenseRow
                    key={e.id || `${e.description}-${e.created_at}`}
                    exp={e}
                    members={group?.members || []}
                    myId={myId}
                  />
                ))
            )
          )}
        </ScrollView>
      )}

      {/* STICKY ACTION BAR */}
      {mode !== 'loading' && (
        <View style={st.actionBar}>
          <Pressable
            style={({ pressed }) => [st.actionBtn, pressed && st.actionBtnPressed]}
            onPress={() => router.push(`/split/${id}/add` as any)}
          >
            <Ionicons name="add" size={18} color={INK} />
            <Text style={st.actionText}>EXPENSE</Text>
          </Pressable>
          <Pressable
            disabled={totalYouOwe < 0.5}
            style={({ pressed }) => [
              st.actionBtnPrimary,
              totalYouOwe < 0.5 && st.actionBtnDisabled,
              pressed && totalYouOwe >= 0.5 && st.actionBtnPressed,
            ]}
            onPress={() => setSettleOpen(true)}
          >
            <Text style={st.actionTextPrimary}>
              {totalYouOwe < 0.5 ? 'NOTHING TO SETTLE' : `SETTLE ${fmt(totalYouOwe)}`}
            </Text>
          </Pressable>
        </View>
      )}

      <SettleSheet
        visible={settleOpen}
        onClose={() => { setSettleOpen(false); setSettleTargetId(undefined); }}
        rows={settleTargetId ? youOwe.filter(r => r.id === settleTargetId) : youOwe}
        groupId={id || ''}
        onSettled={(amt, withName) => {
          setSettleOpen(false);
          setSettleTargetId(undefined);
          load(false);
          // R107 — Fire the brutal celebration overlay if we have a
          // resolved amount. Pure UI sugar — never blocks the data
          // refresh path. Auto-dismisses internally.
          if (typeof amt === 'number' && amt > 0) {
            setCelebrate({ amount: amt, name: withName });
          }
        }}
      />
      {celebrate && (
        <SettlementCelebration
          visible={!!celebrate}
          amount={celebrate.amount}
          withName={celebrate.name}
          onClose={() => setCelebrate(null)}
        />
      )}
    </SafeAreaView>
  );
}

function ExpenseRow({
  exp,
  members,
  myId,
}: {
  exp: Expense;
  members: Member[];
  myId: string;
}) {
  const payerName =
    members.find((m) => m.user_id === exp.paid_by)?.name || 'Someone';
  const payerIsMe = exp.paid_by === myId;
  const myShare = Number(exp.splits?.[myId] || 0);

  // Format relative day
  const date = exp.created_at ? new Date(exp.created_at) : null;
  const dateStr =
    date && !isNaN(date.getTime())
      ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      : '';

  return (
    <View style={st.expRow}>
      <View style={st.expMid}>
        <Text style={st.expDesc} numberOfLines={1}>
          {exp.description || '(no description)'}
        </Text>
        <Text style={st.expSub}>
          {payerIsMe ? 'You' : payerName} paid · {dateStr}
        </Text>
        {/* R107 — contextual embedded comms. Each row becomes its own
            mini-thread so flatmates can ask "why is this 1.5x?" without
            leaving the receipt context. */}
        {exp.id ? (
          <ExpenseCommentsThread
            expenseId={exp.id}
            seedCount={Number(exp.comment_count || 0)}
          />
        ) : null}
      </View>
      <View style={st.expRight}>
        <Text style={st.expAmt}>{fmt(exp.amount)}</Text>
        {myShare > 0 ? (
          <Text style={st.expShare}>
            your share {fmt(myShare)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DATE DIVIDER (R100R) — GPay-style date chip injected between event groups.
//
// Visual: brutalist hard-shadow chip, centered, accent-yellow background.
// Renders as the user's calendar day rolls over while scrolling the
// activity feed. "Today" / "Yesterday" / "06 May" / "06 May 2024".
// ─────────────────────────────────────────────────────────────────────────
function DateDivider({ label }: { label: string }) {
  if (!label) return null;
  return (
    <View style={st.dateDividerWrap}>
      <View style={st.dateDividerLine} />
      <View style={st.dateDividerChip}>
        <Text style={st.dateDividerTxt}>{label}</Text>
      </View>
      <View style={st.dateDividerLine} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY BUBBLE — GPay-aligned structured event renderer (R100I).
//
// Per user directive ("Redesign split functions exactly like GPay"),
// these bubbles now match GPay's visual grammar:
//   • White rounded card (radius 14) with soft shadow (light borders
//     only, no brutalist 2-px ink frames)
//   • Sender name above the bubble (small bold)
//   • "Requested for 'X'" header line
//   • Big mono ₹ amount (24pt)
//   • Member avatar circle
//   • Progress bar with "1/1 paid" / "0/1 paid" copy
//   • Status pill row (green check + "Paid · 1 May" or clock + "Unpaid")
//   • "Pay" pill button on unpaid items the user owes
//   • Date dividers between event groups
//
// Strict structure — NO free-text rendering. Always the same fields
// in the same positions. Trust loop: user can scan a 5-day history
// in 3 seconds without reading prose.
// ─────────────────────────────────────────────────────────────────────────
function ActivityBubble({
  event,
  myId,
  onPay,
}: {
  event: ActivityEvent;
  myId: string;
  onPay?: () => void;
}) {
  const tsText = (() => {
    if (!event.ts) return '';
    const d = new Date(event.ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short',
    });
  })();

  // ── Date divider for group_created
  if (event.kind === 'group_created') {
    return (
      <View style={st.systemPillWrap}>
        <View style={st.systemPill}>
          <Ionicons name="flag" size={11} color={MUTED} />
          <Text style={st.systemPillTxt}>
            Group created · {event.group_name}
          </Text>
        </View>
      </View>
    );
  }

  // ── Expense added — GPay "Requested for X" bubble
  if (event.kind === 'expense_added') {
    const isMe = event.payer_id === myId;
    const senderName = isMe ? 'You' : event.payer_name;
    // R101H — Outstanding-days indicator. If an expense is unpaid AND
    // older than 14 days, surface the wait gently as a chip in the
    // status row. Past 30 days the chip turns red — emotional UX cue
    // that this is no longer "young debt" and a friend is waiting.
    const daysOld = (() => {
      if (!event.ts) return 0;
      const t = new Date(event.ts).getTime();
      if (isNaN(t)) return 0;
      return Math.floor((Date.now() - t) / 86400000);
    })();
    const showStale = !isMe && onPay && daysOld >= 14;
    const isVeryStale = daysOld >= 30;
    // For expenses logged by me, the bubble is right-aligned; others left.
    return (
      <View style={[st.gpWrap, isMe ? st.gpWrapRight : st.gpWrapLeft]}>
        <Text style={[st.gpSender, isMe && { textAlign: 'right' }]}>
          {senderName}
        </Text>
        <View style={st.gpBubble}>
          <Text style={st.gpHeader} numberOfLines={1}>
            Requested for &lsquo;{event.description}&rsquo;
          </Text>
          <Text style={st.gpAmount}>{fmt(event.amount)}</Text>
          <View style={st.gpAvatarRow}>
            <View style={st.gpAvatar}>
              <Text style={st.gpAvatarLetter}>
                {senderName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
          {/* Progress bar — every expense at creation = 0/N paid. The
              bubble doesn't track real-time paid splits yet (would
              need backend per-split status), so we render the
              optimistic baseline that mirrors GPay's empty state. */}
          <View style={st.gpProgressRow}>
            <View style={st.gpProgressTrack}>
              <View style={[st.gpProgressFill, { width: '0%' }]} />
            </View>
            <Text style={st.gpProgressLbl}>
              0/{Math.max(1, event.members_count - 1)} paid
            </Text>
          </View>
          {/* Status pill row */}
          <View style={st.gpStatusRow}>
            <Ionicons name="time-outline" size={14} color={MUTED} />
            <Text style={st.gpStatusTxt}>Unpaid · {tsText}</Text>
            {showStale && (
              <View style={[st.gpStaleChip, isVeryStale && st.gpStaleChipHot]}>
                <Text style={[st.gpStaleTxt, isVeryStale && st.gpStaleTxtHot]}>
                  {daysOld}D
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={14} color={MUTED} style={{ marginLeft: 'auto' }} />
          </View>
          {/* Pay button — only when the current user owes (not the payer) */}
          {!isMe && onPay && (
            <Pressable
              onPress={onPay}
              style={({ pressed }) => [
                st.gpPayBtn,
                pressed && { opacity: 0.85 },
              ]}
              testID="bubble-pay"
            >
              <Text style={st.gpPayTxt}>Pay</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ── Settlement — GPay-style "Paid" bubble
  const isMe = event.from_id === myId;
  const senderName = isMe ? 'You' : event.from_name;
  return (
    <View style={[st.gpWrap, isMe ? st.gpWrapRight : st.gpWrapLeft]}>
      <Text style={[st.gpSender, isMe && { textAlign: 'right' }]}>
        {senderName}
      </Text>
      <View style={[st.gpBubble, st.gpBubbleSettle]}>
        <Text style={st.gpHeader} numberOfLines={1}>
          Paid {event.to_name}
        </Text>
        <Text style={[st.gpAmount, { color: OK }]}>{fmt(event.amount)}</Text>
        <View style={st.gpProgressRow}>
          <View style={st.gpProgressTrack}>
            <View style={[st.gpProgressFill, { width: '100%', backgroundColor: OK }]} />
          </View>
          <Text style={[st.gpProgressLbl, { color: OK }]}>1/1 paid</Text>
        </View>
        <View style={st.gpStatusRow}>
          <View style={st.gpCheckBadge}>
            <Ionicons name="checkmark" size={11} color="#fff" />
          </View>
          <Text style={[st.gpStatusTxt, { color: OK }]}>Paid · {tsText}</Text>
          <Ionicons name="chevron-forward" size={14} color={MUTED} style={{ marginLeft: 'auto' }} />
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SETTLE BOTTOM SHEET — kept inline. Two outcomes only: UPI link or
// "Mark paid offline". No coin redeem, no rewards path.
// ─────────────────────────────────────────────────────────────────────────
function SettleSheet({
  visible,
  onClose,
  rows,
  groupId,
  onSettled,
}: {
  visible: boolean;
  onClose: () => void;
  rows: { id: string; name: string; amount: number }[];
  groupId: string;
  /** R107 — onSettled now receives (amount, withName) so the caller
   *  can render the SettlementCelebration with the actual figure. */
  onSettled: (amount?: number, withName?: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  // R101G — Per-row partial-amount input. When a value is set the
  // pay actions use that amount instead of the full debt. Empty/0 →
  // pay the full row amount (preserves the prior 1-tap UX).
  const [partial, setPartial] = useState<Record<string, string>>({});

  const effectiveAmount = (rowId: string, fullAmt: number): number => {
    const raw = (partial[rowId] || '').trim();
    if (!raw) return fullAmt;
    const n = parseFloat(raw);
    if (!isFinite(n) || n <= 0) return fullAmt;
    return Math.min(n, fullAmt);
  };

  const payUpi = async (targetId: string, fullAmount: number) => {
    const amount = effectiveAmount(targetId, fullAmount);
    setBusyId(targetId);
    try {
      const r = await api.get(
        `/split/pay-intent/${targetId}?amount=${amount.toFixed(2)}`
      );
      const link = r?.data?.upi_link;
      if (link) {
        const can = await Linking.canOpenURL(link);
        if (can) await Linking.openURL(link);
        else
          Alert.alert(
            'No UPI app found',
            'Install GPay, PhonePe, Paytm or BHIM to pay via UPI.'
          );
      } else {
        Alert.alert('UPI unavailable', "They haven't added a UPI ID yet. Mark paid offline instead.");
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not open UPI app.';
      Alert.alert('Pay via UPI', String(msg));
    } finally {
      setBusyId(null);
    }
  };

  // R101G — Razorpay flow. Creates an order and opens the hosted
  // checkout page in the device browser. The page completes the
  // pay-and-verify cycle; on return the user pulls-to-refresh and
  // the settlement appears in the activity feed.
  const payRazorpay = async (targetId: string, fullAmount: number) => {
    const amount = effectiveAmount(targetId, fullAmount);
    setBusyId(targetId);
    try {
      const r = await api.post('/split/razorpay-order', {
        target_user_id: targetId,
        amount,
        group_id: groupId,
      });
      const url = r?.data?.checkout_url;
      if (url) {
        const can = await Linking.canOpenURL(url);
        if (can) {
          await Linking.openURL(url);
          // Soft hint: tap-back will refresh.
          setTimeout(() => onSettled(), 600);
        } else {
          Alert.alert(
            'Browser unavailable',
            'Could not open the payment page on this device.'
          );
        }
      } else {
        Alert.alert(
          'Cards/Netbanking unavailable',
          'Payment service is misconfigured. Please use UPI or mark paid offline.'
        );
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        'Could not start the card / netbanking flow.';
      Alert.alert('Pay with cards', String(msg));
    } finally {
      setBusyId(null);
    }
  };

  const markOffline = async (targetId: string, amount: number) => {
    setBusyId(targetId);
    try {
      await api.post(
        '/split/mark-paid-offline',
        { target_user_id: targetId, amount, group_id: groupId },
        {
          headers: {
            'Idempotency-Key': `settle-${groupId}-${targetId}-${Date.now()}`,
          },
        }
      );
      // Silent mission contribute — non-blocking, swallow 404 while
      // missions router isn't registered yet.
      api
        .post(
          '/missions/contribute',
          { amount, kind: 'settle_split', label: 'Split settled' },
          { headers: { 'Idempotency-Key': `mc-${groupId}-${targetId}-${Date.now()}` } }
        )
        .catch(() => {});
      // R107 — fullscreen Brutal celebration owns the dopamine hit
      // now (handled by parent via onSettled). The toast still
      // doubles as a screen-reader hook + confirmation strip.
      try {
        const { showBrutalToast } = require('../../store/brutalToastStore');
        showBrutalToast(`Settled ₹${amount.toFixed(0)} — clean slate`, 'positive');
      } catch { /* never let UX feedback crash the success path */ }
      const targetName = rows.find(r => r.id === targetId)?.name;
      onSettled(amount, targetName);
    } catch (e: any) {
      // R100J — better Mark-Paid error UX. Previously: re-tap loop
      // because the alert only said "Could not record settlement"
      // and the sheet never refreshed stale rows. Now:
      //   • Show the actual backend reason (e.g. "Amount exceeds
      //     outstanding ₹0.00" — a stale-data signal).
      //   • Call onRefresh (=onSettled WITHOUT closing the sheet)
      //     so the UI re-pulls /balances + /expenses + /settlements
      //     and the row disappears if the debt is already cleared.
      const msg: string = e?.response?.data?.detail || 'Could not record settlement.';
      const isStale = /outstanding|exceeds|already settled|no outstanding/i.test(msg);
      Alert.alert(
        isStale ? 'Already settled' : 'Mark as paid',
        isStale
          ? `${msg}\n\nRefreshing balances…`
          : String(msg)
      );
      // Refresh by closing the sheet (which re-loads on focus). Keeps
      // behavior simple — sheet reopens with fresh state when needed.
      if (isStale) onSettled();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BrutalSheet visible={visible} onClose={onClose} heightFraction={0.6}>
      <View style={ss.head}>
        <Text style={ss.title}>SETTLE UP</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {rows.length === 0 ? (
          <Text style={ss.empty}>Nothing to settle in this group.</Text>
        ) : (
          rows.map((r) => {
            const partRaw = (partial[r.id] || '').trim();
            const partVal = partRaw ? parseFloat(partRaw) : NaN;
            const partInvalid =
              partRaw !== '' && (!isFinite(partVal) || partVal <= 0 || partVal > r.amount);
            const eff = effectiveAmount(r.id, r.amount);
            const showRemaining = partRaw !== '' && !partInvalid && eff < r.amount;
            return (
              <View key={r.id} style={ss.row}>
                <View style={ss.rowHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={ss.rowLabel}>You owe</Text>
                    <Text style={ss.rowName}>{r.name}</Text>
                  </View>
                  <Text style={ss.rowAmt}>{fmt(r.amount)}</Text>
                </View>

                {/* R101G — Optional partial-amount input. Empty = full pay. */}
                <View style={ss.partialRow}>
                  <Text style={ss.partialLbl}>PAY</Text>
                  <View style={ss.partialBox}>
                    <Text style={ss.partialRupee}>₹</Text>
                    <TextInput
                      value={partial[r.id] || ''}
                      onChangeText={(v) =>
                        setPartial((p) => ({ ...p, [r.id]: v.replace(/[^0-9.]/g, '') }))
                      }
                      keyboardType="numeric"
                      placeholder={String(Math.round(r.amount))}
                      placeholderTextColor={MUTED}
                      style={ss.partialInput}
                    />
                  </View>
                  <Pressable
                    onPress={() => setPartial((p) => ({ ...p, [r.id]: '' }))}
                    style={ss.partialFullBtn}
                    hitSlop={6}
                  >
                    <Text style={ss.partialFullTxt}>FULL</Text>
                  </Pressable>
                </View>
                {partInvalid ? (
                  <Text style={ss.partialErr}>
                    Enter a value between ₹1 and {fmt(r.amount)}.
                  </Text>
                ) : showRemaining ? (
                  <Text style={ss.partialNote}>
                    {`Remaining ${fmt(r.amount - eff)} stays on your tab.`}
                  </Text>
                ) : null}

                <View style={ss.rowActions}>
                  <Pressable
                    disabled={busyId === r.id || partInvalid}
                    onPress={() => payUpi(r.id, r.amount)}
                    style={({ pressed }) => [
                      ss.btn,
                      ss.btnPrimary,
                      pressed && ss.btnPressed,
                      (busyId === r.id || partInvalid) && ss.btnDisabled,
                    ]}
                  >
                    <Ionicons name="phone-portrait" size={13} color={INK} />
                    <Text style={ss.btnTextDark}>UPI</Text>
                  </Pressable>
                  <Pressable
                    disabled={busyId === r.id || partInvalid}
                    onPress={() => payRazorpay(r.id, r.amount)}
                    style={({ pressed }) => [
                      ss.btn,
                      ss.btnDark,
                      pressed && ss.btnPressed,
                      (busyId === r.id || partInvalid) && ss.btnDisabled,
                    ]}
                  >
                    <Ionicons name="card" size={13} color="#fff" />
                    <Text style={ss.btnTextLight}>CARDS</Text>
                  </Pressable>
                </View>
                <Pressable
                  disabled={busyId === r.id || partInvalid}
                  onPress={() => markOffline(r.id, r.amount)}
                  style={({ pressed }) => [
                    ss.btnGhostFull,
                    pressed && ss.btnPressed,
                    (busyId === r.id || partInvalid) && ss.btnDisabled,
                  ]}
                >
                  <Text style={ss.btnTextGhost}>I PAID OFFLINE — MARK SETTLED</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </BrutalSheet>
  );
}

function confirmDelete(groupId: string | undefined, name: string) {
  if (!groupId) return;
  Alert.alert(
    name,
    'Leave this group? You can be re-added later.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/split/groups/${groupId}/leave`);
            router.replace('/split');
          } catch (e: any) {
            Alert.alert('Could not leave', e?.response?.data?.detail || 'Try again.');
          }
        },
      },
    ],
    { cancelable: true }
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerMid: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: INK, letterSpacing: -0.3 },
  headerCode: { fontSize: 10, color: MUTED, letterSpacing: 1, fontFamily: MONO },
  loadingPane: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  membersRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  memberChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  memberChipMe: { backgroundColor: INK },
  memberChipText: { fontSize: 12, fontWeight: '800', color: INK },
  memberChipTextMe: { color: '#fff' },
  memberChipPending: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  // R101E — Pending invitee honesty banner styles. Lighter brutalist
  // language than the primary balance card (1.5px border, no offset
  // shadow, neutral cream backdrop) so it visually de-emphasises
  // claims that aren't real debt yet — matches the brief's hierarchy
  // rule that pending must NOT scream like primary balances.
  pendingBanner: {
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: INK,
    borderStyle: 'dashed',
    backgroundColor: BR_COLORS.paper,
  },
  pendingBannerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pendingBannerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: INK,
    letterSpacing: 1.2,
  },
  pendingBannerSub: {
    fontSize: 12,
    fontWeight: '600',
    color: BR_COLORS.muted,
    lineHeight: 17,
    marginBottom: 10,
  },
  pendingBannerList: {
    gap: 6,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  pendingDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: BR_COLORS.muted,
  },
  pendingRowName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: INK,
  },
  pendingRowState: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: BR_COLORS.muted,
  },
  // R101I — Smart Settle banner. Brutalist accent-yellow card with
  // hard ink border + 2-px stamp shadow. Sits between pending banner
  // and balance card. Press → opens SettleSheet with all rows.
  smartSettleBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: ACCENT,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
    elevation: 0,
  },
  smartSettleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  smartSettleTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: INK,
    letterSpacing: 1.6,
  },
  smartSettleBody: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    lineHeight: 18,
  },
  smartSettleFoot: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  smartSettleCta: {
    fontSize: 12,
    fontWeight: '900',
    color: INK,
    letterSpacing: 1.4,
  },
  memberChipPendingText: { fontSize: 11, color: MUTED, fontWeight: '600' },
  balanceCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  allSettled: {
    fontSize: 18,
    color: INK,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  allSettledCard: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  allSettledEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  allSettledSub: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  // R101J — link out to the activity feed when there's history.
  // Closes the loop: "All settled" + "here's what got settled".
  allSettledLink: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
  },
  allSettledLinkTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: INK,
    textAlign: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  balanceText: { fontSize: 14, color: INK, fontWeight: '600' },
  balanceName: { fontWeight: '900' },
  balancePending: { fontSize: 10, fontWeight: '900', color: MUTED, letterSpacing: 1 },
  balanceAmt: { fontSize: 17, fontWeight: '900', fontFamily: MONO },
  urgency: { fontSize: 12, color: MUTED, marginTop: 8, fontStyle: 'italic' },
  listHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  listHeadingText: { fontSize: 11, fontWeight: '900', letterSpacing: 2, color: INK },
  listHeadingCount: { fontSize: 12, color: MUTED, fontWeight: '700' },

  // R100G — Activity / Expenses tab switcher
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: INK,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: PAPER,
  },
  tabBtnActive: { backgroundColor: INK },
  tabTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6, color: INK },
  tabTxtActive: { color: PAPER },
  tabCount: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    fontFamily: MONO,
    minWidth: 18,
    textAlign: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: '#EFEAD9',
    borderWidth: 1,
    borderColor: LINE,
  },
  tabCountActive: {
    color: INK,
    backgroundColor: ACCENT,
    borderColor: PAPER,
  },

  // R100J — Brutalist enforcement pass. Per user directive
  // ("Enforce brutalist theme across the whole app — every UI code"),
  // the GPay-style bubbles ship with brutalist VISUALS while keeping
  // the GPay STRUCTURE (header / amount / progress / status / Pay).
  // Sharp 0-radius corners, 2-px ink borders, BR_STAMP drop instead
  // of soft shadow, accent-yellow Pay button instead of light-blue.
  gpWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  gpWrapLeft:  { alignItems: 'flex-start' },
  gpWrapRight: { alignItems: 'flex-end' },
  gpSender: {
    fontSize: 11,
    color: MUTED,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 6,
    paddingHorizontal: 4,
    textTransform: 'uppercase' as const,
  },
  gpBubble: {
    width: '88%',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
    // Brutalist: no rounding, hard ink frame, 3-px stamp drop.
    borderRadius: 0,
    borderWidth: 2,
    borderColor: INK,
    // Brutalist drop — solid offset, not a soft blur.
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
    elevation: 0,
    gap: 10,
  },
  gpBubbleSettle: {
    backgroundColor: '#F3FBF6',
    borderColor: OK,
    shadowColor: OK,
  },
  gpHeader: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
    letterSpacing: 0.1,
  },
  gpAmount: {
    fontFamily: MONO,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: INK,
  },
  gpAvatarRow: {
    flexDirection: 'row',
    gap: -6,
  },
  gpAvatar: {
    // Square brutalist avatar — no rounding.
    width: 26, height: 26,
    backgroundColor: '#F1ECDB',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },
  gpAvatarLetter: {
    fontSize: 11, fontWeight: '900', color: INK,
  },

  gpProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#F0EBDB',
    borderWidth: 1,
    borderColor: INK,
    overflow: 'hidden',
  },
  gpProgressFill: {
    height: '100%',
    backgroundColor: ACCENT,
  },
  gpProgressLbl: {
    fontSize: 10, fontWeight: '900', color: MUTED,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },

  gpStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E4E2DB',
  },
  gpStatusTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.2,
  },
  gpCheckBadge: {
    // Square check badge — brutalist.
    width: 16, height: 16,
    backgroundColor: OK,
    borderWidth: 1, borderColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },

  gpPayBtn: {
    // Brutalist Pay button — accent yellow with ink border + stamp.
    alignSelf: 'flex-start',
    paddingHorizontal: 22,
    paddingVertical: 10,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
    elevation: 0,
  },
  gpPayTxt: {
    fontSize: 12, fontWeight: '900', color: INK,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  // R101H — Stale-debt indicator chip. Brutalist mini-stamp inline
  // with the Unpaid · DATE row. 14d+ shows a cream chip; 30d+ flips
  // to red — emotional UX cue that the friend is waiting.
  gpStaleChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: MUTED,
    marginLeft: 6,
  },
  gpStaleChipHot: {
    backgroundColor: '#FEE2E2',
    borderColor: DANGER,
  },
  gpStaleTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: MUTED,
    letterSpacing: 1,
    fontFamily: MONO,
  },
  gpStaleTxtHot: {
    color: DANGER,
  },

  // System pill (group_created)
  systemPillWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  systemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: LINE,
    borderStyle: 'dashed',
    backgroundColor: '#FAF8F1',
  },
  systemPillTxt: {
    fontSize: 11, color: MUTED, fontWeight: '700', letterSpacing: 0.5,
  },

  // R100R — GPay-style date divider chip. Hard ink frame, accent-yellow
  // bg, brutalist 2-px stamp. Sits inside a horizontal rule pair so the
  // chip reads as a section break, not just a label.
  dateDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  dateDividerLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: INK,
  },
  dateDividerChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
    elevation: 0,
  },
  dateDividerTxt: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '900',
    color: INK,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  emptyExpenses: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyExpensesTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: INK,
    marginBottom: 4,
  },
  emptyExpensesBody: { fontSize: 13, color: MUTED, textAlign: 'center' },
  expRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    alignItems: 'center',
  },
  expMid: { flex: 1 },
  expDesc: { fontSize: 14, fontWeight: '800', color: INK },
  expSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  expRight: { alignItems: 'flex-end' },
  expAmt: { fontSize: 15, fontWeight: '900', color: INK, fontFamily: MONO },
  expShare: { fontSize: 11, color: MUTED, marginTop: 2 },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.select({ ios: 22, default: 12 }),
    backgroundColor: PAPER,
    borderTopWidth: 1,
    borderTopColor: LINE,
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    paddingVertical: 14,
    gap: 4,
  },
  actionBtnPrimary: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: ACCENT,
    paddingVertical: 14,
  },
  actionBtnDisabled: { backgroundColor: '#E5E0D5' },
  actionBtnPressed: { transform: [{ translateY: 1 }] },
  actionText: { fontSize: 12, fontWeight: '900', color: INK, letterSpacing: 1.5 },
  actionTextPrimary: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.5,
  },
});

const ss = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
  },
  title: { fontSize: 14, fontWeight: '900', letterSpacing: 2, color: INK },
  empty: { fontSize: 14, color: MUTED, textAlign: 'center', paddingVertical: 32 },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: { fontSize: 11, color: MUTED, fontWeight: '700', letterSpacing: 1 },
  rowName: { fontSize: 16, fontWeight: '900', color: INK, marginTop: 2 },
  rowAmt: {
    fontSize: 22,
    fontWeight: '900',
    color: DANGER,
    fontFamily: MONO,
  },
  // R101G — partial-amount input row.
  partialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  partialLbl: {
    fontSize: 10,
    fontWeight: '900',
    color: MUTED,
    letterSpacing: 1.4,
  },
  partialBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: '#fff',
  },
  partialRupee: { fontSize: 16, fontWeight: '900', color: MUTED },
  partialInput: {
    flex: 1,
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '900',
    color: INK,
    paddingVertical: 0,
  },
  partialFullBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
  },
  partialFullTxt: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: INK,
  },
  partialErr: {
    fontSize: 11,
    fontWeight: '700',
    color: DANGER,
    marginTop: 6,
  },
  partialNote: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    marginTop: 6,
    fontStyle: 'italic',
  },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: INK,
  },
  btnPrimary: { backgroundColor: ACCENT },
  btnDark: { backgroundColor: INK },
  btnGhost: { backgroundColor: '#fff' },
  btnGhostFull: {
    marginTop: 8,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: INK,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { transform: [{ translateY: 1 }] },
  btnTextDark: { color: INK, fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  btnTextLight: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  btnTextPrimary: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  btnTextGhost: { color: INK, fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
});
