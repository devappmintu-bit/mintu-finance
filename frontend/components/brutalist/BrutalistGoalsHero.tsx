/**
 * BrutalistGoalsHero — v9 master §"Commitment Engine".
 *
 * Lives at the top of /app/goals.tsx. Three stacked blocks:
 *
 *   1. HERO CARD      primary brutal · "₹X saved" + CTA "Start your first goal" or "Keep going"
 *   2. SMART CHIPS    secondary 1px gray · Emergency fund · Trip · Gadget · Car
 *                     (tap → seeds GoalSheet with a preset)
 *   3. AI NUDGE       tertiary no border · predictive line
 *                     "Save ₹200/day → reach ₹10K by Aug 12"
 */
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER, BR_STAMP } from '../../utils/brutalist';

export interface Goal { id: string; name: string; target_amount: number; saved_amount: number; target_date?: string | null; emoji: string; }

export interface Preset { emoji: string; name: string; target: number; horizonDays: number; }

export const SMART_PRESETS: Preset[] = [
  { emoji: '🛟', name: 'Emergency fund', target: 50000,  horizonDays: 180 },
  { emoji: '✈️', name: 'Trip',            target: 30000,  horizonDays: 90 },
  { emoji: '💻', name: 'Gadget',          target: 60000,  horizonDays: 120 },
  { emoji: '🚗', name: 'Car down-payment',target: 100000, horizonDays: 365 },
  { emoji: '🎁', name: 'Big gift',        target: 10000,  horizonDays: 60 },
];

interface Props {
  goals: Goal[];
  onStartFirstGoal: () => void;
  onPickPreset: (p: Preset) => void;
}

export default function BrutalistGoalsHero({ goals, onStartFirstGoal, onPickPreset }: Props) {
  const totalSaved = goals.reduce((s, g) => s + (g.saved_amount || 0), 0);
  const totalTarget = goals.reduce((s, g) => s + (g.target_amount || 0), 0);
  const topGoal = goals[0];
  const hasGoals = goals.length > 0;

  // Predictive: take the closest to completion and project days-to-goal
  // from a simple assumed daily pace (₹200/day). Only shown if we have data.
  const projection = React.useMemo(() => {
    if (!topGoal) return null;
    const remaining = Math.max(0, topGoal.target_amount - topGoal.saved_amount);
    if (remaining === 0) return 'Top goal fully funded 🎉';
    const pacePerDay = 200;
    const days = Math.ceil(remaining / pacePerDay);
    const eta = new Date(); eta.setDate(eta.getDate() + days);
    const fmt = eta.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return `Save ₹${pacePerDay}/day → reach ${topGoal.name} by ${fmt}`;
  }, [topGoal]);

  return (
    <View style={{ marginBottom: BR_SPACE.lg }}>
      {/* 1. HERO */}
      <View style={[styles.hero, BR_STAMP.md]}>
        <View style={styles.tagRow}>
          <View style={styles.smallRule} />
          <Text style={styles.tagText}>COMMITMENT ENGINE</Text>
        </View>
        <Text style={styles.heroSub}>Total saved across goals</Text>
        <Text style={styles.heroAmount}>₹{fmt(totalSaved)}</Text>
        {hasGoals ? (
          <Text style={styles.heroMeta}>
            of ₹{fmt(totalTarget)} targeted · {goals.length} goal{goals.length === 1 ? '' : 's'}
          </Text>
        ) : (
          <Text style={styles.heroMeta}>You haven't committed to any goal yet.</Text>
        )}

        <Pressable
          onPress={onStartFirstGoal}
          testID="goals-hero-cta"
          style={({ pressed }) => [styles.cta, pressed && styles.pressedShift]}
        >
          <Text style={styles.ctaText}>
            {hasGoals ? 'ADD NEW GOAL' : 'START YOUR FIRST GOAL'}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={BR_COLORS.ink} />
        </Pressable>
      </View>

      {/* 2. SMART CHIPS */}
      <View style={{ marginTop: BR_SPACE.lg }}>
        <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted, marginBottom: BR_SPACE.sm }]}>
          SMART SUGGESTIONS
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: BR_SPACE.sm }}>
          {SMART_PRESETS.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => onPickPreset(p)}
              testID={`goals-preset-${p.name.replace(/\s+/g, '-')}`}
              style={({ pressed }) => [styles.chip, pressed && { backgroundColor: BR_COLORS.paperAlt }]}
            >
              <Text style={{ fontSize: 18 }}>{p.emoji}</Text>
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.chipLabel}>{p.name}</Text>
                <Text style={styles.chipMeta}>₹{fmt(p.target)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* 3. AI PREDICTIVE NUDGE — tertiary, no border */}
      {projection ? (
        <View style={styles.aiNudge}>
          <Ionicons name="sparkles-outline" size={14} color={BR_COLORS.accent} style={{ marginRight: 6 }} />
          <Text style={styles.aiNudgeText} numberOfLines={2}>{projection}</Text>
        </View>
      ) : null}
    </View>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

const styles = StyleSheet.create({
  // HERO
  hero: {
    backgroundColor: BR_COLORS.ink,
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    padding: BR_SPACE.lg,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallRule: { width: 12, height: BR_BORDER.heavy, backgroundColor: BR_COLORS.accent },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: BR_COLORS.accent },
  heroSub: {
    fontSize: 13, fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginTop: BR_SPACE.sm,
  },
  heroAmount: {
    fontFamily: 'Menlo',
    fontSize: 60, lineHeight: 60,
    fontWeight: '900', letterSpacing: -3,
    color: '#fff', marginTop: 4,
  },
  heroMeta: {
    fontSize: 12, fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
  },
  cta: {
    marginTop: BR_SPACE.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BR_COLORS.accent,
    borderColor: BR_COLORS.accent,
    borderWidth: BR_BORDER.bold,
    paddingVertical: 14, paddingHorizontal: BR_SPACE.lg,
  },
  ctaText: {
    color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 2,
  },
  pressedShift: { transform: [{ translateX: 2 }, { translateY: 2 }], opacity: 0.95 },

  // CHIP
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: BR_SPACE.md, paddingVertical: BR_SPACE.sm,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.paper,
    minHeight: 48,
  },
  chipLabel: { fontSize: 13, fontWeight: '700', color: BR_COLORS.ink },
  chipMeta: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: BR_COLORS.muted, marginTop: 1 },

  // AI NUDGE
  aiNudge: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: BR_SPACE.md,
    paddingHorizontal: 4,
  },
  aiNudgeText: {
    fontSize: 13, fontWeight: '600', color: BR_COLORS.ink, flex: 1,
  },
});
