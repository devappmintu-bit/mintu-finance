/**
 * PremiumComparison — plan-wise feature comparison for MintU Premium.
 *
 * Round 53o refactor (Apr 29 2026) — decision-focused redesign.
 *
 * Was: horizontally-scrolling 13-row matrix with verbose feature labels.
 * Now: 4 grouped sections (AI & Insights / Automation / Premium perks /
 * Guarantee), no horizontal scroll (fits 390px phone width), with active
 * + selected tier column highlight wired in.
 *
 * Highlight rules (per user spec):
 *   • Before purchase: highlight `selectedTier` (subtle outline).
 *   • After purchase:  highlight `activeTier`   (solid tint).
 *   • If both exist:    active = solid, selected = subtle outline.
 *
 * India-Hack 3-paid-tier ladder (all monthly, capped ≤ ₹150):
 *   • Micro    — ₹29  "Why not?"
 *   • Standard — ₹99  "Useful"           ← best-seller
 *   • Premium  — ₹149 "Upgrade my life"  ← top tier
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';
import PulseCTA from './PulseCTA';

type Plan = 'intro' | 'monthly' | 'yearly';
type Cell = boolean | string;
type Row  = { label: string; intro: Cell; monthly: Cell; yearly: Cell };
type Section = { title: string; rows: Row[] };

const COLS: { id: Plan; title: string; price: string; sub: string; badge?: string; tint: string }[] = [
  { id: 'intro',   title: 'Micro',    price: '₹29',  sub: 'Why not?',           tint: '#FFB300' },
  { id: 'monthly', title: 'Standard', price: '₹99',  sub: 'Useful',             badge: 'BEST', tint: COLORS.accent.brand },
  { id: 'yearly',  title: 'Premium',  price: '₹149', sub: 'Upgrade life',       badge: 'TOP',  tint: '#8B5CF6' },
];

// Trimmed for scannability. Grouped so users can mentally filter by need.
const SECTIONS: Section[] = [
  {
    title: 'AI & Insights',
    rows: [
      { label: 'Unlimited AI Coach',     intro: true, monthly: true, yearly: true },
      { label: '30-day insights',        intro: true, monthly: true, yearly: true },
      { label: 'Waste detector',         intro: true, monthly: true, yearly: true },
    ],
  },
  {
    title: 'Automation',
    rows: [
      { label: 'Auto-categorisation',    intro: false, monthly: true, yearly: true },
      { label: 'Tax calculator + ITR',   intro: false, monthly: true, yearly: true },
      { label: 'Investment / SIP planner', intro: false, monthly: true, yearly: true },
      { label: 'Yearly dashboard',       intro: false, monthly: true, yearly: true },
    ],
  },
  {
    title: 'Premium perks',
    rows: [
      { label: 'Priority AI responses',  intro: false, monthly: false, yearly: true },
      { label: 'Custom reports (PDF)',   intro: false, monthly: false, yearly: true },
      { label: 'Ad-free experience',     intro: false, monthly: false, yearly: true },
      { label: 'Exclusive badges',       intro: false, monthly: false, yearly: true },
      { label: 'Money School lessons',   intro: false, monthly: false, yearly: true },
    ],
  },
  {
    title: 'Guarantee',
    rows: [
      { label: 'Money-back',             intro: '7-day', monthly: '15-day', yearly: '30-day' },
    ],
  },
];

type Props = {
  onClose?: () => void;
  /** The tier the user has actively subscribed to. Solid highlight. */
  activeTier?: Plan | null;
  /** The tier the user is browsing/selecting (pre-purchase). Subtle outline. */
  selectedTier?: Plan | null;
  /** Tap on a column header to re-select the tier in the parent. */
  onPickTier?: (p: Plan) => void;
};

