/**
 * HomeScreen — Round 89 Strike 2 (FINAL — intent-first, brutalist).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DESIGN CONTRACT — 4 blocks, locked. No more, no less.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   1. HERO       = Decision Context    → "Am I OK or in trouble?"
 *                                         Score + risk flag + ONE insight.
 *                                         Tappable → AI Coach (prefilled).
 *
 *   2. TODAY      = Action Engine       → ONE primary action. Optional
 *                                         ONE secondary. No list, no
 *                                         scroll. Tappable → AI Coach.
 *
 *   3. THIS WEEK  = Dashboard strip     → ≤3 rows. Spend vs budget /
 *                                         Score ↑↓ / Next bill.
 *                                         Omits empty rows, not fills them.
 *
 *   4. DISCOVER   = Collapsed drawer    → Money School / Premium Hub /
 *                                         Rewards / News. Closed by default.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DELETED (not moved, not hidden — gone from Home):
 *   ControlCenterCard · GettingStartedCard · DailyQuestCard ·
 *   FinancialBrainCard · InsightsCard (standalone) ·
 *   HomeHero (old decorative one) · QuickActionBar · TodayChips ·
 *   SmartSuggestion · PremiumTeaserCard · PremiumHomeCard ·
 *   UnifiedLeaderboard · MoneySchoolCard · WeeklyReport ·
 *   EmbeddedFinanceCard · NewsCardStack
 *
 * ONE BRAIN — Hero + Today both read from usePriorityInsight(), the
 * same pure engine that powers AI Coach. No forked logic.
 * ═══════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import { makeStyles } from '../../utils/makeStyles';
import TapTile from '../../components/ui/TapTile';
import { BR_COLORS, BR_TYPE, BR_SPACE } from '../../utils/brutalist';

import { HomeSkeleton } from '../../components/SkeletonLoader';
// Round 94 — AnimatedCoin import removed (gamification kill).
import HeroDecision from '../../components/home/HeroDecision';
import TodayAction from '../../components/home/TodayAction';
import WeekStrip from '../../components/home/WeekStrip';
import DiscoverDrawer from '../../components/home/DiscoverDrawer';
import PremiumUpsellRow from '../../components/home/PremiumUpsellRow';
import StarterPackCard from '../../components/home/StarterPackCard';

import Confetti from '../../components/Confetti';
import { useHomeNotifications } from '../../hooks/useHomeNotifications';
import { useAfterFirstPaint, prefetchRoute } from '../../hooks/usePerf';
import { useHomeBundleData } from '../../hooks/useHomeBundleData';
import { usePriorityInsight } from '../../hooks/usePriorityInsight';
import { useStarterCards } from '../../hooks/useStarterCards';
import { ROUTES } from '../../constants/routes';

function HomeScreen() {
  const styles = useStyles();
  const { user, avatar } = useAuthStore();
  const { lang } = useLangStore();
  const { unread } = useHomeNotifications();

  // SSoT — Home bundle (stats, snapshot, confetti lifecycle, etc.)
  const home = useHomeBundleData(lang);
  const {
    stats, snapshot,
    loading, refreshing, showConfetti,
    onRefresh, onConfettiDone,
    txnCount,
  } = home;

  // ONE BRAIN — shared priority engine. Used by Hero + Today + AI Coach.
  const insight = usePriorityInsight();

  // Round 98 — pre-seeded starter deck from `/api/onboarding/seed`.
  // Only fetches when the user has no transactions yet; otherwise
  // we skip the round-trip entirely (real data already drives the hero).
  const { cards: starterCards, anchorPct, anchorCopy, seeded: starterSeeded } =
    useStarterCards(Number(txnCount ?? 0) === 0);

  // Header callbacks (stable refs)
  const goSearch        = useCallback(() => router.push('/search' as any), []);
  const goNotifications = useCallback(() => router.push('/notifications' as any), []);
  // Round 94 — `goCoinLedger` removed (gamification kill, /coin-ledger deleted).
  const goProfile       = useCallback(() => router.push(ROUTES.PROFILE), []);

  const welcomeGreeting = useMemo(() => t('welcome_back', lang).toUpperCase(), [lang]);

  // Prefetch adjacent routes.
  useAfterFirstPaint(() => {
    prefetchRoute(() => import('./transactions'));
    prefetchRoute(() => import('./budget'));
    prefetchRoute(() => import('./ai-coach'));
  });

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <HomeSkeleton />
    </SafeAreaView>
  );

  // Monthly budget — pulled from snapshot if backend included it, else
  // undefined. WeekStrip omits the "vs budget" row when missing.
  const monthlyBudget = Number(
    (snapshot as any)?.monthly_budget_total ??
    (snapshot as any)?.monthly_budget ??
    0,
  );
  const mtdSpend = Number(snapshot?.mtd_spend ?? stats?.total_expense ?? 0);

  return (
    <SafeAreaView style={styles.container}>
      <Confetti trigger={showConfetti} onDone={onConfettiDone} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BR_COLORS.accent}
          />
        }
      >
        {/* ── HEADER — slim, brutalist ────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{welcomeGreeting}</Text>
            <Text style={styles.name}>{user?.name || 'User'}</Text>
          </View>
          <TouchableOpacity
            onPress={goSearch}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="search" size={20} color={BR_COLORS.ink} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goNotifications}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="notifications-outline" size={20} color={BR_COLORS.ink} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{unread > 9 ? '9+' : String(unread)}</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Round 94 — coin chip removed (gamification kill, R92). */}
          <TapTile onPress={goProfile} style={styles.avatarWrap} feedback="selection">
            <View style={styles.avatarRing}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={20} color={BR_COLORS.ink} />
                </View>
              )}
            </View>
          </TapTile>
        </View>

        {/* ── 1. HERO — Decision Context ────────────────────────── */}
        {/* Score + risk flag + ONE insight. Taps → AI Coach. */}
        {/* For zero-txn new users we SKIP the hero (no score yet)  */}
        {/* and let the starter deck / TodayAction carry the surface. */}
        {txnCount > 0 && <HeroDecision insight={insight} />}

        {/* ── 1a. STARTER PACK — Round 98 first-paint deck. ──────── */}
        {/* Only appears for brand-new users who completed the       */}
        {/* income slider but haven't logged any transactions yet.   */}
        {txnCount === 0 && starterSeeded && starterCards.length > 0 && (
          <StarterPackCard
            cards={starterCards}
            anchorPct={anchorPct}
            anchorCopy={anchorCopy}
          />
        )}

        {/* ── 2. TODAY — Action Engine ──────────────────────────── */}
        {/* ONE primary action. Optional ONE secondary. Tappable → Coach. */}
        {/* Hide Today when the starter deck is doing the work —     */}
        {/* otherwise we'd stack two "do something" cards.           */}
        {!(txnCount === 0 && starterSeeded && starterCards.length > 0) && (
          <TodayAction insight={insight} />
        )}

        {/* ── 3. THIS WEEK — Situational Awareness ──────────────── */}
        {/* ≤3 rows. Omits empty rows. Hidden if nothing to show.  */}
        {txnCount > 0 && (
          <WeekStrip
            mtdSpend={mtdSpend}
            monthlyBudget={monthlyBudget || undefined}
          />
        )}

        {/* ── 4. DISCOVER — Collapsed drawer ─────────────────────── */}
        <DiscoverDrawer />

        {/* ── 5. PREMIUM UPSELL — below Discover (spec) ──────────── */}
        {/* Renders nothing for Pro users. */}
        <PremiumUpsellRow />

        <View style={{ height: 140 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(() => ({
  container: { flex: 1, backgroundColor: BR_COLORS.paper },
  scroll: { paddingHorizontal: BR_SPACE.lg, paddingTop: BR_SPACE.md, paddingBottom: 140 },

  // Header — flat, brutalist, zero decoration.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: BR_SPACE.lg,
    gap: 6,
  },
  greeting: { ...BR_TYPE.labelSm, color: BR_COLORS.muted },
  name: {
    fontSize: 22, fontWeight: '900',
    color: BR_COLORS.ink,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  avatarWrap: { position: 'relative' },
  avatarRing: {
    width: 40, height: 40,
    borderWidth: 2, borderColor: BR_COLORS.ink,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: BR_COLORS.paper,
  },
  avatarImg: { width: 36, height: 36 },
  avatarPlaceholder: {
    width: 36, height: 36,
    backgroundColor: BR_COLORS.paperAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  coinsChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
  },
  headerIconBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    position: 'relative',
  },
  badge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 16, height: 16, paddingHorizontal: 3,
    backgroundColor: BR_COLORS.negative,
    borderWidth: 2, borderColor: BR_COLORS.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 9, fontWeight: '900', color: BR_COLORS.accentInk },
}));

// Tab-level ErrorBoundary so a crash here doesn't blank the whole app.
import { withTabBoundary } from '../../components/withTabBoundary';
export default withTabBoundary(HomeScreen, 'Home');
