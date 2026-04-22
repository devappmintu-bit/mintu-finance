/**
 * ProgressionStrip.tsx — Horizontal scroll summarising the user's
 * active progression loops: streak, badges, challenges.
 *
 * Shows three compact cards so the user can see at a glance "what am
 * I progressing on right now".
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  streak: number;
  streakTarget?: number;      // next streak milestone
  badgesEarned: number;
  badgesTotal: number;
  activeChallenges: number;
  challengeTitle?: string;
  onStreakPress?: () => void;
  onBadgesPress?: () => void;
  onChallengesPress?: () => void;
};

export default function ProgressionStrip({
  streak, streakTarget = 30, badgesEarned, badgesTotal,
  activeChallenges, challengeTitle,
  onStreakPress, onBadgesPress, onChallengesPress,
}: Props) {
  const streakPct = Math.min(100, (streak / Math.max(1, streakTarget)) * 100);
  const badgePct = badgesTotal > 0 ? Math.min(100, (badgesEarned / badgesTotal) * 100) : 0;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {/* STREAK */}
      <TouchableOpacity activeOpacity={0.9} onPress={onStreakPress}>
        <LinearGradient colors={['#F59E0B', '#F56E1E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.emoji}>🔥</Text>
            <Text style={s.title}>STREAK</Text>
          </View>
          <Text style={s.bigN}>{streak}<Text style={s.dayTxt}>d</Text></Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${streakPct}%`, backgroundColor: '#fff' }]} />
          </View>
          <Text style={s.subTxt}>Goal: {streakTarget}-day streak</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* BADGES */}
      <TouchableOpacity activeOpacity={0.9} onPress={onBadgesPress}>
        <LinearGradient colors={['#7C3AED', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.emoji}>🏅</Text>
            <Text style={s.title}>BADGES</Text>
          </View>
          <Text style={s.bigN}>{badgesEarned}<Text style={s.dayTxt}>/{badgesTotal}</Text></Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${badgePct}%`, backgroundColor: '#fff' }]} />
          </View>
          <Text style={s.subTxt}>Unlock more by saving</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* CHALLENGES */}
      <TouchableOpacity activeOpacity={0.9} onPress={onChallengesPress}>
        <LinearGradient colors={['#10B981', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.emoji}>⚡</Text>
            <Text style={s.title}>CHALLENGES</Text>
          </View>
          <Text style={s.bigN}>{activeChallenges}<Text style={s.dayTxt}>{activeChallenges === 1 ? ' active' : ' active'}</Text></Text>
          <Text style={[s.subTxt, { marginTop: 8 }]} numberOfLines={2}>
            {challengeTitle || 'Join a new challenge'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 10, paddingVertical: 4 },
  card: { width: 160, padding: 14, borderRadius: 18, gap: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 16 },
  title: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: 'rgba(255,255,255,0.9)' },
  bigN: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  dayTxt: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  subTxt: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
});
