import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES } from '../../utils/theme';
import { BarChart } from 'react-native-gifted-charts';
import { router } from 'expo-router';

export default function HomeScreen() {
  const { user, setUser } = useAuthStore();
  const { lang } = useLangStore();
  const [insights, setInsights] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [dailyLesson, setDailyLesson] = useState<any>(null);
  const [smartAlerts, setSmartAlerts] = useState<any[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Load fast endpoints first to unblock the UI
      const [profileRes, statsRes, txnRes, lessonRes, alertsRes, reportRes] = await Promise.all([
        api.get('/user/me'),
        api.get('/stats/overview'),
        api.get('/transactions?limit=5'),
        api.get(`/money-school/daily?lang=${lang}`),
        api.get('/alerts/smart'),
        api.get('/reports/weekly'),
      ]);
      setUser(profileRes.data);
      setStats(statsRes.data);
      setRecentTxns(Array.isArray(txnRes.data) ? txnRes.data.slice(0, 4) : []);
      setDailyLesson(lessonRes.data);
      setSmartAlerts(alertsRes.data?.alerts || []);
      setWeeklyReport(reportRes.data);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Load AI insights separately (slow OpenAI call - don't block UI)
    try {
      const insightsRes = await api.get(`/insights/daily?lang=${lang}`);
      setInsights(insightsRes.data);
    } catch (error) {
      console.error('Insights fetch error:', error);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  const moneyScore = insights?.money_score || user?.money_score || 50;
  const scoreColor = moneyScore >= 75 ? COLORS.accent.moneyIn : moneyScore >= 50 ? COLORS.accent.warning : COLORS.accent.moneyOut;
  const scoreLabel = moneyScore >= 75 ? t('excellent', lang) : moneyScore >= 50 ? t('good', lang) : t('needs_attention', lang);

  const chartData = Object.entries(insights?.spending_summary || {}).map(
    ([category, amount]: [string, any]) => ({
      value: amount,
      label: category.slice(0, 4),
      frontColor: CATEGORIES[category]?.color || COLORS.accent.secondary,
      topLabelComponent: () => <Text style={styles.chartLabel}>{'\u20B9'}{Math.round(amount)}</Text>,
    })
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        testID="home-dashboard"
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.accent.primary} />}
      >
        {/* Header with Profile Avatar */}
        <View style={styles.header}>
          <TouchableOpacity testID="profile-avatar-btn" style={styles.avatarBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person" size={18} color={COLORS.accent.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.overline}>{t('welcome_back', lang)}</Text>
            <Text style={styles.greeting}>{t('hello', lang)}, {user?.name || 'there'}!</Text>
          </View>
          <TouchableOpacity testID="home-rewards-btn" style={styles.rewardsBtn} onPress={() => router.push('/(tabs)/rewards')}>
            <Ionicons name="gift" size={18} color={COLORS.accent.secondary} />
          </TouchableOpacity>
        </View>

        {/* Money Score Hero */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreTop}>
            <View>
              <Text style={styles.scoreOverline}>{t('money_score', lang)}</Text>
              <Text style={[styles.scoreStatus, { color: scoreColor }]}>{scoreLabel}</Text>
            </View>
            <View style={[styles.scoreBadge, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreBadgeText, { color: scoreColor }]}>{moneyScore}</Text>
              <Text style={styles.scoreBadgeSub}>/100</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${moneyScore}%`, backgroundColor: scoreColor }]} />
          </View>
        </View>

        {/* Quick Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderLeftColor: COLORS.accent.moneyIn }]}>
              <Ionicons name="arrow-down-circle" size={20} color={COLORS.accent.moneyIn} />
              <Text style={styles.statAmount}>{'\u20B9'}{stats.total_income.toFixed(0)}</Text>
              <Text style={styles.statLabel}>{t('income', lang)}</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: COLORS.accent.moneyOut }]}>
              <Ionicons name="arrow-up-circle" size={20} color={COLORS.accent.moneyOut} />
              <Text style={styles.statAmount}>{'\u20B9'}{stats.total_expense.toFixed(0)}</Text>
              <Text style={styles.statLabel}>{t('expenses', lang)}</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: COLORS.accent.secondary }]}>
              <Ionicons name="wallet" size={20} color={COLORS.accent.secondary} />
              <Text style={styles.statAmount}>{'\u20B9'}{stats.balance.toFixed(0)}</Text>
              <Text style={styles.statLabel}>{t('balance', lang)}</Text>
            </View>
          </View>
        )}

        {/* AI Insight Card */}
        {insights?.insight_text && (
          <View style={styles.insightCard}>
            <View style={styles.insightIconWrap}>
              <Ionicons name="sparkles" size={20} color={COLORS.accent.warning} />
            </View>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>{t('ai_insight', lang)}</Text>
              <Text style={styles.insightText}>{insights.insight_text}</Text>
            </View>
          </View>
        )}

        {/* Smart Alerts */}
        {smartAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            {smartAlerts.slice(0, 3).map((alert: any, i: number) => {
              const bgColors: Record<string, string> = { danger: '#FEF2F2', warning: '#FFFBEB', success: '#F0FDF4', info: '#EFF6FF' };
              const borderColors: Record<string, string> = { danger: '#FECACA', warning: '#FDE68A', success: '#BBF7D0', info: '#BFDBFE' };
              const textColors: Record<string, string> = { danger: '#991B1B', warning: '#92400E', success: '#166534', info: '#1E40AF' };
              return (
                <View key={i} style={[styles.alertCard, { backgroundColor: bgColors[alert.severity] || '#F9FAFB', borderColor: borderColors[alert.severity] || '#E5E7EB' }]}>
                  <Text style={styles.alertEmoji}>{alert.emoji}</Text>
                  <View style={styles.alertBody}>
                    <Text style={[styles.alertTitle, { color: textColors[alert.severity] || COLORS.text.primary }]}>{alert.title}</Text>
                    <Text style={styles.alertMsg}>{alert.message}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Weekly Report Card */}
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
                <Text style={[styles.weeklyStatVal, { color: COLORS.accent.moneyOut }]}>{'\u20B9'}{weeklyReport.total_spent?.toFixed(0)}</Text>
                <Text style={styles.weeklyStatLbl}>This Week</Text>
              </View>
              {weeklyReport.last_week_spent > 0 && (
                <View style={styles.weeklyStat}>
                  <Text style={[styles.weeklyStatVal, { color: COLORS.text.muted }]}>{'\u20B9'}{weeklyReport.last_week_spent?.toFixed(0)}</Text>
                  <Text style={styles.weeklyStatLbl}>Last Week</Text>
                </View>
              )}
              {weeklyReport.change_pct !== 0 && (
                <View style={[styles.weeklyChangePill, { backgroundColor: weeklyReport.change_pct > 0 ? COLORS.accent.moneyOut + '15' : COLORS.accent.moneyIn + '15' }]}>
                  <Ionicons name={weeklyReport.change_pct > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={weeklyReport.change_pct > 0 ? COLORS.accent.moneyOut : COLORS.accent.moneyIn} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: weeklyReport.change_pct > 0 ? COLORS.accent.moneyOut : COLORS.accent.moneyIn }}>{Math.abs(weeklyReport.change_pct).toFixed(0)}%</Text>
                </View>
              )}
            </View>
            <Text style={styles.weeklySuggestion}>{weeklyReport.savings_suggestion}</Text>
          </View>
        )}
        {/* Money School Card */}
        {dailyLesson && (
          <View testID="money-school-card" style={styles.schoolCard}>
            <View style={styles.schoolHeader}>
              <View style={styles.schoolBadge}>
                <Ionicons name="school" size={14} color="#8B5CF6" />
                <Text style={styles.schoolBadgeText}>MONEY SCHOOL</Text>
              </View>
              <Text style={styles.schoolProgress}>
                {dailyLesson.lesson_number}/{dailyLesson.total_lessons}
              </Text>
            </View>
            <Text style={styles.schoolTitle}>{dailyLesson.lesson?.title}</Text>
            <Text style={styles.schoolContent} numberOfLines={3}>
              {dailyLesson.lesson?.content}
            </Text>
            {dailyLesson.personal_tip ? (
              <View style={styles.schoolTipBox}>
                <Ionicons name="sparkles" size={14} color={COLORS.accent.primary} />
                <Text style={styles.schoolTipText}>{dailyLesson.personal_tip}</Text>
              </View>
            ) : null}
            <View style={styles.schoolCatPill}>
              <Text style={styles.schoolCatText}>{dailyLesson.lesson?.category}</Text>
            </View>
          </View>
        )}

        {/* Spending Chart - original */}
        {chartData.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('spending_breakdown', lang)}</Text>
            <Text style={styles.cardSubtitle}>{t('last_7_days', lang)}</Text>
            <View style={styles.chartWrap}>
              <BarChart
                data={chartData}
                barWidth={28}
                spacing={20}
                roundedTop
                barBorderRadius={6}
                hideRules
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: COLORS.text.muted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: COLORS.text.muted, fontSize: 10 }}
                noOfSections={3}
                maxValue={Math.max(...chartData.map((d) => d.value)) * 1.3}
                isAnimated
              />
            </View>
          </View>
        )}

        {/* Recommendations */}
        {insights?.recommendations?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('smart_tips', lang)}</Text>
            {insights.recommendations.map((rec: string, i: number) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipIcon}>
                  <Ionicons name="checkmark" size={14} color={COLORS.accent.primary} />
                </View>
                <Text style={styles.tipText}>{rec}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent Transactions */}
        {recentTxns.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t('recent_transactions', lang)}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
                <Text style={styles.seeAll}>{t('see_all', lang)}</Text>
              </TouchableOpacity>
            </View>
            {recentTxns.map((txn: any, i: number) => {
              const cat = CATEGORIES[txn.category] || CATEGORIES.Other;
              return (
                <View key={txn.id || i} style={styles.txnRow}>
                  <View style={[styles.txnIcon, { backgroundColor: cat.color + '18' }]}>
                    <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                  </View>
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnDesc} numberOfLines={1}>{txn.description}</Text>
                    <Text style={styles.txnCat}>{txn.category}</Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: txn.type === 'credit' ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]}>
                    {txn.type === 'credit' ? '+' : '-'}{'\u20B9'}{txn.amount.toFixed(0)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scrollContent: { padding: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xxl },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.accent.primary + '30' },
  headerCenter: { flex: 1, marginHorizontal: SPACING.md },
  rewardsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent.secondary + '15', justifyContent: 'center', alignItems: 'center' },
  overline: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: COLORS.accent.primary, marginBottom: 4 },
  greeting: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.5 },
  // Score card
  scoreCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  overline: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: COLORS.accent.primary, marginBottom: 4 },
  scoreTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  scoreOverline: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: COLORS.text.muted, marginBottom: 6 },
  scoreStatus: { fontSize: 18, fontWeight: '700' },
  scoreBadge: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  scoreBadgeText: { fontSize: 28, fontWeight: '800' },
  scoreBadgeSub: { fontSize: 11, color: COLORS.text.muted, marginTop: -2 },
  progressTrack: { height: 6, backgroundColor: COLORS.bg.primary, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  // Stats
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  statCard: { flex: 1, backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderLeftWidth: 3, borderWidth: 1, borderColor: COLORS.border.card },
  statAmount: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginTop: 8 },
  statLabel: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  // Insight
  insightCard: { flexDirection: 'row', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.warning + '20' },
  insightIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent.warning + '18', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  insightContent: { flex: 1 },
  insightTitle: { fontSize: 14, fontWeight: '700', color: COLORS.accent.warning, marginBottom: 6 },
  insightText: { fontSize: 14, color: COLORS.text.secondary, lineHeight: 21 },
  // Card
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: COLORS.text.muted, marginBottom: SPACING.lg },
  seeAll: { fontSize: 14, fontWeight: '600', color: COLORS.accent.primary },
  chartWrap: { alignItems: 'center', marginTop: 8 },
  chartLabel: { fontSize: 9, color: COLORS.text.muted, marginBottom: 4 },
  // Tips
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.md },
  tipIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent.primary + '18', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  tipText: { flex: 1, fontSize: 14, color: COLORS.text.secondary, lineHeight: 20 },
  // Transaction rows
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border.subtle },
  txnIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 15, fontWeight: '600', color: COLORS.text.primary },
  txnCat: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  txnAmount: { fontSize: 16, fontWeight: '700' },
  // Money School
  schoolCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#8B5CF6' + '25' },
  schoolHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  schoolBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#8B5CF6' + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },
  schoolBadgeText: { fontSize: 11, fontWeight: '700', color: '#8B5CF6', letterSpacing: 0.8 },
  schoolProgress: { fontSize: 12, fontWeight: '600', color: COLORS.text.muted },
  schoolTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary, marginBottom: 8 },
  schoolContent: { fontSize: 14, color: COLORS.text.secondary, lineHeight: 21, marginBottom: SPACING.md },
  schoolTipBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: COLORS.accent.primary + '10', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  schoolTipText: { flex: 1, fontSize: 13, color: COLORS.accent.primaryLight, lineHeight: 19 },
  schoolCatPill: { backgroundColor: '#8B5CF6' + '15', paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  schoolCatText: { fontSize: 11, fontWeight: '600', color: '#8B5CF6' },
  // Smart Alerts
  alertsSection: { marginBottom: SPACING.lg, gap: 8 },
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, gap: 10 },
  alertEmoji: { fontSize: 20, marginTop: 2 },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  alertMsg: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 19 },
  // Weekly Report
  weeklyCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.secondary + '25' },
  weeklyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  weeklyLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: COLORS.accent.secondary, flex: 1 },
  weeklyPeriod: { fontSize: 11, color: COLORS.text.muted },
  weeklyHeadline: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary, marginBottom: SPACING.md },
  weeklyStatsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.md },
  weeklyStat: { alignItems: 'center' },
  weeklyStatVal: { fontSize: 18, fontWeight: '800' },
  weeklyStatLbl: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  weeklyChangePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  weeklySuggestion: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 19, fontStyle: 'italic' },
});
