/**
 * components/split/NudgeUI.tsx — Round 53m Pending Settlement Nudges UI.
 *
 * Two surfaces for the same nudge object:
 *
 *  • <NudgeChip>   — small pill on the group card in the list:
 *                    "🤖 ₹80 pending"
 *                    Tap → onPress (parent opens Smart Settle).
 *
 *  • <NudgeBanner> — fuller mascot-led row on the group summary header:
 *                    "🤖 You still owe ₹80 here. Want me to clear it?"
 *                    [⚡ Settle now]  [×]
 *                    Dismiss bumps ignore_count via dismissNudge();
 *                    after 3 ignores the banner self-suppresses for 72h.
 *
 * Both components stay deliberately quiet: muted accent tints, never
 * red, never sticky. They're conversational, not alarms.
 */
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from '../../utils/makeStyles';
import { haptic as haptics } from '../../utils/haptics';
import Mascot from '../Mascot';
import { C } from './theme';
import {
  PendingNudge,
  NudgeStrength,
  dismissNudge,
  strengthHints,
} from '../../services/nudges';

const fmtRupee = (n: number) =>
  `\u20b9${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const STRENGTH_TINT: Record<NudgeStrength, string> = {
  soft: C.accent + '14',
  medium: C.accent + '24',
  strong: C.accent + '30',
};


// ── Small chip used inside group list cards ─────────────────────────


export function NudgeChip({
  nudge,
  onPress,
}: {
  nudge: PendingNudge;
  onPress?: (n: PendingNudge) => void;
}) {
  const s = useChipStyles();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress?.(nudge);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${fmtRupee(nudge.amount)} pending in ${nudge.group_name}. Tap to settle.`}
      style={({ pressed }) => [
        s.chip,
        { backgroundColor: STRENGTH_TINT[nudge.strength] },
        pressed && { opacity: 0.85 },
      ]}
      hitSlop={6}
    >
      <Mascot size={16} />
      <Text style={s.chipT}>{fmtRupee(nudge.amount)} pending</Text>
    </Pressable>
  );
}

const useChipStyles = makeStyles(() => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.accent + '30',
    alignSelf: 'flex-start',
  },
  chipT: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 0.2,
  },
}));


// ── Fuller banner used inside group summary header ───────────────────


export function NudgeBanner({
  nudge,
  onSettle,
  onDismissed,
}: {
  nudge: PendingNudge;
  onSettle: (n: PendingNudge) => void;
  /** Called after the user taps × — parent should drop the banner from
   *  state so the visual disappears immediately. */
  onDismissed?: (n: PendingNudge) => void;
}) {
  const s = useBannerStyles();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const tranAnim = React.useRef(new Animated.Value(-8)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(tranAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, tranAnim]);

  const hints = strengthHints(nudge.strength);
  const voiceCopy =
    nudge.strength === 'strong'
      ? hints.voice
      : nudge.strength === 'medium'
      ? `${fmtRupee(nudge.amount)} still left here. ${hints.voice}`
      : `You still owe ${fmtRupee(nudge.amount)} here. Want me to clear it?`;

  const handleDismiss = React.useCallback(async () => {
    haptics.selection();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(tranAnim, { toValue: -8, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      onDismissed?.(nudge);
    });
    // Fire-and-forget the server-side bump.
    dismissNudge(nudge.id).catch(() => {});
  }, [nudge, fadeAnim, tranAnim, onDismissed]);

  const handleSettle = React.useCallback(() => {
    haptics.light();
    onSettle(nudge);
  }, [nudge, onSettle]);

  return (
    <Animated.View
      style={[
        s.wrap,
        { backgroundColor: STRENGTH_TINT[nudge.strength] },
        { opacity: fadeAnim, transform: [{ translateY: tranAnim }] },
      ]}
      accessible
      accessibilityLabel={voiceCopy}
    >
      <Mascot size={32} glow={nudge.strength !== 'strong'} />
      <View style={s.body}>
        <Text style={s.copy} numberOfLines={3}>
          {voiceCopy}
        </Text>
        <View style={s.actions}>
          <Pressable
            onPress={handleSettle}
            accessibilityRole="button"
            accessibilityLabel={hints.cta}
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
          >
            <View
              style={[s.cta, { backgroundColor: '#0A0A0A' }]}>
              <Ionicons name="flash" size={13} color={C.inv} />
              <Text style={s.ctaT}>{`\u26a1 ${hints.cta}`}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={8}
            style={({ pressed }) => [s.dismiss, pressed && { opacity: 0.6 }]}
          >
            <Text style={s.dismissT}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const useBannerStyles = makeStyles(() => ({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.accent + '35',
    marginVertical: 6,
  },
  body: { flex: 1, gap: 8 },
  copy: {
    fontSize: 13,
    color: C.text1,
    fontWeight: '600',
    lineHeight: 18,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  },
  ctaT: {
    fontSize: 12,
    fontWeight: '800',
    color: C.inv,
    letterSpacing: 0.2,
  },
  dismiss: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dismissT: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text3,
  },
}));
