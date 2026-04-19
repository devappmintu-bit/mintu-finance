import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../components/ToastConfig';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { usePushNotifications } from '../hooks/usePushNotifications';

// Silence noisy, non-actionable deprecation warnings from RN core + libs.
// These warnings are informational for future RN versions and don't affect runtime.
const NOISY_PATTERNS = [
  '"shadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  '[expo-av]',
  '[expo-notifications]',
  'Listening to push token changes is not yet fully supported on web',
];
LogBox.ignoreLogs(NOISY_PATTERNS);

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

  // Registers device push token with backend once auth is ready.
  // Silent on web/simulators, idempotent across remounts.
  usePushNotifications();

  useEffect(() => {
    loadFromStorage();
    loadLang();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="unlock" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="premium" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="premium-reports" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="yearly" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="legal/[page]" options={{ animation: 'slide_from_right' }} />
      </Stack>
      <Toast config={toastConfig} position="bottom" bottomOffset={100} />
    </>
  );
}
