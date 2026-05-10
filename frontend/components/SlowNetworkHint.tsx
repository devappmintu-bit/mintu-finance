/**
 * SlowNetworkHint — R114 trust-preserving slow-API banner.
 *
 * Activates when the user has been online but the in-flight API has
 * been pending > 3 s. Gives a polite, low-anxiety nudge so they don't
 * conclude the app is broken and force-quit (the #1 reason for losing
 * authenticated cohorts on Indian Tier-2/3 mobile networks).
 *
 * Trigger contract:
 * -----------------
 *   Any caller can flag a slow request via:
 *     beginSlowRequest('id-or-route')
 *     ...
 *     endSlowRequest('id-or-route')
 *
 *   The component listens to the registry and surfaces the banner when
 *   ANY request has been pending > 3 s, plus a 600 ms grace window
 *   to absorb "finished just before banner painted" jitter.
 *
 *   axios interceptor in /app/frontend/utils/api.ts wires this in for
 *   every API call automatically (see R114 changes there).
 *
 * Visual style:
 * -------------
 *   Sits BELOW the OfflineBanner (which has higher z-index). Brutal
 *   yellow stamp tile so it's visible without being alarming. Auto-
 *   hides ~600 ms after the last slow request resolves.
 *
 * Performance:
 * ------------
 *   - Uses module-level Set + a 250 ms tick instead of per-request
 *     state-setters (so the component never re-renders on healthy
 *     fast requests).
 *   - Animation runs on the native driver (`translateY`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '../hooks/useIsOnline';
import {
  BR_COLORS,
  BR_BORDER,
  BR_FONT,
  PALETTE,
} from './brutal';

// ---------------------------------------------------------------------------
// Module-level registry. Calling code wraps API calls.
// ---------------------------------------------------------------------------

type Pending = { id: string; startedAt: number };
const pending = new Map<string, Pending>();

export function beginSlowRequest(id: string) {
  if (!id) return;
  pending.set(id, { id, startedAt: Date.now() });
}
export function endSlowRequest(id: string) {
  if (!id) return;
  pending.delete(id);
}
export function activeSlowRequestCount(): number {
  const now = Date.now();
  let n = 0;
  for (const p of pending.values()) {
    if (now - p.startedAt > THRESHOLD_MS) n++;
  }
  return n;
}

const THRESHOLD_MS = 3_000;   // a request is "slow" after 3 s
const HOLD_MS = 600;          // keep banner up 0.6 s after last request resolves
const HEIGHT = 32;
const ANIM_MS = 220;
const TICK_MS = 250;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SlowNetworkHint() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();

  // We separately track "is at least one request currently slow?" to
  // drive visibility. A 250 ms tick samples the registry. If we wanted
  // sub-frame precision we'd subscribe to events, but the user-visible
  // threshold is 3 s so 250 ms sampling is invisible.
  const [visible, setVisible] = useState(false);
  const lastSeenRef = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    const t = setInterval(() => {
      if (!alive) return;
      const n = activeSlowRequestCount();
      const now = Date.now();
      if (n > 0) {
        lastSeenRef.current = now;
        if (!visible) setVisible(true);
      } else if (visible && now - lastSeenRef.current > HOLD_MS) {
        setVisible(false);
      }
    }, TICK_MS);
    return () => { alive = false; clearInterval(t); };
  }, [visible]);

  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: ANIM_MS,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  // Hide entirely when offline — the OfflineBanner takes over so we
  // don't double-up.
  if (!online) return null;

  // Sit just BELOW the OfflineBanner space. OfflineBanner only paints
  // when offline so they never overlap.
  const top = (insets.top || 0) + 0;
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [-(HEIGHT + 6), 0] });
  const opacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        { top, transform: [{ translateY }], opacity },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      accessibilityLabel="Slower than usual. Hang on — we're still loading."
    >
      <View style={styles.inner}>
        <Text style={styles.txt}>⏳ SLOWER THAN USUAL — HANG ON</Text>
      </View>
    </Animated.View>
  );
}

const styles = {
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 998, // just below OfflineBanner (999)
    elevation: 998,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6 },
      android: {},
    }),
  } as any,
  inner: {
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: PALETTE.yellow,
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
  } as any,
  txt: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 11,
    letterSpacing: 0.5,
  } as any,
};
