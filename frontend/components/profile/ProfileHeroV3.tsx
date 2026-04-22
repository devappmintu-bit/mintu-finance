/**
 * ProfileHeroV3 — signature saffron-gradient hero, matched with
 * BalanceHero / Budget / Transactions heroes (brand continuity).
 *
 * Design notes:
 *   • Uses the exact same LinearGradient(#F56E1E → #C14A06) and
 *     decorative blobs used across the app's other tab heroes.
 *   • Clean hierarchy: avatar+name, tier pill, big Money Score,
 *     progress bar to next tier, single "Level Up" CTA chip.
 *   • No Top X%, delta, coins or extra CTAs — kept minimal as per
 *     the v3 brief.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface Props {
  user: any;
  avatar?: string | null;
  onEditName: () => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
  onLevelUp: () => void;
}

type Tier = { label: string; next: string; emoji: string; min: number; max: number };

const TIERS: Tier[] = [
  { label: 'Just Starting', next: 'Growing Saver', emoji: '🌱', min: 0, max: 40 },
  { label: 'Growing Saver', next: 'Smart Spender', emoji: '⚡', min: 40, max: 60 },
  { label: 'Smart Spender', next: 'Elite Saver', emoji: '💪', min: 60, max: 80 },
  { label: 'Elite Saver', next: 'Wealth Master', emoji: '🏆', min: 80, max: 100 },
];

function tierFor(score: number): Tier {
  return TIERS.find(t => score < t.max) || TIERS[TIERS.length - 1];
}

export default function ProfileHeroV3({
  user, avatar, onEditName, onPickAvatar, onRemoveAvatar, onLevelUp,
}: Props) {
  const score = user?.money_score || 0;
  const tier = tierFor(score);
  const pct = Math.min(100, Math.max(0, ((score - tier.min) / (tier.max - tier.min)) * 100));
  const pointsToNext = Math.max(0, tier.max - score);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <LinearGradient
      colors={['#F56E1E', '#C14A06']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.blob1} />
      <View style={s.blob2} />

      {/* Top row: tier pill (left) + edit button (right) */}
      <View style={s.topRow}>
        <View style={s.tierPill}>
          <Text style={s.tierEmoji}>{tier.emoji}</Text>
          <Text style={s.tierTxt}>{tier.label.toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={s.editBtn} onPress={() => { haptic(); onEditName(); }} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="create-outline" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Identity: avatar + name */}
      <View style={s.identity}>
        <TouchableOpacity
          onPress={() => { haptic(); onPickAvatar(); }}
          onLongPress={avatar ? onRemoveAvatar : undefined}
          style={s.avatarWrap}
          activeOpacity={0.85}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlace}>
              <Image source={require('../../assets/images/mintu-logo.png')} style={s.avatar} />
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{user?.name || 'User'}</Text>
          <Text style={s.phone} numberOfLines={1}>{user?.phone || '—'}</Text>
        </View>
      </View>

      {/* Score block */}
      <Text style={s.label}>MONEY SCORE</Text>
      <View style={s.amountRow}>
        <Text style={s.amount}>{score}</Text>
        <Text style={s.amountOf}>/ 100</Text>
      </View>

      {/* Progress bar */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>

      <Text style={s.sub} numberOfLines={1}>
        {pointsToNext > 0
          ? `${pointsToNext} points to ${tier.next}`
          : 'Top tier reached — keep it up'}
      </Text>

      {/* Level Up CTA chip */}
      <TouchableOpacity
        style={s.cta}
        onPress={() => { haptic(); onLevelUp(); }}
        activeOpacity={0.85}
        testID="profile-level-up"
      >
        <Ionicons name="rocket" size={14} color="#fff" />
        <Text style={s.ctaTxt}>Level up</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
    shadowColor: '#C14A06', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  blob1: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -50, left: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(0,0,0,0.08)' },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tierEmoji: { fontSize: 12 },
  tierTxt: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  avatarWrap: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)', padding: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlace: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  name: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  phone: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.78)', marginTop: 1 },

  label: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 1, marginTop: 16, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  amount: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },
  amountOf: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginLeft: 6 },

  progressBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.28)', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  sub: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.88)', marginTop: 8 },

  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 999,
  },
  ctaTxt: { fontSize: 12.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});
