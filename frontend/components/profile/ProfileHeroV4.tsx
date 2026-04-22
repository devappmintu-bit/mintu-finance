/**
 * ProfileHeroV4 — Living Financial Identity Engine.
 *
 * Upgrades over V3:
 *   • Avatar with status ring (green/orange/red — reflects savings health)
 *   • Score is TAPPABLE → opens ScoreBreakdownModal
 *   • Multi-milestone progress rail with animated dots
 *   • Predictive insight line ("Reach Wealth Builder in 9 days")
 *   • Next-unlock reward preview inline
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
  statusRing?: 'green' | 'orange' | 'red' | null;
  predictiveInsight?: string;
  nextReward?: { label: string; at: number } | null;
  onEditName: () => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
  onLevelUp: () => void;
  onTapScore: () => void;
}

const MILESTONES = [
  { at: 0,   emoji: '🌱', label: 'Just Starting' },
  { at: 40,  emoji: '⚡', label: 'Growing Saver' },
  { at: 60,  emoji: '💪', label: 'Smart Spender' },
  { at: 80,  emoji: '🏆', label: 'Elite Saver' },
  { at: 100, emoji: '👑', label: 'Wealth Master' },
];

const STATUS_COLOR = {
  green:  '#10B981',
  orange: '#F59E0B',
  red:    '#EF4444',
  none:   'rgba(255,255,255,0.25)',
} as const;

export default function ProfileHeroV4({
  user, avatar, statusRing, predictiveInsight, nextReward,
  onEditName, onPickAvatar, onRemoveAvatar, onLevelUp, onTapScore,
}: Props) {
  const score = user?.money_score || 0;
  const ringColor = STATUS_COLOR[statusRing || 'none'];

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  // Current tier + next tier
  let currentTier = MILESTONES[0];
  let nextTier = MILESTONES[1];
  for (let i = 0; i < MILESTONES.length - 1; i++) {
    if (score >= MILESTONES[i].at && score < MILESTONES[i + 1].at) {
      currentTier = MILESTONES[i];
      nextTier = MILESTONES[i + 1];
      break;
    }
    if (score >= 100) {
      currentTier = MILESTONES[MILESTONES.length - 1];
      nextTier = MILESTONES[MILESTONES.length - 1];
    }
  }

  return (
    <LinearGradient
      colors={['#F56E1E', '#C14A06']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.blob1} />
      <View style={s.blob2} />

      {/* Top row: tier pill + edit button */}
      <View style={s.topRow}>
        <View style={s.tierPill}>
          <Text style={s.tierEmoji}>{currentTier.emoji}</Text>
          <Text style={s.tierTxt}>{currentTier.label.toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={s.editBtn} onPress={() => { haptic(); onEditName(); }} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="create-outline" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Identity with status ring */}
      <View style={s.identity}>
        <TouchableOpacity
          onPress={() => { haptic(); onPickAvatar(); }}
          onLongPress={avatar ? onRemoveAvatar : undefined}
          style={[s.avatarRing, { borderColor: ringColor }]}
          activeOpacity={0.85}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlace}>
              <Image source={require('../../assets/images/mintu-logo.png')} style={s.avatar} />
            </View>
          )}
          {statusRing ? (
            <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[statusRing] }]} />
          ) : null}
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{user?.name || 'User'}</Text>
          <Text style={s.phone} numberOfLines={1}>{user?.phone || '—'}</Text>
        </View>
      </View>

      {/* Score — tappable */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => { haptic(); onTapScore(); }} style={s.scoreBlock}>
        <Text style={s.label}>MONEY SCORE · tap to break down</Text>
        <View style={s.amountRow}>
          <Text style={s.amount}>{score}</Text>
          <Text style={s.amountOf}>/ 100</Text>
          <View style={s.breakdownHint}>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
          </View>
        </View>

        {/* Multi-milestone rail */}
        <View style={s.rail}>
          {MILESTONES.map((m, i) => {
            const reached = score >= m.at;
            const pctPos = (m.at / 100) * 100;
            return (
              <View
                key={i}
                style={[
                  s.milestone,
                  { left: `${pctPos}%` },
                  reached && s.milestoneReached,
                ]}
              />
            );
          })}
          <View style={[s.progressFill, { width: `${Math.min(100, score)}%` }]} />
        </View>

        {predictiveInsight ? (
          <View style={s.predictive}>
            <Ionicons name="sparkles" size={11} color={'#FCD34D'} />
            <Text style={s.predictiveTxt} numberOfLines={1}>{predictiveInsight}</Text>
          </View>
        ) : null}

        {nextReward ? (
          <View style={s.rewardInline}>
            <Text style={s.rewardEmoji}>🎁</Text>
            <Text style={s.rewardTxt}>Unlock at {nextReward.at}: <Text style={{ fontWeight: '900' }}>{nextReward.label}</Text></Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Level Up CTA */}
      <TouchableOpacity style={s.cta} onPress={() => { haptic(); onLevelUp(); }} activeOpacity={0.85} testID="profile-level-up">
        <Ionicons name="rocket" size={14} color="#fff" />
        <Text style={s.ctaTxt}>Level up · {nextTier.label}</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 24, padding: 20, overflow: 'hidden', position: 'relative', marginBottom: 16, shadowColor: '#C14A06', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  blob1: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -50, left: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(0,0,0,0.08)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tierEmoji: { fontSize: 12 },
  tierTxt: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  avatarRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, overflow: 'visible', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarPlace: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  statusDot: { position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#C14A06' },
  name: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  phone: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.78)', marginTop: 1 },

  scoreBlock: { marginTop: 16 },
  label: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  amount: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },
  amountOf: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginLeft: 6 },
  breakdownHint: { marginLeft: 'auto', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, paddingHorizontal: 6, paddingVertical: 6 },

  rail: { height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.28)', position: 'relative', marginTop: 10, overflow: 'visible' },
  progressFill: { position: 'absolute', left: 0, top: 0, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.92)' },
  milestone: { position: 'absolute', top: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)', marginLeft: -4, borderWidth: 1.5, borderColor: '#C14A06' },
  milestoneReached: { backgroundColor: '#FCD34D' },

  predictive: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  predictiveTxt: { flex: 1, fontSize: 12, fontWeight: '700', color: '#FCD34D' },

  rewardInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  rewardEmoji: { fontSize: 12 },
  rewardTxt: { fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.88)' },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.22)', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999 },
  ctaTxt: { fontSize: 12.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});
