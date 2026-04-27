/**
 * PremiumComparison — plan-wise feature comparison for MintU Premium.
 *
 * India-Hack 3-paid-tier ladder (all monthly, capped ≤ ₹150):
 *   • Micro    — ₹29  "Why not?"
 *   • Standard — ₹99  "Useful"           ← best-seller
 *   • Premium  — ₹149 "Upgrade my life"  ← top tier
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';

type Plan = 'intro' | 'monthly' | 'yearly';
type Row = { label: string; intro: boolean | string; monthly: boolean | string; yearly: boolean | string };

const COLS: { id: Plan; title: string; price: string; sub: string; badge?: string; tint: string }[] = [
  { id: 'intro',   title: 'Micro',    price: '₹29',  sub: 'Why not?',            tint: '#FFB300' },
  { id: 'monthly', title: 'Standard', price: '₹99',  sub: 'Useful',               badge: 'BEST VALUE', tint: COLORS.accent.brand },
  { id: 'yearly',  title: 'Premium',  price: '₹149', sub: "Upgrade my life",      badge: 'TOP', tint: '#8B5CF6' },
];

// Feature matrix — Micro is the lean "taste of Premium", Standard fills utility,
// Premium is the full aspirational kit.
const FEATURES: Row[] = [
  { label: 'Personalised AI Coach (GPT-5.2)',  intro: true,  monthly: true,  yearly: true },
  { label: 'Unlimited AI messages',            intro: true,  monthly: true,  yearly: true },
  { label: '30-day insights + Waste detector', intro: true,  monthly: true,  yearly: true },
  { label: 'Auto-categorisation via AI',       intro: false, monthly: true,  yearly: true },
  { label: 'Tax calculator + ITR export',      intro: false, monthly: true,  yearly: true },
  { label: 'Investment / SIP planner',         intro: false, monthly: true,  yearly: true },
  { label: 'Yearly dashboard + Reports',       intro: false, monthly: true,  yearly: true },
  { label: 'Priority AI responses',            intro: false, monthly: false, yearly: true },
  { label: 'Custom reports (PDF)',             intro: false, monthly: false, yearly: true },
  { label: 'Ad-free experience',               intro: false, monthly: false, yearly: true },
  { label: 'Exclusive badges + Early access',  intro: false, monthly: false, yearly: true },
  { label: 'Money School lessons',             intro: false, monthly: false, yearly: true },
  { label: 'Money-back guarantee',             intro: '7-day', monthly: '15-day', yearly: '30-day' },
];

type Props = { onClose?: () => void };

export default function PremiumComparison({ onClose }: Props) {
  const s = useStyles();
  return (
    <View style={s.wrap}>
      {/* Hero */}
      <LinearGradient colors={[COLORS.accent.brand, COLORS.accent.brandDark]} style={s.hero}>
        <View style={s.heroTop}>
          <Ionicons name="diamond" size={18} color="#fff" />
          <Text style={s.heroTitle}>Pick your Premium plan</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="comparison-close">
              <Ionicons name="close" size={15} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.heroSub}>All tiers monthly · Hard-capped at ₹150. No annual lock-ins. Cancel anytime.</Text>
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
              {(['intro', 'monthly', 'yearly'] as const).map((p) => (
                <View key={p} style={s.cell}>
                  {typeof f[p] === 'boolean'
                    ? <Ionicons name={f[p] ? 'checkmark-circle' : 'close-circle'} size={18} color={f[p] ? COLORS.state.successAlt : COLORS.text.muted} />
                    : <Text style={s.cellTxt} numberOfLines={1}>{String(f[p])}</Text>}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={s.fineprint}>
        Prices include GST. All tiers billed monthly. Cancel anytime from Profile → Subscriptions.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#fff' },

  hero: { padding: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },
  heroSub: { color: '#FFE4CC', fontSize: 11, marginTop: 6 },
  closeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  colScroll: { maxWidth: '100%' },

  headRow: { flexDirection: 'row', backgroundColor: '#FFF7ED', borderBottomWidth: 2, borderBottomColor: COLORS.accent.brand },
  rowLabelHead: { width: 120, padding: 12, justifyContent: 'center' },
  rowLabelHeadTxt: { fontSize: 10, fontWeight: '800', color: '#78350F', textTransform: 'uppercase', letterSpacing: 0.6 },
  colHead: { width: 110, padding: 12, alignItems: 'center', borderTopWidth: 3, position: 'relative' },
  planBadge: { position: 'absolute', top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  planBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  colTitle: { fontSize: 11, fontWeight: '800', color: '#111', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 },
  colPrice: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  colSub: { fontSize: 10, color: COLORS.text.muted, fontWeight: '600', marginTop: 2 },

  featRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  featRowAlt: { backgroundColor: '#FAFAF9' },
  rowLabel: { width: 120, paddingHorizontal: 12 },
  rowLabelTxt: { fontSize: 12, color: '#111', fontWeight: '600' },
  cell: { width: 110, alignItems: 'center', justifyContent: 'center' },
  cellTxt: { fontSize: 11, fontWeight: '700', color: COLORS.accent.brand },

  fineprint: { fontSize: 10, color: COLORS.text.muted, textAlign: 'center', fontStyle: 'italic', padding: 12 },
}));
