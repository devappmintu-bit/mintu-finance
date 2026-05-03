/**
 * RewardsHero — v10 Brutalist replacement for the old saffron-gradient
 * variant. Used by `/rewards-hub` with the existing prop shape:
 *   { coins, freeSpinsLeft, tierName, tierColor, onBack, onPressCoins }
 *
 * Matches the grammar of every tab hero: eyebrow + accent rule, 2px
 * INK bordered card, mono ledger numerals, brutalist action strip.
 */
import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const INK    = '#0A0A0A';
const PAPER  = '#F5F1EA';
const ACCENT = '#E84A0C';
const MUTED  = '#6B6B6B';
const OK     = '#0E8F5B';
const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace' });

type Props = {
  coins: number;
  freeSpinsLeft: number;
  tierName: string;
  tierColor?: string;
  onBack?: () => void;
  onPressCoins?: () => void;
};

function RewardsHero({ coins, freeSpinsLeft, tierName, tierColor = ACCENT, onBack, onPressCoins }: Props) {
  return (
    <View style={styles.wrap}>
      {/* Top bar */}
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn} testID="rewards-hero-back">
          <Ionicons name="arrow-back" size={16} color={INK} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <View style={[styles.tierPill, { borderColor: tierColor }]}>
          <Ionicons name="medal-outline" size={10} color={tierColor} />
          <Text style={[styles.tierText, { color: tierColor }]}>{(tierName || 'BRONZE').toUpperCase()}</Text>
        </View>
      </View>

      {/* Eyebrow */}
      <View style={styles.eyebrowRow}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>REWARDS · HUB</Text>
      </View>

      <Pressable onPress={onPressCoins} style={({ pressed }) => [styles.card, pressed && { transform: [{ translateY: 1 }] }]} testID="rewards-hero-coins">
        <View style={styles.focalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.focalTag}>MINTU COINS</Text>
            <Text style={styles.focal} numberOfLines={1}>{coins.toLocaleString('en-IN')}</Text>
            <Text style={styles.sub} numberOfLines={1}>Tap to view coin ledger →</Text>
          </View>

          {/* Free spins chip */}
          <View style={styles.spinChip}>
            <Ionicons name="flash" size={12} color={OK} />
            <Text style={styles.spinNum}>{freeSpinsLeft}</Text>
            <Text style={styles.spinLabel}>FREE SPINS</Text>
          </View>
        </View>

        {/* Stat strip */}
        <View style={styles.strip}>
          <Cell label="COINS"  value={coins.toLocaleString('en-IN')} />
          <Cell label="SPINS"  value={String(freeSpinsLeft)} tone={freeSpinsLeft > 0 ? OK : INK} />
          <Cell label="TIER"   value={(tierName || 'Bronze').toUpperCase()} tone={tierColor} last />
        </View>
      </Pressable>
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

export default memo(RewardsHero);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12, paddingHorizontal: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backBtn: { width: 36, height: 36, borderWidth: 2, borderColor: INK, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, backgroundColor: PAPER },
  tierText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },

  card: { borderWidth: 2, borderColor: INK, backgroundColor: '#fff' },
  focalRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderColor: INK },
  focalTag: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: MUTED },
  focal: { fontFamily: MONO, fontSize: 38, fontWeight: '900', color: INK, letterSpacing: -1.6, lineHeight: 42, marginTop: 2 },
  sub: { fontSize: 11, fontWeight: '700', color: MUTED, marginTop: 4, letterSpacing: 0.3 },

  spinChip: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: OK, backgroundColor: '#E9F7EF', minWidth: 78 },
  spinNum: { fontFamily: MONO, fontSize: 20, fontWeight: '900', color: OK, marginTop: 2 },
  spinLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3, color: OK, marginTop: 2 },

  strip: { flexDirection: 'row', backgroundColor: PAPER },
  cell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderColor: INK, alignItems: 'flex-start' },
  cellLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: MUTED },
  cellVal: { fontFamily: MONO, fontSize: 14, fontWeight: '900', marginTop: 3, letterSpacing: -0.4 },
});
