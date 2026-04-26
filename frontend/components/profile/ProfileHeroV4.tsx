/**
 * ProfileHeroV4 — Living Financial Identity Engine (Samsung Health–style avatar).
 *
 * v5 changes:
 *   • Avatar is now a large, centered circular portrait (Samsung Health style)
 *     with a soft status ring and a compact white camera badge.
 *   • Single tap → opens ProfilePhotoSheet (Take / Gallery / Remove). No long-press.
 *   • Initials fallback (derived from user.name) replaces the old mintu-logo
 *     placeholder when no photo is set.
 *   • Identity (avatar + name + phone) is now vertically stacked and centered
 *     for a calmer, more premium hero.
 *   • Score breakdown + milestone rail remain unchanged below the identity.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

/**
 * Round 51e — privacy-friendly phone masking.
 *
 * Profile hero displays the user's phone, which is one of the most
 * sensitive identifiers the app exposes. Masking middle digits keeps
 * enough of the number visible for the user to confirm ownership at a
 * glance, while preventing accidental disclosure to people sharing or
 * peeking at the screen (cafés, public transport, screenshots).
 *
 * Examples:
 *   "+91 9441234707"  →  "+91 944••••707"
 *   "9441234707"      →  "+91 944••••707"  (assumes IN if 10-digit)
 *   "+44 7012345678"  →  "+44 701•••••678" (preserves CC + 3 + 3)
 *   undefined/empty   →  "—"
 */
function maskPhone(raw: any): string {
  if (!raw) return '—';
  const s = String(raw).trim();
  if (!s) return '—';

  // Split country code (leading "+xx") from the local digits.
  let cc = '+91';
  let local = s;
  const ccMatch = s.match(/^(\+\d{1,3})\s*(.*)$/);
  if (ccMatch) {
    cc = ccMatch[1];
    local = ccMatch[2];
  }
  // Strip non-digits from the local part for masking.
  const digits = local.replace(/\D/g, '');
  if (digits.length < 6) {
    // Too short to safely mask — return original (rare edge case).
    return s;
  }
  const head = digits.slice(0, 3);
  const tail = digits.slice(-3);
  const middle = '•'.repeat(Math.max(4, digits.length - 6));
  return `${cc} ${head}${middle}${tail}`;
}

interface Props {
  user: any;
  avatar?: string | null;
  statusRing?: 'green' | 'orange' | 'red' | null;
  predictiveInsight?: string;
  nextReward?: { label: string; at: number } | null;
  onEditName: () => void;
  /** Opens the unified ProfilePhotoSheet (handles take/gallery/remove). */
  onEditAvatar: () => void;
  onLevelUp: () => void;
  onTapScore: () => void;
}

const MILESTONES = [
  { at: 0,   emoji: '🌱', label: 'Just Starting' },
  { at: 40,  emoji: '⚡', label: 'Growing Saver' },
  { at: 60,  emoji: '💪', label: 'Smart Spender' },
  { at: 80,  emoji: '🏆', label: 'Elite Saver' },
  { at: 100, emoji: '👑', label: 'Wealth Master' },
];

const STATUS_COLOR = {
  green:  '#34D399',
  orange: '#FBBF24',
  red:    '#F87171',
  none:   'rgba(255,255,255,0.35)',
} as const;

function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || 'U';
}

