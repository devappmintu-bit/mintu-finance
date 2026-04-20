/**
 * PremiumComparison — plan-wise feature comparison for MintU Premium.
 *
 * Three columns (Monthly / Yearly / Lifetime) with:
 *   • Price header + savings badge
 *   • 12-row feature matrix — every row is "✓" because Premium tiers all
 *     include every feature; the distinction is the commitment + savings
 *   • Perks that only Lifetime unlocks (exclusive Legend badge + free upgrades)
 *   • Bottom CTA that scrolls the caller back to the plan-picker
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type Plan = 'monthly' | 'yearly' | 'lifetime';
type Row = { label: string; monthly: boolean | string; yearly: boolean | string; lifetime: boolean | string };

const COLS: { id: Plan; title: string; price: string; sub: string; badge?: string; tint: string }[] = [
  { id: 'monthly', title: 'Monthly', price: '₹99', sub: '/month', tint: '#3B82F6' },
  { id: 'yearly',  title: 'Yearly',  price: '₹899', sub: '/year', badge: 'SAVE 24%', tint: '#F56E1E' },
  { id: 'lifetime', title: 'Lifetime', price: '₹2,999', sub: 'one time', badge: 'BEST', tint: '#8B5CF6' },
];

// All 12 premium features — same across tiers; commitment determines price.
const FEATURES: Row[] = [
  { label: 'Personalised AI Coach (GPT-5.2)', monthly: true, yearly: true, lifetime: true },
  { label: 'Deep analytics reports (PDF)',    monthly: true, yearly: true, lifetime: true },
  { label: 'Auto-categorisation via AI',      monthly: true, yearly: true, lifetime: true },
  { label: 'Tax calculator + ITR export',     monthly: true, yearly: true, lifetime: true },
  { label: 'Investment / SIP planner',        monthly: true, yearly: true, lifetime: true },
  { label: 'Money School lessons',            monthly: true, yearly: true, lifetime: true },
  { label: 'Recurring & custom budgets',      monthly: true, yearly: true, lifetime: true },
  { label: 'Shareable score cards',           monthly: true, yearly: true, lifetime: true },
  { label: 'Ad-free experience',              monthly: true, yearly: true, lifetime: true },
  { label: 'Multi-device sync',               monthly: true, yearly: true, lifetime: true },
  { label: 'Priority human support',          monthly: true, yearly: true, lifetime: true },
  { label: 'Exclusive Legend badge',          monthly: false, yearly: false, lifetime: 'LEGEND' },
  { label: 'Free lifetime updates',           monthly: false, yearly: false, lifetime: true },
  { label: 'Money-back guarantee',            monthly: '7-day', yearly: '30-day', lifetime: '60-day' },
  { label: 'Effective monthly cost',          monthly: '₹99', yearly: '₹75', lifetime: '₹42' },
];

type Props = { onClose?: () => void };

export default function PremiumComparison({ onClose }: Props) {
  return (
    <View style={s.wrap}>
      {/* Hero */}
      <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.hero}>
        <View style={s.heroTop}>
          <Ionicons name="diamond" size={18} color="#fff" />
          <Text style={s.heroTitle}>Pick your Premium plan</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="comparison-close">
              <Ionicons name="close" size={15} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.heroSub}>All tiers unlock the same 11 core features. Pick the commitment that fits.</Text>
      </LinearGradient>

      {/* Column header — horizontally scrollable for 3 columns */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.colScroll}>
        <View>
          {/* Price header row */}
          <View style={s.headRow}>
            <View style={s.rowLabelHead}><Text style={s.rowLabelHeadTxt}>Feature</Text></View>
            {COLS.map(c => (
              <View key={c.id} style={[s.colHead, { borderTopColor: c.tint }]}>
                {c.badge && (
                  <View style={[s.planBadge, { backgroundColor: c.tint }]}>
                    <Text style={s.planBadgeTxt}>{c.badge}</Text>
                  </View>
                )}
                <Text style={s.colTitle}>{c.title}</Text>
                <Text style={[s.colPrice, { color: c.tint }]}>{c.price}</Text>
                <Text style={s.colSub}>{c.sub}</Text>
              </View>
            ))}
          </View>

          {/* Feature rows */}
          {FEATURES.map((f, i) => (
            <View key={i} style={[s.featRow, i % 2 === 1 && s.featRowAlt]}>
              <View style={s.rowLabel}>
                <Text style={s.rowLabelTxt} numberOfLines={2}>{f.label}</Text>
              </View>
              {(['monthly', 'yearly', 'lifetime'] as const).map((p) => (
                <View key={p} style={s.cell}>
                  {typeof f[p] === 'boolean'
                    ? <Ionicons name={f[p] ? 'checkmark-circle' : 'close-circle'} size={18} color={f[p] ? '#10B981' : '#9CA3AF'} />
                    : <Text style={s.cellTxt} numberOfLines={1}>{String(f[p])}</Text>}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={s.fineprint}>
        Prices include GST. Subscriptions auto-renew until cancelled. Lifetime is a one-time payment.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#fff' },

  hero: { padding: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },
  heroSub: { color: '#FFE4CC', fontSize: 11, marginTop: 6 },
  closeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  colScroll: { maxWidth: '100%' },

  headRow: { flexDirection: 'row', backgroundColor: '#FFF7ED', borderBottomWidth: 2, borderBottomColor: '#F56E1E' },
  rowLabelHead: { width: 120, padding: 12, justifyContent: 'center' },
  rowLabelHeadTxt: { fontSize: 10, fontWeight: '800', color: '#78350F', textTransform: 'uppercase', letterSpacing: 0.6 },
  colHead: { width: 110, padding: 12, alignItems: 'center', borderTopWidth: 3, position: 'relative' },
  planBadge: { position: 'absolute', top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  planBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  colTitle: { fontSize: 11, fontWeight: '800', color: '#111', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 },
  colPrice: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  colSub: { fontSize: 10, color: '#6B7280', fontWeight: '600', marginTop: 2 },

  featRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  featRowAlt: { backgroundColor: '#FAFAF9' },
  rowLabel: { width: 120, paddingHorizontal: 12 },
  rowLabelTxt: { fontSize: 12, color: '#111', fontWeight: '600' },
  cell: { width: 110, alignItems: 'center', justifyContent: 'center' },
  cellTxt: { fontSize: 11, fontWeight: '700', color: '#F56E1E' },

  fineprint: { fontSize: 10, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic', padding: 12 },
});
