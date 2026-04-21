import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator,
  Share, Linking, Alert, InteractionManager,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import api from '../../utils/api';
import { fetchCurrentUser, fetchAvatar, uploadAvatar } from '../../services/user';
import { awardCoins } from '../../services/premium';
import { fetchStatsOverview, fetchTransactions } from '../../services/transactions';
import { COLORS, RADIUS, SPACING, CATEGORIES, SHADOW, shadowStyle } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import PressableGlass from '../../components/PressableGlass';
import TapTile from '../../components/ui/TapTile';
import { router, useFocusEffect } from 'expo-router';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import InsightsCard from '../../components/home/InsightsCard';
import DailyQuestCard from '../../components/DailyQuestCard';
import PremiumHomeCard from '../../components/home/PremiumHomeCard';
import MoneySchoolCard from '../../components/home/MoneySchoolCard';
import AIInsightCard from '../../components/home/AIInsightCard';
import UnifiedLeaderboard from '../../components/leaderboard/UnifiedLeaderboard';
import AnimatedCoin from '../../components/AnimatedCoin';
import NewsCarousel from '../../components/home/NewsCarousel';
import WeeklyReport from '../../components/home/WeeklyReport';
import HeroCard from '../../components/home/HeroCard';
import Confetti from '../../components/Confetti';

import { APP_LINK } from '../../utils/brand';

