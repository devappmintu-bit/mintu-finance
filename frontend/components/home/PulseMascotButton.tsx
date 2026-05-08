/**
 * PulseMascotButton — Home top-left entry to MintU Pulse.
 *
 * Per the locked spec, this REPLACES nothing in Home — it's injected to
 * the left of the existing greeting so Home reads:
 *
 *     [🤖]   WELCOME, {User}
 *     [🤖]   Test User
 *
 * Three visual states driven by the `/api/pulse` response:
 *   • idle      — small breath/bounce (MintuMascot idle). Default.
 *   • new       — unread_count > 0  → soft accent-coloured glow ring.
 *   • important — has_important     → thicker pulse ring + numeric badge.
 *
 * Polling contract:
 *   Fetch on mount and on screen focus. Refresh every 5 min while
 *   Home is focused. No websocket — the feed only refreshes hourly
 *   via the existing `_news_refresher_loop` worker, so aggressive
 *   polling would just burn battery.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useFocusEffect, router } from 'expo-router';
import MintuMascot from '../MintuMascot';
import api from '../../utils/api';
import { BR_COLORS } from '../../utils/brutalist';

type PulseHeader = {
  unread_count: number;
  has_important: boolean;
};

type Props = {
  // Called with the latest header so Home can nudge other surfaces if
  // it wants to (currently unused; kept so the screen never re-fetches
  // Pulse on its own).
  onHeader?: (h: PulseHeader) => void;
};

const MASCOT_SIZE = 44;

export default function PulseMascotButton({ onHeader }: Props) {
  const [header, setHeader] = useState<PulseHeader>({
    unread_count: 0,
    has_important: false,
  });

  const loadRef = useRef<boolean>(false);

  const fetchHeader = useCallback(async () => {
    if (loadRef.current) return; // prevent concurrent hits
    loadRef.current = true;
    try {
      const r = await api.get('/pulse');
      const h: PulseHeader = {
        unread_count: Number(r?.data?.unread_count || 0),
        has_important: Boolean(r?.data?.has_important),
      };
      setHeader(h);
      onHeader?.(h);
    } catch {
      // Pulse is non-critical — swallow so Home never breaks on feed failure.
    } finally {
      loadRef.current = false;
    }
  }, [onHeader]);

  // Fetch on mount + on every focus.
  useFocusEffect(
    useCallback(() => {
      fetchHeader();
      // Lightweight background refresh while Home is focused.
      const iv = setInterval(fetchHeader, 5 * 60 * 1000);
      return () => clearInterval(iv);
    }, [fetchHeader])
  );

  useEffect(() => {
    fetchHeader();
  }, [fetchHeader]);

  const open = useCallback(() => {
    router.push('/pulse' as any);
  }, []);

  // Glow ring — only animates when unread_count > 0 OR has_important.
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const state: 'idle' | 'new' | 'important' = header.has_important
    ? 'important'
    : header.unread_count > 0
    ? 'new'
    : 'idle';

  useEffect(() => {
    cancelAnimation(glowScale);
    cancelAnimation(glowOpacity);
    if (state === 'idle') {
      glowScale.value = withTiming(1, { duration: 200 });
      glowOpacity.value = withTiming(0, { duration: 200 });
      return;
    }
    // New: soft slow pulse. Important: faster + wider.
    const maxScale = state === 'important' ? 1.35 : 1.2;
    const maxOpacity = state === 'important' ? 0.55 : 0.35;
    const duration = state === 'important' ? 900 : 1600;
    glowScale.value = withRepeat(
      withSequence(
        withTiming(maxScale, { duration, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(maxOpacity, { duration, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
  }, [state, glowScale, glowOpacity]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <Pressable
      onPress={open}
      hitSlop={10}
      style={st.tap}
      accessibilityRole="button"
      accessibilityLabel={
        state === 'important'
          ? `MintU Pulse — ${header.unread_count} important updates`
          : state === 'new'
          ? `MintU Pulse — ${header.unread_count} new updates`
          : 'MintU Pulse'
      }
    >
      {/* Glow ring (sits behind mascot) */}
      <Animated.View
        pointerEvents="none"
        style={[
          st.glow,
          glowStyle,
          state === 'important' && st.glowImportant,
        ]}
      />
      {/* Mascot — idle state always; any "celebrate" etc. would be too
          loud for a top-left always-visible button. Motion differentiation
          comes entirely from the glow ring. */}
      <MintuMascot size={MASCOT_SIZE} state="idle" />
      {/* Numeric badge — only when unread > 0 */}
      {header.unread_count > 0 && (
        <View
          style={[
            st.badge,
            state === 'important' && st.badgeImportant,
          ]}
        >
          <Text style={st.badgeTxt}>
            {header.unread_count > 9 ? '9+' : String(header.unread_count)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  tap: {
    width: MASCOT_SIZE + 12,
    height: MASCOT_SIZE + 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  glow: {
    position: 'absolute',
    width: MASCOT_SIZE + 4,
    height: MASCOT_SIZE + 4,
    borderRadius: (MASCOT_SIZE + 4) / 2,
    // R101C — White-only mascot plate. The orange/saffron glow was
    // doubling up with the home header's accent colour and making the
    // whole top-left corner read as one orange blob. White plate with
    // a thin ink hairline keeps the mascot iconic without the colour
    // overload. State-coloured glow is now reserved for the
    // 'important' state only (red, see glowImportant).
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
  },
  glowImportant: {
    backgroundColor: BR_COLORS.negative,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: BR_COLORS.paper,
    backgroundColor: BR_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImportant: { backgroundColor: BR_COLORS.negative },
  badgeTxt: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    lineHeight: Platform.select({ ios: 11, default: 12 }),
  },
});
