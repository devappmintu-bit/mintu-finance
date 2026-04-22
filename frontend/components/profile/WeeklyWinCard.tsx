/**
 * WeeklyWinCard — square, branded "share-ready" card used for viral loops.
 *
 * Designed to be captured via react-native-view-shot and shared to
 * WhatsApp / Instagram Stories / Twitter. Dimensions are fixed (1080-ish
 * via style scale) so the output image looks identical regardless of the
 * screen size it was rendered on.
 *
 * Visual language:
 *   • Signature MintU orange gradient
 *   • Hero percent / delta stat (huge)
 *   • This-week vs last-week mini bars (proof)
 *   • Tier badge + motivational tagline
 *   • Footer with MintU logo + "try it free" CTA and URL
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

export type WinKind = 'saved_more' | 'cut_spend' | 'streak' | 'tier_up' | 'neutral';

export interface WeeklyWinCardProps {
  userName?: string;
  kind: WinKind;
  /** Hero number (percent or amount). */
  heroValue: string;
  /** Eyebrow label above the hero number. */
  heroLabel: string;
  /** Supporting tagline below hero. */
  tagline: string;
  /** Optional mini bar comparison. */
  thisWeek?: { label: string; amount: number };
  lastWeek?: { label: string; amount: number };
  /** Tier pill (e.g. "Growing Saver ⚡"). */
  tier?: string;
  /** Money score — shown subtly in footer if present. */
  score?: number;
}

const KIND_META: Record<WinKind, { emoji: string; accent: string }> = {
  saved_more: { emoji: '🚀', accent: '#FCD34D' },
  cut_spend:  { emoji: '✂️', accent: '#FCD34D' },
  streak:     { emoji: '🔥', accent: '#FCD34D' },
  tier_up:    { emoji: '👑', accent: '#FCD34D' },
  neutral:    { emoji: '📊', accent: '#FCD34D' },
};

/**
 * Card renders at a fixed 360x360 logical-pixel square. react-native-view-shot
 * will up-scale via its `result: 'data-uri'` + `format: 'png'` options.
 */
const CARD_W = 360;
const CARD_H = 360;

