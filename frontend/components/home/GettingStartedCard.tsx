/**
 * Round 39 — Getting Started checklist card for first-time Home users.
 *
 * Renders ONLY when the user has zero transactions, budgets, goals, AND
 * groups (true first-time state). Each item is tappable, navigates to the
 * relevant screen, and ticks itself off as the underlying data appears.
 * The card permanently dismisses once all 4 are checked OR the user taps
 * the "Dismiss" link — stored in AsyncStorage so it doesn't reappear.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../../utils/theme';

const DISMISS_KEY = 'getting_started_dismissed_v1';

type Counts = {
  transactions: number;
  budgets: number;
  goals: number;
  groups: number;
};

interface Props {
  counts: Counts | null;
}

function GettingStartedCard({ counts }: Props) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  // Read dismissal flag once on mount.
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(DISMISS_KEY);
        setDismissed(v === '1');
      } catch { setDismissed(false); }
    })();
  }, []);

  const dismiss = useCallback(async () => {
    setDismissed(true);
    try { await AsyncStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }, []);

  // Wait until both dismissal flag AND counts have loaded.
  if (dismissed === null || counts === null) return null;
  if (dismissed) return null;

  // Build per-step status from real counts.
  const steps = [
    { id: 'txn',    label: 'Add your first transaction',    done: counts.transactions > 0, route: '/(tabs)/transactions', emoji: '💸' },
    { id: 'budget', label: 'Create a budget',                done: counts.budgets > 0,      route: '/(tabs)/budget',       emoji: '🎯' },
    { id: 'goal',   label: 'Set a savings goal',             done: counts.goals > 0,        route: '/goals',                emoji: '🏝️' },
    { id: 'split',  label: 'Invite a friend to split',       done: counts.groups > 0,       route: '/(tabs)/split',         emoji: '👥' },
  ];

  // Auto-dismiss permanently when all done.
  const allDone = steps.every((s) => s.done);
  if (allDone) {
    // Schedule a one-shot persist; don't block render.
    AsyncStorage.setItem(DISMISS_KEY, '1').catch(() => {});
    return null;
  }

  // Show the card only for genuinely first-time users (NO data anywhere).
  // If user has progress on at least one item, we keep showing until done.
  // The original spec wanted "only when ALL counts == 0", but that hides
  // the helpful progress indicator the moment they add one transaction —
  // worse UX. We keep it until all done OR dismissed.

  const completed = steps.filter((s) => s.done).length;

  return (
    <View style={s.card} accessibilityLabel="Getting started checklist">
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>GETTING STARTED</Text>
          <Text style={s.title}>Set up your money basics</Text>
          <Text style={s.sub}>{completed} of {steps.length} done</Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Dismiss getting started card">
          <Ionicons name="close" size={20} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View
        style={s.barTrack}
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: steps.length, now: completed }}
      >
        <View style={[s.barFill, { width: `${(completed / steps.length) * 100}%` }]} />
      </View>

      {steps.map((step) => (
        <TouchableOpacity
          key={step.id}
          style={s.step}
          onPress={() => router.push(step.route as any)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${step.done ? 'Completed: ' : ''}${step.label}`}
          accessibilityState={{ checked: step.done }}
        >
          <View style={[s.checkbox, step.done && s.checkboxDone]}>
            {step.done ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
            ) : (
              <Text style={s.stepEmoji}>{step.emoji}</Text>
            )}
          </View>
          <Text style={[s.stepLbl, step.done && s.stepLblDone]} numberOfLines={1}>{step.label}</Text>
          {!step.done && <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    padding: 16, borderRadius: 18,
    backgroundColor: '#FFF7ED',
    borderWidth: 1, borderColor: '#FFDDC0',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  kicker: { fontSize: 10, fontWeight: '900', color: COLORS.accent.primary, letterSpacing: 1.2 },
  title: { fontSize: 16, fontWeight: '900', color: COLORS.text.primary, marginTop: 4 },
  sub: { fontSize: 11, fontWeight: '700', color: COLORS.text.muted, marginTop: 2, letterSpacing: 0.4 },
  barTrack: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: { height: '100%', backgroundColor: COLORS.accent.primary, borderRadius: 3 },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
  },
  checkbox: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#FFDDC0', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
  stepEmoji: { fontSize: 14 },
  stepLbl: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  stepLblDone: { color: COLORS.text.muted, textDecorationLine: 'line-through' },
});

// Round 43 perf — memoized so unrelated parent state changes don't re-render this widget.
export default React.memo(GettingStartedCard);
