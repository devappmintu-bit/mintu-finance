/**
 * ProfileSkeleton — polished loading state for the Profile tab.
 *
 * Round 58 — Updated to mirror the new glass-card hierarchy
 * (Identity / MoneyScore / Boost carousel) instead of the legacy
 * orange gradient hero. Keeps the user oriented while data loads.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Skeleton from '../ui/Skeleton';
import { makeStyles } from '../../utils/makeStyles';
import { GLASS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  wrap: { padding: 16, gap: 14 },
  card: {
    backgroundColor: GLASS.solidBg,
    borderRadius: 0, padding: 18,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 0,
    backgroundColor: c.gray[200],
  },
  segmentRow: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.gray[200] },
  row: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, height: 150, borderRadius: 0 },
  bigCard: { height: 120, borderRadius: 0 },
}));

export default function ProfileSkeleton() {
  const s = useStyles();
  return (
    <View style={s.wrap} accessibilityLabel="Loading profile">
      {/* Identity card placeholder */}
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <View style={s.avatar} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton.Line w="60%" />
          <Skeleton.Line w="40%" />
          <Skeleton.Line w="35%" />
        </View>
      </View>

      {/* Money score card placeholder */}
      <View style={s.card}>
        <Skeleton.Line w="40%" />
        <View style={{ height: 16 }} />
        <Skeleton.Box h={56} radius={8} />
        <View style={{ height: 16 }} />
        <View style={s.segmentRow}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={s.segment} />
          ))}
        </View>
        <View style={{ height: 16 }} />
        <Skeleton.Line w="80%" />
        <View style={{ height: 18 }} />
        <Skeleton.Box h={44} radius={12} />
      </View>

      {/* Boost carousel placeholder — three stub cards */}
      <View style={s.row}>
        <Skeleton.Box style={s.tile} />
        <Skeleton.Box style={s.tile} />
      </View>

      <Skeleton.Box style={s.bigCard} />
      <Skeleton.Box style={s.bigCard} />
    </View>
  );
}