export default function WeeklyWinCard({
  userName, kind, heroValue, heroLabel, tagline,
  thisWeek, lastWeek, tier, score,
}: WeeklyWinCardProps) {
  const meta = KIND_META[kind];

  const thisVal = Math.round(Number(thisWeek?.amount || 0));
  const lastVal = Math.round(Number(lastWeek?.amount || 0));
  const maxVal = Math.max(thisVal, lastVal, 1);
  const thisPct = (thisVal / maxVal) * 100;
  const lastPct = (lastVal / maxVal) * 100;

  const inr = (n: number) => {
    const v = Math.round(Math.abs(n));
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000)   return `₹${(v / 1000).toFixed(1)}K`;
    return `₹${v.toLocaleString('en-IN')}`;
  };

  return (
    <LinearGradient
      colors={['#F56E1E', '#C14A06']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      {/* Decorative blobs for depth */}
      <View style={s.blob1} />
      <View style={s.blob2} />
      <View style={s.blob3} />

      {/* Top row: MintU logo + tier */}
      <View style={s.topRow}>
        <View style={s.logoWrap}>
          <Image source={require('../../assets/images/mintu-logo.png')} style={s.logo} contentFit="contain" />
          <Text style={s.brand}>MintU</Text>
        </View>
        {tier ? (
          <View style={s.tierPill}>
            <Text style={s.tierTxt}>{tier}</Text>
          </View>
        ) : null}
      </View>

      {/* Hero section */}
      <View style={s.hero}>
        <Text style={s.eyebrow}>{heroLabel.toUpperCase()}</Text>
        <View style={s.heroRow}>
          <Text style={s.heroEmoji}>{meta.emoji}</Text>
          <Text style={s.heroValue} numberOfLines={1}>{heroValue}</Text>
        </View>
        <Text style={s.tagline} numberOfLines={2}>{tagline}</Text>
      </View>

      {/* Mini comparison bars — proof */}
      {thisWeek && lastWeek ? (
        <View style={s.compareBlock}>
          <View style={s.barRow}>
            <Text style={s.barLbl}>{lastWeek.label}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFillDim, { width: `${lastPct}%` }]} />
            </View>
            <Text style={s.barVal}>{inr(lastVal)}</Text>
          </View>
          <View style={s.barRow}>
            <Text style={[s.barLbl, { color: '#fff', fontWeight: '800' }]}>{thisWeek.label}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${thisPct}%`, backgroundColor: meta.accent }]} />
            </View>
            <Text style={[s.barVal, { color: meta.accent, fontWeight: '900' }]}>{inr(thisVal)}</Text>
          </View>
        </View>
      ) : null}

      {/* Footer: user attribution + CTA */}
      <View style={s.footer}>
        <View style={{ flex: 1 }}>
          <Text style={s.footerHint}>{userName ? `${userName} on MintU` : 'Tracked on MintU'}</Text>
          {typeof score === 'number' ? (
            <Text style={s.footerSmall}>Money Score · {score}/100</Text>
          ) : null}
        </View>
        <View style={s.ctaPill}>
          <Ionicons name="sparkles" size={11} color="#C14A06" />
          <Text style={s.ctaTxt}>Try MintU free</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 28, padding: 22, overflow: 'hidden', position: 'relative',
    backgroundColor: '#F56E1E',
  },
  blob1: { position: 'absolute', top: -60, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)' },
  blob2: { position: 'absolute', bottom: -70, left: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.08)' },
  blob3: { position: 'absolute', top: 80, left: -30, width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.06)' },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 24, height: 24, borderRadius: 6 },
  brand: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  tierPill: { backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tierTxt: { fontSize: 10.5, fontWeight: '900', color: '#fff', letterSpacing: 0.4 },

  hero: { marginTop: 18 },
  eyebrow: { fontSize: 10.5, fontWeight: '900', color: 'rgba(255,255,255,0.85)', letterSpacing: 1.4 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  heroEmoji: { fontSize: 32 },
  heroValue: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -2, flexShrink: 1 },
  tagline: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.92)', marginTop: 6, letterSpacing: -0.2, lineHeight: 17 },

  compareBlock: { marginTop: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, padding: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLbl: { width: 72, fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  barFillDim: { height: '100%', backgroundColor: 'rgba(255,255,255,0.45)' },
  barFill: { height: '100%' },
  barVal: { width: 60, textAlign: 'right', fontSize: 11.5, fontWeight: '700', color: '#fff' },

  footer: {
    position: 'absolute', left: 22, right: 22, bottom: 18,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  footerHint: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  footerSmall: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  ctaPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  ctaTxt: { fontSize: 11, fontWeight: '900', color: '#C14A06', letterSpacing: -0.1 },
});

/**
 * Helper: turn a weekly-comparison payload into WeeklyWinCard props.
 */
export function deriveWin(input: {
  userName?: string;
  score?: number;
  tierLabel?: string;
  pctBetter: number;
  thisWeek: { saved: number; expense: number; txn_count: number } | null;
  lastWeek: { saved: number; expense: number; txn_count: number } | null;
  rewardBadge?: string | null;
}): WeeklyWinCardProps {
  const { pctBetter, thisWeek, lastWeek, userName, score, tierLabel, rewardBadge } = input;
  const savedDelta = (thisWeek?.saved || 0) - (lastWeek?.saved || 0);
  const spentDelta = (thisWeek?.expense || 0) - (lastWeek?.expense || 0);

  let kind: WinKind = 'neutral';
  let heroValue = '—';
  let heroLabel = 'THIS WEEK';
  let tagline = 'Tracking my money with MintU';

  if (rewardBadge && /tier|level|rank/i.test(rewardBadge)) {
    kind = 'tier_up';
    heroValue = `Level Up`;
    heroLabel = 'UNLOCKED';
    tagline = `Earned the ${rewardBadge} badge this week 🎉`;
  } else if (savedDelta > 0 && (thisWeek?.saved || 0) > 0) {
    kind = 'saved_more';
    heroValue = `+${inrCompact(savedDelta)}`;
    heroLabel = 'SAVED VS LAST WEEK';
    tagline = savedDelta >= 5000 ? 'Biggest savings week yet 💪' : 'My future self is already proud 😎';
  } else if (spentDelta < 0 && Math.abs(pctBetter) > 0) {
    kind = 'cut_spend';
    heroValue = `${Math.abs(Math.round(pctBetter))}% less`;
    heroLabel = 'CUT FROM SPENDING';
    tagline = 'Kept the wallet chill this week ✂️';
  } else if (pctBetter > 0) {
    kind = 'cut_spend';
    heroValue = `${Math.round(pctBetter)}% better`;
    heroLabel = 'THAN LAST WEEK';
    tagline = 'Small wins compound — still going 🔥';
  } else {
    kind = 'neutral';
    heroValue = inrCompact(thisWeek?.expense || 0);
    heroLabel = 'SPENT THIS WEEK';
    tagline = 'Holding steady — tracking every rupee 📊';
  }

  return {
    userName,
    kind,
    heroValue,
    heroLabel,
    tagline,
    thisWeek: thisWeek ? { label: 'This week', amount: thisWeek.expense } : undefined,
    lastWeek: lastWeek ? { label: 'Last week', amount: lastWeek.expense } : undefined,
    tier: tierLabel,
    score,
  };
}

function inrCompact(n: number): string {
  const v = Math.round(Math.abs(n));
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
}
