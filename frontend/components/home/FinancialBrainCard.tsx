/**
 * FinancialBrainCard — tabbed AI card merging Insight / Forecast / Waste.
 * Reduces doomscroll fatigue by consolidating 3 legacy cards into 1.
 */
import React, { memo, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AIInsightCard from './AIInsightCard';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';

type Props = { snapshot: any | null; stats: any | null; predict: any | null };
type TabKey = 'insight' | 'predict' | 'waste';

function FinancialBrainCard({ snapshot, stats, predict }: Props) {
  const s = useStyles();
  const hasPredict = !!(predict?.overspend_alerts?.length);
  const hasWaste = !!(predict?.waste_comparisons?.length);

  const tabs = useMemo(() => {
    const t: { key: TabKey; emoji: string; label: string }[] = [{ key: 'insight', emoji: '🧠', label: 'Insights' }];
    if (hasPredict) t.push({ key: 'predict', emoji: '🔮', label: 'Forecast' });
    if (hasWaste) t.push({ key: 'waste', emoji: '💸', label: 'Waste' });
    return t;
  }, [hasPredict, hasWaste]);

  const [tab, setTab] = useState<TabKey>('insight');

  const switchTab = (k: TabKey) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setTab(k);
  };

  const renderInsight = () => (
    <View style={{ marginHorizontal: -14, marginBottom: -14 }}>
      <AIInsightCard
        transactions={snapshot?.recent_transactions || []}
        totalSpend={Number(snapshot?.total_spend_month || snapshot?.mtd_spend || stats?.total_expense || 0)}
        savingsRate={Number(snapshot?.savings_rate || 0)}
        topCategory={snapshot?.top_category?.name}
        topCategoryAmount={Number(snapshot?.top_category?.amount || 0)}
        monthlyIncome={Number(snapshot?.monthly_income || snapshot?.mtd_income || stats?.total_income || 0)}
      />
    </View>
  );

  const renderPredict = () => (
    <View style={{ gap: 8 }}>
      {predict.overspend_alerts.slice(0, 3).map((a: any, i: number) => (
        <TouchableOpacity
          key={'ov' + i}
          style={[s.predictRow, a.severity === 'critical' && s.predictRowCrit]}
          onPress={() => router.push('/(tabs)/budget')}
          activeOpacity={0.75}
        >
          <Ionicons name={a.severity === 'critical' ? 'alert-circle' : 'warning'} size={17} color={a.severity === 'critical' ? '#EF4444' : '#F59E0B'} />
          <Text style={s.predictTxt} numberOfLines={2}>{a.message}</Text>
          <Ionicons name="chevron-forward" size={14} color="#6B7280" />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderWaste = () => (
    <View style={{ gap: 8 }}>
      {predict.waste_comparisons.slice(0, 3).map((w: any, i: number) => (
        <View key={'w' + i} style={s.wasteRow}>
          <Ionicons name={(w.icon as any) || 'cafe'} size={17} color="#C2410C" />
          <View style={{ flex: 1 }}>
            <Text style={s.wasteTitle}>{w.title}: ₹{Number(w.amount || 0).toLocaleString('en-IN')}</Text>
            <Text style={s.wasteSub} numberOfLines={2}>{w.comparison}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="hardware-chip" size={15} color={COLORS.accent.primary} />
        <Text style={s.heading}>FINANCIAL BRAIN</Text>
        <View style={s.aiPill}><Text style={s.aiPillTxt}>AI</Text></View>
      </View>
      {tabs.length > 1 && (
        <View style={s.tabRow}>
          {tabs.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => switchTab(t.key)} style={[s.tab, tab === t.key && s.tabActive]} activeOpacity={0.8}>
              <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.emoji} {t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {tab === 'insight' && renderInsight()}
      {tab === 'predict' && hasPredict && renderPredict()}
      {tab === 'waste' && hasWaste && renderWaste()}
    </View>
  );
}

export default memo(FinancialBrainCard);

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.bg.secondary, borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: c.border.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  heading: { flex: 1, fontSize: 11, fontWeight: '900', color: c.accent.primary, letterSpacing: 1.1 },
  aiPill: { backgroundColor: c.accent.primary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  aiPillTxt: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  tabRow: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: '#F3F4F6', borderRadius: 12, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabTxt: { fontSize: 11.5, fontWeight: '700', color: '#6B7280' },
  tabTxtActive: { color: '#111827', fontWeight: '800' },
  predictRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFFBEB', borderRadius: 11, borderWidth: 1, borderColor: '#FDE68A' },
  predictRowCrit: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  predictTxt: { flex: 1, fontSize: 12.5, color: '#111827', fontWeight: '600', lineHeight: 17 },
  wasteRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFF7ED', borderRadius: 11, borderLeftWidth: 3, borderLeftColor: c.accent.primary },
  wasteTitle: { fontSize: 13, fontWeight: '800', color: '#C2410C' },
  wasteSub: { fontSize: 11.5, color: '#78350F', marginTop: 2, lineHeight: 16 },
}));
