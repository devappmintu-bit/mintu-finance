/**
 * PremiumComparison — MintU vs Others feature-comparison table.
 *
 * Matches the Kiwi Neon-style "Benefits" reference screenshot:
 *  | Feature                | MintU  |  Others |
 *  | AI Coach               |   ✓    |    ✗    |
 *  | Tax Calculator         |   ✓    |    ✗    |
 *  ...
 * Two headline stats at the top (Members / Savings).
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type Row = { label: string; mintu: boolean | string; others: boolean | string };

const BENEFITS: Row[] = [
  { label: 'Personalised AI Coach (GPT-5.2)', mintu: true, others: false },
  { label: 'Deep analytics reports (PDF)', mintu: true, others: false },
  { label: 'Auto-categorisation via AI', mintu: true, others: false },
  { label: 'Tax calculator (New vs Old regime)', mintu: true, others: 'Basic' },
  { label: 'Investment / SIP suggester', mintu: true, others: false },
  { label: 'Money School lessons', mintu: true, others: false },
  { label: 'Split bills with friends', mintu: true, others: true },
  { label: 'Recurring & custom budgets', mintu: true, others: 'Paid' },
  { label: 'Shareable score card', mintu: true, others: false },
  { label: 'Ad-free experience', mintu: true, others: false },
  { label: 'Multi-device sync', mintu: true, others: true },
  { label: 'Priority human support', mintu: true, others: false },
];

type Props = { onClose?: () => void };

export default function PremiumComparison({ onClose }: Props) {
  return (
    <View style={s.wrap}>
      {/* Hero */}
      <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.hero}>
        <View style={s.heroTop}>
          <Ionicons name="diamond" size={20} color="#fff" />
          <Text style={s.heroTitle}>Why MintU Premium?</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="comparison-close">
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statVal}>1,000+</Text>
            <Text style={s.statLbl}>Smart savers</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Text style={s.statVal}>₹38k</Text>
            <Text style={s.statLbl}>Avg yearly saving</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Text style={s.statVal}>4.7 ★</Text>
            <Text style={s.statLbl}>User rating</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Table header */}
      <View style={s.tblHeaderRow}>
        <Text style={[s.tblHeadTxt, { flex: 2, textAlign: 'left' }]}>Feature</Text>
        <Text style={s.tblHeadMintu}>MintU</Text>
        <Text style={s.tblHeadTxt}>Others</Text>
      </View>

      {/* Table rows */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {BENEFITS.map((r, i) => (
          <View key={i} style={[s.tblRow, i % 2 === 1 && s.tblRowAlt]}>
            <Text style={[s.tblCell, { flex: 2, textAlign: 'left' }]} numberOfLines={2}>{r.label}</Text>
            <View style={s.tblCellMintu}>
              {typeof r.mintu === 'boolean'
                ? <Ionicons name={r.mintu ? 'checkmark-circle' : 'close-circle'} size={20} color={r.mintu ? '#10B981' : '#EF4444'} />
                : <Text style={s.partialMintu}>{r.mintu}</Text>}
            </View>
            <View style={s.tblCellOthers}>
              {typeof r.others === 'boolean'
                ? <Ionicons name={r.others ? 'checkmark-circle' : 'close-circle'} size={20} color={r.others ? '#10B981' : '#EF4444'} />
                : <Text style={s.partialOthers}>{r.others}</Text>}
            </View>
          </View>
        ))}
        <Text style={s.fineprint}>
          Comparison based on publicly available free-tier features of typical Indian personal-finance apps.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#fff' },

  hero: { padding: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: 10, marginTop: 12 },
  stat: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 4 },
  statVal: { color: '#fff', fontSize: 17, fontWeight: '800' },
  statLbl: { color: '#FFE4CC', fontSize: 10, fontWeight: '600', marginTop: 2 },

  tblHeaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: '#F56E1E' },
  tblHeadTxt: { flex: 1, fontSize: 11, fontWeight: '800', color: '#78350F', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },
  tblHeadMintu: { flex: 1, fontSize: 12, fontWeight: '800', color: '#F56E1E', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },

  tblRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tblRowAlt: { backgroundColor: '#FAFAF9' },
  tblCell: { flex: 1, fontSize: 13, color: '#111', textAlign: 'center' },
  tblCellMintu: { flex: 1, alignItems: 'center' },
  tblCellOthers: { flex: 1, alignItems: 'center' },
  partialMintu: { fontSize: 12, color: '#F56E1E', fontWeight: '700' },
  partialOthers: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },

  fineprint: { fontSize: 10, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic', padding: 12 },
});
