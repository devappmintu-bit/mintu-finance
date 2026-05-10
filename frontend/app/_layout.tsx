import { Stack, router, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, View, TextInput, InteractionManager } from 'react-native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../components/ToastConfig';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { useThemePref } from '../store/themeStore';
import { navIntel, maybePrewarmNext } from '../utils/navIntel';
import { telemetry } from '../utils/routeTelemetry';
import '../utils/navPrewarmers'; // R115 — registers cheap prewarmers for tabs/pulse
import ThemeTransitionOverlay from '../components/ui/ThemeTransitionOverlay';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useSMSListener } from '../hooks/useSMSListener';
import { useAppLock } from '../hooks/useAppLock';
import { useDailyCheckIn } from '../hooks/useDailyCheckIn';
import { useHydrateNeoTheme } from '../store/neoTheme';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PortalProvider } from '@gorhom/portal';
import { COLORS, useAppColors } from '../utils/theme';
import ErrorBoundary from '../components/ErrorBoundary';
import OfflineBanner from '../components/OfflineBanner';
import SlowNetworkHint from '../components/SlowNetworkHint';
import { SmartBackProvider } from '../hooks/useSmartBack';
import AppLockOverlay from '../components/AppLockOverlay';
import SmartEntryHost from '../components/smart-entry/SmartEntryHost';
import BrutalToastHost from '../components/brutal/BrutalToastHost';
import CmdPalette from '../components/CmdPalette';
import { useFinContext } from '../store/financialContext';
import { isExpoGo } from '../utils/lockManager';

// Phase 5 Wave 4 — boot-sequence optimization.
// * Sentry init is DEFERRED to post-first-paint (was eager at import).
//   Even in no-op mode the SDK module loaded ~40 MB of JS into the bundle
//   at cold start. A 2-s delay is invisible to users but lets the first
//   screen paint render hundreds of ms sooner on mid-tier Android.
// * Sync engine is deferred to runAfterInteractions — it subscribes to
//   NetInfo + AppState (both expensive first calls). No pending offline
//   expenses need to drain in the first second of the app.
// * Both still run ~2 s after boot so they catch pre-auth errors etc.

// Silence noisy, non-actionable deprecation warnings from RN core + libs.
// These warnings are informational for future RN versions and don't affect runtime.
const NOISY_PATTERNS = [
  '"shadow*" style props are deprecated',
  '"textShadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  '[expo-av]',
  '[expo-notifications]',
  'Listening to push token changes is not yet fully supported on web',
];
LogBox.ignoreLogs(NOISY_PATTERNS);

// Round 47 perf — set sensible cross-platform defaults on TextInput so we
// don't have to repeat them on 23+ files:
//  • selectionColor: makes the cursor visible on dark backgrounds (iOS bug)
//  • placeholderTextColor: medium-grey works against both light & dark cards
// Setting once on TextInput.defaultProps applies to every <TextInput /> in
// the tree; individual components can still override with their own props.
((TextInput as any).defaultProps ||= {});
(TextInput as any).defaultProps.selectionColor = COLORS.accent.brand; // brand
(TextInput as any).defaultProps.cursorColor = COLORS.accent.brand;    // Android-only API

// react-native-web routes warnings through console.warn — LogBox does not intercept there.
// Patch it once at startup so 3rd-party library deprecations don't spam the browser console.
if (Platform.OS === 'web' && typeof console !== 'undefined' && !(console as any).__mintuFiltered) {
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const shouldSuppress = (args: any[]) => {
    const first = args[0];
    if (typeof first !== 'string') return false;
    return NOISY_PATTERNS.some(p => first.includes(p));
  };
  console.warn = (...args: any[]) => { if (!shouldSuppress(args)) origWarn(...args); };
  console.error = (...args: any[]) => { if (!shouldSuppress(args)) origError(...args); };
  (console as any).__mintuFiltered = true;
}

