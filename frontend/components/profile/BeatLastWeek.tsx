/**
 * BeatLastWeek — weekly comparison card with AI commentary.
 * Uses cool blue accent to visually differentiate from orange Today / hero.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  thisWeek: { saved: number; expense: number; txn_count: number } | null;
  lastWeek: { saved: number; expense: number; txn_count: number } | null;
  pctBetter: number;
  commentary: string;
  tone: 'positive' | 'neutral' | 'warn' | 'info';
  rewardPreview: { coins: number; badge?: string | null; tier_boost?: boolean } | null;
  onPress: () => void;
}

const TONE_COLOR = {
  positive: '#059669',
  neutral:  '#6B7280',
  warn:     '#DC2626',
  info:     '#3B82F6',
} as const;

export default function BeatLastWeek({
  thisWeek, lastWeek, pctBetter, commentary, tone, rewardPreview, onPress,
}: Props) {
  const s = useStyles();
  const color = TONE_COLOR[tone];

  const thisVal = Math.round(Number(thisWeek?.expense || 0));
  const lastVal = Math.round(Number(lastWeek?.expense || 0));
  const maxVal = Math.max(thisVal, lastVal, 1);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.92} onPress={() => { haptic(); onPress(); }}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Beat Your Last Week</Text>
          <Text style={[s.commentary, { color }]} numberOfLines={2}>{commentary}</Text>
        </View>
        {pctBetter !== 0 && tone !== 'info' ? (
          <View style={[s.deltaChip, { backgroundColor: color + '1A' }]}>
            <Ionicons name={pctBetter >= 0 ? 'trending-down' : 'trending-up'} size={12} color={color} />
            <Text style={[s.deltaTxt, { color }]}>{Math.abs(pctBetter)}%</Text>
          </View>
        ) : null}
      </View>

      {/* Mini comparison bars */}
      <View style={s.barsRow}>
        <View style={s.barCol}>
          <Text style={s.barLbl}>Last week</Text>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${(lastVal / maxVal) * 100}%`, backgroundColor: '#D1D5DB' }]} />
          </View>
          <Text style={s.barVal}>₹{lastVal.toLocaleString('en-IN')}</Text>
        </View>
        <View style={s.barCol}>
          <Text style={s.barLbl}>This week</Text>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${(thisVal / maxVal) * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={[s.barVal, { color, fontWeight: '800' }]}>₹{thisVal.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {/* Reward preview */}
      {rewardPreview && (rewardPreview.coins > 0 || rewardPreview.badge) ? (
        <View style={s.rewardRow}>
          {rewardPreview.coins > 0 ? (
            <View style={s.rewardChip}>
              <Text style={s.rewardEmoji}>🪙</Text>
              <Text style={s.rewardTxt}>+{rewardPreview.coins}</Text>
            </View>
          ) : null}
          {rewardPreview.badge ? (
            <View style={s.rewardChip}>
              <Text style={s.rewardEmoji}>🏅</Text>
              <Text style={s.rewardTxt}>{rewardPreview.badge}</Text>
            </View>
          ) : null}
          {rewardPreview.tier_boost ? (
            <View style={s.rewardChip}>
              <Text style={s.rewardEmoji}>⚡</Text>
              <Text style={s.rewardTxt}>Tier boost</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={s.ctaRow}>
        <Text style={[s.ctaTxt, { color }]}>{pctBetter > 0 && pctBetter < 20 ? 'Almost there →' : 'View full breakdown →'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.bg.secondary, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: c.border.subtle, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  label: { fontSize: 10.5, fontWeight: '700', color: c.text.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  commentary: { fontSize: 14, fontWeight: '700', marginTop: 4, letterSpacing: -0.2, lineHeight: 18 },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  deltaTxt: { fontSize: 11.5, fontWeight: '900' },

  barsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  barCol: { flex: 1 },
  barLbl: { fontSize: 10, fontWeight: '700', color: c.text.muted, letterSpacing: 0.3, textTransform: 'uppercase' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: c.bg.primary, marginTop: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barVal: { fontSize: 12.5, fontWeight: '700', color: c.text.primary, marginTop: 6 },

  rewardRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  rewardChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  rewardEmoji: { fontSize: 11 },
  rewardTxt: { fontSize: 11, fontWeight: '700', color: c.text.primary },

  ctaRow: { marginTop: 10, alignSelf: 'flex-end' },
  ctaTxt: { fontSize: 12, fontWeight: '800' },
}));
