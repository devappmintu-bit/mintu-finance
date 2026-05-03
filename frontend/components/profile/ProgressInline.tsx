/**
 * ProgressInline — single minimal row merging Streak · Badges · Coins.
 * Replaces the previous 3-card horizontal ProgressionStrip.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import AnimatedStreak from '../AnimatedStreak';
import AnimatedCoin from '../AnimatedCoin';
import { COLORS } from '../../utils/theme';

interface Props {
  streak: number;
  badgesEarned: number;
  badgesTotal: number;
  coins: number;
  onPressViewProgress: () => void;
}

export default function ProgressInline({
  streak, badgesEarned, badgesTotal, coins, onPressViewProgress,
}: Props) {
  const s = useStyles();
  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => { haptic(); onPressViewProgress(); }}
      style={s.card}
    >
      <View style={s.row}>
        <View style={s.item}>
          <AnimatedStreak value={streak} size="sm" suffix="days" />
        </View>
        <View style={s.divider} />
        <View style={s.item}>
          <Text style={s.emoji}>🏅</Text>
          <Text style={s.value}>{badgesEarned}</Text>
          <Text style={s.label}>/ {badgesTotal}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.item}>
          <AnimatedCoin value={coins} size="sm" />
        </View>
      </View>

      <View style={s.linkRow}>
        <Text style={s.link}>View progress</Text>
        <Ionicons name="arrow-forward" size={12} color={COLORS.accent.brand} />
      </View>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: 0,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border.subtle,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
  emoji: { fontSize: 16 },
  value: { fontSize: 15, fontWeight: '700', color: c.text.primary },
  label: { fontSize: 11, fontWeight: '500', color: c.text.muted },
  divider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: c.border.subtle },

  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
  link: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
}));
