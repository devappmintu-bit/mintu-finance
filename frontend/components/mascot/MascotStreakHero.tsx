/**
 * MascotStreakHero — Duolingo-style streak surface.
 *
 * Shows day count + flame tier + freeze inventory (cosmetic for now)
 * + comeback CTA. Hidden for users who've never built a streak
 * (showStreak === false) so we never fake gamification.
 *
 * Tap action: opens Money School / streak detail (TODO route).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import AnimatedStreak from '../AnimatedStreak';
import { useFinContext } from '../../store/financialContext';
import { useMascotMood } from '../../hooks/useMascotMood';

// Soft "streak at risk" warning when last txn was >18h ago.
function streakAtRisk(lastTxnIso?: string | null): boolean {
  if (!lastTxnIso) return false;
  const hours = (Date.now() - new Date(lastTxnIso).getTime()) / 3600000;
  return hours >= 18 && hours <= 36;
}

export default function MascotStreakHero() {
  const streakDays = useFinContext((s) => s.streak?.days ?? 0);
  const lastTxn = useFinContext((s) => s.transactions?.lastTxnDate);
  const { showStreak } = useMascotMood();

  if (!showStreak || streakDays < 1) return null;

  const atRisk = streakAtRisk(lastTxn);
  const headline = atRisk
    ? `Your ${streakDays}-day streak is hanging by a thread.`
    : streakDays >= 30
    ? `${streakDays} days. You're built different.`
    : streakDays >= 7
    ? `One week strong. Keep the chain alive.`
    : `Day ${streakDays}. Small wins compound.`;

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); }}
      style={({ pressed }) => [styles.card, atRisk && styles.cardWarn, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Streak: ${streakDays} days${atRisk ? ', at risk' : ''}`}
    >
      <View style={styles.row}>
        <View style={styles.flameWrap}>
          <AnimatedStreak value={streakDays} size="lg" suffix="" />
        </View>
        <View style={styles.body}>
          <Text style={styles.label}>{atRisk ? 'STREAK AT RISK' : 'CURRENT STREAK'}</Text>
          <Text style={styles.headline} numberOfLines={2}>{headline}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>❄️ 1 freeze</Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: '#FFEDD5' }]}>
              <Text style={styles.metaPillText}>🔥 {streakDays}d</Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF7ED',
    borderWidth: 2,
    borderColor: '#0B0B0B',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  cardWarn: { backgroundColor: '#FEF3C7' },
  cardPressed: { transform: [{ translateX: 2 }, { translateY: 2 }], shadowOffset: { width: 2, height: 2 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flameWrap: { width: 80, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: '#9A3412' },
  headline: { fontSize: 15, fontWeight: '800', color: '#0B0B0B', lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  metaPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#0B0B0B',
    backgroundColor: '#FFFFFF',
  },
  metaPillText: { fontSize: 11, fontWeight: '900', color: '#0B0B0B' },
});
