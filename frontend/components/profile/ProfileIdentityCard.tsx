/**
 * ProfileIdentityCard — Round 58 Profile Revamp.
 *
 * Replaces the heavy orange gradient hero. Goal: a calm, premium
 * "identity pill" that gives the user a glance-able sense of self
 * (avatar + name + tier + weekly delta) without dominating the screen
 * with brand color.
 *
 * Brief reasoning:
 *   • The accent orange is now used ONLY on the avatar's gradient ring
 *     and the optional weekly delta chip, not as a full background.
 *   • The card itself uses GLASS.solidBg (translucent white) on the warm
 *     #FAFAF9 canvas, hairline borders for the iOS-Crystal cue, and a
 *     soft long shadow for depth.
 *   • Identity hierarchy: Name (bold, primary ink) → Tier (small
 *     pill) → Phone (muted, masked).
 *
 * Reuses existing tokens: COLORS / GLASS / shadowStyle. No new design
 * tokens introduced.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, GLASS, shadowStyle } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

const TIERS: Record<string, { label: string; emoji: string; color: string }> = {
  rookie:        { label: 'Beginner',       emoji: '🌱', color: '#6B7280' },
  growing:       { label: 'Growing Saver',  emoji: '🌿', color: '#10B981' },
  smart:         { label: 'Smart Spender',  emoji: '⚡',  color: '#3B82F6' },
  elite:         { label: 'Elite Saver',    emoji: '⭐', color: '#8B5CF6' },
  wealth:        { label: 'Wealth Builder', emoji: '💎', color: '#E84A0C' },
  master:        { label: 'Wealth Master',  emoji: '👑', color: '#FFB020' },
};

/** Mask the middle of an Indian/intl phone for privacy on a public screen. */
function maskPhone(raw: any): string {
  if (!raw) return '\u2014';
  const s = String(raw).trim();
  if (!s) return '\u2014';
  let cc = '+91';
  let local = s;
  const ccMatch = s.match(/^(\+\d{1,3})\s*(.*)$/);
  if (ccMatch) { cc = ccMatch[1]; local = ccMatch[2]; }
  const digits = local.replace(/\D/g, '');
  if (digits.length < 6) return `${cc} ${digits}`;
  const n = digits.length;
  const head = digits.slice(0, 3);
  const tail = digits.slice(-3);
  return `${cc} ${head}${'\u2022'.repeat(Math.max(2, n - 6))}${tail}`;
}

/** Pick the tier slug that matches the score. Falls back to 'rookie'. */
function tierForScore(score: number): keyof typeof TIERS {
  if (score >= 100) return 'master';
  if (score >= 80) return 'wealth';
  if (score >= 60) return 'elite';
  if (score >= 40) return 'smart';
  if (score >= 20) return 'growing';
  return 'rookie';
}

function initialsOf(name?: string | null): string {
  if (!name) return 'M';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]).join('').toUpperCase() || 'M';
}

function haptic() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
}

export interface ProfileIdentityCardProps {
  name?: string | null;
  phone?: string | null;
  avatarUri?: string | null;
  score: number;
  /** Optional weekly delta — "+8 this week" — shown as a small chip when present. */
  weeklyDelta?: number | null;
  onEditAvatar: () => void;
  onEditName: () => void;
}

