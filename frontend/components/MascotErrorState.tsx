/**
 * components/MascotErrorState.tsx — Round 53n companion-tone recovery state.
 *
 * Replaces the legacy "🚧 isn't working right now" tab fallback with a
 * mascot-led recovery moment:
 *
 *   • Small mascot performs a curated "thinking" animation (tap/peek)
 *   • Companion-voice copy keyed to which tab is recovering
 *   • Auto-retry once after 1500ms (silent — no toast)
 *   • Manual retry CTA
 *
 * Usage (typically from an error boundary):
 *   <MascotErrorState tabName="home" onRetry={() => boundary.reset()} />
 *
 * Design philosophy (from spec):
 *   "If MintU feels alive when things work, it must feel even more
 *    alive when things break."
 *
 * NOTE — this component intentionally does NOT call any backend API.
 * It uses purely synchronous, locally-curated copy + animation so it
 * can render even during catastrophic failures (network down, JWT
 * dead, JS bundle partially broken). The recovery contract is:
 *   1. Show mascot + companion copy at 0ms
 *   2. Animate
 *   3. Auto-retry once (silent)
 *   4. If still broken, user can manually retry
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../utils/theme';
import { haptic as haptics } from '../utils/haptics';
import {
  createMascotAnimValues,
  playMascotAnimation,
  rotateToDeg,
} from '../utils/mascotAnimations';
import type { MascotAction } from '../services/mascot';
import Mascot from './Mascot';

type Props = {
  /** Identifies which surface is recovering — drives copy. Examples:
   *  "home" | "coach" | "budget" | "split" | "transactions" | undefined */
  tabName?: string;
  /** Called when user (or the auto-retry timer) wants to retry. Should
   *  reset the boundary state so the children re-mount. */
  onRetry: () => void;
  /** Set to false to disable the silent auto-retry beat. Defaults true. */
  autoRetry?: boolean;
  /** Delay before the silent auto-retry fires. Default 1500ms — long
   *  enough for the user to see the recovery moment, short enough that
   *  they don't reach for the manual button. */
  autoRetryMs?: number;
};

/** Curated companion-tone copy keyed by tab. Falls back to a generic
 *  line for unknown tabs. Kept short — the moment should feel like a
 *  whisper, not a wall of text. */
const RECOVERY_COPY: Record<string, { line: string; action: MascotAction }> = {
  home: { line: "Hmm\u2026 something slipped. Fixing it now.", action: 'tap' },
  coach: { line: "Lost my train of thought\u2026 one sec.", action: 'peek' },
  insights: { line: "Crunching the numbers again\u2026", action: 'spin' },
  ai: { line: "Hold on\u2026 thinking again.", action: 'peek' },
  'ai-coach': { line: "Lost the thread\u2026 picking it up.", action: 'peek' },
  budget: { line: "Couldn\u2019t refresh this. Trying again\u2026", action: 'tap' },
  split: { line: "One sec, getting your groups\u2026", action: 'wave' },
  transactions: { line: "Reaching for your transactions\u2026", action: 'stretch' },
  rewards: { line: "Polishing your rewards\u2026", action: 'sip' },
  profile: { line: "Tidying up your profile\u2026", action: 'wave' },
  default: { line: "That didn\u2019t go as planned\u2026 give me a sec.", action: 'tap' },
};

function pickCopy(tabName?: string): { line: string; action: MascotAction } {
  if (!tabName) return RECOVERY_COPY.default;
  const normalised = tabName.toLowerCase().replace(/^the\s+|\s+section$/g, '').trim();
  return RECOVERY_COPY[normalised] || RECOVERY_COPY.default;
}

export default function MascotErrorState({
  tabName,
  onRetry,
  autoRetry = true,
  autoRetryMs = 1500,
}: Props) {
  const copy = pickCopy(tabName);
  const animVals = useRef(createMascotAnimValues()).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(8)).current;
  const stopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Entry: fade + slide + curated mascot animation.
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(slideIn, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
    requestAnimationFrame(() => {
      stopRef.current = playMascotAnimation(copy.action, animVals);
    });

    // Silent auto-retry once (the spec calls this "feels smart instead of broken").
    if (autoRetry && autoRetryMs > 0) {
      timerRef.current = setTimeout(() => {
        setRetrying(true);
        onRetry();
      }, autoRetryMs);
    }

    return () => {
      stopRef.current?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualRetry = useCallback(() => {
    haptics.light();
    if (timerRef.current) clearTimeout(timerRef.current);
    setRetrying(true);
    // Briefly bounce the mascot before triggering retry — gives a beat
    // of feedback so the user knows their tap registered.
    stopRef.current?.();
    stopRef.current = playMascotAnimation('bounce', animVals, () => onRetry());
    // Belt-and-braces: also fire onRetry directly in case the animation
    // is interrupted (e.g. unmount).
    setTimeout(onRetry, 360);
  }, [animVals, onRetry]);

  return (
    <Animated.View
      style={[
        s.wrap,
        { opacity: fadeIn, transform: [{ translateY: slideIn }] },
      ]}
      accessible
      accessibilityLabel={`${copy.line} Tap to retry.`}
    >
      <Animated.View
        style={{
          transform: [
            { translateX: animVals.translateX },
            { translateY: animVals.translateY },
            { rotate: rotateToDeg(animVals.rotate) },
            { scale: animVals.scale },
          ],
          opacity: animVals.opacity,
        }}
      >
        <Mascot size={72} glow />
      </Animated.View>

      <Text style={s.line} numberOfLines={3}>{copy.line}</Text>

      <Pressable
        onPress={handleManualRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        disabled={retrying}
      >
        <View
          style={[s.cta, retrying && { opacity: 0.7 }, { backgroundColor: '#FF8C66' }]}>
          <Ionicons name={retrying ? 'sync' : 'refresh'} size={14} color="#fff" />
          <Text style={s.ctaT}>{retrying ? 'Retrying\u2026' : 'Try again'}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    gap: 14,
    backgroundColor: 'transparent',
  },
  line: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 0,
  },
  ctaT: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
