import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator,
  Image, Share, Linking, Alert, InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES, SHADOW, shadowStyle } from '../../utils/theme';
import PressableGlass from '../../components/PressableGlass';
import { BarChart } from 'react-native-gifted-charts';
import { router, useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import InsightsCard from '../../components/home/InsightsCard';
import DailyQuestCard from '../../components/DailyQuestCard';
import AIInsightCard from '../../components/home/AIInsightCard';
import UnifiedLeaderboard from '../../components/leaderboard/UnifiedLeaderboard';
import NewsCarousel from '../../components/home/NewsCarousel';
import WeeklyReport from '../../components/home/WeeklyReport';
import Confetti from '../../components/Confetti';

const APP_LINK = 'https://mintu.app/download';

export default function HomeScreen() {
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
      // Phase 1: Critical data (shown above the fold)
      const [profileRes, statsRes, txnRes, avatarRes, snapRes] = await Promise.all([
        api.get('/user/me'),
        api.get('/stats/overview'),
        api.get('/transactions?limit=5'),
        api.get('/user/avatar'),
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
            api.post('/coins/award', { action: 'open_app_daily' }).catch(() => ({ data: null })),
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
          // Trigger confetti if we just awarded daily-open coins
          if (_openCoinsAward?.data?.awarded && _openCoinsAward.data.awarded > 0) {
            setShowConfetti(true);
          }
        } catch (e) { console.error('Phase2 err', e); }
      });

      // Phase 3 (fully independent): India Finance news — fire separately so
      // it never blocks the rest of the secondary data and shows fallback fast.
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

  // Re-fetch news every time Home gains focus (covers tab switches & deep re-entry).
  // Cheap because backend cache returns in ~100ms; keeps "today's news" truly today's.
  useFocusEffect(
    useCallback(() => {
      fetchNews(false);
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
        await api.post('/user/avatar', { avatar: b64 });
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

        {/* HEADER — CRED-style with avatar */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{t('welcome_back', lang).toUpperCase()}</Text>
            <Text style={styles.name}>{t('hi', lang)}, {user?.name || 'User'}!</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={styles.avatarWrap}>
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
          </TouchableOpacity>
        </View>

        {/* MintU 2.0 — Daily Quest Card (habit loop) */}
        <DailyQuestCard coinsStatus={coinsStatus} />

        {/* Freshness Signal — auto-updating "Last updated just now / X min ago" */}
        <View style={styles.freshStrip}>
          <View style={styles.freshLiveDot} />
          <Text style={styles.freshText}>{lastSyncLabel}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.freshBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={12} color={COLORS.accent.primary} />
          </TouchableOpacity>
        </View>

        {/* MintU 2.0 — Top-of-home Pill Row (Coins + Percentile + Streak) */}
        {(coinsStatus || leaderboard || snapshot) && (
          <View style={styles.pillRow}>
            {coinsStatus && (
              <TouchableOpacity style={[styles.pill, styles.pillCoin]} onPress={() => router.push('/(tabs)/rewards')} activeOpacity={0.7}>
                <Text style={styles.pillEmoji}>🪙</Text>
                <Text style={styles.pillValue}>{coinsStatus.balance}</Text>
                <Text style={styles.pillLabel}>coins</Text>
                {coinsStatus.today_earned > 0 && <View style={styles.pillGlow}><Text style={styles.pillGlowT}>+{coinsStatus.today_earned}</Text></View>}
              </TouchableOpacity>
            )}
            {leaderboard?.percentile > 0 && (
              <TouchableOpacity style={[styles.pill, styles.pillRank]} onPress={() => router.push('/(tabs)/rewards')} activeOpacity={0.7}>
                <Text style={styles.pillEmoji}>🏆</Text>
                <Text style={styles.pillValue}>Top {Math.max(1, 100 - leaderboard.percentile)}%</Text>
              </TouchableOpacity>
            )}
            {(snapshot?.tier?.streak_days ?? user?.streak_days ?? 0) > 0 && (
              <View style={[styles.pill, styles.pillStreak]}>
                <Text style={styles.pillEmoji}>🔥</Text>
                <Text style={styles.pillValue}>{snapshot?.tier?.streak_days ?? user?.streak_days ?? 0}</Text>
                <Text style={styles.pillLabel}>day streak</Text>
              </View>
            )}
          </View>
        )}

        {/* CARD OF THE DAY */}
        {cardOfDay && (
          <View style={[styles.cotdCard, { borderLeftColor: cardOfDay.color || COLORS.accent.primary }]}>
            <View style={styles.cotdHeader}>
              <Text style={styles.cotdEmoji}>{cardOfDay.emoji}</Text>
              <Text style={[styles.cotdType, { color: cardOfDay.color }]}>{cardOfDay.title}</Text>
              <TouchableOpacity onPress={refreshCardOfDay} style={styles.cotdRefresh}>
                <Ionicons name="refresh" size={14} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cotdText}>{cardOfDay.text}</Text>
          </View>
        )}

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

        {/* LEADERBOARD PREVIEW */}
        <LeaderboardPreview leaderboard={leaderboard} />

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  greeting: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: COLORS.text.muted },
  name: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary, marginTop: 2 },
  // Avatar — CRED style
  avatarWrap: { position: 'relative' },
  avatarRing: { width: 52, height: 52, borderRadius: 26, padding: 2, borderWidth: 2.5, borderColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.primary },
  // Leaderboard  // Card of the Day
  cotdCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderLeftWidth: 4, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 12, 0.04, 3) },
  cotdHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cotdEmoji: { fontSize: 22 },
  cotdType: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  cotdRefresh: { padding: 4 },
  cotdText: { fontSize: 15, fontWeight: '500', color: COLORS.text.secondary, lineHeight: 23 },
  // Stats row
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  statBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, gap: 4, ...shadowStyle('#2E1F1A', 1, 8, 0.03, 2) },
  statVal: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: '600' },
  // Alerts
  alertsSection: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: SPACING.sm },
  fomoSection: { marginBottom: SPACING.lg, marginTop: -4 },
  fomoScroll: { gap: 10, paddingRight: 8 },
  fomoCard: {
    width: 260,
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(230,81,0,0.18)',
    gap: 6,
    ...SHADOW.sm,
  },
  fomoCardDanger: { backgroundColor: 'rgba(254,242,242,0.95)', borderColor: '#FECACA' },
  fomoCardAccent: { backgroundColor: 'rgba(254,243,199,0.95)', borderColor: '#FDE68A' },
  fomoIcon: { fontSize: 22 },
  fomoText: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary, lineHeight: 18 },
  fomoCtaRow: { marginTop: 4 },
  fomoCta: { fontSize: 12, fontWeight: '800', color: COLORS.accent.primary },
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, gap: 10, marginBottom: 8 },
  alertEmoji: { fontSize: 20, marginTop: 2 },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  alertMsg: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 19 },
  // Premium banner  // Rewards
  // Weekly  // MintU 2.0 — Predictive insights card (Waste detector + overspending)
  predictCard: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.card, padding: 14, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#E6510030', ...shadowStyle('#E65100', 2, 10, 0.08, 3) },
  // MintU 2.0 — Top-of-home pill row (gamification)
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  // Transparency notice strip — RBI-friendly data freshness disclosure
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, position: 'relative' },
  pillCoin: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B40' },
  pillRank: { backgroundColor: '#DBEAFE', borderColor: '#3B82F640' },
  pillStreak: { backgroundColor: '#FEE2E2', borderColor: '#EF444440' },
  pillEmoji: { fontSize: 14 },
  pillValue: { fontSize: 13, fontWeight: '800', color: COLORS.text.primary },
  pillLabel: { fontSize: 11, fontWeight: '600', color: COLORS.text.muted },
  pillGlow: { position: 'absolute', top: -6, right: -4, backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, borderWidth: 2, borderColor: '#FFFFFF' },
  pillGlowT: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  predictHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  predictTitle: { flex: 1, fontSize: 11, fontWeight: '800', color: '#E65100', letterSpacing: 0.8 },
  aiBadge: { backgroundColor: '#E65100', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  aiBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  predictRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FEF3C7', borderRadius: 10, marginBottom: 6 },
  predictRowCrit: { backgroundColor: '#FEE2E2' },
  predictText: { flex: 1, fontSize: 12, color: COLORS.text.primary, fontWeight: '600', lineHeight: 17 },
  wasteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFF4E5', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#E65100' },
  wasteTitle: { fontSize: 13, fontWeight: '800', color: '#7C2D12' },
  wasteSub: { fontSize: 11, color: '#92400E', marginTop: 2, lineHeight: 15 },
  // WhatsApp share button for weekly report
  // School  // Horizontal news cards  // Live / refresh indicators  // Fresh / last-updated strip replacing the old "data updates on refresh" trust signal
  freshStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#DCFCE7', borderRadius: 999, alignSelf: 'flex-start', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: '#86EFAC' },
  freshLiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' },
  freshText: { fontSize: 11, fontWeight: '700', color: '#065F46', letterSpacing: 0.2 },
  freshBtn: { marginLeft: 4, padding: 4, borderRadius: 999, backgroundColor: '#fff' },
  // Leaderboard preview on Home
  // Money School horizontal cards
  // Transactions});
