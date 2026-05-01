/**
 * SectionHeader — unified section title + optional trailing CTA.
 *
 * Design System 2.0 · Phase 1 primitive.
 *
 * Why: 20+ screens reinvented the section-heading row (title + optional
 * `See all` CTA). This centralises the spec so corrections here
 * propagate everywhere.
 *
 * Usage:
 *   <SectionHeader title="Today" action="See all" onAction={goAll} />
 *   <SectionHeader title="Budgets" subtitle="This month" />
 */
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { COLORS, SPACE, TYPO } from '../../utils/theme';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

function SectionHeaderImpl({ title, subtitle, action, onAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.action}>
          <Text style={styles.actionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.accent.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const SectionHeader = React.memo(SectionHeaderImpl);
SectionHeader.displayName = 'SectionHeader';
export default SectionHeader;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.lg,
    marginBottom: SPACE.sm,
    gap: 8,
  },
  title: { ...TYPO.h2, color: COLORS.text.primary },
  sub: { ...TYPO.caption, color: COLORS.text.muted, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionText: { ...TYPO.bodySm, fontWeight: '700', color: COLORS.accent.primary },
});
