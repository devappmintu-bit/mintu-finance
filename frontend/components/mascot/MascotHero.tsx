/**
 * MascotHero — the FACE of MintU on the home screen.
 *
 * Big, breathing Mintu + mood-driven dialogue + tap → AI Coach.
 * Renders nothing for cold-start users (honest-UX gate). For active
 * users, this is the daily check-in moment — the equivalent of seeing
 * Duo on the Duolingo home screen.
 *
 * Layout (brutalist, 0-radius, hard ink shadow):
 *
 *   ┌────────────────────────────────────────┐
 *   │  [MASCOT]   MOOD_LABEL                        │
 *   │             one-line dialogue →                 │
 *   │             tap CTA · dot · streak/score chip   │
 *   └────────────────────────────────────────┘
 */
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { haptic as h } from '../../utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import MascotPresence from './MascotPresence';
import { useMascotMood } from '../../hooks/useMascotMood';
import { useFinContext } from '../../store/financialContext';
import { BR_COLORS } from '../../utils/brutalist';

const MOOD_LABELS: Record<string, string> = {
  panicked: 'ALERT',
  sad: 'COME BACK',
  sleepy: 'LATE NIGHT',
  sarcastic: 'NOTICED',
  proud: 'PROUD',
  celebrating: 'ON FIRE',
  encouraging: 'KEEP GOING',
  focused: 'WATCH',
  idle: 'STEADY',
};

const MOOD_COLORS: Record<string, string> = {
  panicked: '#DC2626',
  sad: '#6B7280',
  sleepy: '#7C3AED',
  sarcastic: '#0EA5E9',
  proud: '#16A34A',
  celebrating: '#F59E0B',
  encouraging: '#10B981',
  focused: '#FF8C66',
  idle: '#0B0B0B',
};

export default function MascotHero() {
  const { mood, line, gated, showStreak } = useMascotMood();
  const streakDays = useFinContext((s) => s.streak?.days ?? 0);
  const score = useFinContext((s) => s.score?.value ?? 0);

  const onTap = useCallback(() => {
    h.select();
    router.push('/(tabs)/ai-coach' as any);
  }, []);

  if (gated) return null;

  const accent = MOOD_COLORS[mood];
  const label = MOOD_LABELS[mood];

  return (
    <Pressable
      onPress={onTap}
      accessibilityRole="button"
      accessibilityLabel={`Mintu says: ${line}. Tap to open AI Coach.`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.row}>
        <MascotPresence size={84} />
        <View style={styles.body}>
          <View style={[styles.moodPill, { borderColor: accent }]}>
            <View style={[styles.moodDot, { backgroundColor: accent }]} />
            <Text style={[styles.moodLabel, { color: accent }]}>MINTU · {label}</Text>
          </View>
          <Text style={styles.line} numberOfLines={2}>{line}</Text>
          <View style={styles.cta}>
            <Ionicons name="sparkles" size={12} color="#0B0B0B" />
            <Text style={styles.ctaText}>Tap to chat with Mintu</Text>
            {showStreak && streakDays > 0 ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>🔥 {streakDays}d</Text>
              </View>
            ) : null}
            {score >= 1 ? (
              <View style={[styles.chip, { backgroundColor: '#FFF' }]}>
                <Text style={styles.chipText}>{score}/100</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#0B0B0B',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 12,
    // Hard ink drop shadow — brutalist signature.
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  cardPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOffset: { width: 2, height: 2 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  body: { flex: 1, gap: 6 },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    gap: 5,
  },
  moodDot: { width: 6, height: 6, borderRadius: 3 },
  moodLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  line: { fontSize: 15, fontWeight: '800', color: '#0B0B0B', lineHeight: 20 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  ctaText: { fontSize: 11, fontWeight: '700', color: '#0B0B0B', letterSpacing: 0.3 },
  chip: {
    backgroundColor: BR_COLORS.accent + '22',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#0B0B0B',
  },
  chipText: { fontSize: 10, fontWeight: '900', color: '#0B0B0B' },
});
