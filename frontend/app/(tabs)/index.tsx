import React, { useState, useEffect, useCallback, memo } from 'react';
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
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import InsightsCard from '../../components/home/InsightsCard';
import DailyQuestCard from '../../components/DailyQuestCard';
import Confetti from '../../components/Confetti';

const APP_LINK = 'https://mintu.app/download';

export default function HomeScreen() {
  const { user, setUser } = useAuthStore();
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
  const [avatar, setAvatar] = useState<string>('');
  const [news, setNews] = useState<any[]>([]);
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
          const [lessonRes, alertsRes, reportRes, lbRes, gameRes, cotdRes, newsRes, fomoRes, predRes, coinsRes, _openCoinsAward] = await Promise.all([
            api.get(`/money-school/dynamic?lang=${lang}`).catch(() => ({ data: null })),
            api.get('/alerts/smart').catch(() => ({ data: { alerts: [] } })),
            api.get('/reports/weekly').catch(() => ({ data: null })),
            api.get('/leaderboard/savings').catch(() => ({ data: null })),
            api.get('/gamification/status').catch(() => ({ data: null })),
            api.get('/card-of-the-day').catch(() => ({ data: null })),
            api.get('/news/india-finance').catch(() => ({ data: { articles: [] } })),
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
          setNews(newsRes.data?.articles || []);
          setFomoItems(fomoRes.data?.items || []);
          if (predRes.data) setPredict(predRes.data);
          if (coinsRes.data) setCoinsStatus(coinsRes.data);
          // Trigger confetti if we just awarded daily-open coins
          if (_openCoinsAward?.data?.awarded && _openCoinsAward.data.awarded > 0) {
            setShowConfetti(true);
          }
        } catch (e) { console.error('Phase2 err', e); }
      });
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

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

        {/* Transparency Notice — RBI-friendly data freshness disclosure */}
        <View style={styles.transparencyStrip}>
          <Ionicons name="information-circle-outline" size={14} color="#475569" />
          <Text style={styles.transparencyText}>Data updates when you refresh or add transactions · Pull down to sync</Text>
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
          <InsightsCard snapshot={snapshot} onPressSparkline={() => router.push('/(tabs)/transactions')} />
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
              <Ionicons name="analytics" size={16} color="#8B5CF6" />
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
        {weeklyReport && weeklyReport.total_spent > 0 && (
          <View style={styles.weeklyCard}>
            <View style={styles.weeklyHeader}>
              <Ionicons name="calendar" size={16} color={COLORS.accent.secondary} />
              <Text style={styles.weeklyLabel}>WEEKLY REPORT</Text>
              <Text style={styles.weeklyPeriod}>{weeklyReport.period}</Text>
            </View>
            <Text style={styles.weeklyHeadline}>{weeklyReport.headline}</Text>
            <View style={styles.weeklyStatsRow}>
              <View style={styles.weeklyStat}>
                <Text style={[styles.weeklyStatVal, { color: '#EF4444' }]}>₹{weeklyReport.total_spent?.toFixed(0)}</Text>
                <Text style={styles.weeklyStatLbl}>This Week</Text>
              </View>
              {weeklyReport.last_week_spent > 0 && (
                <View style={styles.weeklyStat}>
                  <Text style={[styles.weeklyStatVal, { color: COLORS.text.muted }]}>₹{weeklyReport.last_week_spent?.toFixed(0)}</Text>
                  <Text style={styles.weeklyStatLbl}>Last Week</Text>
                </View>
              )}
              {weeklyReport.change_pct !== 0 && (
                <View style={[styles.changePill, { backgroundColor: weeklyReport.change_pct > 0 ? '#FEF2F2' : '#F0FDF4' }]}>
                  <Ionicons name={weeklyReport.change_pct > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={weeklyReport.change_pct > 0 ? '#EF4444' : '#10B981'} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: weeklyReport.change_pct > 0 ? '#EF4444' : '#10B981' }}>{Math.abs(weeklyReport.change_pct).toFixed(0)}%</Text>
                </View>
              )}
            </View>
            <Text style={styles.weeklySuggestion}>{weeklyReport.savings_suggestion}</Text>
            <TouchableOpacity
              style={styles.shareBtn}
              activeOpacity={0.85}
              onPress={async () => {
                const snap = snapshot || {};
                const tierEmoji = snap.tier?.current?.emoji || '💰';
                const tierName = snap.tier?.current?.name || 'MintU';
                const txt = (
                  `${weeklyReport.mood} My MintU Weekly Report\n\n` +
                  `${weeklyReport.headline}\n\n` +
                  `${tierEmoji} Tier: ${tierName}\n` +
                  `🔥 Streak: ${snap.tier?.streak_days || user?.streak_days || 0} days\n` +
                  `📊 Score: ${snap.tier?.score || user?.money_score || 50}/100\n\n` +
                  (weeklyReport.top_category?.amount ? `Top: ${weeklyReport.top_category.name} — ₹${Math.round(weeklyReport.top_category.amount).toLocaleString('en-IN')}\n` : '') +
                  `\nTrack your money with MintU 👉 ${APP_LINK}`
                );
                try {
                  const wa = `whatsapp://send?text=${encodeURIComponent(txt)}`;
                  const canWA = await Linking.canOpenURL(wa);
                  if (canWA) { Linking.openURL(wa); return; }
                  await Share.share({ message: txt });
                } catch { Toast.show({ type: 'error', text1: 'Could not share' }); }
              }}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Share Weekly Report</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* LEADERBOARD PREVIEW — Top 3 podium + your rank */}
        {leaderboard?.top_10 && leaderboard.top_10.length > 0 && (
          <TouchableOpacity style={styles.lbCard} activeOpacity={0.9} onPress={() => router.push('/(tabs)/rewards')}>
            <View style={styles.lbHeader}>
              <Ionicons name="trophy" size={18} color="#F59E0B" />
              <Text style={styles.lbTitle}>Savings Leaderboard</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
            </View>
            <View style={styles.lbMetaRow}>
              <View style={styles.lbMetaBox}>
                <Text style={styles.lbMetaNum}>#{leaderboard.user_rank || '-'}</Text>
                <Text style={styles.lbMetaLbl}>Your Rank</Text>
              </View>
              <View style={[styles.lbMetaBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#FDE68A' }]}>
                <Text style={[styles.lbMetaNum, { color: '#10B981' }]}>{leaderboard.percentile || 0}%</Text>
                <Text style={styles.lbMetaLbl}>Percentile</Text>
              </View>
              <View style={styles.lbMetaBox}>
                <Text style={[styles.lbMetaNum, { color: '#8B5CF6' }]}>{leaderboard.user_score || 0}</Text>
                <Text style={styles.lbMetaLbl}>Score</Text>
              </View>
            </View>
            <View style={styles.lbTop3Row}>
              {[1, 0, 2].map((idx) => {
                const p = leaderboard.top_10[idx];
                if (!p) return <View key={idx} style={{ flex: 1 }} />;
                const medals = ['\ud83e\udd47', '\ud83e\udd48', '\ud83e\udd49'];
                const heights = [80, 60, 50];
                const colors = ['#F59E0B', '#94A3B8', '#C77632'];
                const rank = p.rank;
                return (
                  <View key={idx} style={styles.lbPodium}>
                    <Text style={{ fontSize: 22, marginBottom: 4 }}>{medals[rank - 1]}</Text>
                    <View style={[styles.lbPodiumBar, { height: heights[rank - 1], backgroundColor: colors[rank - 1] }]}>
                      <Text style={styles.lbPodiumRank}>{rank}</Text>
                    </View>
                    <Text style={styles.lbPodiumName} numberOfLines={1}>{p.is_me ? 'You' : p.name.split(' ')[0]}</Text>
                    <Text style={styles.lbPodiumScore}>{p.score}/100</Text>
                  </View>
                );
              })}
            </View>
            <Text style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 12, textAlign: 'center', fontStyle: 'italic' }}>
              {leaderboard.comparison_text || `You're in the top ${100 - (leaderboard.percentile || 50)}% of savers!`}
            </Text>
          </TouchableOpacity>
        )}

        {/* INDIA FINANCE NEWS — Horizontal snap carousel */}
        <View style={{ marginBottom: SPACING.lg, marginHorizontal: -SPACING.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="newspaper" size={16} color={COLORS.accent.primary} />
              <Text style={styles.sectionTitle}>India Finance Today</Text>
            </View>
            {news.length > 0 && <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Swipe →</Text>}
          </View>
          {news.length === 0 ? (
            <View style={[styles.emptyState, { marginHorizontal: SPACING.lg }]}><ActivityIndicator size="small" color={COLORS.accent.primary} /><Text style={[styles.emptyText, { marginTop: 8 }]}>Loading updates...</Text></View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={278}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 12 }}
            >
              {news.map((article: any, i: number) => {
                const catColor = article.category === 'alert' ? '#EF4444' : article.category === 'market' ? '#10B981' : article.category === 'scheme' ? '#6366F1' : article.category === 'tip' ? '#F59E0B' : COLORS.accent.primary;
                return (
                  <View key={i} style={[styles.newsCard, { borderTopColor: catColor }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <View style={[styles.newsCatDot, { backgroundColor: catColor }]} />
                        <Text style={[styles.newsCat, { color: catColor }]} numberOfLines={1}>{article.category}</Text>
                      </View>
                      <Text style={{ fontSize: 22 }}>{article.emoji}</Text>
                    </View>
                    <Text style={styles.newsTitle} numberOfLines={3}>{article.title}</Text>
                    <Text style={styles.newsSummary} numberOfLines={4}>{article.summary}</Text>
                    <View style={styles.newsFooter}>
                      <Text style={styles.newsSource} numberOfLines={1}>{article.source}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
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
  // Leaderboard
  lbCard: { backgroundColor: '#FFFBEB', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FDE68A' },
  lbHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lbTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#92400E', flex: 1 },
  lbRankPill: { backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full },
  lbRankText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  lbComparison: { fontSize: 14, fontWeight: '600', color: '#78716C', marginBottom: SPACING.md, lineHeight: 20 },
  lbStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: '#fff', borderRadius: RADIUS.lg },
  lbStatBox: { alignItems: 'center', flex: 1 },
  lbStatNum: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary },
  lbStatLabel: { fontSize: 10, color: COLORS.text.muted, marginTop: 2 },
  lbStatDivider: { width: 1, height: 30, backgroundColor: '#FDE68A' },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#FDE68A', gap: 8 },
  lbRowMe: { backgroundColor: '#FEF3C7', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
  lbMedal: { fontSize: 16, width: 28 },
  lbName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text.primary },
  lbScore: { fontSize: 16, fontWeight: '700', color: '#F59E0B' },
  lbStreak: { fontSize: 12, color: '#EF4444' },
  // Card of the Day
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
  // Premium banner
  premiumBanner: { backgroundColor: 'rgba(139,92,246,0.06)', borderRadius: RADIUS.card, padding: 16, marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)' },
  premiumBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full },
  premiumBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  // Rewards
  rewardsCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#F59E0B25', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 3) },
  rewardsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md },
  rewardsTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#92400E', flex: 1 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: '600', color: COLORS.accent.primary },
  rewardsBadges: { flexDirection: 'row', justifyContent: 'space-around' },
  rewardItem: { alignItems: 'center', gap: 4 },
  rewardEmoji: { fontSize: 24 },
  rewardVal: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary },
  rewardLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: '600' },
  // Weekly
  weeklyCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.secondary + '25', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 3) },
  // MintU 2.0 — Predictive insights card (Waste detector + overspending)
  predictCard: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.card, padding: 14, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#8B5CF630', ...shadowStyle('#8B5CF6', 2, 10, 0.08, 3) },
  // MintU 2.0 — Top-of-home pill row (gamification)
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  // Transparency notice strip — RBI-friendly data freshness disclosure
  transparencyStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 10, marginBottom: 10 },
  transparencyText: { flex: 1, fontSize: 10.5, color: '#475569', fontWeight: '600', lineHeight: 14 },
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
  predictTitle: { flex: 1, fontSize: 11, fontWeight: '800', color: '#8B5CF6', letterSpacing: 0.8 },
  aiBadge: { backgroundColor: '#8B5CF6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  aiBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  predictRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FEF3C7', borderRadius: 10, marginBottom: 6 },
  predictRowCrit: { backgroundColor: '#FEE2E2' },
  predictText: { flex: 1, fontSize: 12, color: COLORS.text.primary, fontWeight: '600', lineHeight: 17 },
  wasteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFF4E5', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#E65100' },
  wasteTitle: { fontSize: 13, fontWeight: '800', color: '#7C2D12' },
  wasteSub: { fontSize: 11, color: '#92400E', marginTop: 2, lineHeight: 15 },
  // WhatsApp share button for weekly report
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#25D366' },
  shareBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  weeklyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  weeklyLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: COLORS.accent.secondary, flex: 1 },
  weeklyPeriod: { fontSize: 11, color: COLORS.text.muted },
  weeklyHeadline: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary, marginBottom: SPACING.md },
  weeklyStatsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.md },
  weeklyStat: { alignItems: 'center' },
  weeklyStatVal: { fontSize: 18, fontWeight: '800' },
  weeklyStatLbl: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  weeklySuggestion: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 19, fontStyle: 'italic' },
  // School
  schoolCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#8B5CF625' },
  // Horizontal news cards
  newsCard: { width: 266, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: RADIUS.lg, padding: 14, borderWidth: 1, borderColor: COLORS.border.card, borderTopWidth: 3 },
  newsCatDot: { width: 6, height: 6, borderRadius: 3 },
  newsCat: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  newsTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary, lineHeight: 20, marginBottom: 6 },
  newsSummary: { fontSize: 12, color: COLORS.text.secondary, lineHeight: 18, marginBottom: 10 },
  newsFooter: { borderTopWidth: 1, borderTopColor: COLORS.border.subtle, paddingTop: 8, marginTop: 'auto' },
  newsSource: { fontSize: 11, fontWeight: '600', color: COLORS.text.muted },
  // Leaderboard preview on Home
  lbCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#F59E0B20' },
  lbHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  lbTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary, flex: 1 },
  lbMetaRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#FFFBEB', borderRadius: 12, paddingVertical: 10, marginBottom: 12 },
  lbMetaBox: { alignItems: 'center', flex: 1 },
  lbMetaNum: { fontSize: 18, fontWeight: '800', color: '#92400E' },
  lbMetaLbl: { fontSize: 10, color: COLORS.text.muted, marginTop: 2, fontWeight: '600' },
  lbTop3Row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginTop: 4 },
  lbPodium: { alignItems: 'center', flex: 1, maxWidth: 90 },
  lbPodiumBar: { width: '100%', borderRadius: 8, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 6 },
  lbPodiumRank: { fontSize: 20, fontWeight: '800', color: '#fff' },
  lbPodiumName: { fontSize: 11, fontWeight: '700', color: COLORS.text.primary, marginTop: 6, textAlign: 'center' },
  lbPodiumScore: { fontSize: 10, color: COLORS.text.muted, marginTop: 1 },
  schoolHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  schoolBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  schoolBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#8B5CF6' },
  schoolTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: 8 },
  schoolTip: { fontSize: 14, color: COLORS.text.secondary, lineHeight: 21, marginBottom: SPACING.md },
  schoolCatPill: { backgroundColor: '#8B5CF615', paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  schoolCatText: { fontSize: 11, fontWeight: '600', color: '#8B5CF6' },
  // Money School horizontal cards
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  xpText: { fontSize: 13, fontWeight: '600', color: '#8B5CF6' },
  xpVal: { fontSize: 13, fontWeight: '700', color: '#F59E0B' },
  schoolCardH: { width: 280, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.card, padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', borderLeftWidth: 4, ...shadowStyle('#2E1F1A', 2, 10, 0.04, 3) },
  schoolCardType: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  schoolXpBadge: { fontSize: 10, fontWeight: '700', color: '#F59E0B', backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  schoolCardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text.primary, marginBottom: 6 },
  schoolCardBody: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 19 },
  // Transactions
  txnSection: { marginBottom: SPACING.lg },
  txnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  seeAllLink: { fontSize: 14, fontWeight: '600', color: COLORS.accent.primary },
  emptyState: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: COLORS.text.muted },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  txnIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 15, fontWeight: '600', color: COLORS.text.primary },
  txnDate: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  txnAmt: { fontSize: 16, fontWeight: '700' },
});
