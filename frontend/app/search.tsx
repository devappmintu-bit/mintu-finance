/**
 * Unified search screen — R113 brutal convergence.
 *
 * Debounced input (300ms) queries GET /search and renders grouped
 * results. Migrated to BrutalCard + brutal tokens.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, SectionList, ActivityIndicator,
  Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import {
  BrutalCard,
  BrutalEmptyState,
  BR_COLORS,
  BR_BORDER,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../components/brutal';
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

  useEffect(() => { getRecentSearches().then(setRecent); }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null); setError(null); setLoading(false);
      return;
    }
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

  const onPressTxn = (_id: string) => {
    commitSearch();
    try { Haptics.selectionAsync(); } catch {}
    router.push('/(tabs)/transactions' as any);
  };
  const onPressBudget = () => { commitSearch(); try { Haptics.selectionAsync(); } catch {} router.push('/(tabs)/budget' as any); };
  const onPressGoal = () => { commitSearch(); try { Haptics.selectionAsync(); } catch {} router.push('/goals' as any); };
  const onPressGroup = () => { commitSearch(); try { Haptics.selectionAsync(); } catch {} router.push('/(tabs)/split' as any); };

  const sections: Array<{ title: string; data: any[]; kind: string }> = [];
  if (results) {
    if (results.transactions.length) sections.push({ title: 'TRANSACTIONS', data: results.transactions, kind: 'txn' });
    if (results.budgets.length) sections.push({ title: 'BUDGETS', data: results.budgets, kind: 'budget' });
    if (results.goals.length) sections.push({ title: 'GOALS', data: results.goals, kind: 'goal' });
    if (results.groups.length) sections.push({ title: 'GROUPS', data: results.groups, kind: 'group' });
  }

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  const renderItem = useCallback(({ item, section }: any) => {
    const tile = (bg: string, emoji: string, title: string, sub: string, right: React.ReactNode, onPress: () => void) => (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [s.row, pressed && BR_SHADOW.pressShift]}
      >
        <View style={[s.iconWrap, { backgroundColor: bg }]}>
          <Text style={s.iconEmoji}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.rowSub} numberOfLines={1}>{sub}</Text>
        </View>
        {right}
      </Pressable>
    );

    if (section.kind === 'txn') {
      return tile(
        item.type === 'credit' ? PALETTE.lime : PALETTE.peach,
        item.type === 'credit' ? '💰' : '💸',
        item.merchant || item.description || 'Transaction',
        `${item.category}  ·  ${new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        <Text style={[s.rowAmt, { color: item.type === 'credit' ? PALETTE.success : BR_COLORS.ink }]}>
          {item.type === 'credit' ? '+' : ''}{fmt(item.amount)}
        </Text>,
        () => onPressTxn(item.id),
      );
    }
    if (section.kind === 'budget') {
      return tile(
        PALETTE.brand, '🎯', item.category, `${item.period}  ·  ${fmt(item.amount)} limit`,
        <Ionicons name="chevron-forward" size={18} color={BR_COLORS.textMuted} />, onPressBudget,
      );
    }
    if (section.kind === 'goal') {
      return tile(
        PALETTE.cyan, item.emoji, item.name,
        `${fmt(item.saved_amount)} / ${fmt(item.target_amount)}  ·  ${item.pct}%`,
        <Ionicons name="chevron-forward" size={18} color={BR_COLORS.textMuted} />, onPressGoal,
      );
    }
    if (section.kind === 'group') {
      return tile(
        PALETTE.lime, item.emoji, item.name,
        `${item.member_count} member${item.member_count === 1 ? '' : 's'}`,
        <Ionicons name="chevron-forward" size={18} color={BR_COLORS.textMuted} />, onPressGroup,
      );
    }
    return null;
  }, [commitSearch]);

  const body = (() => {
    if (!q.trim()) {
      if (recent.length === 0) {
        return (
          <BrutalEmptyState
            emoji="🔎"
            title="Search your finances"
            body="Find transactions, budgets, goals, or split groups — all in one place."
          />
        );
      }
      return (
        <View style={{ padding: BR_SPACE['4'] }}>
          <View style={s.recentHead}>
            <Text style={s.recentLabel}>RECENT SEARCHES</Text>
            <Pressable onPress={clearRecent} hitSlop={8}>
              <Text style={s.clearTxt}>CLEAR</Text>
            </Pressable>
          </View>
          <BrutalCard flat style={{ paddingVertical: 4 }}>
            {recent.map((term, i) => (
              <Pressable
                key={term}
                style={[s.recentRow, i === recent.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => setQ(term)}
              >
                <Ionicons name="time-outline" size={18} color={BR_COLORS.textMuted} />
                <Text style={s.recentTxt} numberOfLines={1}>{term}</Text>
                <Ionicons name="arrow-up-outline" size={16} color={BR_COLORS.textMuted} style={{ transform: [{ rotate: '-45deg' }] }} />
              </Pressable>
            ))}
          </BrutalCard>
        </View>
      );
    }
    if (loading) {
      return (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator color={PALETTE.brand} />
          <Text style={{ marginTop: 12, color: BR_COLORS.textMuted, fontWeight: '700' }}>Searching…</Text>
        </View>
      );
    }
    if (error) {
      if (error === 'offline') {
        return (
          <BrutalEmptyState
            emoji="📶"
            title="You're offline"
            body="Search needs an internet connection. Reconnect and try again — your recent searches stay saved."
          />
        );
      }
      return (
        <BrutalEmptyState
          emoji="⚠️"
          title="Search unavailable"
          body={error}
          ctaLabel="RETRY"
          onCta={() => setQ(q)}
        />
      );
    }
    if (results && results.total === 0) {
      return (
        <BrutalEmptyState
          emoji="🔎"
          title={`No results for "${q}"`}
          body="Try a merchant name, category, or goal name. Or start tracking a new expense."
          ctaLabel="ADD TRANSACTION"
          onCta={() => router.push({ pathname: '/(tabs)/transactions' as any, params: { openAdd: '1' } })}
        />
      );
    }
    return (
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => <Text style={s.sectionHeader}>{section.title}</Text>}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: BR_SPACE['4'], paddingBottom: 120, gap: BR_SPACE['2'] }}
        stickySectionHeadersEnabled={false}
      />
    );
  })();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={s.headerBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <View style={s.searchBox}>
          <Ionicons
            name={isOnline ? 'search' : 'cloud-offline'}
            size={18}
            color={isOnline ? BR_COLORS.ink : PALETTE.warn}
          />
          <TextInput
            autoFocus
            placeholder={isOnline ? 'Search transactions, budgets, goals…' : 'Offline — search unavailable'}
            placeholderTextColor={BR_COLORS.textMuted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => { commitSearch(); Keyboard.dismiss(); }}
            returnKeyType="search"
            style={s.input}
            accessibilityLabel="Search"
            editable={isOnline}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={BR_COLORS.textMuted} />
            </Pressable>
          )}
        </View>
      </View>
      {body}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    gap: BR_SPACE['3'],
  },
  headerBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BR_COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
  },
  input: {
    flex: 1, fontSize: 14, color: BR_COLORS.ink, padding: 0,
    fontWeight: '600',
  },

  sectionHeader: {
    ...BR_FONT.stamp,
    fontSize: 11,
    color: BR_COLORS.textMuted,
    marginTop: BR_SPACE['3'],
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: BR_SPACE['3'],
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    ...(BR_SHADOW.sm as any),
  },
  iconWrap: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.fine, borderColor: BR_COLORS.ink,
  },
  iconEmoji: { fontSize: 18 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: BR_COLORS.ink },
  rowSub: { fontSize: 12, color: BR_COLORS.textMuted, marginTop: 2, fontWeight: '500' },
  rowAmt: { fontSize: 14, fontWeight: '900' },

  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  recentLabel: { ...BR_FONT.stamp, fontSize: 11, color: BR_COLORS.textMuted },
  clearTxt: { ...BR_FONT.stamp, fontSize: 11, color: PALETTE.brand },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: BR_SPACE['3'],
    paddingHorizontal: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.line,
  },
  recentTxt: { flex: 1, fontSize: 14, color: BR_COLORS.ink, fontWeight: '600' },
});
