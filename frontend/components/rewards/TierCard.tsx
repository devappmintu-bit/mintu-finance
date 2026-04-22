/**
 * TierCard.tsx — Progression tier card (Bronze → Platinum).
 *
 * Shows:
 *   • Current tier badge + colour
 *   • XP bar showing progress to next tier
 *   • "Next tier unlocks" perks teaser
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Tier = {
  id: string;
  name: string;
  color: string;
  xp: number;
  xp_to_next: number;
  progress_pct: number;
  perks: string[];
  next_tier?: { id: string; name: string; color: string; min_xp: number; perks?: string[] } | null;
};

const TIER_EMOJI: Record<string, string> = {
  bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎',
};

const TIER_GRADIENTS: Record<string, [string, string]> = {
  bronze: ['#CD7F32', '#92400E'],
  silver: ['#E5E7EB', '#9CA3AF'],
  gold: ['#FCD34D', '#F59E0B'],
  platinum: ['#C4B5FD', '#7C3AED'],
};

export default function TierCard({ tier }: { tier: Tier }) {
  const gradient = TIER_GRADIENTS[tier.id] || TIER_GRADIENTS.bronze;
  const emoji = TIER_EMOJI[tier.id] || '🥉';

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.blob} />
      <View style={s.row}>
        <View style={s.badge}>
          <Text style={s.emoji}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.topRow}>
            <Text style={s.tierName}>{tier.name.toUpperCase()}</Text>
            <Text style={s.xpBadge}>{tier.xp} XP</Text>
          </View>
          {tier.next_tier ? (
            <>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.max(2, Math.min(100, tier.progress_pct))}%` }]} />
              </View>
              <Text style={s.nextTxt}>
                <Ionicons name="trophy" size={10} color="rgba(255,255,255,0.95)" />
                {'  '}{tier.xp_to_next} XP to {tier.next_tier.name}
              </Text>
            </>
          ) : (
            <Text style={s.maxTxt}>👑 Max tier reached — you're a legend</Text>
          )}
        </View>
      </View>
      {!!tier.perks?.length && (
        <View style={s.perksRow}>
          {tier.perks.slice(0, 3).map((p, i) => (
            <View key={i} style={s.perkChip}>
              <Ionicons name="checkmark-circle" size={10} color="#fff" />
              <Text style={s.perkTxt}>{p}</Text>
            </View>
          ))}
        </View>
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: { padding: 14, borderRadius: 20, gap: 10, overflow: 'hidden', position: 'relative', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  blob: { position: 'absolute', top: -50, right: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  emoji: { fontSize: 28 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  tierName: { fontSize: 14, fontWeight: '900', color: '#fff', letterSpacing: 1.2 },
  xpBadge: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.95)', backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  track: { height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  nextTxt: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.95)', marginTop: 6 },
  maxTxt: { fontSize: 11, fontWeight: '800', color: '#fff', marginTop: 4 },
  perksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  perkChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  perkTxt: { fontSize: 9.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});
