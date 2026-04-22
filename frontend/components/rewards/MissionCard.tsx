/**
 * MissionCard.tsx — Daily mission row.
 *
 * States:
 *   • Incomplete: progress bar + emoji + title + reward badge.
 *   • Complete (not claimed): pulsing "Claim" button.
 *   • Claimed: muted with ✓ badge.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

type Mission = {
  id: string;
  title: string;
  emoji: string;
  target: number;
  progress: number;
  progress_pct: number;
  completed: boolean;
  claimed: boolean;
  reward_coins: number;
  reward_xp: number;
};

type Props = {
  mission: Mission;
  onClaim?: (id: string) => Promise<void> | void;
  submitting?: boolean;
};

export default function MissionCard({ mission, onClaim, submitting }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!mission.completed || mission.claimed) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [mission.completed, mission.claimed, pulse]);

  const handle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClaim && onClaim(mission.id);
  };

  const isClaimable = mission.completed && !mission.claimed;

  return (
    <View style={[s.card, mission.claimed && s.cardClaimed]}>
      <View style={[s.emojiPill, mission.claimed && { backgroundColor: '#E5E7EB' }]}>
        <Text style={s.emoji}>{mission.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, mission.claimed && { color: '#9CA3AF' }]} numberOfLines={1}>{mission.title}</Text>
        <View style={s.metaRow}>
          <View style={s.track}>
            <LinearGradient
              colors={mission.claimed ? ['#D1D5DB', '#9CA3AF'] : mission.completed ? ['#10B981', '#059669'] : ['#F59E0B', '#F56E1E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.fill, { width: `${Math.max(2, mission.progress_pct)}%` }]}
            />
          </View>
          <Text style={s.progTxt}>
            {mission.progress}/{mission.target}
          </Text>
        </View>
        <View style={s.rewardRow}>
          <View style={s.rewardChip}>
            <Text style={s.rewardTxt}>🪙 +{mission.reward_coins}</Text>
          </View>
          <View style={[s.rewardChip, { backgroundColor: '#EDE9FE' }]}>
            <Text style={[s.rewardTxt, { color: '#6D28D9' }]}>⭐ +{mission.reward_xp} XP</Text>
          </View>
        </View>
      </View>
      <View style={s.cta}>
        {mission.claimed ? (
          <View style={[s.btn, { backgroundColor: '#E5E7EB' }]}>
            <Ionicons name="checkmark" size={18} color="#9CA3AF" />
          </View>
        ) : isClaimable ? (
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <TouchableOpacity onPress={handle} disabled={submitting} activeOpacity={0.85} testID={`claim-${mission.id}`}>
              <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.claimBtn}>
                <Text style={s.claimTxt}>{submitting ? '…' : 'Claim'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={[s.btn, { backgroundColor: '#F3F4F6' }]}>
            <Text style={s.pendingTxt}>{Math.max(0, mission.target - mission.progress)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  cardClaimed: { opacity: 0.55 },
  emojiPill: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  title: { fontSize: 13, fontWeight: '800', color: '#111827' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#F3F4F6', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  progTxt: { fontSize: 10, fontWeight: '900', color: '#6B7280', minWidth: 28, textAlign: 'right' },
  rewardRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  rewardChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: '#FEF3C7' },
  rewardTxt: { fontSize: 9.5, fontWeight: '800', color: '#92400E' },
  cta: { alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  btn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pendingTxt: { fontSize: 13, fontWeight: '900', color: '#9CA3AF' },
  claimBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, shadowColor: '#10B981', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  claimTxt: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.4 },
});
