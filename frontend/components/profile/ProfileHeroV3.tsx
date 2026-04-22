/**
 * ProfileHeroV3 — minimal, calm hero for the redesigned Profile.
 *
 * Design goals:
 *   • Flat card, subtle border, NO heavy gradient
 *   • Large Money Score as the focal point
 *   • Clean progress bar toward next tier
 *   • Single primary CTA: "Level Up"
 *
 * REMOVED from v2: Top X%, coins, streak, delta pill, dual CTAs.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  user: any;
  avatar?: string | null;
  onEditName: () => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
  onLevelUp: () => void;
}

type Tier = { label: string; next: string; min: number; max: number };

const TIERS: Tier[] = [
  { label: 'Just Starting', next: 'Growing Saver', min: 0, max: 40 },
  { label: 'Growing Saver', next: 'Smart Spender', min: 40, max: 60 },
  { label: 'Smart Spender', next: 'Elite Saver', min: 60, max: 80 },
  { label: 'Elite Saver', next: 'Wealth Master', min: 80, max: 100 },
];

function tierFor(score: number): Tier {
  return TIERS.find(t => score < t.max) || TIERS[TIERS.length - 1];
}

export default function ProfileHeroV3({
  user, avatar, onEditName, onPickAvatar, onRemoveAvatar, onLevelUp,
}: Props) {
  const s = useStyles();
  const score = user?.money_score || 0;
  const tier = tierFor(score);
  const pct = Math.min(100, Math.max(0, ((score - tier.min) / (tier.max - tier.min)) * 100));
  const pointsToNext = Math.max(0, tier.max - score);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <View style={s.card}>
      {/* Avatar + Name row */}
      <View style={s.headerRow}>
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

        <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{user?.name || 'User'}</Text>
          <Text style={s.phone} numberOfLines={1}>{user?.phone || '—'}</Text>
        </View>

        <TouchableOpacity style={s.editBtn} onPress={() => { haptic(); onEditName(); }} hitSlop={8}>
          <Ionicons name="create-outline" size={18} color={'#9CA3AF'} />
        </TouchableOpacity>
      </View>

      {/* Score block — focal point */}
      <View style={s.scoreBlock}>
        <View style={s.scoreRow}>
          <Text style={s.scoreValue}>{score}</Text>
          <Text style={s.scoreOf}>/ 100</Text>
        </View>
        <Text style={s.scoreLabel}>Money Score · {tier.label}</Text>

        {/* Progress bar */}
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>

        <Text style={s.nextTier}>
          {pointsToNext > 0
            ? `${pointsToNext} points to ${tier.next}`
            : `Top tier reached — keep it up`}
        </Text>
      </View>

      {/* Single primary CTA */}
      <TouchableOpacity style={s.cta} onPress={() => { haptic(); onLevelUp(); }} activeOpacity={0.88} testID="profile-level-up">
        <Text style={s.ctaText}>Level Up</Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border.subtle,
    marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', backgroundColor: c.bg.primary },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlace: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.primary },
  name: { fontSize: 17, fontWeight: '700', color: c.text.primary, letterSpacing: -0.2 },
  phone: { fontSize: 12.5, fontWeight: '500', color: c.text.muted, marginTop: 2 },
  editBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // Score block
  scoreBlock: { marginTop: 20, alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  scoreValue: { fontSize: 56, fontWeight: '800', color: c.text.primary, letterSpacing: -2 },
  scoreOf: { fontSize: 18, fontWeight: '600', color: c.text.muted, marginLeft: 4 },
  scoreLabel: { fontSize: 12.5, fontWeight: '600', color: c.text.secondary, marginTop: 2, letterSpacing: 0.2 },

  // Progress bar
  progressBar: { width: '100%', height: 6, borderRadius: 3, backgroundColor: c.bg.primary, marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: c.accent.primary, borderRadius: 3 },
  nextTier: { fontSize: 11.5, fontWeight: '600', color: c.text.muted, marginTop: 8 },

  // CTA
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.accent.primary,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 18,
  },
  ctaText: { fontSize: 14.5, fontWeight: '700', color: '#fff', letterSpacing: -0.1 },
}));
