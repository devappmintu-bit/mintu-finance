/**
 * RewardsHeroBrutalist — v10 Brutalist retrofit for the Rewards tab.
 *
 * Sits at the top of /app/(tabs)/rewards.tsx replacing the plain
 * page title. Brutalist grammar matches the other tab heroes:
 *   • REWARDS · GAME eyebrow + accent rule
 *   • Mono score focal + streak + percentile side-chip
 *   • 3-col stat strip (SCORE · STREAK · TIER)
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const INK    = '#0A0A0A';
const PAPER  = '#F5F1EA';
const ACCENT = '#F56E1E';
const MUTED  = '#6B6B6B';
const OK     = '#0E8F5B';
const WARN   = '#D97706';
const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace' });

type Props = {
  score: number;
  streak: number;
  percentile?: { label?: string; pct?: number } | null;
  tier?: string;
};

function RewardsHeroBrutalist({ score, streak, percentile, tier = 'BRONZE' }: Props) {
  const scoreTone = score >= 75 ? OK : score >= 50 ? WARN : INK;
  const streakTone = streak >= 7 ? OK : streak >= 3 ? WARN : INK;

  return (
    <View style={styles.wrap}>
      {/* Eyebrow */}
      <View style={styles.eyebrowRow}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>REWARDS · GAME</Text>
        <View style={{ flex: 1 }} />
        {percentile?.label ? (
          <View style={styles.pctPill}>
            <Ionicons name="trending-up" size={10} color={OK} />
            <Text style={styles.pctText} numberOfLines={1}>{percentile.label}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        {/* Focal row */}
        <View style={styles.focalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.focalTag}>MONEY SCORE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[styles.focal, { color: scoreTone }]} numberOfLines={1}>{score}</Text>
              <Text style={styles.focalOf}>/100</Text>
            </View>
            <Text style={styles.sub}>
              {score >= 75 ? 'You\'re compounding — keep the rhythm.'
                : score >= 50 ? 'Decent base — one push to break 75.'
                : 'Start tracking daily to climb the ladder.'}
            </Text>
          </View>

          {/* Streak chip */}
          <View style={[styles.chip, { borderColor: streakTone }]}>
            <Ionicons name="flame" size={12} color={streakTone} />
            <Text style={[styles.chipNum, { color: streakTone }]}>{streak}</Text>
            <Text style={[styles.chipLabel, { color: streakTone }]}>DAYS</Text>
          </View>
        </View>

        {/* Stat strip */}
        <View style={styles.strip}>
          <Cell label="SCORE"  value={`${score}`} tone={scoreTone} />
          <Cell label="STREAK" value={`${streak}D`} tone={streakTone} />
          <Cell label="TIER"   value={tier.toUpperCase()} last />
        </View>
      </View>
    </View>
  );
}

function Cell({ label, value, tone = INK, last }: { label: string; value: string; tone?: string; last?: boolean }) {
  return (
    <View style={[styles.cell, last && { borderRightWidth: 0 }]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellVal, { color: tone }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default memo(RewardsHeroBrutalist);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },
  pctPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: OK, backgroundColor: '#E9F7EF', maxWidth: 160 },
  pctText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, color: OK, flexShrink: 1 },

  card: { borderWidth: 2, borderColor: INK, backgroundColor: '#fff' },
  focalRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderColor: INK },
  focalTag: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: MUTED },
  focal: { fontFamily: MONO, fontSize: 40, fontWeight: '900', letterSpacing: -2, lineHeight: 44, marginTop: 2 },
  focalOf: { fontFamily: MONO, fontSize: 16, fontWeight: '800', color: MUTED, letterSpacing: -0.5, marginLeft: 2 },
  sub: { fontSize: 11, fontWeight: '700', color: MUTED, marginTop: 4, letterSpacing: 0.2 },

  chip: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, backgroundColor: PAPER, minWidth: 68 },
  chipNum: { fontFamily: MONO, fontSize: 20, fontWeight: '900', letterSpacing: -0.8, marginTop: 2 },
  chipLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 },

  strip: { flexDirection: 'row', backgroundColor: PAPER },
  cell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderColor: INK, alignItems: 'flex-start' },
  cellLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: MUTED },
  cellVal: { fontFamily: MONO, fontSize: 15, fontWeight: '900', marginTop: 3, letterSpacing: -0.4 },
});
