import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import api from '../../utils/api';
import { BarChart } from 'react-native-gifted-charts';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const { user, setUser } = useAuthStore();
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      const [insightsRes, profileRes] = await Promise.all([
        api.get('/insights/daily'),
        api.get('/user/me'),
      ]);
      setInsights(insightsRes.data);
      setUser(profileRes.data);
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchInsights();
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return '#10B981';
    if (score >= 50) return '#F59E0B';
    return '#EF4444';
  };

  const getScoreMessage = (score: number) => {
    if (score >= 75) return 'Excellent!';
    if (score >= 50) return 'Good';
    return 'Needs Attention';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const chartData = Object.entries(insights?.spending_summary || {}).map(
    ([category, amount]: [string, any]) => ({
      value: amount,
      label: category.slice(0, 3),
      frontColor: '#4F46E5',
    })
  );

  const moneyScore = insights?.money_score || user?.money_score || 50;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name}!</Text>
            <Text style={styles.subtitle}>Here's your financial overview</Text>
          </View>
        </View>

        {/* Money Score Card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreHeader}>
            <View>
              <Text style={styles.scoreLabel}>Money Score</Text>
              <Text style={[styles.scoreStatus, { color: getScoreColor(moneyScore) }]}>
                {getScoreMessage(moneyScore)}
              </Text>
            </View>
            <View style={[styles.scoreCircle, { borderColor: getScoreColor(moneyScore) }]}>
              <Text style={[styles.scoreValue, { color: getScoreColor(moneyScore) }]}>
                {moneyScore}
              </Text>
            </View>
          </View>
          <View style={styles.scoreBar}>
            <View
              style={[
                styles.scoreBarFill,
                {
                  width: `${moneyScore}%`,
                  backgroundColor: getScoreColor(moneyScore),
                },
              ]}
            />
          </View>
        </View>

        {/* AI Insight */}
        {insights?.insight_text && (
          <View style={styles.insightCard}>
            <View style={styles.insightHeader}>
              <Ionicons name="bulb" size={24} color="#F59E0B" />
              <Text style={styles.insightTitle}>Today's Insight</Text>
            </View>
            <Text style={styles.insightText}>{insights.insight_text}</Text>
          </View>
        )}

        {/* Spending Chart */}
        {chartData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.cardTitle}>Spending by Category (Last 7 Days)</Text>
            <View style={styles.chartContainer}>
              <BarChart
                data={chartData}
                barWidth={32}
                spacing={24}
                roundedTop
                barBorderRadius={4}
                hideRules
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: '#64748B', fontSize: 10 }}
                noOfSections={3}
                maxValue={Math.max(...chartData.map((d) => d.value)) * 1.2}
                isAnimated
                animationDuration={500}
              />
            </View>
          </View>
        )}

        {/* Recommendations */}
        {insights?.recommendations && insights.recommendations.length > 0 && (
          <View style={styles.recommendationsCard}>
            <Text style={styles.cardTitle}>Smart Recommendations</Text>
            {insights.recommendations.map((rec: string, index: number) => (
              <View key={index} style={styles.recommendationItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.recommendationText}>{rec}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  scoreCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreLabel: {
    fontSize: 16,
    color: '#CBD5E1',
    marginBottom: 4,
  },
  scoreStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  scoreBar: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  insightCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  insightTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  insightText: {
    fontSize: 15,
    color: '#CBD5E1',
    lineHeight: 22,
  },
  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
  },
  recommendationsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: '#CBD5E1',
    marginLeft: 12,
    lineHeight: 20,
  },
});