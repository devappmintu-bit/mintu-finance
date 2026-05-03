/**
 * HomeScreen — MintU 2.0 Redesign.
 *
 * Layout philosophy: INSIGHT → ACTION → REWARD
 *
 *  1. Slim header                  (greeting + avatar + coins)
 *  2. Balance Hero                 (big saved/spent card with pace pulse)
 *  3. Quick Action Bar             (Add · Scan · Split · AI · Rewards)
 *  4. Today Chips                  (stat chips horizontal scroll)
 *  5. Actionable Smart Alerts      (interactive CTAs)
 *  6. Pulse Graph                  (slim 7-day sparkline)
 *  7. Financial Brain              (tabbed AI · Forecast · Waste)
 *  8. Daily Quest                  (retention habit loop)
 *  9. Premium + Money School       (compact)
 * 10. Weekly Report · Leaderboard · News
 *
 * Round 67 (R3 decomposition) — All data-fetching logic moved into
 * `hooks/useHomeBundleData.ts` (~210 LOC). This file now reads as
 * pure presentation: data in, UI out.
 */
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import { COLORS, SPACING, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import TapTile from '../../components/ui/TapTile';
import { router } from 'expo-router';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import InsightsCard from '../../components/home/InsightsCard';
import DailyQuestCard from '../../components/DailyQuestCard';
import PremiumHomeCard from '../../components/home/PremiumHomeCard';
import MoneySchoolCard from '../../components/home/MoneySchoolCard';
import PremiumTeaserCard from '../../components/premium/PremiumTeaserCard';
import UnifiedLeaderboard from '../../components/leaderboard/UnifiedLeaderboard';
import AnimatedCoin from '../../components/AnimatedCoin';
import NewsCardStack from '../../components/home/NewsCardStack';
import WeeklyReport from '../../components/home/WeeklyReport';
import BalanceHero from '../../components/home/BalanceHero';
import HomeHero from '../../components/home/HomeHeroBrutalist';
import GettingStartedCard from '../../components/home/GettingStartedCard';
import MascotMoment from '../../components/MascotMoment';
import QuickActionBar from '../../components/home/QuickActionBar';
import TodayChips from '../../components/home/TodayChips';
import ActionableAlertCard from '../../components/home/ActionableAlertCard';
import FinancialBrainCard from '../../components/home/FinancialBrainCard';
// Round 74 — Phase 1 "Lazy User First": Home Control Center hub +
// sticky AskBar bring all do-now actions to a single glance.
import ControlCenterCard from '../../components/home/ControlCenterCard';
import useControlCenterData from '../../hooks/useControlCenterData';
import AskBar from '../../components/ai-coach/AskBar';
import { useAIPrompt } from '../../store/aiPromptStore';
import EmbeddedFinanceCard from '../../components/home/EmbeddedFinanceCard';
import WelcomeNewUserCard from '../../components/home/WelcomeNewUserCard';
import Confetti from '../../components/Confetti';
import AICoachChat from '../../components/AICoachChat';
import { StaggeredEntrance, SmartSuggestion } from '../../components/primitives';
import { pickHomeSmartSuggestion } from '../../hooks/pickHomeSmartSuggestion';
import { useHomeNotifications } from '../../hooks/useHomeNotifications';
import { useAfterFirstPaint, prefetchRoute } from '../../hooks/usePerf';
import { useHomeBundleData } from '../../hooks/useHomeBundleData';
import { ROUTES } from '../../constants/routes';

function HomeScreen() {
  const styles = useStyles();
  const { user, avatar } = useAuthStore();
  const { lang } = useLangStore();

  // Round 37 — bell badge unread count
  const { unread } = useHomeNotifications();

  // Round 67 — All home data + lifecycle handled by useHomeBundleData
  const home = useHomeBundleData(lang);
  const {
    stats, snapshot, predict, smartAlerts, weeklyReport, coinsStatus,
    news, newsUpdatedAt, newsLoading,
    loading, refreshing, showConfetti,
    onRefresh, onRefreshNews, onConfettiDone,
    gettingStartedCounts, txnCount, topLeaks, monthlyLoss, moneyScore,
  } = home;

  // Phase 5 Wave 2B — Stable callbacks for header / section actions.
  const goSearch = useCallback(() => router.push('/search' as any), []);
  const goNotifications = useCallback(() => router.push('/notifications' as any), []);
  const goCoinLedger = useCallback(() => router.push('/coin-ledger' as any), []);
  const goProfile = useCallback(() => router.push(ROUTES.PROFILE), []);
  const goLeaderboard = useCallback(() => router.push('/leaderboard' as any), []);
  const goTransactions = useCallback(() => router.push(ROUTES.TRANSACTIONS), []);

  const leaderboardTitle = useMemo(() => t('leaderboard', lang).toUpperCase(), [lang]);
  const welcomeGreeting = useMemo(() => t('welcome_back', lang).toUpperCase(), [lang]);

  // Round 58 — Prefetch next-likely routes during idle.
  useAfterFirstPaint(() => {
    prefetchRoute(() => import('./transactions'));
    prefetchRoute(() => import('./budget'));
    prefetchRoute(() => import('./ai-coach'));
  });

  // Round 74 — Phase 1 Lazy User First — Control Center data hook.
  // Aggregates split-insights + proactive-nudges into a unified
  // one-tap action list. Paused until user is loaded.
  // Hooks MUST be called before any early returns to satisfy
  // React's rules-of-hooks.
  const { actions: ccActions, isLoading: ccLoading } = useControlCenterData({ paused: !user?.id });
  const [chatOpen, setChatOpen] = React.useState(false);

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <HomeSkeleton />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Confetti trigger={showConfetti} onDone={onConfettiDone} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
      >

        {/* 1. HEADER — slim greeting + search + bell + coin chip + avatar */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{welcomeGreeting}</Text>
            <Text style={styles.name}>{user?.name || 'User'} 👋</Text>
          </View>
          {/* Round 37 — search icon, always visible */}
          <TouchableOpacity
            onPress={goSearch}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="search" size={20} color={COLORS.text.primary} />
          </TouchableOpacity>
          {/* Round 37 — notifications bell with unread badge */}
          <TouchableOpacity
            onPress={goNotifications}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="notifications-outline" size={20} color={COLORS.text.primary} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{unread > 9 ? '9+' : String(unread)}</Text>
              </View>
            )}
          </TouchableOpacity>
          {coinsStatus && (
            <TapTile onPress={goCoinLedger} style={styles.coinsChip} feedback="light" testID="header-coins-chip" accessibilityLabel="Coin balance, view history">
              <AnimatedCoin value={Number(coinsStatus.balance || 0)} size="sm" />
            </TapTile>
          )}
          <TapTile onPress={goProfile} style={styles.avatarWrap} feedback="selection">
            <View style={styles.avatarRing}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={22} color={COLORS.accent.primary} />
                </View>
              )}
            </View>
            {/* Settings badge — white icon on saturated brand bg (theme-invariant per Round 50 audit). */}
            <View style={styles.avatarBadge}><Ionicons name="settings-sharp" size={10} color="#FFFFFF" /></View>
          </TapTile>
        </View>

        {/* Round 74 — Phase 1 "Lazy User First" — Control Center.
            Replaced MascotMoment + WelcomeNewUserCard at the top
            with a single hub showing all do-now actions (split
            owed/owing, overspend nudges, smart-save tips). The
            mascot still lives in the floating tab puck — keeping
            it on Home was a duplicate. */}
        <ControlCenterCard actions={ccActions} loading={ccLoading} />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Design System 2.0 — card-reveal stagger. Mimics Apple
            Wallet: each card slides up with a 60ms delay so the
            full feed reveals in a single elegant cascade on mount.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <StaggeredEntrance delayMs={60} duration={420} distance={14}>
          {/* 2. HOME HERO — Wave 5.1 revamp. ONE primary card: hero
            number (animated count-up) + 7-bar sparkline + ONE CTA
            "See why" + 3 quick-action chips. Replaces the legacy
            BalanceHero + QuickActionBar + TodayChips stack above fold.
            BalanceHero retained (below fold) for backward-compat of
            legacy detail views; quick-actions below no longer double up
            since Hero's chip row already surfaces them. */}
        <HomeHero
          mtdSpend={Number(snapshot?.mtd_spend ?? stats?.total_expense ?? 0)}
          mtdIncome={Number(snapshot?.mtd_income ?? stats?.total_income ?? 0)}
          projectedMonthEnd={Number(snapshot?.projected_month_end ?? 0)}
          sparkline={Array.isArray(snapshot?.sparkline) ? snapshot!.sparkline : []}
          topCategory={snapshot?.top_category || null}
          paceEmoji={snapshot?.pace_emoji || '🟢'}
          paceHeadline={snapshot?.pace_headline || undefined}
        />

        {/* 2b. Legacy BalanceHero — kept below fold for users who still
            rely on the score-card surface while the hero leads. Will be
            retired after one full release cycle once telemetry confirms
            the hero is carrying the primary-glance job. */}
        <BalanceHero user={user} snapshot={snapshot} stats={stats} />

        {/* Round 39 — Getting Started checklist for first-time users.
            Self-hides when all 4 items are complete OR when user dismisses,
            persisted in AsyncStorage. Counts derived from `stats` (which the
            home bundle already returns) — no extra fetch. */}
        <GettingStartedCard
          counts={gettingStartedCounts}
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            DS 2.0 Intelligence Layer — SmartSuggestion.
            Selection logic lives in hooks/useHomeSmartSuggestion.ts
            (Wave R3). Parent only has to wire the action route.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {(() => {
          const pick = pickHomeSmartSuggestion({
            txnCount,
            smartAlerts,
            monthlyLoss,
            topLeaks,
            snapshot,
          });
          if (!pick) return null;
          const { onActionRoute, ...rest } = pick.props;
          return (
            <SmartSuggestion
              {...rest}
              onAction={onActionRoute ? () => router.push(onActionRoute as any) : undefined}
            />
          );
        })()}

        {/* 3. QUICK ACTION BAR */}
        <QuickActionBar />

        {/* 4. TODAY CHIPS — glanceable stats */}
        <TodayChips snapshot={snapshot} stats={stats} />

        {/* 4b. PREMIUM TEASER — loss-framing conversion card.
            Round 51e — gate by transaction count. The card shows
            "YOU LOST THIS MONTH ₹X" with leak categories, which is
            misleading and demoralising for brand-new users with zero
            transactions (where amounts come from the static fallback
            list). Only render once the user has at least one logged
            transaction so the framing is data-grounded. New users see
            an empty-state hint instead. */}
        {(() => {
          if (txnCount > 0) {
            return (
              <PremiumTeaserCard
                monthlyLoss={monthlyLoss}
                topLeaks={topLeaks}
                hiddenInsightsCount={5}
                ctaRoute="/premium"
              />
            );
          }
          // Round 74 — Phase 1: removed the inert "Your AI Coach is
          // warming up" empty-state block. The Control Center hub at
          // the top now communicates "All caught up ✨" for new users
          // and the sticky AskBar is the singular AI surface — no
          // need for a duplicate cold-state nudge here.
          return null;
        })()}

        {/* 5. ACTIONABLE ALERTS — only when present */}
        {smartAlerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Smart Alerts</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeTxt}>{smartAlerts.length}</Text>
              </View>
            </View>
            {smartAlerts.slice(0, 3).map((a: any, i: number) => (
              <ActionableAlertCard
                key={(a.type || 'alert') + i}
                emoji={a.emoji}
                severity={a.severity}
                title={a.title}
                message={a.message}
                actions={a.actions || []}
              />
            ))}
          </View>
        )}

        {/* 6. PULSE GRAPH — slim 7-day sparkline + tier progress */}
        {snapshot && (
          <InsightsCard snapshot={snapshot} onPressSparkline={goTransactions} />
        )}

        {/* 7. FINANCIAL BRAIN — tabbed AI insights */}
        {snapshot && (
          <FinancialBrainCard snapshot={snapshot} stats={stats} predict={predict} />
        )}

        {/* 8. DAILY QUEST — habit loop */}
        <DailyQuestCard coinsStatus={coinsStatus} userName={user?.name} />

        {/* 9. MONEY SCHOOL */}
        <MoneySchoolCard />

        {/* 10. WEEKLY REPORT */}
        <WeeklyReport weeklyReport={weeklyReport} snapshot={snapshot} user={user} />

        {/* 11. LEADERBOARD compact */}
        <UnifiedLeaderboard compact title={leaderboardTitle} onPressMore={goLeaderboard} />

        {/* 12. EMBEDDED FINANCE — curated credit / insurance / SIP products */}
        <EmbeddedFinanceCard moneyScore={moneyScore} />

        {/* 13. NEWS */}
        <NewsCardStack news={news} newsUpdatedAt={newsUpdatedAt} newsLoading={newsLoading} onRefresh={onRefreshNews} />

        {/* 13. FINANCIAL SUPERPOWERS — Premium upsell, end-of-feed so users
               reach it after consuming all other value. */}
        <PremiumHomeCard />
        </StaggeredEntrance>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Round 74 — Phase 1 Lazy User First — sticky AskBar.
          Single primary AI surface across the whole tab; tapping
          opens AICoachChat modal pre-loaded with the rotating
          prompt. Floats above the floating tab bar via bottomOffset. */}
      <AskBar
        bottomOffset={122}
        onSubmit={(prefill) => {
          useAIPrompt.getState().set(prefill, 'daily_brief', 'home');
          setChatOpen(true);
        }}
      />

      {/* Chat modal — opens when AskBar's send fires. */}
      {chatOpen && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setChatOpen(false)}>
          <AICoachChat onClose={() => setChatOpen(false)} />
        </Modal>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: 140 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  greeting: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: c.accent.primary },
  name: { fontSize: 22, fontWeight: '900', color: c.text.primary, marginTop: 2, letterSpacing: -0.4 },
  avatarWrap: { position: 'relative' },
  avatarRing: { width: 48, height: 48, borderRadius: 0, padding: 2, borderWidth: 2.5, borderColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 40, height: 40, borderRadius: 0 },
  avatarPlaceholder: { width: 40, height: 40, borderRadius: 0, backgroundColor: 'rgba(255,107,26,0.18)', justifyContent: 'center', alignItems: 'center' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 0, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: c.bg.primary },
  coinsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: 'rgba(255,176,71,0.14)', borderWidth: 1, borderColor: 'rgba(255,176,71,0.45)', marginRight: 8 },
  // Round 37 — header icon buttons + unread badge.
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 0, alignItems: 'center', justifyContent: 'center',
    marginRight: 6, position: 'relative',
    backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle,
  },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4,
    borderRadius: 0, backgroundColor: c.state.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: c.bg.primary,
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: c.bg.elevated },

  // Sections
  section: { marginBottom: SPACING.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  sectionBadge: { backgroundColor: c.accent.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, minWidth: 22, alignItems: 'center' },
  sectionBadgeTxt: { fontSize: 11, fontWeight: '900', color: c.accent.primary },

  // Round 51e — empty-state for AI Coach card (zero transactions). Shown
  // in place of PremiumTeaserCard for new users so they get an
  // encouraging onboarding card instead of fake "you lost ₹X" framing.
  newUserAiCoachCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 18, borderRadius: 0, marginBottom: 14,
    backgroundColor: GLASS.solidBg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
  },
  newUserAiCoachIcon: {
    width: 52, height: 52, borderRadius: 0,
    backgroundColor: c.accent.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  newUserAiCoachTitle: { fontSize: 14.5, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  newUserAiCoachSub: { fontSize: 12, fontWeight: '600', color: c.text.muted, marginTop: 4, lineHeight: 17 },
}));
// Round 41 — wrap with tab-level ErrorBoundary so a crash here
// doesn't blank the whole app; the user sees a Retry CTA instead.
import { withTabBoundary } from '../../components/withTabBoundary';
export default withTabBoundary(HomeScreen, 'Home');
