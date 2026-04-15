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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [insightsRes, profileRes, statsRes, txnRes] = await Promise.all([
        api.get('/insights/daily'),
        api.get('/user/me'),
        api.get('/stats/overview'),
        api.get('/transactions?limit=5'),
      ]);
      setInsights(insightsRes.data);
      setUser(profileRes.data);
      setStats(statsRes.data);
      setRecentTxns(Array.isArray(txnRes.data) ? txnRes.data.slice(0, 4) : []);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.overline}>{t('welcome_back', lang)}</Text>
            <Text style={styles.greeting}>{t('hello', lang)}, {user?.name || 'there'}!</Text>
          </View>
          <TouchableOpacity testID="home-notifications-btn" style={styles.notifButton}>
            <Ionicons name="notifications-outline" size={22} color={COLORS.text.primary} />
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

        {/* Spending Chart */}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  overline: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: COLORS.accent.primary, marginBottom: 4 },
  greeting: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.5 },
  notifButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg.secondary, borderWidth: 1, borderColor: COLORS.border.subtle, justifyContent: 'center', alignItems: 'center' },
  // Score card
  scoreCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
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
});
