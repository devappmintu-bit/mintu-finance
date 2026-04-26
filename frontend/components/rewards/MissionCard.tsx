/**
 * MissionCard.tsx — Daily mission row.
 *
 * States:
 *   • Incomplete: progress bar + emoji + title + reward badge.
 *   • Complete (not claimed): pulsing "Claim" button.
 *   • Claimed: muted with ✓ badge.
 *
 * Round 50 — migrated to makeStyles + useAppColors. Status-driven
 * progress gradients (orange/green/gray) are semantic and stay literal
 * because each represents a state that must read consistently in
 * light + dark themes ("green = complete" everywhere).
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { useAppColors } from '../../utils/theme';

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

// Status-driven gradients — semantic, theme-independent
const PROG_GRAD_INCOMPLETE: readonly [string, string] = ['#F59E0B', '#F56E1E'];
const PROG_GRAD_COMPLETE:   readonly [string, string] = ['#10B981', '#059669'];
const PROG_GRAD_CLAIMED:    readonly [string, string] = ['#D1D5DB', '#9CA3AF'];
const CLAIM_BTN_GRAD:       readonly [string, string] = ['#10B981', '#059669'];

export default function MissionCard({ mission, onClaim, submitting }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!mission.completed || mission.claimed) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [mission.completed, mission.claimed, pulse]);

  const handle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { /* noop */ });
    onClaim && onClaim(mission.id);
  };

  const isClaimable = mission.completed && !mission.claimed;
  const progGradient = mission.claimed ? PROG_GRAD_CLAIMED : mission.completed ? PROG_GRAD_COMPLETE : PROG_GRAD_INCOMPLETE;

  return (
    <View style={[s.card, mission.claimed && s.cardClaimed]}>
      <View style={[s.emojiPill, mission.claimed && { backgroundColor: c.gray[200] }]}>
        <Text style={s.emoji}>{mission.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, mission.claimed && { color: c.gray[400] }]} numberOfLines={1}>{mission.title}</Text>
        <View style={s.metaRow}>
          <View style={s.track}>
            <LinearGradient
              colors={progGradient}
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
          <View style={s.rewardChipPurple}>
            <Text style={s.rewardTxtPurple}>⭐ +{mission.reward_xp} XP</Text>
          </View>
        </View>
      </View>
      <View style={s.cta}>
        {mission.claimed ? (
          <View style={s.btnMuted}>
            <Ionicons name="checkmark" size={20} color={c.gray[400]} />
          </View>
        ) : isClaimable ? (
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <TouchableOpacity onPress={handle} disabled={submitting} activeOpacity={0.85} testID={`claim-${mission.id}`}>
              <LinearGradient colors={CLAIM_BTN_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.claimBtn}>
                <Text style={s.claimTxt}>{submitting ? '…' : 'Claim'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={s.btnFaint}>
            <Text style={s.pendingTxt}>{Math.max(0, mission.target - mission.progress)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: c.bg.elevated, borderRadius: 16, borderWidth: 1, borderColor: c.gray[100] },
  cardClaimed: { opacity: 0.55 },
  emojiPill: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  title: { fontSize: 13, fontWeight: '800', color: c.text.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  track: { flex: 1, height: 4, borderRadius: 4, backgroundColor: c.gray[100], overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  progTxt: { fontSize: 11, fontWeight: '900', color: c.text.muted, minWidth: 28, textAlign: 'right' },
  rewardRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rewardChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FEF3C7' },
  rewardChipPurple: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#EDE9FE' },
  rewardTxt: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  rewardTxtPurple: { fontSize: 11, fontWeight: '800', color: '#6D28D9' },
  cta: { alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  btnMuted: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.gray[200] },
  btnFaint: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.gray[100] },
  pendingTxt: { fontSize: 13, fontWeight: '900', color: c.gray[400] },
  claimBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, shadowColor: '#10B981', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  claimTxt: { fontSize: 12, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.4 },
}));