function ProfileIdentityCard({
  name, phone, avatarUri, score, weeklyDelta,
  onEditAvatar, onEditName,
}: ProfileIdentityCardProps) {
  const s = useStyles();
  const tierKey = tierForScore(score || 0);
  const tier = TIERS[tierKey];

  // Round 58 — gradient ring uses TWO brand-anchored stops at low alpha
  // so the orange is a HIGHLIGHT, not a flood. Tier-specific accent
  // tints the second stop subtly for personality.
  const ringStops: [string, string] = [
    COLORS.accent.brand,           // primary orange — top-left
    tier.color,                    // tier-specific — bottom-right
  ];

  return (
    <View style={s.card}>
      {/* Avatar with gradient ring */}
      <TouchableOpacity
        onPress={() => { haptic(); onEditAvatar(); }}
        activeOpacity={0.85}
        style={s.avatarWrap}
        accessibilityLabel="Change profile photo"
        testID="profile-avatar"
      >
        <View
          style={[s.avatarRing, { backgroundColor: '#0A0A0A' }]}>
          <View style={s.avatarInner}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.avatarImg} contentFit="cover" />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitials}>{initialsOf(name)}</Text>
              </View>
            )}
          </View>
        </View>
        {/* Tiny camera badge */}
        <View style={s.cameraBadge}>
          <Ionicons name="camera" size={11} color={COLORS.text.primary} />
        </View>
      </TouchableOpacity>

      {/* Identity column */}
      <View style={s.identityCol}>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>{name || 'User'}</Text>
          <TouchableOpacity
            onPress={() => { haptic(); onEditName(); }}
            hitSlop={10}
            activeOpacity={0.6}
            accessibilityLabel="Edit name"
          >
            <Ionicons name="create-outline" size={16} color={COLORS.text.muted} />
          </TouchableOpacity>
        </View>

        <View style={s.metaRow}>
          <View style={[s.tierPill, { backgroundColor: tier.color + '14', borderColor: tier.color + '33' }]}>
            <Text style={s.tierEmoji}>{tier.emoji}</Text>
            <Text style={[s.tierLabel, { color: tier.color }]} numberOfLines={1}>{tier.label}</Text>
          </View>
          {typeof weeklyDelta === 'number' && weeklyDelta !== 0 && (
            <View style={[s.deltaChip, weeklyDelta > 0 ? s.deltaUp : s.deltaDown]}>
              <Ionicons
                name={weeklyDelta > 0 ? 'trending-up' : 'trending-down'}
                size={11}
                color={weeklyDelta > 0 ? COLORS.state.success : COLORS.state.danger}
              />
              <Text style={[
                s.deltaTxt,
                { color: weeklyDelta > 0 ? COLORS.state.success : COLORS.state.danger },
              ]}>
                {weeklyDelta > 0 ? '+' : ''}{weeklyDelta} this week
              </Text>
            </View>
          )}
        </View>

        <Text style={s.phone} numberOfLines={1}>{maskPhone(phone)}</Text>
      </View>
    </View>
  );
}

export default React.memo(ProfileIdentityCard);

const AVATAR_SIZE = 64;
const RING_PADDING = 3;

const useStyles = makeStyles((c) => ({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: GLASS.solidBg,
    borderRadius: 0, padding: 16, marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    ...shadowStyle('#111827', 4, 18, 0.05, 3),
  },
  avatarWrap: { position: 'relative' },
  avatarRing: {
    width: AVATAR_SIZE + RING_PADDING * 2,
    height: AVATAR_SIZE + RING_PADDING * 2,
    borderRadius: (AVATAR_SIZE + RING_PADDING * 2) / 2,
    padding: RING_PADDING,
  },
  avatarInner: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: c.bg.elevated,
    overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: {
    width: '100%', height: '100%',
    backgroundColor: c.gray[100],
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 22, fontWeight: '800', color: c.text.primary,
    letterSpacing: -0.5,
  },
  cameraBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 0,
    backgroundColor: c.bg.elevated,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    justifyContent: 'center', alignItems: 'center',
    ...shadowStyle('#111827', 1, 4, 0.08, 2),
  },
  identityCol: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: {
    fontSize: 19, fontWeight: '800', color: c.text.primary,
    letterSpacing: -0.4, flex: 1,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 0, borderWidth: 1,
    maxWidth: 160,
  },
  tierEmoji: { fontSize: 11 },
  tierLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  deltaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 0,
    borderWidth: 1,
  },
  deltaUp: { backgroundColor: c.state.successBg, borderColor: c.state.successBorder },
  deltaDown: { backgroundColor: c.state.dangerBg, borderColor: c.state.dangerBorder },
  deltaTxt: { fontSize: 10, fontWeight: '800' },
  phone: { fontSize: 12, color: c.text.muted, fontWeight: '500', marginTop: 6 },
}));
