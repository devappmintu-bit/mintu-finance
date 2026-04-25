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
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, RefreshControl, InteractionManager, TouchableOpacity, AppState,
} from 'react-native';
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
import { COLORS, RADIUS, SPACING, shadowStyle } from '../../utils/theme';
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
import GettingStartedCard from '../../components/home/GettingStartedCard';
import QuickActionBar from '../../components/home/QuickActionBar';
import TodayChips from '../../components/home/TodayChips';
import ActionableAlertCard from '../../components/home/ActionableAlertCard';
import FinancialBrainCard from '../../components/home/FinancialBrainCard';
import EmbeddedFinanceCard from '../../components/home/EmbeddedFinanceCard';
import Confetti from '../../components/Confetti';

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
  // Round 37 — bell badge unread count, fetched independently so list-screen
  // interactions don't block notification refresh.
  const [unread, setUnread] = useState(0);
  const refreshUnread = useCallback(async () => {
    try {
      const { fetchUnreadCount } = await import('../../services/notifications');
      const n = await fetchUnreadCount();
      setUnread(n);
    } catch {}
  }, []);
  useEffect(() => { refreshUnread(); }, [refreshUnread]);
  // Round 37 — re-check unread count when app comes back to foreground so
  // a notification received while backgrounded reflects on the badge.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnread();
    });
    return () => sub.remove();
  }, [refreshUnread]);
  // Round 42 — foreground polling. Until real push delivery (FCM/APNs) is
  // wired, poll every 60s so badge stays in sync if the user keeps the app
  // open; pauses automatically when the screen is unmounted.
  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState === 'active') refreshUnread();
    }, 60_000);
    return () => clearInterval(id);
  }, [refreshUnread]);
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
        console.warn('home/bundle failed, fallback', bundleErr);
      }

      // Fallback parallel calls
      const [profileRes, statsRes, txnRes, avatarRes, snapRes] = await Promise.all([
        fetchCurrentUser().then(data => ({ data })),
        fetchStatsOverview().then(data => ({ data })),
        fetchTransactions({ limit: 5 }).then(data => ({ data })),
        fetchAvatar().then(data => ({ data })),
        api.get('/home/snapshot').catch(() => ({ data: null })),
      ]);
      setUser(profileRes.data);
      setStats(statsRes.data);
      setRecentTxns(Array.isArray(txnRes.data) ? txnRes.data.slice(0, 4) : []);
      if (avatarRes.data?.avatar) setAvatar(avatarRes.data.avatar);
      if (snapRes.data) setSnapshot(snapRes.data);
      setLoading(false);

      InteractionManager.runAfterInteractions(async () => {
        try {
          const [alertsRes, reportRes, predRes, coinsRes, _openCoinsAward] = await Promise.all([
            api.get('/alerts/smart').catch(() => ({ data: { alerts: [] } })),
            api.get('/reports/weekly').catch(() => ({ data: null })),
            api.get('/ai/predict').catch(() => ({ data: null })),
            api.get('/coins/status').catch(() => ({ data: null })),
            awardCoins('open_app_daily').then(data => ({ data })).catch(() => ({ data: null })),
          ]);
          setSmartAlerts(alertsRes.data?.alerts || []);
          if (reportRes.data) setWeeklyReport(reportRes.data);
          if (predRes.data) setPredict(predRes.data);
          if (coinsRes.data) setCoinsStatus(coinsRes.data);
          if (_openCoinsAward?.data?.awarded && _openCoinsAward.data.awarded > 0) {
            setShowConfetti(true);
          }
        } catch (e) { console.error('Phase2 err', e); }
      });
      fetchNews(false);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
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
  const onRefresh = () => { setRefreshing(true); fetchData(); };

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
      const res = await api.get(`/news/india-finance${refresh ? '?refresh=1' : ''}`);
      setNews(res.data?.articles || []);
      setNewsUpdatedAt(res.data?.updated_at || null);
    } catch (e) {
      // fallback handled server-side
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { fetchNews(true); }, [fetchNews])
  );

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <HomeSkeleton />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Confetti trigger={showConfetti} onDone={() => setShowConfetti(false)} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
      >

        {/* 1. HEADER — slim greeting + search + bell + coin chip + avatar */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{t('welcome_back', lang).toUpperCase()}</Text>
            <Text style={styles.name}>{user?.name || 'User'} 👋</Text>
          </View>
          {/* Round 37 — search icon, always visible */}
          <TouchableOpacity
            onPress={() => router.push('/search' as any)}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="search" size={20} color={COLORS.text.primary} />
          </TouchableOpacity>
          {/* Round 37 — notifications bell with unread badge */}
          <TouchableOpacity
            onPress={() => router.push('/notifications' as any)}
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
            <TapTile onPress={() => router.push('/coin-ledger' as any)} style={styles.coinsChip} feedback="light" testID="header-coins-chip" accessibilityLabel="Coin balance, view history">
              <AnimatedCoin value={Number(coinsStatus.balance || 0)} size="sm" />
            </TapTile>
          )}
          <TapTile onPress={() => router.push('/(tabs)/profile')} style={styles.avatarWrap} feedback="selection">
            <View style={styles.avatarRing}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={22} color={COLORS.accent.primary} />
                </View>
              )}
            </View>
            <View style={styles.avatarBadge}><Ionicons name="settings-sharp" size={10} color="#fff" /></View>
          </TapTile>
        </View>

        {/* 2. BALANCE HERO — big primary card */}
        <BalanceHero user={user} snapshot={snapshot} stats={stats} />

        {/* Round 39 — Getting Started checklist for first-time users.
            Self-hides when all 4 items are complete OR when user dismisses,
            persisted in AsyncStorage. Counts derived from `stats` (which the
            home bundle already returns) — no extra fetch. */}
        <GettingStartedCard
          counts={stats ? {
            transactions: Number(stats?.month?.transaction_count || stats?.transaction_count || stats?.transactions_count || 0),
            budgets: Number(stats?.budget_count || (stats?.budgets || []).length || 0),
            goals: Number(stats?.goal_count || (stats?.goals || []).length || 0),
            groups: Number(stats?.group_count || (stats?.groups || []).length || 0),
          } : null}
        />

        {/* 3. QUICK ACTION BAR */}
        <QuickActionBar />

        {/* 4. TODAY CHIPS — glanceable stats */}
        <TodayChips snapshot={snapshot} stats={stats} />

        {/* 4b. PREMIUM TEASER — loss-framing conversion card (free users only) */}
        <PremiumTeaserCard
          monthlyLoss={Number(predict?.monthly_waste || predict?.overspend_total || 0)}
          topLeaks={(predict?.waste_comparisons || []).slice(0, 3).map((w: any) => ({
            label: w.title || w.category || 'Spending leak',
            amount: Number(w.amount || 0),
            emoji: w.emoji || '💸',
          }))}
          hiddenInsightsCount={5}
          ctaRoute="/premium"
        />

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
          <InsightsCard snapshot={snapshot} onPressSparkline={() => router.push('/(tabs)/transactions')} />
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
        <UnifiedLeaderboard compact title={t('leaderboard', lang).toUpperCase()} onPressMore={() => router.push('/leaderboard' as any)} />

        {/* 12. EMBEDDED FINANCE — curated credit / insurance / SIP products */}
        <EmbeddedFinanceCard moneyScore={user?.money_score || 0} />

        {/* 13. NEWS */}
        <NewsCarousel news={news} newsUpdatedAt={newsUpdatedAt} newsLoading={newsLoading} onRefresh={() => fetchNews(true)} />

        {/* 13. FINANCIAL SUPERPOWERS — Premium upsell, end-of-feed so users
               reach it after consuming all other value. */}
        <PremiumHomeCard />

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
  badgeTxt: { fontSize: 10, fontWeight: '900', color: '#fff' },

  // Sections
  section: { marginBottom: SPACING.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  sectionBadge: { backgroundColor: c.accent.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, minWidth: 22, alignItems: 'center' },
  sectionBadgeTxt: { fontSize: 11, fontWeight: '900', color: c.accent.primary },
}));
// Round 41 — wrap with tab-level ErrorBoundary so a crash here
// doesn't blank the whole app; the user sees a Retry CTA instead.
import { withTabBoundary } from '../../components/withTabBoundary';
export default withTabBoundary(HomeScreen, 'Home');
