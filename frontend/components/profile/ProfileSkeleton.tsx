/**
 * ProfileSkeleton — polished loading state for the Profile tab.
 *
 * Mirrors the live layout (orange hero + progress row + missions + sections)
 * so the layout doesn't shift when real data lands. Shimmer animation via
 * existing <Skeleton> primitives. Uses the signature MintU orange gradient
 * so the skeleton feels on-brand, not generic.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Skeleton from '../ui/Skeleton';
import { COLORS } from '../../utils/theme';

export default function ProfileSkeleton() {
  return (
    <View style={s.wrap} accessibilityLabel="Loading profile">
      {/* Hero — orange gradient placeholder with avatar + score */}
      <LinearGradient
        colors={['#F56E1E', '#C14A06']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={s.tierRow}>
          <View style={s.tierPill} />
          <View style={s.editBtn} />
        </View>

        {/* Avatar circle */}
        <View style={s.avatar} />
        <View style={s.name} />
        <View style={s.phone} />

        {/* Score label + amount */}
        <View style={s.scoreBlock}>
          <View style={s.scoreLabel} />
          <View style={s.scoreNum} />
          <View style={s.scoreRail} />
        </View>

        <View style={s.ctaPill} />
      </LinearGradient>

      {/* Missions card */}
      <View style={s.card}>
        <Skeleton.Line w="55%" />
        <View style={{ height: 14 }} />
        <Skeleton.Line w="90%" />
        <View style={{ height: 10 }} />
        <Skeleton.Line w="80%" />
        <View style={{ height: 18 }} />
        <Skeleton.Box h={44} radius={12} />
      </View>

      {/* Progress row */}
      <View style={s.row}>
        <Skeleton.Box style={s.tile} />
        <Skeleton.Box style={s.tile} />
        <Skeleton.Box style={s.tile} />
      </View>

      {/* Beat Last Week + AI Coach */}
      <Skeleton.Box style={s.bigCard} />
      <Skeleton.Box style={s.bigCard} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 16 },

  hero: { borderRadius: 24, padding: 20, gap: 10 },
  tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tierPill: { width: 110, height: 22, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)' },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.15)' },
  avatar: {
    alignSelf: 'center', width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)',
    marginTop: 4,
  },
  name: { alignSelf: 'center', width: 120, height: 18, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 12 },
  phone: { alignSelf: 'center', width: 90, height: 12, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 6 },
  scoreBlock: { marginTop: 16 },
  scoreLabel: { width: 180, height: 10, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  scoreNum: { width: 80, height: 42, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 6 },
  scoreRail: { height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.2)', marginTop: 12 },
  ctaPill: { alignSelf: 'center', width: 160, height: 36, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.2)', marginTop: 10 },

  card: { backgroundColor: COLORS.bg.secondary, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border.subtle },
  row: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, height: 70, borderRadius: 14 },
  bigCard: { height: 140, borderRadius: 16 },
});
