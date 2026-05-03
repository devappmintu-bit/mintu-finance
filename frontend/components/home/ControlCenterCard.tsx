/**
 * components/home/ControlCenterCard.tsx — Round 74 (Phase 1).
 *
 * The new top-anchored "Today's actions" hub on the Home tab.
 * Implements the "Lazy User First" core principle:
 *   • App pre-thinks all the user's open loops and surfaces them
 *     as one-tap actionable rows.
 *   • Empty state ("All caught up ✅") so the card is always
 *     present and consistent — no dead area, no surprise.
 *
 * Visual hierarchy:
 *   [icon · tone-tinted]  TITLE                  [CTA pill]
 *                         body line · ₹amount
 *
 * Tones (kind → color) drive the icon-bg and CTA tint:
 *   urgent   = red    (you owe / overspend / budget alert)
 *   warning  = amber  (collect / anomaly)
 *   success  = green  (smart-save)
 *   info     = blue   (streak / generic)
 *
 * Performance: pure presentational, no fetches here. Data comes
 * from useControlCenterData (parent passes via props).
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT_FAMILY } from '../../utils/theme';
import type { ControlCenterAction } from '../../hooks/useControlCenterData';

interface Props {
  actions: ControlCenterAction[];
  loading?: boolean;
}

const TONE_BG: Record<ControlCenterAction['tone'], string> = {
  urgent:  'rgba(239,68,68,0.10)',
  warning: 'rgba(245,158,11,0.12)',
  success: 'rgba(16,185,129,0.10)',
  info:    'rgba(59,130,246,0.10)',
};
const TONE_FG: Record<ControlCenterAction['tone'], string> = {
  urgent:  '#DC2626',
  warning: '#B45309',
  success: '#0E8B5E',
  info:    '#1D4ED8',
};
const TONE_CTA_BG: Record<ControlCenterAction['tone'], string> = {
  urgent:  '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  info:    '#3B82F6',
};

function fmtINR(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export default function ControlCenterCard({ actions, loading }: Props) {
  const count = actions.length;

  const handlePress = (a: ControlCenterAction) => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
    }
    a.on_press();
  };

  return (
    <View style={styles.card}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>TODAY'S ACTIONS</Text>
          <Text style={styles.title}>
            {count === 0 ? 'All caught up' : count === 1 ? '1 thing to handle' : `${count} things to handle`}
          </Text>
        </View>
        {count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countTxt}>{count}</Text>
          </View>
        )}
      </View>

      {/* EMPTY STATE */}
      {count === 0 && !loading && (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIcon}>
            <Ionicons name="checkmark-done" size={22} color="#0E8B5E" />
          </View>
          <Text style={styles.emptyTitle}>You're up to date ✨</Text>
          <Text style={styles.emptySub} numberOfLines={2}>
            No splits owed, no overspends. Tap the Mintu puck below if you want to ask anything.
          </Text>
        </View>
      )}

      {/* ACTION ROWS */}
      {actions.map((a, idx) => (
        <View key={a.id} style={[styles.row, idx === 0 && { borderTopWidth: 0 }]}>
          <View style={[styles.iconWrap, { backgroundColor: TONE_BG[a.tone] }]}>
            <Ionicons name={a.icon as any} size={20} color={TONE_FG[a.tone]} />
          </View>

          <View style={styles.rowMid}>
            <Text style={styles.rowTitle} numberOfLines={1}>{a.title}</Text>
            <Text style={styles.rowBody} numberOfLines={1}>
              {a.body}
              {typeof a.amount === 'number' ? (
                <Text style={[styles.amountTxt, { color: TONE_FG[a.tone] }]}>{'  · '}{fmtINR(a.amount)}</Text>
              ) : null}
            </Text>
          </View>

          <Pressable
            onPress={() => handlePress(a)}
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: TONE_CTA_BG[a.tone] },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${a.cta_label} — ${a.title}`}
            testID={`cc-action-${a.id}`}
          >
            <Text style={styles.ctaTxt}>{a.cta_label}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 4px 14px rgba(15,23,42,0.06)' as any },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 4,
  },
  kicker: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.4,
    color: COLORS.text.muted,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.4,
    marginTop: 3,
  },
  countBadge: {
    minWidth: 28, height: 28, paddingHorizontal: 9,
    borderRadius: 0,
    backgroundColor: COLORS.accent.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  countTxt: { fontSize: 13, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.08)',
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  rowBody: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.text.secondary,
    marginTop: 1,
  },
  amountTxt: {
    fontWeight: '800',
  },
  ctaBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    minWidth: 64,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  emptyBox: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  emptyIcon: {
    width: 44, height: 44, borderRadius: 0,
    backgroundColor: 'rgba(16,185,129,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
    marginTop: 4,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 18,
    lineHeight: 16,
  },
});
