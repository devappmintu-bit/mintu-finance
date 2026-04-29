/**
 * components/MascotMoment.tsx — MintU Personality Engine renderer.
 *
 * Two surfaces, one component:
 *
 *  • mode="home"  — small, non-blocking widget. Auto-fades after ~2.4s
 *                   so it never blocks scroll or tap targets. Tap on
 *                   the widget converts it into a "coach" moment
 *                   (full personality burst).
 *
 *  • mode="coach" — full personality burst. Bigger animation, haptic,
 *                   stays visible until the parent unmounts.
 *
 * The component owns its own data fetching (one POST per mount) so
 * surfaces can drop it in with zero ceremony. Keeps strict 1-day scope:
 * no chat, no DB, no analytics.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { makeStyles } from '../utils/makeStyles';
import { haptics } from '../utils/haptics';
import { fetchMascotMoment, getInstantFallback, MascotMomentDTO, MascotMode } from '../services/mascot';
import {
  createMascotAnimValues,
  playMascotAnimation,
  rotateToDeg,
} from '../utils/mascotAnimations';
import Mascot from './Mascot';

type Props = {
  mode?: MascotMode;
  /** When set, the widget reloads (and replays) whenever this value changes. */
  refreshKey?: string | number;
  /** Auto-dismiss the widget after this many ms (home mode only).
   *  Set to 0 to disable. Default 2400ms. Login + coach default to 0. */
  autoDismissMs?: number;
  /** Optional hook fired when the user taps the widget. The default
   *  behavior is to upgrade to a fresh "coach" moment in place. Login
   *  mode is non-interactive by default. */
  onTap?: (moment: MascotMomentDTO | null) => void;
  /** Force-collapse the widget regardless of internal state (e.g. when
   *  parent navigates away). */
  hidden?: boolean;
  /** Optional name hint — used by login mode to personalise the
   *  instant fallback before the LLM lands. */
  userName?: string;
  /** When true (default for login), render the instant fallback
   *  synchronously on mount and upgrade with the LLM if it arrives. */
  instantFirst?: boolean;
};

