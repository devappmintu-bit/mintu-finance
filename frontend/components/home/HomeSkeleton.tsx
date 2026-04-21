/**
 * HomeSkeleton — shimmer placeholder for the Home tab while data loads.
 *
 * Mirrors the Home layout:
 *   • Header (avatar + coins chip)
 *   • Primary balance card
 *   • Quick actions row (4 tiles)
 *   • 2 content cards (news + premium)
 *   • Transactions list (3 rows)
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Skeleton from '../ui/Skeleton';
import { COLORS } from '../../utils/theme';

export default function HomeSkeleton() {
  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Skeleton.Box w={120} h={16} radius={6} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton.Box w={70} h={28} radius={999} />
          <Skeleton.Circle size={36} />
        </View>
      </View>

      {/* Balance hero */}
      <Skeleton.Box w="100%" h={100} radius={20} style={{ marginTop: 18 }} />

      {/* Quick actions */}
      <View style={s.quickRow}>
        {[0, 1, 2, 3].map(i => <Skeleton.Box key={i} w={76} h={76} radius={16} />)}
      </View>

      {/* Two content cards */}
      <Skeleton.Box w="100%" h={140} radius={18} style={{ marginTop: 18 }} />
      <Skeleton.Box w="100%" h={100} radius={18} style={{ marginTop: 10 }} />

      {/* Transactions */}
      <Skeleton.Box w={140} h={14} radius={6} style={{ marginTop: 24 }} />
      {[0, 1, 2].map(i => (
        <View key={i} style={s.txnRow}>
          <Skeleton.Circle size={40} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton.Box w="60%" h={14} />
            <Skeleton.Box w="35%" h={10} />
          </View>
          <Skeleton.Box w={60} h={18} radius={6} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, backgroundColor: COLORS.bg.primary, flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
