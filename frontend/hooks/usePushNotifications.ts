// Centralized push notification hook — registers the device push token with the
// backend the first time an authenticated user opens the app, then sets up a
// foreground notification handler so heads-up banners show while the app is open.
//
// Safe to call multiple times (no-ops on web and on repeat calls).
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';

const TOKEN_STORAGE_KEY = '@mintu:expo_push_token';

// Foreground banner behavior (tapping inside the app still gets a notification).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const { token: authToken } = useAuthStore();
  const registered = useRef(false);

  useEffect(() => {
    if (!authToken || registered.current) return;
    registered.current = true;

    (async () => {
      try {
        // Skip on web and simulators — Expo push only works on real devices.
        if (Platform.OS === 'web' || !Device.isDevice) return;

        // 1) Ensure permissions
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          const asked = await Notifications.requestPermissionsAsync();
          status = asked.status;
        }
        if (status !== 'granted') return;

        // 2) Android requires a channel for heads-up behavior
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.DEFAULT,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#E65100',
          });
        }

        // 3) Get Expo push token
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const pushToken = tokenData.data;

        // 4) Only hit the backend if the token actually changed
        const cachedToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
        if (cachedToken === pushToken) return;

        await api.post('/notifications/register-token', { push_token: pushToken });
        await AsyncStorage.setItem(TOKEN_STORAGE_KEY, pushToken);
      } catch (e) {
        // Swallow silently — never block app boot on notification failures.
        console.log('Push registration skipped:', e);
      }
    })();
  }, [authToken]);
}

// Helper to send a test push — used by the Settings → "Send Test Push" button.
export async function sendTestPush(): Promise<{ sent: boolean; message: string }> {
  try {
    const res = await api.post('/notifications/send-test', {});
    return { sent: !!res.data?.sent, message: res.data?.message || 'Test push sent' };
  } catch (e: any) {
    return { sent: false, message: e?.response?.data?.detail || 'Could not send test push' };
  }
}
