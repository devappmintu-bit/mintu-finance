import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES } from '../../utils/theme';
import { PieChart } from 'react-native-gifted-charts';

export default function InsightsScreen() {
  const [insights, setInsights] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      // Fetch stats first (fast), then insights (may be slow due to AI)
      const statsRes = await api.get('/stats/overview');
      setStats(statsRes.data);
      setLoading(false); // Show content as soon as stats load
      
      const insightsRes = await api.get('/insights/daily');
      setInsights(insightsRes.data);
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

        {/* Money Score Detail */}
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
          <View style={styles.scoreFactors}>
            <View style={styles.factor}>
              <Ionicons name="trending-down" size={16} color={COLORS.accent.moneyOut} />
              <Text style={styles.factorText}>Spending Ratio</Text>
            </View>
            <View style={styles.factor}>
              <Ionicons name="shield-checkmark" size={16} color={COLORS.accent.primary} />
              <Text style={styles.factorText}>Budget Adherence</Text>
            </View>
            <View style={styles.factor}>
              <Ionicons name="pulse" size={16} color={COLORS.accent.secondary} />
              <Text style={styles.factorText}>Consistency</Text>
            </View>
          </View>
        </View>

        {/* AI Insight */}
        {insights?.insight_text && (
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={14} color={COLORS.accent.warning} />
                <Text style={styles.aiBadgeText}>AI INSIGHT</Text>
              </View>
            </View>
            <Text style={styles.aiText}>{insights.insight_text}</Text>
          </View>
        )}

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
            {/* Category legend */}
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
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.lg },
  scoreValue: { fontSize: 32, fontWeight: '800' },
  scoreInfo: { flex: 1 },
  scoreLabel: { fontSize: 14, color: COLORS.text.muted, marginBottom: 4 },
  scoreGrade: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  scoreMiniBar: { height: 4, backgroundColor: COLORS.bg.primary, borderRadius: 2, overflow: 'hidden' },
  scoreMiniBarFill: { height: '100%', borderRadius: 2 },
  scoreFactors: { flexDirection: 'row', justifyContent: 'space-between' },
  factor: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factorText: { fontSize: 12, color: COLORS.text.muted },
  // AI card
  aiCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.warning + '20' },
  aiHeader: { marginBottom: SPACING.md },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.warning + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  aiBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.accent.warning, letterSpacing: 0.8 },
  aiText: { fontSize: 15, color: COLORS.text.secondary, lineHeight: 23 },
  // Card
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: COLORS.text.muted, marginBottom: SPACING.lg },
  // Pie
  pieWrap: { alignItems: 'center', marginBottom: SPACING.lg },
  pieCenter: { alignItems: 'center' },
  pieCenterAmount: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary },
  pieCenterLabel: { fontSize: 12, color: COLORS.text.muted },
  // Legend
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
});
