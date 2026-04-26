/**
 * Round 39 — Coin Ledger screen.
 *
 * Cursor-paginated list of every coin movement (earn/spend) with:
 *   • Filter tabs (All / Earned / Spent) — each filter is its own page set.
 *   • Lifetime totals chip row.
 *   • FlashList with infinite scroll — next page fetched on `onEndReached`.
 *   • Pull-to-refresh resets to first page.
 *   • Skeleton on initial load, EmptyState per filter, error+Retry.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { COLORS, SPACING, useAppColors } from '../utils/theme';
import {
  fetchLedgerPage, sourceEmoji, timeAgo,
  LedgerEntry, LedgerType,
} from '../services/coinLedger';

const FILTERS: { key: LedgerType; label: string }[] = [
  { key: 'all',   label: 'ALL' },
  { key: 'earn',  label: 'EARNED' },
  { key: 'spend', label: 'SPENT' },
];

export default function CoinLedgerScreen() {
  const c = useAppColors();
  const [filter, setFilter] = useState<LedgerType>('all');
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [totals, setTotals] = useState<{ earned: number; spent: number }>({ earned: 0, spent: 0 });

  // Initial / filter-change load — always wipes & resets cursor.
  const loadFirstPage = useCallback(async (f: LedgerType) => {
    setError(false);
    setEntries(null);  // skeleton state
    try {
      const p = await fetchLedgerPage({ type: f, limit: 50 });
      setEntries(p.entries);
      setCursor(p.next_cursor);
      setHasMore(!!p.next_cursor);
      setTotals({ earned: p.total_earned, spent: p.total_spent });
    } catch {
      setError(true);
      setEntries([]);
    }
  }, []);

  useEffect(() => { loadFirstPage(filter); }, [filter, loadFirstPage]);

  // onEndReached infinite scroll — guards against duplicate fires (FlashList
  // can call onEndReached repeatedly when bouncing).
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const p = await fetchLedgerPage({ type: filter, cursor, limit: 50 });
      setEntries((prev) => [...(prev || []), ...p.entries]);
      setCursor(p.next_cursor);
      setHasMore(!!p.next_cursor);
    } catch {
      // Silent — the user still has the rows they had before.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filter, hasMore, loadingMore]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const p = await fetchLedgerPage({ type: filter, limit: 50 });
      setEntries(p.entries);
      setCursor(p.next_cursor);
      setHasMore(!!p.next_cursor);
      setTotals({ earned: p.total_earned, spent: p.total_spent });
      setError(false);
    } catch {} finally { setRefreshing(false); }
  }, [filter]);

  const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

  const renderRow = useCallback(({ item }: { item: LedgerEntry }) => {
    const isEarn = item.type === 'earn';
    const tint = isEarn ? c.state.success : c.state.danger;
    return (
      <View
        style={s.row}
        accessibilityRole="text"
        accessibilityLabel={`${isEarn ? 'Earned' : 'Spent'} ${item.amount} coins, ${item.description}, balance after ${item.balance_after}`}
      >
        <View style={[s.iconWrap, { backgroundColor: tint + '18' }]}>
          <Text style={s.iconEmoji}>{sourceEmoji(item.source)}</Text>
          <View style={[s.iconDot, { backgroundColor: tint }]}>
            {/* White arrow on saturated state-tint dot — intentional per Round 50 audit. */}
            <Ionicons name={isEarn ? 'arrow-up' : 'arrow-down'} size={9} color="#FFFFFF" />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowDesc} numberOfLines={1} ellipsizeMode="tail">{item.description}</Text>
          <Text style={s.rowMeta}>{timeAgo(item.created_at)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.rowAmt, { color: tint }]}>
            {isEarn ? '+' : '−'}{fmt(item.amount)}
          </Text>
          <Text style={s.rowBal}>Balance: {fmt(item.balance_after)}</Text>
        </View>
      </View>
    );
  }, []);

  // Empty-state copy depends on the active filter.
  const emptyCopy = (() => {
    if (filter === 'earn')  return { title: 'No coins earned yet', sub: 'Hit a streak, redeem missions, or refer a friend.' };
    if (filter === 'spend') return { title: 'No coins spent yet', sub: 'Save them up for marketplace rewards & vouchers.' };
    return { title: 'No coin activity yet', sub: 'Earn your first coins by checking in tomorrow.' };
  })();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Coin History</Text>
        <View style={s.balanceChip}>
          <Text style={s.balanceEmoji}>🪙</Text>
          <Text style={s.balanceTxt}>{fmt(totals.earned - totals.spent)}</Text>
        </View>
      </View>

      {/* Lifetime totals row */}
      <View style={s.totalsRow}>
        <View style={[s.totalCard, { borderColor: c.state.successBorder, backgroundColor: c.state.successBg }]}>
          <Text style={[s.totalLbl, { color: c.state.success }]}>Earned</Text>
          <Text style={[s.totalVal, { color: c.state.success }]}>+{fmt(totals.earned)}</Text>
        </View>
        <View style={[s.totalCard, { borderColor: c.state.dangerBorder, backgroundColor: c.state.dangerBg }]}>
          <Text style={[s.totalLbl, { color: c.state.danger }]}>Spent</Text>
          <Text style={[s.totalVal, { color: c.state.danger }]}>−{fmt(totals.spent)}</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={s.tabs}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => {
              if (filter === f.key) return;
              if (Platform.OS !== 'web') { try { Haptics.selectionAsync(); } catch {} }
              setFilter(f.key);
            }}
            style={[s.tab, filter === f.key && s.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            accessibilityLabel={f.label}
            activeOpacity={0.7}
          >
            <Text style={[s.tabTxt, filter === f.key && s.tabTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {entries === null ? (
        <View style={{ padding: SPACING.lg, gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton.Box key={i} h={68} radius={14} />)}
        </View>
      ) : (
        <FlashList
          data={entries}
          keyExtractor={(x) => x.id}
          renderItem={renderRow}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 } as any}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            error ? (
              <EmptyState
                emoji="⚠️"
                title="Couldn't load history"
                subtitle="Check your connection and try again"
                ctaLabel="Retry"
                onCta={() => loadFirstPage(filter)}
              />
            ) : (
              <EmptyState emoji="🪙" title={emptyCopy.title} subtitle={emptyCopy.sub} />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={COLORS.accent.primary} />
              </View>
            ) : null
          }
          accessibilityRole="list"
          accessibilityLabel="Coin history"
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '900', color: COLORS.text.primary, letterSpacing: -0.3 },
  balanceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,176,71,0.16)', borderWidth: 1, borderColor: 'rgba(255,176,71,0.45)',
  },
  balanceEmoji: { fontSize: 14 },
  balanceTxt: { fontSize: 13, fontWeight: '900', color: COLORS.accent.warning },

  totalsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.lg, paddingTop: 14 },
  totalCard: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1 },
  totalLbl: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  totalVal: { fontSize: 18, fontWeight: '900', marginTop: 2 },

  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: SPACING.lg, paddingTop: 14, paddingBottom: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.bg.secondary, borderWidth: 1, borderColor: COLORS.border.subtle },
  tabActive: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  tabTxt: { fontSize: 11, fontWeight: '900', color: COLORS.text.muted, letterSpacing: 1 },
  /* Active tab — white-on-saturated-orange (intentional per Round 50). */
  tabTxtActive: { color: '#FFFFFF' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, backgroundColor: COLORS.bg.secondary,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border.subtle,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  iconEmoji: { fontSize: 22 },
  iconDot: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.bg.secondary },
  rowDesc: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  rowMeta: { fontSize: 11, color: COLORS.text.muted, marginTop: 2, fontWeight: '600' },
  rowAmt: { fontSize: 15, fontWeight: '900' },
  rowBal: { fontSize: 11, color: COLORS.text.muted, marginTop: 2, fontWeight: '600' },
});
