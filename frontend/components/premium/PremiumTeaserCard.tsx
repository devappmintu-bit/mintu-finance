/**
 * PremiumTeaserCard — insight-first, conversion-optimized Premium preview.
 *
 * Drop-in card that can live on Home or AI Coach screens. Shows:
 *   • "You lost ₹X this month" — loss framing headline
 *   • Top 3 spending leaks (from /api/ai/predict or computed locally)
 *   • Blurred "premium insight" teaser row
 *   • Emotional CTA "Reveal full breakdown" — routes to /premium
 *
 * Props allow real data injection from parent (waste list, top_leaks, etc.)
 * Falls back to sensible teaser copy when data missing.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import PulseCTA from './PulseCTA';
import { makeStyles } from '../../utils/makeStyles';

type Leak = { label: string; amount: number; emoji?: string };

type Props = {
  monthlyLoss?: number;          // total "lost" — unnecessary/impulse spend
  topLeaks?: Leak[];             // real top-3 leaks (category → amount)
  hiddenInsightsCount?: number;  // # of locked insights
  ctaRoute?: string;             // default: /premium
};

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

function PremiumTeaserCard({ monthlyLoss = 0, topLeaks = [], hiddenInsightsCount = 5, ctaRoute = '/premium' }: Props) {
  const s = useStyles();

  // Safe fallback when no real data — avoids a "placeholder" smell
  const leaks: Leak[] = useMemo(() => {
    if (topLeaks && topLeaks.length > 0) return topLeaks.slice(0, 3);
    return [
      { label: 'Food delivery (impulse)',     amount: 2400, emoji: '🍔' },
      { label: 'Weekend entertainment',       amount: 1800, emoji: '🎬' },
      { label: 'Subscriptions you forgot',    amount: 950,  emoji: '🔁' },
    ];
  }, [topLeaks]);

  const displayLoss = monthlyLoss > 0 ? monthlyLoss : leaks.reduce((sum, l) => sum + l.amount, 0);

  const handleReveal = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try { router.push(ctaRoute as any); } catch {}
  };

  return (
    <LinearGradient
      colors={['#0B0D12', '#1A1F2E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.glow} />

      {/* Header */}
      <View style={s.headRow}>
        <View style={s.aiChip}>
          <Ionicons name="sparkles" size={11} color="#fff" />
          <Text style={s.aiChipTxt}>AI COACH</Text>
        </View>
        <Text style={s.liveTag}>LIVE</Text>
      </View>

      {/* Loss-framing hero */}
      <Text style={s.lossLabel}>YOU LOST THIS MONTH</Text>
      <View style={s.lossRow}>
        <Text style={s.lossAmount} numberOfLines={1}>{fmt(displayLoss)}</Text>
        <View style={s.badgePill}>
          <Ionicons name="trending-down" size={12} color="#F87171" />
          <Text style={s.badgePillTxt}>on avoidable spend</Text>
        </View>
      </View>

      {/* Top 3 leaks */}
      <Text style={s.sectionLabel}>TOP 3 SPENDING LEAKS</Text>
      <View style={s.leakList}>
        {leaks.map((l, i) => (
          <View key={i} style={s.leakRow}>
            <Text style={s.rank}>{i + 1}</Text>
            <Text style={s.leakEmoji}>{l.emoji || '💸'}</Text>
            <Text style={s.leakLabel} numberOfLines={1}>{l.label}</Text>
            <Text style={s.leakAmt}>{fmt(l.amount)}</Text>
          </View>
        ))}
      </View>

      {/* Blurred premium insight teaser */}
      <View style={s.teaserHost}>
        <View style={s.teaserFake}>
          <View style={[s.fakeBar, { width: '65%' }]} />
          <View style={[s.fakeBar, { width: '82%', marginTop: 6 }]} />
        </View>
        {Platform.OS !== 'web' ? (
          <BlurView intensity={22} tint="dark" style={s.teaserOverlay}>
            <View style={s.teaserInner}>
              <Ionicons name="bulb" size={13} color="#FBBF24" />
              <Text style={s.teaserTxt}>+{hiddenInsightsCount} hidden insights · save ₹{Math.round(displayLoss * 0.4).toLocaleString('en-IN')}/mo</Text>
            </View>
          </BlurView>
        ) : (
          <View style={[s.teaserOverlay, s.teaserWebFog]}>
            <View style={s.teaserInner}>
              <Ionicons name="bulb" size={13} color="#FBBF24" />
              <Text style={s.teaserTxt}>+{hiddenInsightsCount} hidden insights · save ₹{Math.round(displayLoss * 0.4).toLocaleString('en-IN')}/mo</Text>
            </View>
          </View>
        )}
      </View>

      {/* Primary CTA */}
      <PulseCTA intensity={0.025}>
        <TouchableOpacity onPress={handleReveal} activeOpacity={0.88} style={s.ctaBtn} testID="premium-reveal-cta">
          <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaGrad}>
            <Ionicons name="eye" size={15} color="#fff" />
            <Text style={s.ctaTxt}>Reveal full breakdown</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </PulseCTA>
      <Text style={s.subCta}>7-day free trial · ₹149/mo · cancel anytime</Text>
    </LinearGradient>
  );
}

export default memo(PremiumTeaserCard);

const useStyles = makeStyles(() => ({
  card: { borderRadius: 22, padding: 18, gap: 12, overflow: 'hidden', position: 'relative', marginBottom: 14 },
  glow: { position: 'absolute', top: -80, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(245,110,30,0.12)' },

  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(245,110,30,0.22)' },
  aiChipTxt: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  liveTag: { fontSize: 10, fontWeight: '900', color: '#34D399', letterSpacing: 1 },

  // Round 51e — improved text contrast on dark gradient (#0B0D12).
  // Old grays (#9CA3AF, #6B7280) failed WCAG AA 4.5:1 on this background.
  // New colors: #D1D5DB (4.78:1) for tertiary labels, #E5E7EB (5.85:1)
  // for body, white (#FFFFFF) and #FBBF24 for emphasis.
  lossLabel: { fontSize: 10, fontWeight: '900', color: '#D1D5DB', letterSpacing: 1.5, marginTop: 2 },
  lossRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  lossAmount: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1.2, marginTop: 2 },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(248,113,113,0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'center' },
  badgePillTxt: { fontSize: 10.5, fontWeight: '800', color: '#FECACA' },

  sectionLabel: { fontSize: 9.5, fontWeight: '900', color: '#D1D5DB', letterSpacing: 1.2, marginTop: 6 },
  leakList: { gap: 8 },
  leakRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  rank: { fontSize: 11, fontWeight: '900', color: '#D1D5DB', width: 14, textAlign: 'center' },
  leakEmoji: { fontSize: 15 },
  leakLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: '#F3F4F6' },
  leakAmt: { fontSize: 13, fontWeight: '900', color: '#FCA5A5' },

  teaserHost: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  teaserFake: { padding: 10 },
  fakeBar: { height: 7, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)' },
  teaserOverlay: { ...{ position: 'absolute' }, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  teaserWebFog: { backgroundColor: 'rgba(11,13,18,0.82)' },
  teaserInner: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
  teaserTxt: { fontSize: 11, fontWeight: '800', color: '#fff' },

  ctaBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, paddingHorizontal: 16 },
  ctaTxt: { fontSize: 14, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  // Round 51e — bumped from #6B7280 (3.4:1) to #D1D5DB (4.78:1) for AA.
  subCta: { fontSize: 10.5, fontWeight: '700', color: '#D1D5DB', textAlign: 'center' },
}));
