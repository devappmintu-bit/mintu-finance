/**
 * Round 37 — Unified search screen.
 *
 * Debounced input (300ms) queries GET /search and renders grouped results.
 * Before typing: recent searches from AsyncStorage.
 * No results: helpful CTA to add a transaction.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SectionList, ActivityIndicator,
  Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import EmptyState from '../components/ui/EmptyState';
import { COLORS, SPACING } from '../utils/theme';
import {
  runSearch, pushRecentSearch, getRecentSearches, clearRecentSearches,
  SearchResults,
} from '../services/search';
import { useIsOnline } from '../hooks/useIsOnline';

const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const isOnline = useIsOnline();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const debounceRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load recent searches on mount.
  useEffect(() => { getRecentSearches().then(setRecent); }, []);

  // Debounced fetch. Cancels in-flight request if user keeps typing.
  useEffect(() => {
    if (!q.trim()) {
      setResults(null); setError(null); setLoading(false);
      return;
    }
    // Round 42 — when offline, don't fire requests (they'd 0-out anyway and
    // surface a generic "Search unavailable"). Show a clear offline note instead.
    if (!isOnline) {
      setLoading(false);
      setError('offline');
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // Cancel prior request if still pending.
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const r = await runSearch(q);
        setResults(r);
      } catch (e: any) {
        if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') {
          setError('Search unavailable');
          setResults(null);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, isOnline]);

  const commitSearch = useCallback(() => {
    if (q.trim()) pushRecentSearch(q).then(() => getRecentSearches().then(setRecent));
  }, [q]);

  const clearRecent = useCallback(async () => {
    await clearRecentSearches();
    setRecent([]);
  }, []);

  const onPressTxn = (id: string) => {
    commitSearch();
    try { Haptics.selectionAsync(); } catch {}
    router.push('/(tabs)/transactions' as any);
  };
  const onPressBudget = () => { commitSearch(); try { Haptics.selectionAsync(); } catch {} router.push('/(tabs)/budget' as any); };
  const onPressGoal = () => { commitSearch(); try { Haptics.selectionAsync(); } catch {} router.push('/goals' as any); };
  const onPressGroup = () => { commitSearch(); try { Haptics.selectionAsync(); } catch {} router.push('/(tabs)/split' as any); };

  // Section list data — only include sections that have hits.
  const sections: Array<{ title: string; data: any[]; kind: string }> = [];
  if (results) {
    if (results.transactions.length) sections.push({ title: 'Transactions', data: results.transactions, kind: 'txn' });
    if (results.budgets.length) sections.push({ title: 'Budgets', data: results.budgets, kind: 'budget' });
    if (results.goals.length) sections.push({ title: 'Goals', data: results.goals, kind: 'goal' });
    if (results.groups.length) sections.push({ title: 'Groups', data: results.groups, kind: 'group' });
  }

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  // Round 44 perf — wrap in useCallback so SectionList doesn't get a new
  // function reference on every render (which would invalidate row memoization).
  const renderItem = React.useCallback(({ item, section }: any) => {
    if (section.kind === 'txn') {
      return (
        <TouchableOpacity style={s.row} onPress={() => onPressTxn(item.id)} activeOpacity={0.7}>
          <View style={[s.iconWrap, { backgroundColor: '#FFE9DC' }]}>
            <Text style={s.iconEmoji}>{item.type === 'credit' ? '💰' : '💸'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle} numberOfLines={1}>{item.merchant || item.description || 'Transaction'}</Text>
            <Text style={s.rowSub} numberOfLines={1}>{item.category}  ·  {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
          </View>
          <Text style={[s.rowAmt, { color: item.type === 'credit' ? '#059669' : '#111827' }]}>
            {item.type === 'credit' ? '+' : ''}{fmt(item.amount)}
          </Text>
        </TouchableOpacity>
      );
    }
    if (section.kind === 'budget') {
      return (
        <TouchableOpacity style={s.row} onPress={onPressBudget} activeOpacity={0.7}>
          <View style={[s.iconWrap, { backgroundColor: '#FFF0DE' }]}><Text style={s.iconEmoji}>🎯</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{item.category}</Text>
            <Text style={s.rowSub}>{item.period}  ·  {fmt(item.amount)} limit</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      );
    }
    if (section.kind === 'goal') {
      return (
        <TouchableOpacity style={s.row} onPress={onPressGoal} activeOpacity={0.7}>
          <View style={[s.iconWrap, { backgroundColor: '#DBEAFE' }]}><Text style={s.iconEmoji}>{item.emoji}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{item.name}</Text>
            <Text style={s.rowSub}>{fmt(item.saved_amount)} / {fmt(item.target_amount)}  ·  {item.pct}%</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      );
    }
    if (section.kind === 'group') {
      return (
        <TouchableOpacity style={s.row} onPress={onPressGroup} activeOpacity={0.7}>
          <View style={[s.iconWrap, { backgroundColor: '#D1FAE5' }]}><Text style={s.iconEmoji}>{item.emoji}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{item.name}</Text>
            <Text style={s.rowSub}>{item.member_count} member{item.member_count === 1 ? '' : 's'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      );
    }
    return null;
  }, [onPressTxn, onPressBudget]);

  const body = (() => {
    // Before user types — recent searches or hint.
    if (!q.trim()) {
      if (recent.length === 0) {
        return (
          <EmptyState
            emoji="🔍"
            title="Search your finances"
            subtitle="Find transactions, budgets, goals, or split groups — all in one place."
          />
        );
      }
      return (
        <View style={{ padding: SPACING.lg }}>
          <View style={s.recentHead}>
            <Text style={s.recentLabel}>Recent searches</Text>
            <TouchableOpacity onPress={clearRecent} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.clearTxt}>Clear</Text>
            </TouchableOpacity>
          </View>
          {recent.map((term) => (
            <TouchableOpacity key={term} style={s.recentRow} onPress={() => setQ(term)} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={18} color={COLORS.text.muted} />
              <Text style={s.recentTxt} numberOfLines={1}>{term}</Text>
              <Ionicons name="arrow-up-outline" size={16} color={COLORS.text.muted} style={{ transform: [{ rotate: '-45deg' }] }} />
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    if (loading) {
      return (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.accent.primary} />
          <Text style={{ marginTop: 12, color: COLORS.text.muted, fontWeight: '600' }}>Searching…</Text>
        </View>
      );
    }
    if (error) {
      if (error === 'offline') {
        return (
          <EmptyState
            emoji="📶"
            title="You're offline"
            subtitle="Search needs an internet connection. Reconnect and try again — your recent searches stay saved."
          />
        );
      }
      return <EmptyState emoji="⚠️" title="Search unavailable" subtitle={error} ctaLabel="Retry" onCta={() => setQ(q)} />;
    }
    if (results && results.total === 0) {
      return (
        <EmptyState
          emoji="🔎"
          title={`No results for "${q}"`}
          subtitle="Try a merchant name, category, or goal name. Or start tracking a new expense."
          ctaLabel="Add transaction"
          onCta={() => router.push({ pathname: '/(tabs)/transactions' as any, params: { openAdd: '1' } })}
        />
      );
    }
    // Results list.
    return (
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => <Text style={s.sectionHeader}>{section.title}</Text>}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120, gap: 8 }}
        stickySectionHeadersEnabled={false}
      />
    );
  })();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <View style={s.searchBox}>
          <Ionicons name={isOnline ? "search" : "cloud-offline"} size={18} color={isOnline ? COLORS.text.muted : '#92400E'} />
          <TextInput
            autoFocus
            placeholder={isOnline ? "Search transactions, budgets, goals…" : "Offline — search unavailable"}
            placeholderTextColor={COLORS.text.muted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => { commitSearch(); Keyboard.dismiss(); }}
            returnKeyType="search"
            style={s.input}
            accessibilityLabel="Search"
            editable={isOnline}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {body}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, gap: 10,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.bg.secondary, borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderWidth: 1, borderColor: COLORS.border.subtle,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.text.primary, padding: 0 },

  sectionHeader: { fontSize: 11, fontWeight: '900', color: COLORS.text.muted, letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  row: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    padding: 12, backgroundColor: COLORS.bg.secondary,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border.subtle,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 20 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  rowSub: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  rowAmt: { fontSize: 14, fontWeight: '800' },

  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  recentLabel: { fontSize: 11, fontWeight: '900', color: COLORS.text.muted, letterSpacing: 1 },
  clearTxt: { fontSize: 12, fontWeight: '700', color: COLORS.accent.primary },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  recentTxt: { flex: 1, fontSize: 14, color: COLORS.text.primary, fontWeight: '600' },
});
