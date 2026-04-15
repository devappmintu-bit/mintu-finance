import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { startAutoSync } from '../utils/offline';

export default function RootLayout() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage);
  const loadLang = useLangStore((state) => state.loadLang);

  useEffect(() => {
    loadFromStorage();
    loadLang();
    // Start auto-sync for offline queue
    const unsubscribe = startAutoSync();
    return () => unsubscribe();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
