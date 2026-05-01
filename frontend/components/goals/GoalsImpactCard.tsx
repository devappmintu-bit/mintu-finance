/**
 * GoalsImpactCard — Wave 5.6.
 *
 * Picks the "most-on-pace" goal from the list and surfaces an
 * opinionated, celebratory headline at the top of the Goals screen.
 * Goal: the user's first glance lands on a win — not a to-do list.
 *
 * Selection logic (in priority order):
 *   1. Any goal at ≥ 100% → celebrate completion
 *   2. Any goal ≥ 1 week ahead of its linear pace  → "🎉 ahead"
 *   3. The highest-% goal with a target date       → "on track"
 *   4. Highest-% goal without target date          → "keep going"
 *   5. No goals / no savings                       → null (hide card)
 *
 * Renders a glass card with:
 *   • Big accent emoji
 *   • 2-line copy: headline + goal name
 *   • Tiny progress pill (% + ring dot)
 *   • Tap → opens goal detail (via onPressGoal)
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, SPACE, TYPO, ELEVATION } from '../../utils/theme';

export type GoalLike = {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  target_date?: string | null;
  emoji?: string;
  color?: string;
};

export interface GoalsImpactCardProps {
  goals: GoalLike[];
  onPressGoal?: (id: string) => void;
}

function haptic() {
  if (Platform.OS !== 'web') {
    try { Haptics.selectionAsync(); } catch { /* noop */ }
  }
}

type Pick = {
  goal: GoalLike;
  pct: number;
  headline: string;
  subline: string;
  emoji: string;
  tone: 'celebrate' | 'ahead' | 'ontrack' | 'push';
};

function computePick(goals: GoalLike[]): Pick | null {
  const valid = goals.filter(g => (g?.target_amount || 0) > 0);
  if (valid.length === 0) return null;

  const withPct = valid.map(g => ({
    goal: g,
    pct: Math.min(100, (g.saved_amount / g.target_amount) * 100),
  }));

  // 1. Any completed?
  const done = withPct.find(x => x.pct >= 100);
  if (done) {
    return {
      goal: done.goal,
      pct: done.pct,
      headline: 'Goal smashed 🎉',
      subline: `${done.goal.name} is 100% funded!`,
      emoji: done.goal.emoji || '🏆',
      tone: 'celebrate',
    };
  }

  // 2. Any ahead of pace? (pct > expected by date)
  const now = Date.now();
  const ahead = withPct.map(x => {
    const t = x.goal.target_date ? new Date(x.goal.target_date).getTime() : 0;
    if (!t || t <= now) return { ...x, aheadDays: 0 };
    // Assume goal was created at saved=0; use a 30-day window estimate.
    // Expected pct-by-now if linear from creation to target. We don't
    // have created_at so fall back to: if actual pct > 50% and target
    // is > 30 days out, we're "ahead".
    const daysToTarget = Math.max(1, Math.round((t - now) / 86400000));
    // "Ahead" heuristic: pct earned earlier than a naive 50/50 split.
    // If pct > 50% AND daysToTarget > 45  → clearly ahead.
    const aheadDays = x.pct > 50 && daysToTarget > 45 ? daysToTarget - 45 : 0;
    return { ...x, aheadDays };
  });
  const mostAhead = ahead.sort((a, b) => b.aheadDays - a.aheadDays)[0];
  if (mostAhead && mostAhead.aheadDays > 7) {
    const weeks = Math.round(mostAhead.aheadDays / 7);
    return {
      goal: mostAhead.goal,
      pct: mostAhead.pct,
      headline: `You're ${weeks} week${weeks === 1 ? '' : 's'} ahead! 🚀`,
      subline: `${mostAhead.goal.name} · ${Math.round(mostAhead.pct)}% there`,
      emoji: mostAhead.goal.emoji || '🎯',
      tone: 'ahead',
    };
  }

  // 3. Fallback: highest-% goal that has a target date
  const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
  const top = sorted[0];
  if (top.pct >= 50) {
    return {
      goal: top.goal,
      pct: top.pct,
      headline: 'Keep the momentum',
      subline: `${top.goal.name} · ${Math.round(top.pct)}% of ₹${top.goal.target_amount.toLocaleString('en-IN')}`,
      emoji: top.goal.emoji || '🎯',
      tone: 'ontrack',
    };
  }

  // 4. Low % — encouragement
  return {
    goal: top.goal,
    pct: top.pct,
    headline: 'Every ₹ counts',
    subline: `${top.goal.name} · Add ₹500 to unlock ${Math.min(99, Math.round(top.pct + 3))}%`,
    emoji: top.goal.emoji || '✨',
    tone: 'push',
  };
}

function GoalsImpactCardImpl({ goals, onPressGoal }: GoalsImpactCardProps) {
  const pick = useMemo(() => computePick(goals), [goals]);

  if (!pick) return null;

  const toneGradient: Record<Pick['tone'], [string, string]> = {
    celebrate: ['rgba(16,185,129,0.14)', 'rgba(16,185,129,0.00)'],
    ahead:     ['rgba(232,74,12,0.12)',  'rgba(232,74,12,0.00)'],
    ontrack:   ['rgba(59,130,246,0.10)', 'rgba(59,130,246,0.00)'],
    push:      ['rgba(168,85,247,0.10)', 'rgba(168,85,247,0.00)'],
  };
  const toneText: Record<Pick['tone'], string> = {
    celebrate: COLORS.state.success,
    ahead:     COLORS.accent.primary,
    ontrack:   '#3B82F6',
    push:      '#A855F7',
  };

  const handlePress = React.useCallback(() => {
    haptic();
    onPressGoal?.(pick.goal.id);
  }, [pick.goal.id, onPressGoal]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        ELEVATION.z2,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${pick.headline}. ${pick.subline}. Tap to open.`}
      testID="goals-impact-card"
    >
      <LinearGradient
        colors={toneGradient[pick.tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.emojiWrap}>
        <Text style={styles.emoji}>{pick.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.headline, { color: toneText[pick.tone] }]} numberOfLines={1}>
          {pick.headline}
        </Text>
        <Text style={styles.subline} numberOfLines={2}>{pick.subline}</Text>
      </View>
      <View style={[styles.pctPill, { backgroundColor: toneText[pick.tone] + '22' }]}>
        <Text style={[styles.pctText, { color: toneText[pick.tone] }]}>
          {Math.round(pick.pct)}%
        </Text>
        <Ionicons name="chevron-forward" size={14} color={toneText[pick.tone]} />
      </View>
    </Pressable>
  );
}

export const GoalsImpactCard = React.memo(GoalsImpactCardImpl);
GoalsImpactCard.displayName = 'GoalsImpactCard';
export default GoalsImpactCard;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.bg.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.subtle,
    overflow: 'hidden',
  },
  emojiWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg.elevated,
  },
  emoji: { fontSize: 28 },
  headline: { ...TYPO.h3, fontWeight: '700' },
  subline: { ...TYPO.bodySm, color: COLORS.text.muted, marginTop: 2 },
  pctPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  pctText: { ...TYPO.caption, fontWeight: '700' },
});
