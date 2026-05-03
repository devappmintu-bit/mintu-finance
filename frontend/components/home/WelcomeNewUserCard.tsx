/**
 * WelcomeNewUserCard — first-load welcome screen for newly registered users.
 *
 * Renders ONLY when the auth store's `isNewUser` flag is true. The card
 * congratulates the user, gives a one-line value prop, and provides a
 * primary CTA to add the first transaction. After interaction (either tap
 * the CTA or dismiss) the flag is cleared so subsequent home renders show
 * the standard layout.
 *
 * Why this exists:
 *   For brand-new accounts the home screen would otherwise paint the
 *   skeleton-then-real-data flicker, then a mostly-empty BalanceHero
 *   ("Start tracking" / ₹0). That's correct but uninspiring. Showing a
 *   dedicated welcome banner above the standard layout makes the first
 *   impression feel earned.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import {  COLORS, RADIUS, SPACING, useAppColors } from '../../utils/theme';

interface Props {
  userName?: string;
}

function WelcomeNewUserCard({ userName }: Props) {
  const { isNewUser, clearNewUserFlag } = useAuthStore();
  if (!isNewUser) return null;

  const firstName = (userName || '').split(' ')[0] || 'there';

  const onAddFirst = () => {
    clearNewUserFlag();
    try { router.push('/(tabs)/transactions' as any); } catch { /* noop */ }
  };
  const onDismiss = () => {
    clearNewUserFlag();
  };

  return (
    <View style={s.wrap} testID="welcome-new-user-card">
      <View
        style={[s.card, { backgroundColor: '#FFF6EB' }]}>
        <TouchableOpacity onPress={onDismiss} style={s.close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>

        <Text style={s.kicker}>WELCOME TO MINTU 🎉</Text>
        <Text style={s.title} numberOfLines={2}>
          Hey {firstName}, your money story starts now
        </Text>
        <Text style={s.sub} numberOfLines={3}>
          Track every rupee, build saving streaks, and unlock smart insights.
          Let&apos;s log your first expense to set the rhythm.
        </Text>

        <TouchableOpacity onPress={onAddFirst} style={s.cta} activeOpacity={0.85} testID="welcome-add-first-txn">
          <Ionicons name="add-circle" size={18} color="#FFFFFF" />
          <Text style={s.ctaTxt}>Add your first transaction</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.md },
  card: {
    borderRadius: 0,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FFD7A6',
  },
  close: {
    position: 'absolute', top: 10, right: 10,
    width: 28, height: 28, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: COLORS.accent.primary },
  title: { fontSize: 19, fontWeight: '900', color: '#3A1E07', marginTop: 6, lineHeight: 24 },
  sub: { fontSize: 13.5, color: '#5A3A1A', marginTop: 6, lineHeight: 19 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 14,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent.primary,
  },
  ctaTxt: { fontSize: 14.5, fontWeight: '800', color: '#FFFFFF' },
});

export default memo(WelcomeNewUserCard);