export default function HomeScreen() {
  const styles = useStyles();
  const { user, setUser, avatar, setAvatar } = useAuthStore();
  const { lang } = useLangStore();
  const [stats, setStats] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [predict, setPredict] = useState<any>(null);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [dailyLesson, setDailyLesson] = useState<any>(null);
  const [smartAlerts, setSmartAlerts] = useState<any[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [gamification, setGamification] = useState<any>(null);
  const [cardOfDay, setCardOfDay] = useState<any>(null);
  // avatar lives in authStore — read via useAuthStore() above; no local state here.
  const [news, setNews] = useState<any[]>([]);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<string | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());
  const [, setTick] = useState(0); // 1-min ticker to keep "X min ago" fresh

  // Keep the "X min ago" label fresh by re-rendering once a minute.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const lastSyncLabel = (() => {
    const ms = Date.now() - lastSyncAt;
    if (ms < 30_000) return 'Last updated just now';
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return 'Last updated just now';
    if (mins === 1) return 'Last updated 1 min ago';
    if (mins < 60) return `Last updated ${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `Last updated ${hrs}h ago`;
  })();
  const [fomoItems, setFomoItems] = useState<any[]>([]);
  const [coinsStatus, setCoinsStatus] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // ──── Fast path: one bundled call with SWR ────
      // Round-20 /home/bundle fans out 13 endpoints server-side via asyncio.gather.
      // `swrGet` returns the cached copy INSTANTLY on tab revisits, then does a
      // background revalidation. TTL 30s — tuned to balance freshness + snappiness.
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
          if (b.leaderboard) setLeaderboard(b.leaderboard);
          if (b.gamification) setGamification(b.gamification);
          if (b.card_of_the_day) setCardOfDay(b.card_of_the_day);
          setFomoItems(b.fomo_feed?.items || []);
          if (b.ai_predict) setPredict(b.ai_predict);
          if (b.coins) setCoinsStatus(b.coins);
        };
        // Paint cached immediately (0 RTT)
        paint(res.data);
        setLoading(false);
        // Background revalidation — repaint if fresh data differs
        if (res.isStale) {
          res.fresh.then((fresh) => { if (fresh) paint(fresh); }).catch(() => {});
        }
        // Side-effects — don't block UI
        awardCoins('open_app_daily').then(data => ({ data }))
          .then((r) => { if (r?.data?.awarded > 0) setShowConfetti(true); })
          .catch(() => {});
        api.get(`/money-school/dynamic?lang=${lang}`)
          .then((r) => setDailyLesson(r.data))
          .catch(() => {});
        fetchNews(false);
        setLastSyncAt(Date.now());
        setRefreshing(false);
        return;
      } catch (bundleErr) {
        console.warn('home/bundle failed, falling back to parallel calls', bundleErr);
      }

      // ──── Legacy path (kept for graceful degradation) ────
      // Phase 1: Critical data (shown above the fold)
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
      setLoading(false); // Show content immediately

      // Phase 2: Secondary data (deferred until after critical-path paint)
      InteractionManager.runAfterInteractions(async () => {
        try {
          const [lessonRes, alertsRes, reportRes, lbRes, gameRes, cotdRes, fomoRes, predRes, coinsRes, _openCoinsAward] = await Promise.all([
            api.get(`/money-school/dynamic?lang=${lang}`).catch(() => ({ data: null })),
            api.get('/alerts/smart').catch(() => ({ data: { alerts: [] } })),
            api.get('/reports/weekly').catch(() => ({ data: null })),
            api.get('/leaderboard/savings').catch(() => ({ data: null })),
            api.get('/gamification/status').catch(() => ({ data: null })),
            api.get('/card-of-the-day').catch(() => ({ data: null })),
            api.get('/referral/fomo-feed').catch(() => ({ data: { items: [] } })),
            api.get('/ai/predict').catch(() => ({ data: null })),
            api.get('/coins/status').catch(() => ({ data: null })),
            awardCoins('open_app_daily').then(data => ({ data })).catch(() => ({ data: null })),
          ]);
          if (lessonRes.data) setDailyLesson(lessonRes.data);
          setSmartAlerts(alertsRes.data?.alerts || []);
          if (reportRes.data) setWeeklyReport(reportRes.data);
          if (lbRes.data) setLeaderboard(lbRes.data);
          if (gameRes.data) setGamification(gameRes.data);
          if (cotdRes.data) setCardOfDay(cotdRes.data);
          setFomoItems(fomoRes.data?.items || []);
          if (predRes.data) setPredict(predRes.data);
          if (coinsRes.data) setCoinsStatus(coinsRes.data);
          if (_openCoinsAward?.data?.awarded && _openCoinsAward.data.awarded > 0) {
            setShowConfetti(true);
          }
        } catch (e) { console.error('Phase2 err', e); }
      });

      // Phase 3: India Finance news (independent)
      fetchNews(/* refresh */ false);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastSyncAt(Date.now());
    }
  }, [lang]);

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ─── India Finance news: dedicated fetcher so it never blocks the rest ───
  const fetchNews = useCallback(async (refresh = false) => {
    setNewsLoading(true);
    try {
      const res = await api.get(`/news/india-finance${refresh ? '?refresh=1' : ''}`);
      setNews(res.data?.articles || []);
      setNewsUpdatedAt(res.data?.updated_at || null);
    } catch (e) {
      // fallback already provided by backend; swallow silently
    } finally {
      setNewsLoading(false);
    }
  }, []);

  // Re-fetch news every time Home gains focus — with force refresh so the
  // content is truly fresh on every screen entry, not just cached. The
  // backend refresh path is fast and falls back to cache on failure.
  useFocusEffect(
    useCallback(() => {
      fetchNews(true);
    }, [fetchNews])
  );

  const refreshCardOfDay = async () => {
    try {
      const res = await api.get('/card-of-the-day?refresh=true');
      setCardOfDay(res.data);
    } catch (e) { console.error(e); }
  };

  const refreshLesson = async () => {
    try {
      const res = await api.get(`/money-school/daily?lang=${lang}&t=${Date.now()}`);
      setDailyLesson(res.data);
    } catch (e) { console.error(e); }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatar(b64);
      try {
        await uploadAvatar(b64);
      } catch (e) { Alert.alert('Error', 'Could not upload photo'); }
    }
  };

  const score = user?.money_score || stats?.money_score || 50;
  const scoreColor = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <HomeSkeleton />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Confetti trigger={showConfetti} onDone={() => setShowConfetti(false)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}>

        {/* HEADER — CRED-style with avatar + total-coins chip */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{t('welcome_back', lang).toUpperCase()}</Text>
            <Text style={styles.name}>{t('hi', lang)}, {user?.name || 'User'}!</Text>
          </View>
          {coinsStatus && (
            <TapTile
              onPress={() => router.push('/rewards-hub' as any)}
              style={styles.coinsChip}
              feedback="light"
              testID="header-coins-chip"
            >
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

        {/* ══════════════════════════════════════════════════════════════
            HERO CARD — AI-driven daily insight + 1 CTA (INSIGHT → ACTION)
            Dynamic: picks 1 of 6 states (first_run / big_saver / overbudget
            / spike / on_track / neutral) from live snapshot data.
            ══════════════════════════════════════════════════════════════ */}
        <HeroCard
          snapshot={snapshot}
          stats={stats}
          user={user}
          txnCount={Array.isArray(recentTxns) ? recentTxns.length : 0}
        />

        {/* PREMIUM — expandable card on Home, locked for free users */}
        <PremiumHomeCard />

        {/* MONEY SCHOOL — separate premium feature card (AI bot distinct from AI Coach) */}
        <MoneySchoolCard />

        {/* MintU 2.0 — Daily Quest Card (habit loop) */}
        <DailyQuestCard coinsStatus={coinsStatus} />

        {/* Freshness strip removed per design ask — auto-refresh still triggers on focus */}

        {/* Top-percentile pill removed per design ask — streak badge kept */}
        {(snapshot?.tier?.streak_days ?? user?.streak_days ?? 0) > 0 && (
          <View style={styles.pillRow}>
            <View style={[styles.pill, styles.pillStreak]}>
              <Text style={styles.pillEmoji}>🔥</Text>
              <Text style={styles.pillValue}>{snapshot?.tier?.streak_days ?? user?.streak_days ?? 0}</Text>
              <Text style={styles.pillLabel}>day streak</Text>
            </View>
          </View>
        )}

        {/* Card of the Day (quotes) removed per design ask */}

        {/* FINANCIAL INSIGHTS — MintU 2.0 Dynamic Pulse Card */}
        {snapshot ? (
          <>
            <InsightsCard snapshot={snapshot} onPressSparkline={() => router.push('/(tabs)/transactions')} />
            {/* AI INSIGHT CARD — data-driven narrative + CTA (client-side, no extra API call) */}
            <AIInsightCard
              transactions={(snapshot as any)?.recent_transactions || []}
              totalSpend={Number((snapshot as any)?.total_spend_month || stats?.total_expense || 0)}
              savingsRate={Number((snapshot as any)?.savings_rate || 0)}
              topCategory={(snapshot as any)?.top_category?.name}
              topCategoryAmount={Number((snapshot as any)?.top_category?.amount || 0)}
              monthlyIncome={Number((snapshot as any)?.monthly_income || stats?.total_income || 0)}
            />
          </>
        ) : (
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { borderColor: '#10B98120' }]}>
              <Ionicons name="arrow-down-circle" size={18} color="#10B981" />
              <Text style={[styles.statVal, { color: '#10B981' }]}>₹{(stats?.total_income || 0).toLocaleString()}</Text>
              <Text style={styles.statLabel}>{t('income', lang)}</Text>
            </View>
            <View style={[styles.statBox, { borderColor: '#EF444420' }]}>
              <Ionicons name="arrow-up-circle" size={18} color="#EF4444" />
              <Text style={[styles.statVal, { color: '#EF4444' }]}>₹{(stats?.total_expense || 0).toLocaleString()}</Text>
              <Text style={styles.statLabel}>{t('expenses', lang)}</Text>
            </View>
            <View style={[styles.statBox, { borderColor: COLORS.accent.primary + '20' }]}>
              <Ionicons name="wallet" size={18} color={COLORS.accent.primary} />
              <Text style={[styles.statVal, { color: COLORS.accent.primary }]}>₹{((stats?.total_income || 0) - (stats?.total_expense || 0)).toLocaleString()}</Text>
              <Text style={styles.statLabel}>{t('balance', lang)}</Text>
            </View>
          </View>
        )}

        {/* PREDICTIVE ALERTS — Waste Detector + Overspending (from /ai/predict) */}
        {predict && (predict.overspend_alerts?.length > 0 || predict.waste_comparisons?.length > 0) && (
          <View style={styles.predictCard}>
            <View style={styles.predictHeader}>
              <Ionicons name="analytics" size={16} color="#E65100" />
              <Text style={styles.predictTitle}>PREDICTIVE INSIGHTS</Text>
              <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
            </View>
            {predict.overspend_alerts?.slice(0, 2).map((a: any, i: number) => (
              <TouchableOpacity key={'ov' + i} style={[styles.predictRow, a.severity === 'critical' && styles.predictRowCrit]} onPress={() => router.push('/(tabs)/budget')} activeOpacity={0.7}>
                <Ionicons name={a.severity === 'critical' ? 'alert-circle' : 'warning'} size={16} color={a.severity === 'critical' ? '#EF4444' : '#F59E0B'} />
                <Text style={styles.predictText} numberOfLines={2}>{a.message}</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
              </TouchableOpacity>
            ))}
            {predict.waste_comparisons?.slice(0, 1).map((c: any, i: number) => (
              <View key={'ws' + i} style={styles.wasteRow}>
                <Ionicons name={c.icon as any} size={16} color="#E65100" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.wasteTitle}>{c.title}: ₹{c.amount.toLocaleString('en-IN')}</Text>
                  <Text style={styles.wasteSub} numberOfLines={2}>{c.comparison}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* FOMO GROWTH FEED — carousel */}
        {fomoItems.length > 0 && (
          <View style={styles.fomoSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fomoScroll}>
              {fomoItems.map((item: any) => (
                <PressableGlass
                  key={item.id}
                  feedback="light"
                  onPress={() => {
                    if (item.type === 'invite_nudge' || item.type === 'friend_saving') router.push('/(tabs)/profile');
                    else if (item.type === 'streak_break') router.push('/(tabs)/transactions');
                    else router.push('/(tabs)/rewards');
                  }}
                  style={[styles.fomoCard, item.type === 'streak_break' && styles.fomoCardDanger, item.type === 'invite_nudge' && styles.fomoCardAccent]}
                >
                  <Text style={styles.fomoIcon}>{item.icon}</Text>
                  <Text style={styles.fomoText} numberOfLines={2}>{item.text}</Text>
                  <View style={styles.fomoCtaRow}>
                    <Text style={styles.fomoCta}>{item.cta} →</Text>
                  </View>
                </PressableGlass>
              ))}
            </ScrollView>
          </View>
        )}

        {/* SMART ALERTS */}
        {smartAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>Smart Alerts</Text>
            {smartAlerts.slice(0, 3).map((alert: any, i: number) => {
              const bg: Record<string, string> = { danger: '#FEF2F2', warning: '#FFFBEB', success: '#F0FDF4', info: '#EFF6FF' };
              const border: Record<string, string> = { danger: '#FECACA', warning: '#FDE68A', success: '#BBF7D0', info: '#BFDBFE' };
              const textC: Record<string, string> = { danger: '#991B1B', warning: '#92400E', success: '#166534', info: '#1E40AF' };
              return (
                <View key={i} style={[styles.alertCard, { backgroundColor: bg[alert.severity] || '#F9FAFB', borderColor: border[alert.severity] || '#E5E7EB' }]}>
                  <Text style={styles.alertEmoji}>{alert.emoji}</Text>
                  <View style={styles.alertBody}>
                    <Text style={[styles.alertTitle, { color: textC[alert.severity] || COLORS.text.primary }]}>{alert.title}</Text>
                    <Text style={styles.alertMsg}>{alert.message}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* GO PREMIUM and REWARDS HIGHLIGHT moved to Profile tab (Phase 10 redesign) */}

        {/* WEEKLY REPORT */}
        <WeeklyReport weeklyReport={weeklyReport} snapshot={snapshot} user={user} />

        {/* UNIFIED LEADERBOARD (Friends / Global — same across Home/Rewards/Split) */}
        <UnifiedLeaderboard compact title={t('leaderboard', lang).toUpperCase()} onPressMore={() => router.push('/(tabs)/rewards' as any)} />

        {/* INDIA FINANCE NEWS */}
        <NewsCarousel
          news={news}
          newsUpdatedAt={newsUpdatedAt}
          newsLoading={newsLoading}
          onRefresh={() => fetchNews(true)}
        />
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: 140 },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  greeting: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: c.accent.primary },
  name: { fontSize: 24, fontWeight: '900', color: c.text.primary, marginTop: 2, letterSpacing: -0.4 },
  // Avatar — CRED style
  avatarWrap: { position: 'relative' },
  avatarRing: { width: 52, height: 52, borderRadius: 26, padding: 2, borderWidth: 2.5, borderColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,107,26,0.18)', justifyContent: 'center', alignItems: 'center' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: c.bg.primary },
  // Coins chip — neon glass pill
  coinsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,176,71,0.14)', borderWidth: 1, borderColor: 'rgba(255,176,71,0.45)', marginRight: 8 },
  coinsChipVal: { fontSize: 13, fontWeight: '800', color: '#FFB547' },
  // Leaderboard  // Card of the Day — now floating glass
  cotdCard: { backgroundColor: 'rgba(26,26,36,0.85)', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderLeftWidth: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', ...shadowStyle('#000', 4, 18, 0.45, 5) },
  cotdHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cotdEmoji: { fontSize: 22 },
  cotdType: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  cotdRefresh: { padding: 4 },
  cotdText: { fontSize: 15, fontWeight: '500', color: c.text.secondary, lineHeight: 23 },
  // Stats row — dark glass cards
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  statBox: { flex: 1, backgroundColor: 'rgba(26,26,36,0.85)', borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, gap: 4, ...shadowStyle('#000', 2, 10, 0.35, 3) },
  statVal: { fontSize: 16, fontWeight: '900', color: c.text.primary },
  statLabel: { fontSize: 10, color: c.text.muted, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  // Alerts
  alertsSection: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text.primary, marginBottom: SPACING.sm, letterSpacing: -0.2 },
  fomoSection: { marginBottom: SPACING.lg, marginTop: -4 },
  fomoScroll: { gap: 10, paddingRight: 8 },
  fomoCard: {
    width: 260,
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(26,26,36,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,26,0.28)',
    gap: 6,
    ...SHADOW.sm,
  },
  fomoCardDanger: { backgroundColor: 'rgba(255,84,112,0.14)', borderColor: 'rgba(255,84,112,0.4)' },
  fomoCardAccent: { backgroundColor: 'rgba(255,176,32,0.12)', borderColor: 'rgba(255,176,32,0.4)' },
  fomoIcon: { fontSize: 22 },
  fomoText: { fontSize: 13, fontWeight: '600', color: c.text.primary, lineHeight: 18 },
  fomoCtaRow: { marginTop: 4 },
  fomoCta: { fontSize: 12, fontWeight: '800', color: c.accent.primary },
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, gap: 10, marginBottom: 8 },
  alertEmoji: { fontSize: 20, marginTop: 2 },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  alertMsg: { fontSize: 13, color: c.text.secondary, lineHeight: 19 },
  // Predictive insights — dark glass
  predictCard: { backgroundColor: 'rgba(26,26,36,0.9)', borderRadius: RADIUS.card, padding: 14, marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(255,107,26,0.3)', ...shadowStyle('#FF6B1A', 2, 14, 0.25, 3) },
  // Pill row
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, position: 'relative' },
  pillCoin:   { backgroundColor: 'rgba(255,176,71,0.14)', borderColor: 'rgba(255,176,71,0.4)' },
  pillRank:   { backgroundColor: 'rgba(96,165,250,0.14)', borderColor: 'rgba(96,165,250,0.4)' },
  pillStreak: { backgroundColor: 'rgba(255,84,112,0.14)', borderColor: 'rgba(255,84,112,0.4)' },
  pillEmoji: { fontSize: 14 },
  pillValue: { fontSize: 13, fontWeight: '800', color: c.text.primary },
  pillLabel: { fontSize: 11, fontWeight: '600', color: c.text.muted },
  pillGlow: { position: 'absolute', top: -6, right: -4, backgroundColor: '#10E0A0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, borderWidth: 2, borderColor: c.bg.primary },
  pillGlowT: { fontSize: 9, fontWeight: '800', color: '#0B0B12', letterSpacing: 0.3 },
  predictHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  predictTitle: { flex: 1, fontSize: 11, fontWeight: '800', color: c.accent.primary, letterSpacing: 0.8 },
  aiBadge: { backgroundColor: c.accent.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  aiBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  predictRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: 'rgba(255,176,32,0.12)', borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,176,32,0.3)' },
  predictRowCrit: { backgroundColor: 'rgba(255,84,112,0.14)', borderColor: 'rgba(255,84,112,0.4)' },
  predictText: { flex: 1, fontSize: 12, color: c.text.primary, fontWeight: '600', lineHeight: 17 },
  wasteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: 'rgba(255,107,26,0.1)', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: c.accent.primary },
  wasteTitle: { fontSize: 13, fontWeight: '800', color: c.accent.primaryLight },
  wasteSub: { fontSize: 11, color: c.text.secondary, marginTop: 2, lineHeight: 15 },
  // Fresh / last-updated strip — neon green on dark
  freshStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(16,224,160,0.14)', borderRadius: 999, alignSelf: 'flex-start', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: 'rgba(16,224,160,0.4)' },
  freshLiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10E0A0' },
  freshText: { fontSize: 11, fontWeight: '700', color: '#10E0A0', letterSpacing: 0.2 },
  freshBtn: { marginLeft: 4, padding: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
}));
