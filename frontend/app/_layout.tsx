import { Stack, router } from 'expo-router';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, View, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../components/ToastConfig';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { useThemePref } from '../store/themeStore';
import ThemeTransitionOverlay from '../components/ui/ThemeTransitionOverlay';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useAppLock } from '../hooks/useAppLock';
import { useDailyCheckIn } from '../hooks/useDailyCheckIn';
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
import AppLockOverlay from '../components/AppLockOverlay';
import { isExpoGo } from '../utils/lockManager';
import { initSentry } from '../utils/observability';

// Round 53e — Sentry init runs at import time so the SDK can wrap the
// JS error path BEFORE any other code mounts. No-op when DSN unset.
initSentry();

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

  // Re-lock the app on resume from background — reinvokes biometric/PIN every time.
  useAppLock();

  // Daily streak check-in — fires exactly once per cold-start when a valid
  // JWT is present. Backend is idempotent per UTC day so this is safe to
  // call eagerly. See hooks/useDailyCheckIn.ts for full spec.
  useDailyCheckIn();

  useEffect(() => {
    loadFromStorage();
    loadLang();
    loadThemePref();
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
          {/* Round 40 — global offline banner. Mounted outside the Stack so
              it persists across route transitions and sits on top of every
              screen (z-index 999, pointerEvents="none" so it never swallows
              taps). */}
          <OfflineBanner />
          {/*
            Round 30b: the previous Stack `key={resolvedTheme}` hard-remount
            is GONE. All 14 previously-legacy screens have been migrated to
            useAppColors + makeStyles, so they re-read theme tokens
            reactively — no unmount required. Benefit: theme toggle now
            preserves scroll position, in-flight network state, and keyboard
            focus across the entire app.
          */}
          <StatusBar style={resolvedTheme === 'light' ? 'dark' : 'light'} />
          <Stack
            screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: c.bg.primary } }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="unlock" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="premium" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="premium-reports" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="premium-hub" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="money-school" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="rewards-hub" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="leaderboard" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="yearly" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="legal/[page]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="gmail" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="gmail-connected" options={{ animation: 'fade' }} />
            <Stack.Screen name="premium-activated" options={{ animation: 'fade' }} />
            <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="search" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="coin-ledger" options={{ animation: 'slide_from_right' }} />
          </Stack>
          <Toast config={toastConfig} position="bottom" bottomOffset={100} />
          {/* 300ms CrossFade overlay while the Stack remount re-skins the tree */}
          <ThemeTransitionOverlay />
          {/* Round 51d — full-screen opaque lock overlay. Mounted LAST so
              it renders above every Stack screen, sheet, and toast.
              Only paints when authStore.locked === true. Guarantees that
              sensitive content is never visible during the lock→unlock
              transition. */}
          <AppLockOverlay />
        </BottomSheetModalProvider>
      </PortalProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
