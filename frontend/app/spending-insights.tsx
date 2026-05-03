/**
 * Spending Insights — Round 57 (Retention + Virality layer)
 *
 * A single screen that stitches together existing backend endpoints
 * into a personal, emotional, shareable "spending story":
 *   - /api/home/snapshot       → MTD spend, projection, top category, tier
 *   - /api/leaderboard/friends → who spends most vs you (friend taunts)
 *   - /api/analytics/yearly    → trailing 12-month highlights + best months
 *   - /api/reports/weekly      → mood + headline + savings suggestion
 *
 * Design: glass cards on the #FAFAF9 canvas. Every card has a clear
 * hook (share, invite, act) so the screen is both reflective and viral.
 *
 * Defensive: 4-state render (loading / error / empty / data) so users
 * never see a dead screen even if one endpoint degrades.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';

import api from '../utils/api';
import { COLORS, GLASS, shadowStyle } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { APP_LINK } from '../utils/brand';
import MascotMoment from '../components/MascotMoment';
import { StaggeredEntrance } from '../components/primitives';

// Round 57d — first-open mascot moment storage key. Versioned so we can
// invalidate it later if the welcome copy changes meaningfully.
const FIRST_OPEN_KEY = 'mintu.spendingInsights.firstOpen.v1';

// ---------------------------------------------------------------
// Types (loose — we only destructure what's needed)
// ---------------------------------------------------------------
type Snapshot = {
  mtd_spend?: number;
  mtd_income?: number;
  savings_rate?: number;
  projected_month_end?: number;
  top_category?: { name: string; amount: number; pct: number } | null;
  week_change_pct?: number;
  tier?: { current?: { name: string; emoji: string; color: string }; score?: number; streak_days?: number };
  pace_headline?: string;
  pace_emoji?: string;
};
type Friend = { name: string; score: number; streak: number; diff: number; taunt: string; ahead: boolean };
type FriendLeaderboard = { you: { name: string; score: number }; friends: Friend[]; summary: string };
type YearlyMonth = { label: string; expense: number; income: number; savings_rate: number; top_category?: string | null };
type Yearly = {
  monthly: YearlyMonth[];
  yearly: { expense: number; income: number; savings: number; savings_rate: number };
  top_categories: { name: string; amount: number; pct: number }[];
  highlights: {
    highest_spend_month: YearlyMonth | null;
    lowest_spend_month: YearlyMonth | null;
    best_savings_month: YearlyMonth | null;
  };
  headline: string;
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const fmtINR = (n: number | undefined | null): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return '₹0';
  const v = Math.abs(Math.round(n));
  return `₹${v.toLocaleString('en-IN')}`;
};

const SECTION_COLORS = ['#E84A0C', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'];

export default function SpendingInsightsScreen() {
  const s = useStyles();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [friends, setFriends] = useState<FriendLeaderboard | null>(null);
  const [yearly, setYearly] = useState<Yearly | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [showMascot, setShowMascot] = useState(false);

  // Check first-open flag. If unset, fire the mascot moment AND persist.
  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(FIRST_OPEN_KEY);
        if (!seen) {
          setShowMascot(true);
          await AsyncStorage.setItem(FIRST_OPEN_KEY, String(Date.now()));
          // Auto-hide after the burst plays (~5s) so it doesn't block
          // long sessions even if the user lingers.
          setTimeout(() => setShowMascot(false), 5200);
        }
      } catch { /* AsyncStorage unavailable — silently skip the burst */ }
    })();
  }, []);

  const load = useCallback(async () => {
    // All three endpoints run in parallel. One failure does NOT blank
    // the whole screen — we only show the cards that succeeded.
    const results = await Promise.allSettled([
      api.get('/home/snapshot'),
      api.get('/leaderboard/friends'),
      api.get('/analytics/yearly'),
    ]);
    const [snapRes, friendRes, yearRes] = results;
    if (snapRes.status === 'fulfilled') setSnap(snapRes.value.data);
    if (friendRes.status === 'fulfilled') setFriends(friendRes.value.data);
    if (yearRes.status === 'fulfilled') setYearly(yearRes.value.data);
    const fails = results.filter(r => r.status === 'rejected').length;
    setErrorCount(fails);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
  }, [load]);

  const storyShareText = useMemo(() => {
    const spend = fmtINR(snap?.mtd_spend || 0);
    const top = snap?.top_category?.name || 'Other';
    const score = snap?.tier?.score ?? 50;
    const streak = snap?.tier?.streak_days ?? 0;
    return (
      `📊 My MintU Spending Story\n\n` +
      `This month: ${spend}\n` +
      `Biggest category: ${top}\n` +
      `Money Score: ${score}/100 • ${streak}-day streak\n\n` +
      `Track yours → ${APP_LINK}`
    );
  }, [snap]);

  const onShareStory = useCallback(async () => {
    try {
      await Share.share({ message: storyShareText });
      Toast.show({ type: 'success', text1: 'Shared!', position: 'bottom' });
    } catch { /* user cancelled */ }
  }, [storyShareText]);

  // ── STATE 1: LOADING ────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.bg} edges={['top', 'left', 'right']}>
        <Header onBack={() => router.back()} onShare={onShareStory} />
        <View style={s.center}>
          <ActivityIndicator color={COLORS.accent.brand} size="large" />
          <Text style={s.loadingText}>Crunching your spending story…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── STATE 2: ERROR (all three endpoints failed) ────────────────
  if (!snap && !friends && !yearly) {
    return (
      <SafeAreaView style={s.bg} edges={['top', 'left', 'right']}>
        <Header onBack={() => router.back()} onShare={onShareStory} />
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={56} color={COLORS.text.muted} />
          <Text style={s.emptyTitle}>Couldn't load insights</Text>
          <Text style={s.emptySub}>Check your connection and try again.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── STATE 3: EMPTY (new user, no data yet) ────────────────────
  const hasData = (snap?.mtd_spend ?? 0) > 0 || (yearly?.yearly?.expense ?? 0) > 0;
  if (!hasData) {
    return (
      <SafeAreaView style={s.bg} edges={['top', 'left', 'right']}>
        <Header onBack={() => router.back()} onShare={onShareStory} />
        <View style={s.center}>
          <Text style={s.emptyEmoji}>📭</Text>
          <Text style={s.emptyTitle}>No spending tracked yet</Text>
          <Text style={s.emptySub}>
            Add a few transactions and we'll show you your personal spending story.
          </Text>
          <TouchableOpacity
            style={s.retryBtn}
            onPress={() => router.push('/(tabs)/transactions' as any)}
          >
            <Text style={s.retryTxt}>Add Transaction</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── STATE 4: DATA ─────────────────────────────────────────────
  const tier = snap?.tier?.current;
  const monthChange = snap?.week_change_pct ?? 0;
  const arrowUp = monthChange > 0;
  const highestExpenseMonth = yearly?.highlights?.highest_spend_month;
  const bestSavingsMonth = yearly?.highlights?.best_savings_month;

  return (
    <SafeAreaView style={s.bg} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header onBack={() => router.back()} onShare={onShareStory} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.brand} />}
        showsVerticalScrollIndicator={false}
      >
        <StaggeredEntrance delayMs={65} duration={420} distance={14}>
        {errorCount > 0 && (
          <View style={s.warningBar}>
            <Ionicons name="information-circle" size={16} color={COLORS.state.warning} />
            <Text style={s.warningText}>
              Some insights couldn't load. Showing what we have.
            </Text>
          </View>
        )}

        {/* HERO — MTD spend */}
        {snap && (
          <View style={[s.card, s.hero]}>
            <Text style={s.heroLabel}>Spent this month</Text>
            <Text style={s.heroAmount}>{fmtINR(snap.mtd_spend)}</Text>
            <View style={s.heroRow}>
              {tier && (
                <View style={[s.tierPill, { backgroundColor: (tier.color || COLORS.accent.brand) + '22', borderColor: tier.color || COLORS.accent.brand }]}>
                  <Text style={[s.tierPillTxt, { color: tier.color || COLORS.accent.brand }]}>
                    {tier.emoji} {tier.name}
                  </Text>
                </View>
              )}
              {monthChange !== 0 && (
                <View style={s.changePill}>
                  <Ionicons
                    name={arrowUp ? 'trending-up' : 'trending-down'}
                    size={14}
                    color={arrowUp ? COLORS.state.danger : COLORS.state.success}
                  />
                  <Text style={[s.changeTxt, { color: arrowUp ? COLORS.state.danger : COLORS.state.success }]}>
                    {arrowUp ? '+' : ''}{monthChange.toFixed(0)}% vs last week
                  </Text>
                </View>
              )}
            </View>
            {snap.pace_headline && (
              <Text style={s.paceHeadline}>
                {snap.pace_emoji} {snap.pace_headline}
              </Text>
            )}
          </View>
        )}

        {/* TOP CATEGORIES */}
        {yearly?.top_categories && yearly.top_categories.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Where your money went</Text>
              <Text style={s.cardMeta}>Last 12 months</Text>
            </View>
            {yearly.top_categories.slice(0, 5).map((cat, i) => (
              <View key={cat.name} style={s.catRow}>
                <View style={[s.catDot, { backgroundColor: SECTION_COLORS[i % SECTION_COLORS.length] }]} />
                <Text style={s.catName} numberOfLines={1}>{cat.name}</Text>
                <View style={s.catBarWrap}>
                  <View style={[
                    s.catBar,
                    { width: `${Math.min(100, cat.pct)}%`, backgroundColor: SECTION_COLORS[i % SECTION_COLORS.length] },
                  ]} />
                </View>
                <Text style={s.catAmt}>{fmtINR(cat.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* FRIEND COMPARISON — retention + virality */}
        {friends && friends.friends && friends.friends.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>How you stack up</Text>
            </View>
            <Text style={s.friendSummary}>{friends.summary}</Text>
            {friends.friends.slice(0, 5).map((f, i) => (
              <View key={`${f.name}-${i}`} style={s.friendRow}>
                <View style={[s.friendRank, { backgroundColor: f.ahead ? COLORS.state.successBg : COLORS.state.dangerBg }]}>
                  <Text style={[s.friendRankTxt, { color: f.ahead ? COLORS.state.success : COLORS.state.danger }]}>
                    {f.ahead ? '▲' : '▼'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.friendName}>{f.name}</Text>
                  <Text style={s.friendTaunt} numberOfLines={1}>{f.taunt}</Text>
                </View>
                <Text style={s.friendScore}>{f.score}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty friends state = virality CTA */}
        {friends && friends.friends && friends.friends.length === 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Compare with friends</Text>
            <Text style={s.emptySub}>
              Join or create a Split group to compare your Money Score with friends.
            </Text>
            <TouchableOpacity
              style={s.ctaBtn}
              onPress={() => router.push('/(tabs)/split' as any)}
            >
              <Ionicons name="people" size={16} color="#FFFFFF" />
              <Text style={s.ctaBtnTxt}>Open Split</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* YEARLY HIGHLIGHTS */}
        {yearly?.highlights && (highestExpenseMonth || bestSavingsMonth) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Your year in a glance</Text>
            <Text style={s.yearlyHeadline}>{yearly.headline}</Text>
            <View style={s.highlightsGrid}>
              {highestExpenseMonth && (
                <View style={s.highlightBox}>
                  <Text style={s.highlightEmoji}>💸</Text>
                  <Text style={s.highlightLabel}>Biggest month</Text>
                  <Text style={s.highlightValue}>{highestExpenseMonth.label}</Text>
                  <Text style={s.highlightSub}>{fmtINR(highestExpenseMonth.expense)}</Text>
                </View>
              )}
              {bestSavingsMonth && bestSavingsMonth.savings_rate > 0 && (
                <View style={s.highlightBox}>
                  <Text style={s.highlightEmoji}>🏆</Text>
                  <Text style={s.highlightLabel}>Best savings</Text>
                  <Text style={s.highlightValue}>{bestSavingsMonth.label}</Text>
                  <Text style={s.highlightSub}>{bestSavingsMonth.savings_rate.toFixed(0)}% saved</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={s.subtleLink}
              onPress={() => router.push('/yearly' as any)}
            >
              <Text style={s.subtleLinkTxt}>Open full yearly dashboard →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SHARE CTA */}
        <TouchableOpacity style={s.shareBtn} onPress={onShareStory} activeOpacity={0.85}>
          <Ionicons name="share-social" size={18} color="#FFFFFF" />
          <Text style={s.shareBtnTxt}>Share my spending story</Text>
        </TouchableOpacity>
        </StaggeredEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Header
// ---------------------------------------------------------------
function Header({ onBack, onShare }: { onBack: () => void; onShare: () => void }) {
  const s = useStyles();
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} hitSlop={10} style={s.headerBtn}>
        <Ionicons name="chevron-back" size={24} color={COLORS.text.primary} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Spending Insights</Text>
      <TouchableOpacity onPress={onShare} hitSlop={10} style={s.headerBtn}>
        <Ionicons name="share-outline" size={22} color={COLORS.text.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------
const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: GLASS.borderLight,
    backgroundColor: GLASS.solidBg,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: c.text.muted, marginTop: 12, fontSize: 14 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: c.text.primary, marginTop: 12 },
  emptySub: { fontSize: 14, color: c.text.muted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: 18, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: c.accent.primary, borderRadius: 0,
  },
  retryTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  warningBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.state.warningBg, borderColor: c.state.warningBorder,
    borderWidth: 1, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
  },
  warningText: { flex: 1, fontSize: 12, color: c.text.primary },

  card: {
    backgroundColor: GLASS.solidBg,
    borderRadius: 0, padding: 18, marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    ...shadowStyle('#111827', 2, 12, 0.04, 3),
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  cardMeta: { fontSize: 11, color: c.text.muted, fontWeight: '600' },

  hero: { alignItems: 'flex-start' },
  heroLabel: { fontSize: 13, color: c.text.muted, fontWeight: '600', marginBottom: 4 },
  heroAmount: { fontSize: 36, fontWeight: '900', color: c.text.primary, letterSpacing: -1 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tierPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0, borderWidth: 1 },
  tierPillTxt: { fontSize: 12, fontWeight: '800' },
  changePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0,
    backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.border.card,
  },
  changeTxt: { fontSize: 12, fontWeight: '800' },
  paceHeadline: { fontSize: 13, color: c.text.secondary, marginTop: 12, lineHeight: 19 },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  catDot: { width: 10, height: 10, borderRadius: 0 },
  catName: { fontSize: 13, color: c.text.primary, fontWeight: '600', width: 80 },
  catBarWrap: { flex: 1, height: 6, backgroundColor: c.gray[200], borderRadius: 3, overflow: 'hidden' },
  catBar: { height: '100%', borderRadius: 3 },
  catAmt: { fontSize: 12, color: c.text.primary, fontWeight: '700', width: 70, textAlign: 'right' },

  friendSummary: { fontSize: 13, color: c.text.secondary, marginBottom: 10 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  friendRank: { width: 28, height: 28, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  friendRankTxt: { fontSize: 12, fontWeight: '900' },
  friendName: { fontSize: 14, fontWeight: '700', color: c.text.primary },
  friendTaunt: { fontSize: 11, color: c.text.muted, marginTop: 2 },
  friendScore: { fontSize: 16, fontWeight: '800', color: c.accent.primary, minWidth: 36, textAlign: 'right' },

  yearlyHeadline: { fontSize: 13, color: c.text.secondary, marginBottom: 14, lineHeight: 19 },
  highlightsGrid: { flexDirection: 'row', gap: 10 },
  highlightBox: {
    flex: 1, backgroundColor: c.bg.elevated, borderRadius: 0, padding: 12,
    borderWidth: 1, borderColor: c.border.card, alignItems: 'flex-start',
  },
  highlightEmoji: { fontSize: 20, marginBottom: 4 },
  highlightLabel: { fontSize: 10, color: c.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  highlightValue: { fontSize: 15, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  highlightSub: { fontSize: 11, color: c.text.secondary, marginTop: 2 },
  subtleLink: { marginTop: 12, paddingVertical: 6 },
  subtleLinkTxt: { fontSize: 12, color: c.accent.primary, fontWeight: '700' },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.accent.primary, paddingVertical: 11, borderRadius: 0, marginTop: 12,
  },
  ctaBtnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.accent.primary, paddingVertical: 14, borderRadius: 0, marginTop: 6,
    ...shadowStyle(c.accent.primary, 4, 12, 0.2, 4),
  },
  shareBtnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
}));
