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
import React, { useCallback, useMemo, useState } from 'react';
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
// import DiscoverDrawer from '../../components/home/DiscoverDrawer'; // R100V — DISCOVER killed
// R100G — PremiumUpsellRow removed per user directive: Premium card
// moved to Profile (Plan section). Import retained removed below.
import StarterPackCard from '../../components/home/StarterPackCard';
import PulseMascotButton from '../../components/home/PulseMascotButton';
import ReferralMascotCard from '../../components/home/ReferralMascotCard';
import useShouldShowUpsells from '../../hooks/useShouldShowUpsells';
import MissionCard from '../../components/home/MissionCard';
// Round 100X — Duolingo-grade mascot engagement engine.
// MascotHero: the daily face of MintU at the top of home. Hidden for
// cold-start users via internal honest-UX gate (txnCount === 0).
// MascotStreakHero: Duolingo-style streak surface, shown only after
// the user has earned ≥1 streak day.
import MascotHero from '../../components/mascot/MascotHero';
import MascotStreakHero from '../../components/mascot/MascotStreakHero';
import MascotCelebration from '../../components/mascot/MascotCelebration';
import MascotShareCard from '../../components/mascot/MascotShareCard';
import useMascotCelebration from '../../hooks/useMascotCelebration';
// Round 100Z — Neo-Brutalism rebuild. NBHero is the new bold,
// chunky-shadow, sticker-decorated hero that replaces the small
// MascotHero strip on the home dashboard. Theme-aware (light + dark).
import NBHero from '../../components/neo/NBHero';
import { useNeoPalette } from '../../store/neoTheme';

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

  // R100T — earned-the-pitch gate for monetization surfaces (Refer & Earn).
  const showUpsells = useShouldShowUpsells();

  // Round 98 — pre-seeded starter deck from `/api/onboarding/seed`.
  // Only fetches when the user has no transactions yet; otherwise
  // we skip the round-trip entirely (real data already drives the hero).
  const { cards: starterCards, anchorPct, anchorCopy, seeded: starterSeeded } =
    useStarterCards(Number(txnCount ?? 0) === 0);

  // Round 99E — gate the premium upsell behind real engagement.
  // R100G — Premium upsell relocated to Profile per user directive.
  // We keep the starter completion count so other surfaces (e.g.
  // future onboarding milestones) can still observe progress.
  const [starterDoneCount, setStarterDoneCount] = useState(0);
  const userIdForStarter = useAuthStore(s => s.user?.id ?? null);
  // (showPremiumUpsell flag removed — see Premium card in Profile.)
  void starterDoneCount;

  // Round 100X — Mascot celebration overlay. Fires only on REAL earned
  // events (streak milestones, goal hit, first txn). Honest-UX
  // enforced inside the hook via AsyncStorage dedupe.
  const celebration = useMascotCelebration();
  // Share-card visibility — toggled by celebration "SHARE" CTA.
  const [shareOpen, setShareOpen] = useState(false);

  // Round 100Z — Neo palette for theme-aware bg (sky-blue light /
  // graphite dark). Must be called BEFORE any early-return below or
  // we hit React error #310 (hook count mismatch between renders).
  const neoPalette = useNeoPalette();

  // Header callbacks (stable refs)
  const goSearch        = useCallback(() => router.push('/search' as any), []);
  const goNotifications = useCallback(() => router.push('/notifications' as any), []);
  // Round 94 — `goCoinLedger` removed (gamification kill, /coin-ledger deleted).
  const goProfile       = useCallback(() => router.push(ROUTES.PROFILE), []);

  // Round 99F — context-aware greeting. "Welcome back" on a user's
  // first-ever visit is a trust crack — they think the app is broken
  // or knows them too well. Detect zero-txn + zero open notifications
  // as the new-user signal and switch to a warmer first-time copy.
  const isFirstVisit = Number(txnCount ?? 0) === 0;
  const welcomeGreeting = useMemo(
    () => (isFirstVisit ? t('welcome_first', lang) : t('welcome_back', lang)).toUpperCase(),
    [lang, isFirstVisit],
  );

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

  // Round 100Z — neoPalette already declared above (must run BEFORE
  // the `if (loading)` early return to satisfy hooks rules).

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: neoPalette.bg }]}>
      <Confetti trigger={showConfetti} onDone={onConfettiDone} />

      {/* Round 100X — Mascot celebration overlay (fires on real earned events). */}
      <MascotCelebration
        visible={celebration.visible}
        title={celebration.title}
        subtitle={celebration.subtitle}
        onDismiss={celebration.dismiss}
        onShare={() => { celebration.dismiss(); setShareOpen(true); }}
      />
      {/* Share-card surface — toggled by celebration's SHARE button. */}
      <MascotShareCard
        visible={shareOpen}
        title={celebration.title || 'On a roll with MintU 🔥'}
        quote={celebration.subtitle}
        statLabel={celebration.title.includes('streak') ? celebration.title : undefined}
        onClose={() => setShareOpen(false)}
        mood="celebrating"
      />

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
          {/* Pulse mascot — tappable entry to the Money Signal Layer.
              Per spec this is the LEFT-most element; handles its own
              glow/badge states via /api/pulse. See PulseMascotButton. */}
          <PulseMascotButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{welcomeGreeting}</Text>
            <Text style={styles.name}>{user?.name || 'User'}</Text>
          </View>
          {/* Search + notification-bell removed in R100F per Pulse-first
              direction. Pulse owns "what changed today" (top-left mascot);
              search and bell pile up clutter without earning attention.
              The profile avatar carries account access; settings live one
              tap away inside it. */}
          {/* Round 94 — coin chip removed (gamification kill, R92). */}
          {/* R100I — Profile chip removed per user feedback ("looks
              horrible — misaligned"). Reverted to plain avatar
              TapTile; tap still routes to /profile. */}
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

        {/* ── 0. NEO-BRUTAL HERO — Round 100Z face-of-app ────────── */}
        {/* Memphis-Group bold hero with chunky shadow, sticker chaos */}
        {/* (zigzag/asterisk/dot decoration), big H1 typography, and  */}
        {/* mood-aware mascot. Theme-aware (light + dark via         */}
        {/* useNeoPalette). Replaces the older small MascotHero strip */}
        {/* — which is now relegated to a smaller secondary surface.  */}
        <NBHero />

        {/* ── 0a. STREAK HERO — Duolingo-style streak surface ──────── */}
        {/* Hidden until the user has earned ≥1 streak day. Shows flame */}
        {/* tier + freeze inventory + comeback CTA when at risk.        */}
        <MascotStreakHero />

        {/* ── 1. HERO — Decision Context ────────────────────────── */}
        {/* Score + risk flag + ONE insight. Taps → AI Coach. */}
        {/* For zero-txn new users we SKIP the hero (no score yet)  */}
        {/* and let the starter deck / TodayAction carry the surface. */}
        {txnCount > 0 && <HeroDecision insight={insight} />}

        {/* ── 1a. STARTER PACK — Round 98 first-paint deck. ──────── */}
        {/* ── 0. MISSION — Emotional spine (R100Q Phase 1) ─────────── */}
        {/* Card hides itself if no mission seeded; never fakes a goal. */}
        {/* Closes SF1 from the audit: onboarding promised the user a   */}
        {/* mission, this is where they SEE it.                          */}
        <MissionCard />

        {/* Only appears for brand-new users who completed the       */}
        {/* income slider but haven't logged any transactions yet.   */}
        {/* Round 99E: now reports completion count to gate the      */}
        {/* premature-paywall and renders inline proof banner so the */}
        {/* user sees confirmation without leaving Home.             */}
        {txnCount === 0 && starterSeeded && starterCards.length > 0 && (
          <StarterPackCard
            cards={starterCards}
            anchorPct={anchorPct}
            anchorCopy={anchorCopy}
            userId={userIdForStarter}
            onCompletedCountChange={setStarterDoneCount}
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

        {/* ── 4. DISCOVER — KILLED in R100V audit ───────────────────
            Was a card lumping "Money School + Rewards + Premium Hub"
            into one ambiguous brutalist tile. Two unrelated concepts,
            no contextual reason, dilutes Home's hierarchy. Surfaces:
            Money School lives at /money-school (deep-linked from AI
            Coach when relevant), Rewards lives in profile chip,
            Premium Hub is in Profile → PLAN section. No top-level
            DISCOVER drawer needed. */}

        {/* ── 5. REFER & EARN — Toing-style mascot card (R100G) ──── */}
        {/* R100T — Suppressed for cold-start users (no txns/budgets/groups). */}
        {/* No point monetizing referrals before the user has any value to refer. */}
        {showUpsells ? <ReferralMascotCard /> : null}

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
  // R100G — Profile entry combo: avatar + tap-hint chip side-by-side.
  profileEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
  },
  profileChipTxt: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: BR_COLORS.ink,
  },
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