export default function RootLayout() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage);
  const loadLang = useLangStore((state) => state.loadLang);
  const loadThemePref = useThemePref((state) => state.loadFromStorage);
  const resolvedTheme = useThemePref((state) => state.resolved);
  const c = useAppColors();

  // Load Inter font family — premium-feeling, bundled via @expo-google-fonts/inter
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  // Registers device push token with backend once auth is ready.
  // Silent on web/simulators, idempotent across remounts.
  usePushNotifications();

  // R120 — Native SMS listener (Android-only, no-op on web/iOS).
  // Forwards bank/UPI SMS to /api/sms/bulk-parse for deterministic
  // parsing. Activates only on EAS Builds with the native module
  // bundled and READ_SMS+RECEIVE_SMS granted.
  useSMSListener();

  // Re-lock the app on resume from background — reinvokes biometric/PIN every time.
  useAppLock();

  // Daily streak check-in — fires exactly once per cold-start when a valid
  // JWT is present. Backend is idempotent per UTC day so this is safe to
  // call eagerly. See hooks/useDailyCheckIn.ts for full spec.
  // Round 100Z — Hydrate Neo-Brutalism theme preference (light/dark/
  // system) from AsyncStorage so the user's last choice is honored on
  // cold-start. Non-blocking; falls back to 'system' default.
  useDailyCheckIn();
  useHydrateNeoTheme();

  // R115 Sprint-2 — pathname-driven nav intelligence + dev telemetry.
  // Records every visit into the predictive graph, attempts a top-1
  // prewarm of the next likely route after a 1.5 s idle (so we never
  // race the user's actual navigation), and feeds the dev telemetry
  // ring buffer. All side-effects are noop-safe.
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    navIntel.recordVisit(pathname);
    if (__DEV__) telemetry.markMount(pathname);
    const t = setTimeout(() => {
      try { maybePrewarmNext(pathname); } catch { /* noop */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    loadFromStorage();
    loadLang();
    loadThemePref();
  }, []);

  // Round 82 — financialContext SSoT adoption.
  // The 200-LOC `financialContext` store exists to be the one source of
  // truth for money data across the app, but was only populated on a
  // SmartEntry save. That meant AIBrainDashboard / NewsCardStack saw
  // empty data on cold-start. Fix: once the user is authenticated, fire
  // ONE refresh. The store has internal staleness logic (60 s) so this
  // is cheap to re-trigger on focus/mount. Any screen can now consume
  // the SSoT via `useFinContext()` instead of rolling its own fetcher.
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!userId) return;
    // Defer behind interactions so the first paint isn't blocked.
    const handle = InteractionManager.runAfterInteractions(() => {
      useFinContext.getState().refresh(false).catch(() => {});
    });
    return () => { try { handle.cancel?.(); } catch { /* noop */ } };
  }, [userId]);

  // Phase 5 Wave 4 — deferred boot tasks.
  // Sentry init + offline-sync engine both previously ran at module
  // evaluation time, blocking first paint by ~500-900 ms on mid-tier
  // Android. Both are now deferred until AFTER the first interaction,
  // plus a safety net 2-s setTimeout for the Sentry dynamic import.
  // User-visible impact: home tab paints ~500 ms sooner on cold start.
  useEffect(() => {
    const t1 = setTimeout(() => {
      import('../utils/observability')
        .then(({ initSentry }) => { try { initSentry(); } catch { /* noop */ } })
        .catch(() => {});
    }, 2000);
    const handle = InteractionManager.runAfterInteractions(() => {
      import('../services/syncEngine')
        .then(({ initSyncEngine }) => { try { initSyncEngine(); } catch { /* noop */ } })
        .catch(() => {});
    });
    return () => {
      clearTimeout(t1);
      try { handle.cancel?.(); } catch { /* noop */ }
    };
  }, []);

  // Round 51d — Expo Go dev banner.
  // Real-device testing in Expo Go was breaking biometric auth (the prompt
  // is intercepted by the Expo dev host). The unlock flow now bypasses
  // biometric in Expo Go, but we surface this clearly to the user via a
  // single non-blocking toast on first mount so they know why Face ID /
  // Fingerprint isn't being requested. Fires exactly once per cold start.
  useEffect(() => {
    if (!isExpoGo()) return;
    // Tiny delay so Toast root has mounted.
    const t = setTimeout(() => {
      try {
        Toast.show({
          type: 'info',
          text1: '🛠 Dev mode (Expo Go)',
          text2: 'App lock is bypassed. Use a built APK to test biometric.',
          position: 'bottom',
          visibilityTime: 4500,
        });
      } catch { /* noop */ }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  // ── Cold-start safety net (Round 48 clean-session audit) ──────────────
  // After loadFromStorage() resolves, if there is NO valid token, we know
  // the app is starting in a logged-out state. In that case wipe ALL
  // per-user device state as a defensive measure — guards against:
  //   • A previous logout that crashed mid-flow leaving residual SecureStore PIN
  //   • Demo/dev/test data baked into AsyncStorage from earlier builds
  //   • A user who manually cleared just the auth token from devtools
  // Fully idempotent — running clearSessionState on a truly empty device is a
  // no-op so we don't pay any cost on first install.
  useEffect(() => {
    let alive = true;
    const unsub = useAuthStore.subscribe((state, prev) => {
      // We only want to act ONCE — when isLoading flips from true→false
      // the very first time after loadFromStorage() resolves.
      if (!alive) return;
      if (prev.isLoading && !state.isLoading) {
        if (!state.token) {
          // Round 50 Session 4b — `?testMode=1` URL flag (web only) skips
          // the cold-start wipe so the Playwright visual-gate can persist
          // its theme/locale seed across reloads. No effect on native.
          if (Platform.OS === 'web') {
            try {
              if (typeof window !== 'undefined' && window.location?.search?.includes('testMode=1')) {
                return;
              }
            } catch { /* ignore */ }
          }
          import('../utils/clearSessionState')
            .then(({ clearSessionState }) => clearSessionState())
            .catch(() => {});
        }
      }
    });
    return () => { alive = false; unsub(); };
  }, []);

  /**
   * Auth-expired redirect.
   * When the axios interceptor detects a 401 on a request that *had* a token,
   * it calls authStore.lock(). We subscribe to that transition and push the
   * user to /unlock so they can re-authenticate with PIN/biometric.
   */
  useEffect(() => {
    let prev = useAuthStore.getState().locked;
    const unsub = useAuthStore.subscribe((state) => {
      if (!prev && state.locked) {
        try { router.replace('/unlock'); } catch { /* noop */ }
      }
      prev = state.locked;
    });
    return unsub;
  }, []);

  // Keep background dark while fonts are warming up — no jarring flash.
  // On web, `useFonts` may stall if the CDN is slow; after 1s we show the app
  // anyway (system font will render until Inter arrives).
  const [fontsTimeout, setFontsTimeout] = React.useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontsTimeout(true), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!fontsLoaded && !fontsTimeout) {
    return <View style={{ flex: 1, backgroundColor: c.bg.primary }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg.primary }}>
      <ErrorBoundary variant="full">
      <PortalProvider>
        <BottomSheetModalProvider>
          <SmartBackProvider>
          {/* Round 40 — global offline banner. Mounted outside the Stack so
              it persists across route transitions and sits on top of every
              screen (z-index 999, pointerEvents="none" so it never swallows
              taps). */}
          <OfflineBanner />
          {/* R114 — Slow-network hint banner. Surfaces when ANY API call
              has been pending > 3s so the user knows the app isn't frozen.
              Sits BELOW OfflineBanner (z-998 vs 999); auto-hides 600 ms
              after the slow request resolves. */}
          <SlowNetworkHint />
          {/*
            Round 30b: the previous Stack `key={resolvedTheme}` hard-remount
            is GONE. All 14 previously-legacy screens have been migrated to
            useAppColors + makeStyles, so they re-read theme tokens
            reactively — no unmount required. Benefit: theme toggle now
            preserves scroll position, in-flight network state, and keyboard
            focus across the entire app.
          */}
          {/* Round 56 — app is light-only; status bar ink is always dark. */}
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              // R114 Phase-5 — default cross-stack transition is now a
              // native-feeling slide (iOS slide-back gesture supported).
              // Auth/onboarding/index keep `fade` overrides below for
              // smooth boot-sequence cross-fades.
              animation: 'slide_from_right',
              animationDuration: 240,
              gestureEnabled: true,
              contentStyle: { backgroundColor: c.bg.primary },
            }}
          >
            {/* Boot/auth screens cross-fade so there's no "drawer slide"
                feel before login. */}
            <Stack.Screen name="index" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="auth" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="unlock" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="premium" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="premium-reports" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="premium-hub" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="money-school" options={{ animation: 'slide_from_right' }} />
            {/* Round 89 Strike 3 — /rewards-hub deleted.
                Round 92 — /leaderboard retired (gamification kill).
                Round 94 — /coin-ledger + /mystery-box deleted. */}
            <Stack.Screen name="yearly" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="insights/[range]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="onboarding/income" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
            <Stack.Screen name="legal/[page]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="gmail" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="gmail-connected" options={{ animation: 'fade' }} />
            <Stack.Screen name="premium-activated" options={{ animation: 'fade' }} />
            <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="search" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
          <Toast config={toastConfig} position="bottom" bottomOffset={100} />
          {/* R103D — Global brutal celebration toast. Any screen can fire
              `showBrutalToast('🎯 Cap set — baseline started', 'accent')`.
              Mounted ABOVE the legacy `react-native-toast-message` host so
              celebrations land at top of viewport (status-style) while
              regular toasts (errors, info) stay at the bottom. */}
          <BrutalToastHost />
          {/* 300ms CrossFade overlay while the Stack remount re-skins the tree */}
          <ThemeTransitionOverlay />
          {/* Round 51d — full-screen opaque lock overlay. Mounted LAST so
              it renders above every Stack screen, sheet, and toast.
              Only paints when authStore.locked === true. Guarantees that
              sensitive content is never visible during the lock→unlock
              transition. */}
          <AppLockOverlay />
          {/* v10 Phase 2A — Unified SmartEntry host. Any screen (or AI
              Brain action) can call useSmartEntry.open('expense'|'budget'|'goal')
              and the right sheet pops globally. Mounted LAST so sheets
              render above stack but BELOW the app lock overlay. */}
          <SmartEntryHost />
          {/* R117 — Global Cmd Palette. Trigger via Cmd/Ctrl+K on web,
              or long-press any tab on the bottom tab bar. Self-gated;
              renders nothing until the store flips visible=true. */}
          <CmdPalette />
          </SmartBackProvider>
        </BottomSheetModalProvider>
      </PortalProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
