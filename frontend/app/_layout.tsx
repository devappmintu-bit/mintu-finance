import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../components/ToastConfig';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';

// Silence noisy, non-actionable deprecation warnings from RN core + libs.
// These warnings are informational for future RN versions and don't affect runtime.
LogBox.ignoreLogs([
  '"shadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  '[expo-av]',
  '[expo-notifications]',
  'Listening to push token changes is not yet fully supported on web',
]);

export default function RootLayout() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage);
  const loadLang = useLangStore((state) => state.loadLang);

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
        <Stack.Screen name="(tabs)" />
      </Stack>
      <Toast config={toastConfig} position="bottom" bottomOffset={100} />
    </>
  );
}
