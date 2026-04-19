import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';
import Toast from 'react-native-toast-message';

type Challenge = {
  id: string;
  title: string;
  desc: string;
  category?: string | null;
  target_days?: number;
  target_amount?: number;
  target_count?: number;
};

export default function WeeklyChallenge({
  challenge: challengeProp,
  streak = 0,
}: {
  challenge?: Challenge | null;
  streak?: number;
}) {
  const [challenge, setChallenge] = useState<Challenge | null>(challengeProp || null);
  const [joined, setJoined] = useState(false);
  const [progress, setProgress] = useState({ current: 0, target: 1 });

  useEffect(() => {
    if (challengeProp) {
      setChallenge(challengeProp);
      computeProgress(challengeProp);
    } else if (!challenge) {
      // If not passed, fetch from API
      api
        .get('/gamification/status')
        .then((r) => {
          if (r.data?.weekly_challenge) {
            setChallenge(r.data.weekly_challenge);
            computeProgress(r.data.weekly_challenge);
          }
        })
        .catch(() => {});
    }
  }, [challengeProp]);

  const computeProgress = (c: Challenge) => {
    // Derive "target" from whichever key is set
    const target = c.target_days || c.target_count || c.target_amount || 7;
    // Use streak as a stand-in for "days engaged" — gives visible progress that grows
    const current = Math.min(target, Math.max(0, streak || 0));
    setProgress({ current, target });
  };

  const handleJoin = () => {
    setJoined(true);
    Toast.show({
      type: 'success',
      text1: '🔥 Challenge joined!',
      text2: "You're in! Complete it to earn +50 coins",
      position: 'bottom',
    });
  };

  // Fallback challenge if API failed / not yet loaded — ensures we always show the UI.
  const effectiveChallenge: Challenge = challenge || {
    id: 'save_500',
    title: 'Save ₹500 this week',
    desc: 'Reduce spending by ₹500 vs last week',
    target_amount: 500,
  };

  const pct = Math.min(100, Math.round((progress.current / Math.max(progress.target, 1)) * 100));
  const done = pct >= 100;

  return (
    <LinearGradient
      colors={done ? [COLORS.accent.moneyIn, '#1B5E20'] : [COLORS.accent.primaryLight, COLORS.accent.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.topRow}>
        <View style={s.badge}>
          <Ionicons name="flash" size={12} color="#fff" />
          <Text style={s.badgeText}>WEEKLY CHALLENGE</Text>
        </View>
        <View style={s.rewardPill}>
          <Ionicons name="star" size={12} color="#FCD34D" />
          <Text style={s.rewardText}>+50 coins</Text>
        </View>
      </View>

      <Text style={s.title}>{effectiveChallenge.title}</Text>
      <Text style={s.desc}>{effectiveChallenge.desc}</Text>

      {/* Progress */}
      <View style={s.progressRow}>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.progressText}>
          {progress.current}/{progress.target}
        </Text>
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[s.cta, joined && s.ctaJoined]}
        onPress={handleJoin}
        activeOpacity={0.8}
        disabled={joined}
      >
        <Ionicons
          name={done ? 'trophy' : joined ? 'checkmark-circle' : 'rocket'}
          size={16}
          color={done || joined ? '#10B981' : '#6366F1'}
        />
        <Text style={[s.ctaText, (done || joined) && { color: '#10B981' }]}>
          {done ? 'Completed!' : joined ? 'In Progress…' : 'Join Challenge'}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    gap: 10,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  rewardText: { fontSize: 10, fontWeight: '800', color: '#FCD34D', letterSpacing: 0.3 },
  title: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 6 },
  desc: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#FCD34D', borderRadius: 999 },
  progressText: { fontSize: 12, fontWeight: '800', color: '#fff', minWidth: 36, textAlign: 'right' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 12,
    marginTop: 4,
  },
  ctaJoined: { backgroundColor: 'rgba(255,255,255,0.95)' },
  ctaText: { fontSize: 14, fontWeight: '800', color: COLORS.accent.primary, letterSpacing: 0.3 },
});
