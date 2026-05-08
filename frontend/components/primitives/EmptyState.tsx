/**
 * EmptyState — unified empty / zero-data screen fragment.
 *
 * DS2.0 primitive. 15+ screens currently implement their own empty
 * state with inconsistent copy, iconography, and CTA placement.
 *
 * Usage:
 *   <EmptyState
 *     icon="wallet-outline"
 *     title="No transactions yet"
 *     body="Import your first SMS or add a cash entry to get started."
 *     actionLabel="Add transaction"
 *     onAction={() => router.push('/add')}
 *   />
 *
 * Visual intent: a friendly, not-sad empty state. Soft brand halo
 * behind the icon, short copy, ONE primary CTA (never two). Keeps
 * the user moving.
 */
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';
import BrutalButton from '../brutalist/primitives/BrutalButton';

export interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  emoji?: string;
  /** When true, replaces the icon halo with the breathing MintuMascot.
   * Best for high-engagement zero states (e.g. Home/AI Coach/Goals
   * first-run). Defaults to false because the icon-halo variant is
   * cheaper to render in lists. */
  mascot?: boolean;
  title: string;
  body?: string;
  /** Round 83 — "action prompt" line, rendered as "→ {prompt}" above
   * the CTAs. Used for guided-activation empty states per the
   * "🧠 No transactions yet / → Add ₹1 expense to unlock insights"
   * pattern. Optional; body still renders when no prompt is set. */
  prompt?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function EmptyStateImpl({
  icon = 'sparkles',
  emoji,
  mascot,
  title,
  body,
  prompt,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  style,
  testID,
}: EmptyStateProps) {
  // Round 83 — when both CTAs are present, render them side-by-side
  // to match the guided-activation pattern [Action] [Alt] instead of
  // stacking them vertically.
  const hasBothCtas = !!(actionLabel && secondaryLabel);
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {mascot ? (
        // Lazy-import keeps EmptyState's bundle cost zero for the
        // 95 % of uses that don't ask for the mascot.
        <MascotSlot />
      ) : (
        <View style={styles.halo}>
          {emoji ? (
            <Text style={{ fontSize: 36 }}>{emoji}</Text>
          ) : (
            <Ionicons name={icon} size={34} color={COLORS.accent.primary} />
          )}
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {prompt ? <Text style={styles.prompt}>→ {prompt}</Text> : null}
      {hasBothCtas ? (
        <View style={styles.ctaRow}>
          <View style={{ flex: 1 }}>
            <BrutalButton variant="primary" size="md" onPress={onAction}>
              {actionLabel}
            </BrutalButton>
          </View>
          <View style={{ flex: 1 }}>
            <BrutalButton variant="secondary" size="md" onPress={onSecondary}>
              {secondaryLabel}
            </BrutalButton>
          </View>
        </View>
      ) : (
        <>
          {actionLabel ? (
            <View style={{ marginTop: SPACE.md }}>
              <BrutalButton variant="primary" size="md" onPress={onAction}>
                {actionLabel}
              </BrutalButton>
            </View>
          ) : null}
          {secondaryLabel ? (
            <View style={{ marginTop: SPACE.sm }}>
              <BrutalButton variant="ghost" size="sm" onPress={onSecondary}>
                {secondaryLabel}
              </BrutalButton>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

// Wrapped in its own component so the import only happens when needed —
// MascotPresence pulls in react-native-reanimated worklets which we don't
// want loaded on every Home/Transactions screen that uses EmptyState.
//
// Round 100X — upgraded from plain MintuMascot to MascotPresence so the
// empty-state mascot now reflects the user's actual mood (panicked /
// sleepy / encouraging / etc.) via the global `useMascotMood` engine.
// `showWhenGated` is true here because empty-states ARE the cold-start
// surface — users without txns SHOULD see Mintu in this exact context.
const MascotSlot = React.memo(function MascotSlot() {
  const MascotPresence = require('../mascot/MascotPresence').default;
  return (
    <View style={{ marginBottom: SPACE.sm }}>
      <MascotPresence size={120} showWhenGated />
    </View>
  );
});

export const EmptyState = React.memo(EmptyStateImpl);
EmptyState.displayName = 'EmptyState';
export default EmptyState;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: SPACE.xl * 1.5,
    paddingHorizontal: SPACE.xl,
  },
  halo: {
    width: 76,
    height: 76,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.subtle,
  },
  title: { ...TYPO.h2, color: COLORS.text.primary, textAlign: 'center', marginBottom: 6 },
  body: { ...TYPO.body, color: COLORS.text.muted, textAlign: 'center', maxWidth: 280, lineHeight: 21 },
  // Round 83 — "→ Do X to unlock Y" action prompt line.
  prompt: {
    ...TYPO.body,
    color: COLORS.text.primary,
    textAlign: 'center',
    marginTop: SPACE.sm,
    fontWeight: '800',
    letterSpacing: 0.2,
    maxWidth: 320,
  },
  // CTA row — side-by-side primary + secondary buttons for the
  // guided-activation pattern ([Add Expense]  [Scan SMS]).
  ctaRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.md,
    alignSelf: 'stretch',
    paddingHorizontal: SPACE.sm,
  },
});