export default function ProfileHeroV4({
  user, avatar, statusRing, predictiveInsight, nextReward,
  onEditName, onEditAvatar, onLevelUp, onTapScore,
}: Props) {
  const score = user?.money_score || 0;
  const ringColor = STATUS_COLOR[statusRing || 'none'];
  const initials = getInitials(user?.name);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  // Current tier + next tier
  let currentTier = MILESTONES[0];
  let nextTier = MILESTONES[1];
  for (let i = 0; i < MILESTONES.length - 1; i++) {
    if (score >= MILESTONES[i].at && score < MILESTONES[i + 1].at) {
      currentTier = MILESTONES[i];
      nextTier = MILESTONES[i + 1];
      break;
    }
    if (score >= 100) {
      currentTier = MILESTONES[MILESTONES.length - 1];
      nextTier = MILESTONES[MILESTONES.length - 1];
    }
  }

  return (
    <LinearGradient
      colors={['#F56E1E', '#C14A06']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.blob1} />
      <View style={s.blob2} />

      {/* Top row: tier pill + edit-name button */}
      <View style={s.topRow}>
        <View style={s.tierPill}>
          <Text style={s.tierEmoji}>{currentTier.emoji}</Text>
          <Text style={s.tierTxt}>{currentTier.label.toUpperCase()}</Text>
        </View>
        <TouchableOpacity
          style={s.editBtn}
          onPress={() => { haptic(); onEditName(); }}
          hitSlop={8} activeOpacity={0.7}
          accessibilityLabel="Edit name"
        >
          <Ionicons name="create-outline" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Identity — Samsung Health style avatar (large, centered, camera badge) */}
      <View style={s.identity}>
        <TouchableOpacity
          onPress={() => { haptic(); onEditAvatar(); }}
          activeOpacity={0.85}
          style={[s.avatarShell, { borderColor: ringColor }]}
          accessibilityLabel="Change profile photo"
          testID="profile-avatar"
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={s.avatarImg} contentFit="cover" />
          ) : (
            <View style={s.avatarInitialsWrap}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
          )}

          {/* Camera edit badge — tight bottom-right, Samsung Health style */}
          <View style={s.cameraBadge}>
            <Ionicons name="camera" size={14} color="#C14A06" />
          </View>
        </TouchableOpacity>

        <Text style={s.name} numberOfLines={1}>{user?.name || 'User'}</Text>
        {/* Round 51e — masked phone display for privacy.
            "+91 9441234707"  →  "+91 944••••707"
            Keeps country code + first 3 digits + last 3 digits visible
            so the user can still verify their identity at a glance,
            without exposing the full number to anyone glancing at the
            screen. Falls back gracefully for non-Indian or short numbers. */}
        <Text style={s.phone} numberOfLines={1}>{maskPhone(user?.phone)}</Text>
      </View>

      {/* Score — tappable */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => { haptic(); onTapScore(); }} style={s.scoreBlock}>
        <Text style={s.label}>MONEY SCORE · tap to break down</Text>
        <View style={s.amountRow}>
          <Text style={s.amount}>{score}</Text>
          <Text style={s.amountOf}>/ 100</Text>
          <View style={s.breakdownHint}>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
          </View>
        </View>

        {/* Multi-milestone rail */}
        <View style={s.rail}>
          {MILESTONES.map((m, i) => {
            const reached = score >= m.at;
            const pctPos = (m.at / 100) * 100;
            return (
              <View
                key={i}
                style={[
                  s.milestone,
                  { left: `${pctPos}%` },
                  reached && s.milestoneReached,
                ]}
              />
            );
          })}
          <View style={[s.progressFill, { width: `${Math.min(100, score)}%` }]} />
        </View>

        {predictiveInsight ? (
          <View style={s.predictive}>
            <Ionicons name="sparkles" size={11} color={'#FCD34D'} />
            <Text style={s.predictiveTxt} numberOfLines={1}>{predictiveInsight}</Text>
          </View>
        ) : null}

        {nextReward ? (
          <View style={s.rewardInline}>
            <Text style={s.rewardEmoji}>🎁</Text>
            <Text style={s.rewardTxt}>Unlock at {nextReward.at}: <Text style={{ fontWeight: '900' }}>{nextReward.label}</Text></Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Level Up CTA */}
      <TouchableOpacity style={s.cta} onPress={() => { haptic(); onLevelUp(); }} activeOpacity={0.85} testID="profile-level-up">
        <Ionicons name="rocket" size={14} color="#FFFFFF" />
        <Text style={s.ctaTxt}>Level up · {nextTier.label}</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const AVATAR_SIZE = 96;
const AVATAR_INNER = AVATAR_SIZE - 8;

const s = StyleSheet.create({
  card: { borderRadius: 24, padding: 20, overflow: 'hidden', position: 'relative', marginBottom: 16, shadowColor: '#C14A06', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  blob1: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -50, left: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(0,0,0,0.08)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tierEmoji: { fontSize: 12 },
  tierTxt: { fontSize: 10, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.8 },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },

  // Samsung Health style identity — centered stack
  identity: { alignItems: 'center', marginTop: 14 },
  avatarShell: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    // subtle inner glow
    shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  avatarImg: { width: AVATAR_INNER, height: AVATAR_INNER, borderRadius: AVATAR_INNER / 2 },
  avatarInitialsWrap: {
    width: AVATAR_INNER, height: AVATAR_INNER, borderRadius: AVATAR_INNER / 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  avatarInitials: { fontSize: 32, fontWeight: '900', color: '#C14A06', letterSpacing: -0.5 },
  cameraBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#C14A06',
    shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },

  name: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3, marginTop: 12, textAlign: 'center' },
  phone: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.78)', marginTop: 2, textAlign: 'center' },

  scoreBlock: { marginTop: 20 },
  label: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  amount: { fontSize: 44, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1.5 },
  amountOf: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginLeft: 6 },
  breakdownHint: { marginLeft: 'auto', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, paddingHorizontal: 6, paddingVertical: 6 },

  rail: { height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.28)', position: 'relative', marginTop: 10, overflow: 'visible' },
  progressFill: { position: 'absolute', left: 0, top: 0, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.92)' },
  milestone: { position: 'absolute', top: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)', marginLeft: -4, borderWidth: 1.5, borderColor: '#C14A06' },
  milestoneReached: { backgroundColor: '#FCD34D' },

  predictive: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  predictiveTxt: { flex: 1, fontSize: 12, fontWeight: '700', color: '#FCD34D' },

  rewardInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  rewardEmoji: { fontSize: 12 },
  rewardTxt: { fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.88)' },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.22)', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999 },
  ctaTxt: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
});
