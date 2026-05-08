/**
 * Split Home — REBUILD R100A.
 *
 * Rebuilt from scratch (was 811 LOC, 30+ component imports, 5 features fighting
 * for the same surface). New rule: STATE = UI.
 *
 *   STATE          UI
 *   loading        Skeleton (3 rows).
 *   no_groups      Empty pane + one CTA. Nothing else on screen.
 *   all_settled    Net hero (₹0). Group list. No urgency.
 *   has_dues       Net hero (sign-coloured). Dues groups float to top.
 *
 * Hard rules — DO NOT add back:
 *   • No banners, nudges, reminders, badges, coins, leaderboard, chat.
 *   • No premium teasers wedged into the tab.
 *   • No drafts pill, no pending-sync, no contact-picker, no smart-settle sheet.
 *   • One primary CTA at a time. Either '+ New group' OR 'Settle ₹X'.
 *   • Mission backbone is silent — no toasts, no badges, no banners.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import api, { swrGet } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import {
  BR_COLORS,
  BR_FONT,
  BR_BORDER,
  BR_SPACE,
  BR_TYPE,
  BR_STAMP,
} from '../../utils/brutalist';
import MintuMascot from '../../components/MintuMascot';

// All brand tokens routed through BR_COLORS (R100A → R100B brand-kit
// consolidation). Local aliases preserved so the rest of this file's
// StyleSheet entries don't churn — single source of truth lives in
// `utils/brutalist.ts`.
const {
  ink:     INK,
  paper:   PAPER,
  accent:  ACCENT,
  line:    LINE,
  muted:   MUTED,
  positive: OK,
  negative: DANGER,
} = BR_COLORS;
const MONO = BR_FONT.mono;

const fmt = (n: number): string => {
  const v = Math.round(Math.abs(n));
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

type Balances = {
  total_owed_to_you: number;
  total_you_owe: number;
  owe_you: Record<string, number>;
  you_owe: Record<string, number>;
};

type GroupRow = {
  id: string;
  name: string;
  members: { user_id: string; name: string; phone?: string }[];
  pending_invites?: { phone: string }[];
  custom_emoji?: string;
  balances: Record<string, number>; // {memberName: net} — server-provided per group
  total_expenses: number;
};

function groupNetForMe(g: GroupRow, myName: string): number {
  // Server returns balances keyed by member NAME with sign relative to who paid.
  // Positive value for ME means I'm owed across this group; negative means I owe.
  const v = g.balances?.[myName];
  return typeof v === 'number' ? v : 0;
}

export default function SplitHome() {
  const { user } = useAuthStore();
  const myName = user?.name || '';
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    // R100Q-perf-2 — SWR pattern for the Split tab. The two hot
    // GETs (/split/groups + /split/balances) are now served from
    // cache instantly when warm, then revalidated in background.
    // First-load (cache miss) still falls through to the network
    // promise. Combined with warmCriticalCaches() in authStore,
    // post-login Split tab visits render in <50ms.
    const apply = (gRes: any, bRes: any) => {
      const g = gRes?.data ?? gRes;
      const b = bRes?.data ?? bRes;
      setGroups(Array.isArray(g) ? g : []);
      setBalances(b);
      setLoading(false);
      setRefreshing(false);
    };
    try {
      const groupsSwr = swrGet('/split/groups', {
        onFresh: (r) => apply(r, balances),
        staleAfter: 20_000,
      });
      const balancesSwr = swrGet('/split/balances', {
        onFresh: (r) => apply({ data: groups }, r),
        staleAfter: 20_000,
      });
      // Render whatever we already have in cache instantly.
      if (groupsSwr.cached || balancesSwr.cached) {
        apply(groupsSwr.cached, balancesSwr.cached);
      }
      // Await the freshest result for both (this resolves quickly
      // when cache is warm, since swrGet returns the cached promise).
      const [gRes, bRes] = await Promise.all([
        groupsSwr.promise,
        balancesSwr.promise,
      ]);
      apply(gRes, bRes);
    } catch (e) {
      // Network errors leave the previous state intact. No toast — the empty
      // state and pull-to-refresh are the recovery surface.
      setLoading(false);
      setRefreshing(false);
    }
  }, [balances, groups]);

  // Refetch on every focus — splits change when the user returns from
  // group detail / add expense screens. We DO NOT depend on
  // `groups.length` here — that closes a re-render loop with `load`.
  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Derive the single source of truth for the screen state.
  const mode = useMemo<'loading' | 'empty' | 'all_settled' | 'has_dues'>(() => {
    if (loading && groups.length === 0) return 'loading';
    if (groups.length === 0) return 'empty';
    const owe = balances?.total_you_owe || 0;
    const owed = balances?.total_owed_to_you || 0;
    return owe + owed < 1 ? 'all_settled' : 'has_dues';
  }, [loading, groups.length, balances]);

  // Sort: dues groups float to top. Within each bucket, larger absolute
  // balance first (highest tension first).
  const sortedGroups = useMemo(() => {
    const list = [...groups];
    list.sort((a, b) => {
      const an = groupNetForMe(a, myName);
      const bn = groupNetForMe(b, myName);
      const aSettled = Math.abs(an) < 0.5 ? 1 : 0;
      const bSettled = Math.abs(bn) < 0.5 ? 1 : 0;
      if (aSettled !== bSettled) return aSettled - bSettled;
      return Math.abs(bn) - Math.abs(an);
    });
    return list;
  }, [groups, myName]);

  return (
    <SafeAreaView style={st.root} edges={['top']}>
      <View style={st.header}>
        <Text style={st.headerKicker}>SPLIT</Text>
      </View>

      {mode === 'loading' ? (
        <View style={st.loadingPane}>
          <ActivityIndicator size="small" color={INK} />
        </View>
      ) : mode === 'empty' ? (
        <EmptyPane />
      ) : (
        <ScrollView
          contentContainerStyle={st.scroll}
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
          <Hero balances={balances} mode={mode} groupCount={groups.length} />
          <View style={st.listHeading}>
            <Text style={st.listHeadingText}>YOUR GROUPS</Text>
            <Text style={st.listHeadingCount}>{groups.length}</Text>
          </View>
          {sortedGroups.map((g) => (
            <GroupRowView key={g.id} group={g} myName={myName} />
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Hero({ balances, mode, groupCount }: { balances: Balances | null; mode: string; groupCount: number }) {
  const owed = balances?.total_owed_to_you || 0;
  const owe = balances?.total_you_owe || 0;
  const net = owed - owe;
  const settled = Math.abs(net) < 0.5;
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  const color = settled ? MUTED : net > 0 ? OK : DANGER;
  const tag = settled ? 'ALL SETTLED' : net > 0 ? "YOU'RE OWED" : 'YOU OWE';
  const tagTone = settled ? MUTED : net > 0 ? OK : DANGER;

  // R100I — match BudgetHeroBrutalist geometry exactly. Same eyebrow
  // row, same 2-px ink card, same focal row with status chip on the
  // right, same 3-stat bottom strip, same action bar. Visually
  // rhymes with Budget so user feels they're in the same app.
  const monthLabel = new Date().toLocaleDateString('en-IN', {
    month: 'short', year: 'numeric',
  }).toUpperCase();

  return (
    <View style={st.heroWrap}>
      {/* Eyebrow row — minimal label only. Action lives in hero footer. */}
      <View style={st.heroEyebrowRow}>
        <View style={st.heroRule} />
        <Text style={st.heroEyebrow}>SPLIT · {monthLabel}</Text>
        <View style={{ flex: 1 }} />
      </View>

      <View style={st.heroCard}>
        {/* Focal row — net + status chip */}
        <View style={st.heroFocalRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.heroFocalTag}>NET BALANCE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[st.heroFocal, { color }]} numberOfLines={1}>
                {settled ? '₹0' : `${sign}${fmt(Math.abs(net))}`}
              </Text>
            </View>
            <Text style={st.heroSub} numberOfLines={1}>
              {groupCount > 0
                ? `${groupCount} group${groupCount === 1 ? '' : 's'}${settled ? ' · all clear' : net > 0 ? ` · ${fmt(owed)} pending` : ` · ${fmt(owe)} due`}`
                : 'No groups yet — start one below'}
            </Text>
          </View>

          {/* Status chip — same geometry as Budget's % USED chip */}
          <View style={[st.heroChip, { borderColor: tagTone }]}>
            <Ionicons
              name={settled ? 'checkmark' : net > 0 ? 'arrow-down' : 'arrow-up'}
              size={16}
              color={tagTone}
            />
            <Text style={[st.heroChipLabel, { color: tagTone }]}>
              {tag}
            </Text>
          </View>
        </View>

        {/* 3-stat strip — Owed / You Owe / Groups */}
        <View style={st.heroStrip}>
          <HeroCell label="OWED TO YOU" value={fmt(owed)} tone={owed > 0.5 ? OK : INK} />
          <HeroCell label="YOU OWE"     value={fmt(owe)}  tone={owe  > 0.5 ? DANGER : INK} />
          <HeroCell label="GROUPS"      value={String(groupCount)} tone={INK} last />
        </View>

        {/* Action bar — single primary CTA. R100M removed the HISTORY
            button (was wrongly routing to /transactions) and the
            duplicate eyebrow NEW GROUP. The header `+` icon was also
            removed; one explicit primary action lives here. */}
        <View style={st.heroActions}>
          <Pressable
            style={({ pressed }) => [
              st.heroActionPrimary,
              st.heroActionLast,
              pressed && { transform: [{ translateY: 1 }] },
            ]}
            onPress={() => router.push('/split/new-group' as any)}
            testID="split-hero-action-new"
          >
            <Ionicons name="people" size={14} color="#fff" />
            <Text style={st.heroActionPrimaryTxt}>NEW GROUP</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Reused by the Hero strip. Identical geometry to BudgetHero's Cell.
