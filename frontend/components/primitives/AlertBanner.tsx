/**
 * AlertBanner — full-width top-of-screen status banner.
 *
 * DS2.0 primitive. Unlike SmartSuggestion (which is an *inline* AI
 * insight), AlertBanner is used for transient system messages:
 *   - Offline: "You're offline. Actions will sync when you reconnect."
 *   - Sync: "3 transactions synced."
 *   - Update: "New version available. Tap to refresh."
 *   - Warning: "Budget exceeded for Food."
 *
 * Visual intent: compact one-line banner, dismissible, auto-animated
 * in/out via moti. Semantic color mapping.
 *
 * Usage:
 *   <AlertBanner
 *     tone="warning"
 *     message="You're offline. Changes will sync later."
 *     onDismiss={() => setShown(false)}
 *   />
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';

export type AlertBannerTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertBannerProps {
  tone?: AlertBannerTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TONE: Record<AlertBannerTone, { bg: string; fg: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  info:    { bg: 'rgba(37,99,235,0.08)',  fg: COLORS.state.info,    icon: 'information-circle' },
  success: { bg: 'rgba(5,150,105,0.08)',  fg: COLORS.state.success, icon: 'checkmark-circle' },
  warning: { bg: 'rgba(245,158,11,0.10)', fg: COLORS.state.warning, icon: 'warning' },
  danger:  { bg: 'rgba(220,38,38,0.08)',  fg: COLORS.state.danger,  icon: 'alert-circle' },
};

function AlertBannerImpl({
  tone = 'info',
  message,
  actionLabel,
  onAction,
  onDismiss,
  style,
  testID,
}: AlertBannerProps) {
  const m = TONE[tone];
  return (
    <MotiView
      testID={testID}
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -8 }}
      transition={{ type: 'timing', duration: 260 }}
      style={[styles.wrap, { backgroundColor: m.bg, borderColor: m.fg }, style]}
    >
      <Ionicons name={m.icon} size={18} color={m.fg} />
      <Text style={[styles.msg, { color: m.fg }]} numberOfLines={2}>{message}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.action}>
          <Text style={[styles.actionText, { color: m.fg }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss alert">
          <Ionicons name="close" size={16} color={m.fg} />
        </Pressable>
      ) : null}
    </MotiView>
  );
}

export const AlertBanner = React.memo(AlertBannerImpl);
AlertBanner.displayName = 'AlertBanner';
export default AlertBanner;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
    marginHorizontal: SPACE.lg,
    marginVertical: SPACE.xs,
    borderRadius: RADIUS.lg,
    borderLeftWidth: 3,
  },
  msg: { ...TYPO.bodySm, flex: 1, fontWeight: '600' },
  action: { paddingHorizontal: 6, paddingVertical: 2 },
  actionText: { ...TYPO.bodySm, fontWeight: '800', textDecorationLine: 'underline' },
});