export default function MascotMoment({
  mode = 'home',
  refreshKey,
  autoDismissMs,
  onTap,
  hidden = false,
  userName,
  instantFirst,
}: Props) {
  const s = useStyles();

  // Login + coach: never auto-dismiss by default. Home: 2400ms default.
  const effectiveAutoDismiss =
    autoDismissMs !== undefined ? autoDismissMs : (mode === 'home' ? 2400 : 0);
  // Login defaults to instant-first (0ms render). Other modes default to network-first.
  const useInstantFirst = instantFirst !== undefined ? instantFirst : mode === 'login';

  // Bootstrap synchronously when instantFirst is on so first paint
  // never shows an empty bubble. The async LLM upgrade is fired in
  // useEffect below.
  const [moment, setMoment] = useState<MascotMomentDTO | null>(
    () => (useInstantFirst ? getInstantFallback(mode, userName) : null),
  );
  const [activeMode, setActiveMode] = useState<MascotMode>(mode);
  const [dismissed, setDismissed] = useState(false);

  // Animated values driving the mascot motion + the wrapper fade.
  const animVals = useRef(createMascotAnimValues()).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const containerTranslate = useRef(new Animated.Value(8)).current;
  const stopRef = useRef<(() => void) | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimers = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const playMoment = useCallback(
    (m: MascotMomentDTO) => {
      cancelTimers();
      // Fade-in on entry.
      Animated.parallel([
        Animated.timing(containerOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(containerTranslate, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
      // Run the curated animation.
      stopRef.current = playMascotAnimation(m.action, animVals);
    },
    [animVals, cancelTimers, containerOpacity, containerTranslate],
  );

  const fadeOutAndDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(containerTranslate, {
        toValue: -6,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start(() => setDismissed(true));
  }, [containerOpacity, containerTranslate]);

  const load = useCallback(
    async (asMode: MascotMode, force: boolean = false) => {
      try {
        // Round 53l.1: coach mode is always tap-driven and should
        // feel immediate + fresh — bypass the 5-min TTL cache there.
        // Login is also force-fresh (and non-cached server-side).
        // Home mode honors the cache so reopens don't jitter.
        const m = await fetchMascotMoment(asMode, {
          force: force || asMode === 'coach' || asMode === 'login',
          userName,
        });
        setMoment(m);
        setActiveMode(asMode);
        setDismissed(false);
        // Defer to next frame so opacity/translate reset cleanly first.
        requestAnimationFrame(() => playMoment(m));
        if (effectiveAutoDismiss > 0 && asMode === 'home') {
          dismissTimerRef.current = setTimeout(fadeOutAndDismiss, effectiveAutoDismiss);
        }
      } catch {
        // Silent failure — backend has its own fallback library.
      }
    },
    [effectiveAutoDismiss, fadeOutAndDismiss, playMoment, userName],
  );

  useEffect(() => {
    // INSTANT FIRST (Round 53l.2): if we already have a synchronously-
    // bootstrapped moment (login mode), play its animation immediately
    // on first paint. The async LLM upgrade fires next and replaces
    // the moment in place when it lands — never blocking the entry beat.
    if (moment && moment.source === 'instant-fallback') {
      requestAnimationFrame(() => playMoment(moment));
    }
    load(mode);
    return cancelTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refreshKey]);

  const handleTap = useCallback(() => {
    if (!moment) return;
    haptics.light();
    if (onTap) {
      onTap(moment);
      return;
    }
    // Default: upgrade to a fresh coach-mode burst in-place. Always
    // force-fresh on user-driven re-rolls so the cache never wins
    // against an explicit tap.
    cancelTimers();
    setDismissed(false);
    load('coach', true);
  }, [moment, onTap, cancelTimers, load]);

  if (dismissed || hidden || !moment) return null;

  const isCoach = activeMode === 'coach';
  const isLogin = activeMode === 'login';
  // Login uses a premium 64px mascot; coach 56px; home 36px.
  const mascotSize = isLogin ? 64 : isCoach ? 56 : 36;
  const wrapStyle = isLogin ? s.wrapLogin : isCoach ? s.wrapCoach : s.wrapHome;
  const bubbleStyle = isLogin ? s.bubbleLogin : isCoach ? s.bubbleCoach : s.bubbleHome;
  const textStyle = isLogin ? s.textLogin : isCoach ? s.textCoach : null;

  return (
    <Animated.View
      style={[
        s.wrap,
        wrapStyle,
        {
          opacity: containerOpacity,
          transform: [{ translateY: containerTranslate }],
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={handleTap}
        accessibilityRole="button"
        accessibilityLabel={`MintU mascot — ${moment.text}`}
        style={({ pressed }) => [s.row, isLogin && s.rowLogin, pressed && { opacity: 0.85 }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        disabled={isLogin}
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
          <Mascot size={mascotSize} glow={isCoach || isLogin} />
        </Animated.View>
        <View style={[s.bubble, bubbleStyle]}>
          <Text style={[s.text, textStyle]} numberOfLines={isLogin ? 3 : 2}>
            {moment.text}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  wrapHome: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  wrapCoach: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // Round 53l.2 — login surface: premium feel, vertical column (mascot
  // above text) so it reads as a hero, not a sidebar widget.
  wrapLogin: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignSelf: 'center',
    flexDirection: 'column',
  },
  rowLogin: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    maxWidth: 240,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleHome: {
    backgroundColor: c.bg.card,
    borderColor: c.border.subtle,
  },
  bubbleCoach: {
    backgroundColor: c.accent.primary + '14',
    borderColor: c.accent.primary + '35',
  },
  bubbleLogin: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    maxWidth: 280,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text.primary,
    lineHeight: 18,
  },
  textCoach: {
    fontSize: 14,
    fontWeight: '700',
    color: c.accent.primary,
  },
  textLogin: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text.primary,
    textAlign: 'center',
    lineHeight: 22,
  },
}));
