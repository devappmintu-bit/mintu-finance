/**
 * WeeklyChallengeCalm — tinted (8% orange) card, subtle, minimal.
 * Replaces the previous fully-saturated WeeklyChallenge.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  challenge?: { title?: string; description?: string; progress?: number; target?: number; reward_coins?: number } | null;
  onContinue: () => void;
}

export default function WeeklyChallengeCalm({ challenge, onContinue }: Props) {
  const s = useStyles();

  const title = challenge?.title || 'Save ₹500 this week';
  const desc = challenge?.description || 'Reduce spending vs last week';
  const progress = Number(challenge?.progress || 0);
  const target = Number(challenge?.target || 500);
  const pct = target > 0 ? Math.min(100, (progress / target) * 100) : 0;

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.label}>Weekly Challenge</Text>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.desc} numberOfLines={1}>{desc}</Text>
        </View>
        {challenge?.reward_coins ? (
          <View style={s.rewardPill}>
            <Text style={s.rewardTxt}>+{challenge.reward_coins}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>

      <View style={s.bottomRow}>
        <Text style={s.count}>{progress} / {target}</Text>
        <TouchableOpacity onPress={() => { haptic(); onContinue(); }} hitSlop={8} style={s.cta}>
          <Text style={s.ctaTxt}>Continue</Text>
          <Ionicons name="arrow-forward" size={12} color={'#F56E1E'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.accent.primary + '0F', // ~6% tint
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.accent.primary + '2E',
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  label: { fontSize: 10.5, fontWeight: '700', color: c.accent.primary, letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '700', color: c.text.primary, marginTop: 4, letterSpacing: -0.2 },
  desc: { fontSize: 12, fontWeight: '500', color: c.text.secondary, marginTop: 2 },
  rewardPill: { backgroundColor: c.accent.primary + '1F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rewardTxt: { fontSize: 11, fontWeight: '800', color: c.accent.primary },

  progressBar: { height: 6, borderRadius: 3, backgroundColor: c.accent.primary + '22', overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', backgroundColor: c.accent.primary, borderRadius: 3 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  count: { fontSize: 11, fontWeight: '600', color: c.text.muted },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ctaTxt: { fontSize: 12.5, fontWeight: '700', color: c.accent.primary },
}));
