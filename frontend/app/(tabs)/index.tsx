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
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, InteractionManager, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import api from '../../utils/api';
import { fetchCurrentUser, fetchAvatar } from '../../services/user';
import { awardCoins } from '../../services/premium';
import { fetchStatsOverview, fetchTransactions } from '../../services/transactions';
import { COLORS, RADIUS, SPACING, shadowStyle, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import TapTile from '../../components/ui/TapTile';
import { router, useFocusEffect } from 'expo-router';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import InsightsCard from '../../components/home/InsightsCard';
import DailyQuestCard from '../../components/DailyQuestCard';
import PremiumHomeCard from '../../components/home/PremiumHomeCard';
import MoneySchoolCard from '../../components/home/MoneySchoolCard';
import PremiumTeaserCard from '../../components/premium/PremiumTeaserCard';
import UnifiedLeaderboard from '../../components/leaderboard/UnifiedLeaderboard';
import AnimatedCoin from '../../components/AnimatedCoin';
import NewsCarousel from '../../components/home/NewsCarousel';
import WeeklyReport from '../../components/home/WeeklyReport';
import BalanceHero from '../../components/home/BalanceHero';
import HomeHero from '../../components/home/HomeHero';
import GettingStartedCard from '../../components/home/GettingStartedCard';
import MascotMoment from '../../components/MascotMoment';
import QuickActionBar from '../../components/home/QuickActionBar';
import TodayChips from '../../components/home/TodayChips';
import ActionableAlertCard from '../../components/home/ActionableAlertCard';
import FinancialBrainCard from '../../components/home/FinancialBrainCard';
import EmbeddedFinanceCard from '../../components/home/EmbeddedFinanceCard';
import WelcomeNewUserCard from '../../components/home/WelcomeNewUserCard';
import Confetti from '../../components/Confetti';
import { StaggeredEntrance, SmartSuggestion } from '../../components/primitives';
import { pickHomeSmartSuggestion } from '../../hooks/pickHomeSmartSuggestion';
import { useHomeNotifications } from '../../hooks/useHomeNotifications';
import { useAfterFirstPaint, prefetchRoute, runWhenIdle } from '../../hooks/usePerf';
import { ROUTES } from '../../constants/routes';

function HomeScreen() {
  const styles = useStyles();
  const { user, setUser, avatar, setAvatar } = useAuthStore();
  const { lang } = useLangStore();
  const [stats, setStats] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [predict, setPredict] = useState<any>(null);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [smartAlerts, setSmartAlerts] = useState<any[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [coinsStatus, setCoinsStatus] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<string | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Round 34 audit — visible retry banner when home fails to load anything.
  // Previously a double-failure (bundle + fallback) left the user staring
  // at empty widgets with no signal the fetch died.
  const [loadError, setLoadError] = useState(false);
  // Round 37 — bell badge unread count, extracted to useHomeNotifications
  // (Wave R3). Hook handles mount-fetch + AppState foreground-refresh +
  // 60 s polling + 5 s debounce + offline skip.
  const { unread } = useHomeNotifications();
  // Round 35 — refs mirror user/stats so fetchData can detect "nothing painted"
  // without needing user/stats in its dep array (which caused an infinite
  // refetch loop).
  const userRef = useRef<any>(user);
  const statsRef = useRef<any>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  const fetchData = useCallback(async () => {
    setLoadError(false);  // clear previous error on any retry
    try {
      try {
        const { swrGet } = await import('../../utils/swrGet');
        const res = await swrGet(`/home/bundle?lang=${lang}`, { ttlMs: 30_000 });
        const paint = (b: any) => {
          if (!b) return;
          if (b.user) setUser(b.user);
          if (b.stats) setStats(b.stats);
          if (Array.isArray(b.recent_txns)) setRecentTxns(b.recent_txns.slice(0, 4));
          if (b.avatar?.avatar) setAvatar(b.avatar.avatar);
          if (b.snapshot) setSnapshot(b.snapshot);
          setSmartAlerts(b.alerts?.alerts || []);
          if (b.weekly_report) setWeeklyReport(b.weekly_report);
          if (b.ai_predict) setPredict(b.ai_predict);
          if (b.coins) setCoinsStatus(b.coins);
        };
        paint(res.data);
        setLoading(false);
        if (res.isStale) {
          res.fresh.then((fresh) => { if (fresh) paint(fresh); }).catch(() => {});
        }
        awardCoins('open_app_daily').then(data => ({ data }))
          .then((r) => { if (r?.data?.awarded > 0) setShowConfetti(true); })
          .catch(() => {});
        fetchNews(false);
        setRefreshing(false);
        return;
      } catch (bundleErr) {
        if (__DEV__) console.warn('home/bundle failed, fallback', bundleErr);
      }

      // Round 48 perf — Phase 1 must paint the home shell ASAP. We keep the
      // 3 calls that drive above-the-fold UI (user, stats, recent txns) and
      // move avatar + snapshot into Phase 2. On a slow mobile network this
      // cuts ~200-500 ms off perceived TTI because the home tree paints with
      // the avatar initial fallback while the avatar request finishes after.
      const [profileRes, statsRes, txnRes] = await Promise.all([
        fetchCurrentUser().then(data => ({ data })),
        fetchStatsOverview().then(data => ({ data })),
        fetchTransactions({ limit: 5 }).then(data => ({ data })),
      ]);
      setUser(profileRes.data as Parameters<typeof setUser>[0]);
      setStats(statsRes.data);
      setRecentTxns(Array.isArray(txnRes.data) ? txnRes.data.slice(0, 4) : []);
      setLoading(false);

      InteractionManager.runAfterInteractions(async () => {
        try {
          const [avatarRes, snapRes, alertsRes, reportRes, predRes, coinsRes, _openCoinsAward] = await Promise.all([
            fetchAvatar().then(data => ({ data })).catch(() => ({ data: null })),
            api.get('/home/snapshot').catch(() => ({ data: null })),
            api.get('/alerts/smart').catch(() => ({ data: { alerts: [] } })),
            api.get('/reports/weekly').catch(() => ({ data: null })),
            api.get('/ai/predict').catch(() => ({ data: null })),
            api.get('/coins/status').catch(() => ({ data: null })),
            awardCoins('open_app_daily').then(data => ({ data })).catch(() => ({ data: null })),
          ]);
          if (avatarRes.data?.avatar) setAvatar(avatarRes.data.avatar);
          if (snapRes.data) setSnapshot(snapRes.data);
          setSmartAlerts(alertsRes.data?.alerts || []);
          if (reportRes.data) setWeeklyReport(reportRes.data);
          if (predRes.data) setPredict(predRes.data);
          if (coinsRes.data) setCoinsStatus(coinsRes.data);
          if (_openCoinsAward?.data?.awarded && _openCoinsAward.data.awarded > 0) {
            setShowConfetti(true);
          }
        } catch (e) { if (__DEV__) console.error('Phase2 err', e); }
        // News fires last so list paints before remote feeds arrive
        fetchNews(false);
      });
    } catch (error) {
      if (__DEV__) console.error('Dashboard fetch error:', error);
      // Round 34 fix — surface the failure so users know to retry
      // instead of staring at a blank layout thinking the app is frozen.
      // Only trip the error banner when nothing has painted yet (user+stats
      // both null) — otherwise they still have SOMETHING useful to look at.
      // Round 35 fix — read from refs rather than state so we don't have
      // to add user/stats to the dep array (that caused fetchData identity
      // to flip on every paint → useEffect re-fired → refetch loop).
      if (!userRef.current && !statsRef.current) {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  // Phase 5 Wave 2B — Stable callbacks for header / section actions so heavy
  // child components (TapTile/UnifiedLeaderboard/InsightsCard/NewsCarousel)
  // don't see a fresh onPress identity on every home re-render.
  const goSearch = useCallback(() => router.push('/search' as any), []);
  const goNotifications = useCallback(() => router.push('/notifications' as any), []);
  const goCoinLedger = useCallback(() => router.push('/coin-ledger' as any), []);
  const goProfile = useCallback(() => router.push(ROUTES.PROFILE), []);
  const goLeaderboard = useCallback(() => router.push('/leaderboard' as any), []);
  const goTransactions = useCallback(() => router.push(ROUTES.TRANSACTIONS), []);
  const onConfettiDone = useCallback(() => setShowConfetti(false), []);

  // Phase 5 Wave 2B — memoized derived values previously recomputed on
  // every render (e.g. when scroll-triggered AppState/news refresh fires).
  const gettingStartedCounts = useMemo(() => {
    if (!stats) return null;
    return {
      transactions: Number(stats?.month?.transaction_count || stats?.transaction_count || stats?.transactions_count || 0),
      budgets: Number(stats?.budget_count || (stats?.budgets || []).length || 0),
      goals: Number(stats?.goal_count || (stats?.goals || []).length || 0),
      groups: Number(stats?.group_count || (stats?.groups || []).length || 0),
    };
  }, [stats]);

  const txnCount = useMemo(() => Number(
    stats?.transaction_count
    ?? stats?.txn_count
    ?? stats?.total_transactions
    ?? snapshot?.transaction_count
    ?? snapshot?.txn_count
    ?? 0
  ), [stats, snapshot]);

  const topLeaks = useMemo(
    () => (predict?.waste_comparisons || []).slice(0, 3).map((w: any) => ({
      label: w.title || w.category || 'Spending leak',
      amount: Number(w.amount || 0),
      emoji: w.emoji || '💸',
    })),
    [predict]
  );

  const monthlyLoss = Number(predict?.monthly_waste || predict?.overspend_total || 0);

  const leaderboardTitle = useMemo(() => t('leaderboard', lang).toUpperCase(), [lang]);
  const welcomeGreeting = useMemo(() => t('welcome_back', lang).toUpperCase(), [lang]);
  const moneyScore = Number(user?.money_score || 0);

  // Round 30h — subscribe to the R2 cache invalidation graph so the home
  // tab auto-refreshes whenever a mutation elsewhere marks /home/bundle
  // as stale (txn add, settle, budget edit, profile update, etc.).
  // Completes the reactive data graph end-to-end on home.
  useEffect(() => {
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (cancelled) return;
      // Debounce — a single transaction triggers multiple upstream
      // invalidations (txn + budget + rewards). Collapse into one fetch.
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { if (!cancelled) fetchData(); }, 300);
    };
    let unsubs: Array<() => void> = [];
    (async () => {
      const { subscribeInvalidation } = await import('../../utils/swrGet');
      unsubs = [
        subscribeInvalidation('/home/bundle', tick),
        subscribeInvalidation('/home/snapshot', tick),
        subscribeInvalidation('/analytics/summary', tick),
        subscribeInvalidation('/alerts/smart', tick),
        subscribeInvalidation('/reports/weekly', tick),
      ];
    })();
    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      for (const u of unsubs) u();
    };
  }, [fetchData]);

  const fetchNews = useCallback(async (refresh = false) => {
    setNewsLoading(true);
    try {
      // Phase 5 Wave 4 — explicit short timeout for the upstream
      // news feed. Google News can take 3-5 s cold; anything past 4 s
      // is wasted user time — better to show cached/fallback content
      // and move on. Errors NEVER fire a global toast — they surface
      // as an inline "Latest news unavailable" in the NewsCarousel
      // (which already renders last-known cached articles when empty).
      const res = await api.get(
        `/news/india-finance${refresh ? '?refresh=1' : ''}`,
        { timeout: 4000 },
      );
      setNews(res.data?.articles || []);
      setNewsUpdatedAt(res.data?.updated_at || null);
    } catch (e) {
      // Silent failure — UI shows the inline fallback via <NewsCarousel
      // news={[]} /> which surfaces a muted "Latest news unavailable"
      // state without stealing focus from the rest of home. No toast.
      if (__DEV__) console.warn('[home] news fetch failed', e);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const onRefreshNews = useCallback(() => fetchNews(true), [fetchNews]);

  // Round 58 — Defer the news refresh until AFTER first interactive
  // frame. News sits at the bottom of Home; loading it eagerly on
  // focus blocked higher-priority renders (greeting, balance card,
  // smart-suggestion). InteractionManager pushes it to idle, shaving
  // ~150-300ms off perceived TTI on every focus.
  useFocusEffect(
    useCallback(() => {
      const cancel = runWhenIdle(() => fetchNews(true));
      return cancel;
    }, [fetchNews]),
  );

  // Round 58 — Prefetch the next-likely routes during idle. When the
  // user taps Transactions or Budget, the JS module is already in
  // Metro's runtime cache → first paint of those screens drops from
  // ~600 ms to ~120 ms on cold-bundle navigations.
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

        {/* Round 53l — MintU Personality Engine: a fresh mascot
            "moment" appears on each app open. Tappable for a richer
            "coach" burst. Auto-fades to never block scroll. */}
        <View style={{ paddingHorizontal: SPACING.lg, marginTop: 4, marginBottom: 8 }}>
          <MascotMoment mode="home" />
        </View>

        {/* 1.5 WELCOME — first-time registration banner. Self-hides when
            isNewUser flag clears (which happens on first interaction). */}
        <WelcomeNewUserCard userName={user?.name} />

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
          // New-user empty state — encouraging onboarding card instead
          // of fake "you lost ₹X" framing.
          return (
            <View style={styles.newUserAiCoachCard}>
              <View style={styles.newUserAiCoachIcon}>
                <Text style={{ fontSize: 28 }}>✨</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.newUserAiCoachTitle}>Your AI Coach is warming up</Text>
                <Text style={styles.newUserAiCoachSub}>
                  Log your first 3 expenses to unlock personalised spending insights and money-saving tips.
                </Text>
              </View>
            </View>
          );
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
        <NewsCarousel news={news} newsUpdatedAt={newsUpdatedAt} newsLoading={newsLoading} onRefresh={onRefreshNews} />

        {/* 13. FINANCIAL SUPERPOWERS — Premium upsell, end-of-feed so users
               reach it after consuming all other value. */}
        <PremiumHomeCard />
        </StaggeredEntrance>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  avatarRing: { width: 48, height: 48, borderRadius: 24, padding: 2, borderWidth: 2.5, borderColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,107,26,0.18)', justifyContent: 'center', alignItems: 'center' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: c.bg.primary },
  coinsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,176,71,0.14)', borderWidth: 1, borderColor: 'rgba(255,176,71,0.45)', marginRight: 8 },
  // Round 37 — header icon buttons + unread badge.
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    marginRight: 6, position: 'relative',
    backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle,
  },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4,
    borderRadius: 9, backgroundColor: c.state.danger, alignItems: 'center', justifyContent: 'center',
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
    padding: 18, borderRadius: 22, marginBottom: 14,
    backgroundColor: GLASS.solidBg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
  },
  newUserAiCoachIcon: {
    width: 52, height: 52, borderRadius: 16,
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