export default function PremiumComparison({ onClose, activeTier, selectedTier, onPickTier }: Props) {
  const s = useStyles();

  const isActive   = (p: Plan) => activeTier === p;
  const isSelected = (p: Plan) => selectedTier === p && !isActive(p);

  const colHeaderStyle = (p: Plan, tint: string) => [
    s.colHead,
    { borderTopColor: tint },
    isActive(p)   && [s.colHeadActive,   { backgroundColor: tint + '22', borderColor: tint }],
    isSelected(p) && [s.colHeadSelected, { borderColor: tint }],
  ];

  const cellStyle = (p: Plan, tint: string) => [
    s.cell,
    isActive(p)   && { backgroundColor: tint + '12' },
    isSelected(p) && { backgroundColor: tint + '07' },
  ];

  return (
    <View style={s.wrap}>
      {/* Hero */}
      <LinearGradient colors={[COLORS.accent.brand, COLORS.accent.brandDark]} style={s.hero}>
        <View style={s.heroTop}>
          <Ionicons name="diamond" size={16} color="#fff" />
          <Text style={s.heroTitle}>Compare plans</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="comparison-close">
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.heroSub}>All monthly · ≤ ₹150 · Cancel anytime</Text>
      </LinearGradient>

      {/* Column header — fits without horizontal scroll on 360px+ phones */}
      <View style={s.headRow}>
        <View style={s.rowLabelHead} />
        {COLS.map(c => (
          <TouchableOpacity
            key={c.id}
            style={colHeaderStyle(c.id, c.tint)}
            onPress={() => onPickTier?.(c.id)}
            activeOpacity={onPickTier ? 0.7 : 1}
            disabled={!onPickTier}
            testID={`comparison-col-${c.id}`}
          >
            {c.badge && (
              <View style={[s.planBadge, { backgroundColor: c.tint }]}>
                <Text style={s.planBadgeTxt}>{c.badge}</Text>
              </View>
            )}
            <Text style={s.colTitle}>{c.title}</Text>
            <Text style={[s.colPrice, { color: c.tint }]}>{c.price}</Text>
            <Text style={s.colSub} numberOfLines={1}>{c.sub}</Text>
            {isActive(c.id) && (
              <PulseCTA intensity={0.04}>
                <View style={[s.yourPlanPill, { backgroundColor: c.tint }]}>
                  <Text style={s.yourPlanPillTxt}>YOUR PLAN</Text>
                </View>
              </PulseCTA>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Sections */}
      {SECTIONS.map((sec, si) => (
        <View key={si}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionHeaderTxt}>{sec.title}</Text>
          </View>
          {sec.rows.map((f, i) => (
            <View key={i} style={[s.featRow, i % 2 === 1 && s.featRowAlt]}>
              <View style={s.rowLabel}>
                <Text style={s.rowLabelTxt} numberOfLines={2}>{f.label}</Text>
              </View>
              {COLS.map(c => (
                <View key={c.id} style={cellStyle(c.id, c.tint)}>
                  {typeof f[c.id] === 'boolean'
                    ? <Ionicons
                        name={f[c.id] ? 'checkmark-circle' : 'remove-circle-outline'}
                        size={17}
                        color={f[c.id] ? COLORS.state.successAlt : COLORS.text.muted}
                      />
                    : <Text style={s.cellTxt} numberOfLines={1}>{String(f[c.id])}</Text>}
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}

      <Text style={s.fineprint}>
        Prices include GST. Cancel anytime from Profile → Subscriptions.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: c.bg.card,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },

  hero: { paddingHorizontal: 14, paddingVertical: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  heroSub: { color: '#FFE4CC', fontSize: 10.5, marginTop: 4, fontWeight: '600' },
  closeBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  // Column header row — fixed widths, no horizontal scroll.
  // 110 (label) + 80*3 (cols) = 350px, fits 360+ phones.
  headRow: {
    flexDirection: 'row',
    backgroundColor: c.bg.elevated,
    borderBottomWidth: 1.5,
    borderBottomColor: c.border.subtle,
  },
  rowLabelHead: { width: 110, paddingHorizontal: 10 },
  colHead: {
    width: 80,
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: 'center',
    borderTopWidth: 3,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginHorizontal: 1,
  },
  colHeadActive:   { borderWidth: 1.5 },
  colHeadSelected: { borderWidth: 1.5, borderStyle: 'dashed' as const },
  planBadge: {
    position: 'absolute',
    top: -1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
  },
  planBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  colTitle: { fontSize: 11, fontWeight: '800', color: c.text.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  colPrice: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  colSub: { fontSize: 9.5, color: c.text.muted, fontWeight: '700', marginTop: 1 },

  yourPlanPill: {
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  yourPlanPillTxt: { color: '#fff', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 },

  // Section grouping headers (e.g. "AI & Insights")
  sectionHeader: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: c.bg.card,
  },
  sectionHeaderTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: c.accent.primary,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },

  featRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
  },
  featRowAlt: { backgroundColor: c.bg.elevated },
  rowLabel: { width: 110, paddingHorizontal: 12 },
  rowLabelTxt: { fontSize: 12, color: c.text.primary, fontWeight: '600', lineHeight: 16 },
  cell: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    marginHorizontal: 1,
  },
  cellTxt: { fontSize: 10.5, fontWeight: '800', color: c.accent.brand },

  fineprint: {
    fontSize: 10,
    color: c.text.muted,
    textAlign: 'center' as const,
    fontStyle: 'italic' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
}));
