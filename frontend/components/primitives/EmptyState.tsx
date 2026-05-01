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
import PremiumButton from './PremiumButton';

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
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  style,
  testID,
}: EmptyStateProps) {
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
      {actionLabel ? (
        <View style={{ marginTop: SPACE.md }}>
          <PremiumButton label={actionLabel} onPress={onAction} size="md" variant="primary" />
        </View>
      ) : null}
      {secondaryLabel ? (
        <View style={{ marginTop: SPACE.sm }}>
          <PremiumButton label={secondaryLabel} onPress={onSecondary} size="sm" variant="ghost" />
        </View>
      ) : null}
    </View>
  );
}

// Wrapped in its own component so the import only happens when needed —
// MintuMascot pulls in react-native-reanimated worklets which we don't
// want loaded on every Home/Transactions screen that uses EmptyState.
const MascotSlot = React.memo(function MascotSlot() {
  const MintuMascot = require('../MintuMascot').default;
  return (
    <View style={{ marginBottom: SPACE.sm }}>
      <MintuMascot size={120} state="idle" />
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
});
