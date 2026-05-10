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
import { router } from 'expo-router';
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

// R114 — push-tap routing map. Each notification carries a `data.kind`
// field (set server-side by `services/notifications_v2.py`); we map it
// to the appropriate in-app deep link when the user taps the banner or
// system notification. Falls back to `/(tabs)` if the kind is unknown.
function deeplinkForPushKind(data: any): string {
  const kind = (data?.kind || '').toString();
  const id = data?.id ? String(data.id) : null;
  switch (kind) {
    case 'transaction':
    case 'salary':
    case 'overspend':         return '/(tabs)/transactions';
    case 'streak':
    case 'streak_reminder':
    case 'reward':            return '/(tabs)/rewards';
    case 'split':
    case 'split_reminder':    return id ? `/split/${id}` : '/(tabs)/split';
    case 'goal':
    case 'goal_milestone':    return '/goals';
    case 'budget_alert':
    case 'month_end':
    case 'weekly_wrap':       return '/(tabs)/budget';
    case 'pulse':
    case 'daily_brief':       return '/pulse-v2';
    case 'coach':
    case 'proactive_nudge':   return '/(tabs)/ai-coach';
    case 'notif_inbox':
    case 'notification':      return '/notifications';
    default:                  return '/(tabs)';
  }
}

export function usePushNotifications() {
  const { token: authToken } = useAuthStore();
  const registered = useRef(false);

  // R114 — Notification-tap response listener. Mounted ONCE per app
  // lifecycle; routes the tap to the right screen via expo-router.
  // Also handles the cold-start case where the user taps a notification
  // while the app is killed (`getLastNotificationResponseAsync`).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;

    // Cold-start handler — if the app was launched FROM a notification,
    // route to the deep-link target after first paint.
    (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (!alive || !last) return;
        const route = deeplinkForPushKind(last.notification?.request?.content?.data);
        // Wait one tick so the layout has mounted.
        setTimeout(() => {
          try { router.push(route as any); } catch { /* noop */ }
        }, 350);
      } catch { /* noop */ }
    })();

    // Foreground / background tap handler.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const route = deeplinkForPushKind(response.notification.request.content.data);
        router.push(route as any);
      } catch { /* noop */ }
    });

    return () => {
      alive = false;
      try { sub.remove(); } catch { /* noop */ }
    };
  }, []);

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
        if (__DEV__) console.log('Push registration skipped:', e);
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
