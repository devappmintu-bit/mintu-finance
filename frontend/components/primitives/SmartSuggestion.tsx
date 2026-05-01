/**
 * SmartSuggestion — AI-first contextual suggestion card.
 *
 * DS2.0 primitive. This is the "intelligence layer" surface that the
 * design brief calls for — instead of dumping raw data, we surface
 * *one* actionable insight the user should care about RIGHT NOW.
 *
 * Visual intent: glass surface, subtle brand glow on the left edge
 * (indicating it's an intelligent call-out), tight copy, inline CTA.
 *
 * Usage:
 *   <SmartSuggestion
 *     kind="saving"
 *     title="You could save ₹1,240 this month"
 *     body="Your Zomato spend is 63% above your 3-month average."
 *     actionLabel="Set a cap"
 *     onAction={() => router.push('/budget')}
 *     onDismiss={() => {}}
 *   />
 *
 * Kind → icon + accent-colour mapping:
 *   saving   → 💰 emerald (state.success)
 *   alert    → ⚠️ saffron (state.warning)
 *   waste    → 🔥 crimson (state.danger)
 *   insight  → ✨ brand   (accent.primary)
 *   streak   → 🔥 brand-deep
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { COLORS, RADIUS, SPACE, TYPO, ELEVATION } from '../../utils/theme';
import SpringPress from './SpringPress';

export type SmartSuggestionKind = 'saving' | 'alert' | 'waste' | 'insight' | 'streak';

export interface SmartSuggestionProps {
  kind?: SmartSuggestionKind;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const KIND_META: Record<SmartSuggestionKind, { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
  saving:  { icon: 'trending-down',     color: COLORS.state.success, bg: 'rgba(5,150,105,0.08)' },
  alert:   { icon: 'alert-circle',      color: COLORS.state.warning, bg: 'rgba(245,158,11,0.08)' },
  waste:   { icon: 'flame',             color: COLORS.state.danger,  bg: 'rgba(220,38,38,0.08)' },
  insight: { icon: 'sparkles',          color: COLORS.accent.primary, bg: 'rgba(232,74,12,0.08)' },
  streak:  { icon: 'flash',             color: COLORS.accent.primaryDark, bg: 'rgba(232,74,12,0.08)' },
};

function SmartSuggestionImpl({
  kind = 'insight',
  title,
  body,
  actionLabel,
  onAction,
  onDismiss,
  style,
  testID,
}: SmartSuggestionProps) {
  const meta = KIND_META[kind];

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 380 }}
      style={[styles.wrap, ELEVATION.z2, style]}
      testID={testID}
    >
      {/* Left-edge accent bar — signals "this is an intelligent callout" */}
      <View style={[styles.accent, { backgroundColor: meta.color }]} />

      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={18} color={meta.color} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.tag}>MINTU SUGGESTS</Text>
            {onDismiss ? (
              <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss suggestion">
                <Ionicons name="close" size={16} color={COLORS.text.muted} />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body} numberOfLines={2}>{body}</Text> : null}

          {actionLabel ? (
            <SpringPress variant="ghost" onPress={onAction} style={styles.cta}>
              <Text style={[styles.ctaText, { color: meta.color }]}>{actionLabel}</Text>
              <Ionicons name="arrow-forward" size={13} color={meta.color} />
            </SpringPress>
          ) : null}
        </View>
      </View>
    </MotiView>
  );
}

export const SmartSuggestion = React.memo(SmartSuggestionImpl);
SmartSuggestion.displayName = 'SmartSuggestion';
export default SmartSuggestion;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.subtle,
    marginVertical: SPACE.xs,
    marginHorizontal: SPACE.lg,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
  },
  row: {
    flexDirection: 'row',
    padding: SPACE.md,
    paddingLeft: SPACE.md + 4,
    gap: 12,
  },
  iconWrap: {
    width: 36, height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  tag: { ...TYPO.micro, color: COLORS.text.muted, letterSpacing: 1 },
  title: { ...TYPO.h3, color: COLORS.text.primary, marginBottom: 2 },
  body: { ...TYPO.bodySm, color: COLORS.text.muted, lineHeight: 18 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
  },
  ctaText: { ...TYPO.bodySm, fontWeight: '700' },
});
