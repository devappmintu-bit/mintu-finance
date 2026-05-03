/**
 * components/rewards/NextMilestone.tsx — Round 73.
 *
 * Replaces the empty badges placeholder with a contextual
 * "next milestone preview" card showing the closest still-locked
 * badge + what's needed to unlock. Backend computes the gap; this
 * component just renders.
 *
 * Layout: locked-badge icon (ghosted, with shimmer) + name +
 * gap-to-unlock copy + tiny progress hint.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '../../utils/theme';

interface Milestone {
  badge_id: string;
  name: string;
  icon: string;
  needed: number;
  unit: string;
  copy: string;
}

export default function NextMilestone({ milestone }: { milestone: Milestone | null }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  if (!milestone) return null;

  const tx = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-30, 30] });

  return (
    <View style={styles.card}>
      <View style={styles.kickerRow}>
        <View style={styles.kickerDot} />
        <Text style={styles.kicker}>NEXT MILESTONE</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <View style={[styles.iconBg, { backgroundColor: 'rgba(15,23,42,0.06)' }]}>
            <Ionicons name={(milestone.icon as any) || 'ribbon'} size={26} color={COLORS.text.muted} />
          </View>
          <Animated.View
            style={[
              styles.shimmer,
              { transform: [{ translateX: tx }] },
            ]}
            pointerEvents="none"
          />
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={9} color="#FFFFFF" />
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{milestone.name}</Text>
          <Text style={styles.copy} numberOfLines={2}>{milestone.copy}</Text>
          <View style={styles.gapPill}>
            <Ionicons name="flash" size={11} color={COLORS.accent.primary} />
            <Text style={styles.gapTxt}>
              {milestone.needed} more {milestone.unit}{milestone.needed === 1 ? '' : 's'} to unlock
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    gap: 12,
  },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.accent.primary,
  },
  kicker: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.4,
    color: COLORS.text.muted,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 56, height: 56,
    overflow: 'hidden',
    borderRadius: 0,
    position: 'relative',
  },
  iconBg: {
    width: 56, height: 56, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  shimmer: {
    position: 'absolute',
    top: 0, bottom: 0, width: 30,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  lockBadge: {
    position: 'absolute',
    bottom: 2, right: 2,
    width: 18, height: 18, borderRadius: 0,
    backgroundColor: COLORS.text.muted,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  name: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  copy: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  gapPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.accent.brandSoft,
    marginTop: 6,
  },
  gapTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent.primaryDark,
    letterSpacing: 0.1,
  },
});
