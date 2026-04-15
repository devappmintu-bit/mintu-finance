import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES } from '../../utils/theme';
import { PieChart } from 'react-native-gifted-charts';

const MOOD_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  great: { icon: 'happy', color: '#10B981', label: 'Excellent' },
  good: { icon: 'thumbs-up', color: '#3B82F6', label: 'Good' },
  okay: { icon: 'help-circle', color: '#F59E0B', label: 'Okay' },
  concerning: { icon: 'warning', color: '#F97316', label: 'Needs Attention' },
  alert: { icon: 'alert-circle', color: '#EF4444', label: 'Alert' },
};

export default function InsightsScreen() {
  const [insights, setInsights] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const statsRes = await api.get('/stats/overview');
      setStats(statsRes.data);
      setLoading(false);

      const [insightsRes, weeklyRes] = await Promise.all([
        api.get('/insights/daily'),
        api.get('/insights/weekly'),
      ]);
      setInsights(insightsRes.data);
      setWeekly(weeklyRes.data);
    } catch (error) {
      console.error('Insights fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const pieData = Object.entries(stats?.category_breakdown || {}).map(
    ([cat, amount]: [string, any]) => ({
      value: amount,
      color: CATEGORIES[cat]?.color || '#64748B',
      text: cat,
    })
  );
  const totalSpent = pieData.reduce((sum, d) => sum + d.value, 0);

  const moneyScore = insights?.money_score || 50;
  const scoreColor = moneyScore >= 75 ? COLORS.accent.moneyIn : moneyScore >= 50 ? COLORS.accent.warning : COLORS.accent.moneyOut;
  const mood = MOOD_CONFIG[insights?.mood || 'good'];
  const alerts = insights?.alerts || [];
  const trends = insights?.trends || {};

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
        testID="insights-screen"
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.accent.primary} />}
      >
        <Text style={styles.pageTitle}>Insights</Text>
        <Text style={styles.pageSubtitle}>AI-powered spending analysis</Text>

        {/* Money Score + Mood */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>{moneyScore}</Text>
            </View>
            <View style={styles.scoreInfo}>
              <Text style={styles.scoreLabel}>Money Score</Text>
              <Text style={[styles.scoreGrade, { color: scoreColor }]}>
                {moneyScore >= 75 ? 'Excellent' : moneyScore >= 50 ? 'Good' : 'Needs Attention'}
              </Text>
              <View style={styles.scoreMiniBar}>
                <View style={[styles.scoreMiniBarFill, { width: `${moneyScore}%`, backgroundColor: scoreColor }]} />
              </View>
            </View>
          </View>
          {mood && (
            <View style={[styles.moodBadge, { backgroundColor: mood.color + '15' }]}>
              <Ionicons name={mood.icon as any} size={16} color={mood.color} />
              <Text style={[styles.moodText, { color: mood.color }]}>Financial Mood: {mood.label}</Text>
            </View>
          )}
          <View style={styles.scoreFactors}>
            <View style={styles.factor}>
              <Ionicons name="trending-down" size={14} color={COLORS.accent.moneyOut} />
              <Text style={styles.factorText}>Spending</Text>
            </View>
            <View style={styles.factor}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.accent.primary} />
              <Text style={styles.factorText}>Budgets</Text>
            </View>
            <View style={styles.factor}>
              <Ionicons name="pulse" size={14} color={COLORS.accent.secondary} />
              <Text style={styles.factorText}>Consistency</Text>
            </View>
          </View>
        </View>

        {/* Alerts */}
        {alerts.length > 0 && (
          <View style={styles.alertsSection}>
            {alerts.slice(0, 3).map((alert: any, i: number) => {
              const alertColor = alert.severity === 'high' ? '#EF4444' : alert.severity === 'medium' ? '#F59E0B' : '#3B82F6';
              return (
                <View key={i} style={[styles.alertCard, { borderLeftColor: alertColor }]}>
                  <Ionicons
                    name={alert.type === 'anomaly' ? 'help-circle' : alert.type === 'budget_breach' ? 'alert-circle' : 'trending-up'}
                    size={18} color={alertColor}
                  />
                  <Text style={styles.alertText}>{alert.message}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* AI Insight */}
        {insights?.insight_text && (
          <View style={styles.aiCard}>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={14} color={COLORS.accent.warning} />
              <Text style={styles.aiBadgeText}>AI INSIGHT</Text>
            </View>
            <Text style={styles.aiText}>{insights.insight_text}</Text>
          </View>
        )}

        {/* Weekly Summary */}
        {insights?.weekly_summary ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="calendar" size={18} color={COLORS.accent.secondary} />
              <Text style={styles.cardTitle}>Weekly Summary</Text>
            </View>
            <Text style={styles.summaryText}>{insights.weekly_summary}</Text>
            {trends.week_change_pct !== undefined && trends.week_change_pct !== 0 && (
              <View style={[styles.trendPill, { backgroundColor: trends.week_change_pct > 0 ? COLORS.accent.moneyOut + '15' : COLORS.accent.moneyIn + '15' }]}>
                <Ionicons
                  name={trends.week_change_pct > 0 ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={trends.week_change_pct > 0 ? COLORS.accent.moneyOut : COLORS.accent.moneyIn}
                />
                <Text style={[styles.trendText, { color: trends.week_change_pct > 0 ? COLORS.accent.moneyOut : COLORS.accent.moneyIn }]}>
                  {Math.abs(trends.week_change_pct).toFixed(0)}% vs last week
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Expense Breakdown Donut */}
        {pieData.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Expense Breakdown</Text>
            <Text style={styles.cardSubtitle}>Last 30 days</Text>
            <View style={styles.pieWrap}>
              <PieChart
                data={pieData}
                donut
                radius={90}
                innerRadius={60}
                innerCircleColor={COLORS.bg.card}
                centerLabelComponent={() => (
                  <View style={styles.pieCenter}>
                    <Text style={styles.pieCenterAmount}>{'\u20B9'}{totalSpent.toFixed(0)}</Text>
                    <Text style={styles.pieCenterLabel}>Total</Text>
                  </View>
                )}
              />
            </View>
            <View style={styles.legend}>
              {pieData.map((item, i) => (
                <View key={i} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>{item.text}</Text>
                  <Text style={styles.legendAmount}>{'\u20B9'}{item.value.toFixed(0)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Savings Tip */}
        {insights?.savings_tip ? (
          <View style={[styles.card, { borderColor: COLORS.accent.primary + '30' }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="cash" size={18} color={COLORS.accent.primary} />
              <Text style={[styles.cardTitle, { color: COLORS.accent.primary }]}>Savings Tip</Text>
            </View>
            <Text style={styles.savingsText}>{insights.savings_tip}</Text>
          </View>
        ) : null}

        {/* Recommendations */}
        {insights?.recommendations?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recommendations</Text>
            {insights.recommendations.map((rec: string, i: number) => (
              <View key={i} style={styles.recItem}>
                <View style={[styles.recNum, { backgroundColor: [COLORS.accent.primary, COLORS.accent.secondary, COLORS.accent.tertiary][i % 3] + '20' }]}>
                  <Text style={[styles.recNumText, { color: [COLORS.accent.primary, COLORS.accent.secondary, COLORS.accent.tertiary][i % 3] }]}>{i + 1}</Text>
                </View>
                <Text style={styles.recText}>{rec}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Category Trends */}
        {trends.category_trends && Object.keys(trends.category_trends).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Category Trends</Text>
            <Text style={styles.cardSubtitle}>This week vs last week</Text>
            {Object.entries(trends.category_trends).map(([cat, data]: [string, any], i: number) => {
              const catInfo = CATEGORIES[cat] || CATEGORIES.Other;
              const isUp = data.change_pct > 10;
              const isDown = data.change_pct < -10;
              return (
                <View key={i} style={styles.trendRow}>
                  <View style={[styles.trendIcon, { backgroundColor: catInfo.color + '18' }]}>
                    <Ionicons name={catInfo.icon as any} size={16} color={catInfo.color} />
                  </View>
                  <Text style={styles.trendCat}>{cat}</Text>
                  <Text style={styles.trendAmount}>{'\u20B9'}{data.this_week.toFixed(0)}</Text>
                  {data.change_pct !== 0 && (
                    <View style={[styles.trendBadge, { backgroundColor: isUp ? COLORS.accent.moneyOut + '15' : isDown ? COLORS.accent.moneyIn + '15' : COLORS.bg.primary }]}>
                      <Ionicons
                        name={isUp ? 'arrow-up' : isDown ? 'arrow-down' : 'remove'}
                        size={12}
                        color={isUp ? COLORS.accent.moneyOut : isDown ? COLORS.accent.moneyIn : COLORS.text.muted}
                      />
                      <Text style={[styles.trendBadgeText, { color: isUp ? COLORS.accent.moneyOut : isDown ? COLORS.accent.moneyIn : COLORS.text.muted }]}>
                        {Math.abs(data.change_pct).toFixed(0)}%
                      </Text>
                    </View>
                  )}
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
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: COLORS.text.muted, marginBottom: SPACING.xxl },
  // Score
  scoreCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  scoreCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.lg },
  scoreValue: { fontSize: 30, fontWeight: '800' },
  scoreInfo: { flex: 1 },
  scoreLabel: { fontSize: 13, color: COLORS.text.muted, marginBottom: 4 },
  scoreGrade: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  scoreMiniBar: { height: 4, backgroundColor: COLORS.bg.primary, borderRadius: 2, overflow: 'hidden' },
  scoreMiniBarFill: { height: '100%', borderRadius: 2 },
  moodBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.md },
  moodText: { fontSize: 13, fontWeight: '600' },
  scoreFactors: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  factor: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  factorText: { fontSize: 12, color: COLORS.text.muted },
  // Alerts
  alertsSection: { marginBottom: SPACING.lg, gap: 8 },
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderLeftWidth: 3, borderWidth: 1, borderColor: COLORS.border.card },
  alertText: { flex: 1, fontSize: 13, color: COLORS.text.secondary, lineHeight: 19 },
  // AI card
  aiCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.warning + '20' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.warning + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.md },
  aiBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.accent.warning, letterSpacing: 0.8 },
  aiText: { fontSize: 15, color: COLORS.text.secondary, lineHeight: 23 },
  // Card
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary },
  cardSubtitle: { fontSize: 13, color: COLORS.text.muted, marginBottom: SPACING.lg },
  summaryText: { fontSize: 14, color: COLORS.text.secondary, lineHeight: 22 },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, marginTop: SPACING.md },
  trendText: { fontSize: 13, fontWeight: '600' },
  // Savings
  savingsText: { fontSize: 14, color: COLORS.text.secondary, lineHeight: 22 },
  // Pie
  pieWrap: { alignItems: 'center', marginBottom: SPACING.lg },
  pieCenter: { alignItems: 'center' },
  pieCenterAmount: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary },
  pieCenterLabel: { fontSize: 12, color: COLORS.text.muted },
  legend: { gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  legendText: { flex: 1, fontSize: 14, color: COLORS.text.secondary },
  legendAmount: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  // Recommendations
  recItem: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.md },
  recNum: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  recNumText: { fontSize: 13, fontWeight: '700' },
  recText: { flex: 1, fontSize: 14, color: COLORS.text.secondary, lineHeight: 21 },
  // Category Trends
  trendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  trendIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  trendCat: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text.primary },
  trendAmount: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary, marginRight: SPACING.sm },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  trendBadgeText: { fontSize: 12, fontWeight: '600' },
});