function HeroCell({ label, value, tone, last }: { label: string; value: string; tone: string; last?: boolean }) {
  return (
    <View style={[st.heroCell, last && { borderRightWidth: 0 }]}>
      <Text style={st.heroCellLabel}>{label}</Text>
      <Text style={[st.heroCellVal, { color: tone }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function GroupRowViewImpl({ group, myName }: { group: GroupRow; myName: string }) {
  const net = groupNetForMe(group, myName);
  const settled = Math.abs(net) < 0.5;
  const memberCount = (group.members?.length || 0) + (group.pending_invites?.length || 0);
  const subtitle = settled
    ? `${memberCount} members · settled`
    : net > 0
    ? `you're owed ${fmt(net)}`
    : `you owe ${fmt(Math.abs(net))}`;
  const tone = settled ? MUTED : net > 0 ? OK : DANGER;

  return (
    <Pressable
      onPress={() => router.push(`/split/${group.id}` as any)}
      style={({ pressed }) => [st.row, pressed && st.rowPressed]}
    >
      <View style={st.rowAvatar}>
        <Text style={st.rowAvatarText}>
          {group.custom_emoji || group.name.trim().charAt(0).toUpperCase() || '#'}
        </Text>
      </View>
      <View style={st.rowMid}>
        <Text style={st.rowName} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={[st.rowSub, { color: tone }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </Pressable>
  );
}

// R100Q-perf-2 — memo so groups list re-render skips rows whose
// {group, myName} props are reference-equal. Heaviest scrolling
// surface in the Split tab.
const GroupRowView = memo(GroupRowViewImpl);


function EmptyPane() {
  return (
    <View style={st.empty}>
      {/* Mascot replaces the static `÷` mark — gives the empty state a
          breathing presence so first-time users feel greeted, not stranded.
          Idle state = ±4 % scale + ±3 px float, runs on UI thread. */}
      <View style={st.emptyMark}>
        <MintuMascot size={120} state="idle" />
      </View>
      <Text style={st.emptyTitle}>No groups yet.</Text>
      <Text style={st.emptyBody}>
        Track shared expenses with friends. They don't need a MintU account.
      </Text>
      <Pressable
        style={({ pressed }) => [st.cta, pressed && st.ctaPressed]}
        onPress={() => router.push('/split/new-group' as any)}
      >
        <Text style={st.ctaText}>CREATE YOUR FIRST GROUP</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    color: INK,
  },
  loadingPane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingBottom: 24 },
  // R100I — Budget-style hero geometry. Identical grammar to
  // BudgetHeroBrutalist: eyebrow row, 2-px ink card, focal row with
  // status chip, 3-stat strip, action bar.
  heroWrap: {
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
    marginBottom: BR_SPACE.sm,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  heroRule: { width: 10, height: 3, backgroundColor: ACCENT },
  heroEyebrow: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK,
  },
  heroNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: INK,
    backgroundColor: PAPER,
  },
  heroNewTxt: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: INK,
  },

  heroCard: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
  },
  heroFocalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderColor: INK,
  },
  heroFocalTag: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: MUTED,
  },
  heroFocal: {
    fontFamily: MONO,
    fontSize: 32,
    fontWeight: '900',
    color: INK,
    letterSpacing: -1.3,
    lineHeight: 36,
    marginTop: 2,
  },
  heroSub: {
    fontSize: 10.5, fontWeight: '700', color: MUTED, marginTop: 4,
    letterSpacing: 0.2,
  },
  heroChip: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    backgroundColor: PAPER,
    minWidth: 80,
    gap: 2,
  },
  heroChipLabel: {
    fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 2,
  },

  heroStrip: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: INK,
    backgroundColor: PAPER,
  },
  heroCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderColor: INK,
    alignItems: 'flex-start',
  },
  heroCellLabel: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: MUTED,
  },
  heroCellVal: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 3,
    letterSpacing: -0.4,
  },

  heroActions: { flexDirection: 'row' },
  heroActionPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, backgroundColor: ACCENT,
    borderRightWidth: 1, borderColor: INK, minHeight: 48,
  },
  heroActionPrimaryTxt: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: '#fff',
  },
  heroAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, backgroundColor: '#fff',
    borderRightWidth: 1, borderColor: INK, minHeight: 48,
  },
  heroActionLast: { borderRightWidth: 0 },
  heroActionTxt: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: INK,
  },

  // Legacy hero styles kept for forward-compat references that may
  // still target them — safe to delete in a follow-up cleanup.
  hero: {
    // R100G — match HeroDecision (Home) geometry exactly: BR_BORDER.bold
    // ink border + BR_STAMP.md offset, BR_SPACE.lg padding, no margin
    // overrides on the visual block. Visually rhymes with Home so the
    // user feels they're in the same app, not a different surface.
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.lg,
    marginBottom: BR_SPACE.sm,
    padding: BR_SPACE.lg,
    borderWidth: BR_BORDER.bold,
    borderColor: INK,
    backgroundColor: BR_COLORS.paper,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    ...BR_TYPE.label,
    color: MUTED,
  },
  heroNumber: {
    // R100G — was 56pt with -2 letter-spacing; the result was a wall
    // of digits that crowded everything else on the card. Aligned to
    // BR_TYPE.numLg (42pt / -1.5 / mono) — same exact size used by
    // Home's diagnostic score so the two heroes feel like siblings.
    ...BR_TYPE.numLg,
    marginTop: BR_SPACE.sm,
    fontFamily: MONO,
  },
  heroSplit: {
    flexDirection: 'row',
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
  },
  heroSplitCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  heroDivider: { width: 1, backgroundColor: INK },
  heroSplitLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: MUTED,
    marginBottom: 2,
  },
  heroSplitVal: { fontSize: 18, fontWeight: '900', fontFamily: MONO },
  heroUrgency: {
    fontSize: 12,
    color: MUTED,
    marginTop: 12,
    fontStyle: 'italic',
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  listHeadingText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    color: INK,
  },
  listHeadingCount: { fontSize: 12, color: MUTED, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    backgroundColor: PAPER,
  },
  rowPressed: { backgroundColor: '#EEEAE0' },
  rowAvatar: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowAvatarText: { fontSize: 20, fontWeight: '900', color: INK },
  rowMid: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '800', color: INK },
  rowSub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyMark: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyMarkText: { fontSize: 56, fontWeight: '900', color: INK, lineHeight: 60 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: INK,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  emptyBody: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  cta: {
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: INK,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  ctaPressed: { transform: [{ translateY: 1 }] },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
