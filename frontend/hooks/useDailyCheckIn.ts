/**
 * useDailyCheckIn — fires ONE /streak/check-in per cold-start when auth
 * is ready. Idempotent by design: the backend keys on UTC-day, so even
 * if this hook remounts we never double-award.
 *
 * Why here and not on home? Because the home screen is lazy-rendered
 * after navigation settles. Bootstrapping here guarantees the streak
 * advances the moment a valid JWT is present — before any screen reads
 * the streak number to display it.
 *
 * Side-effects:
 *   • Awards 2-25 coins once per UTC day (see core/streak._streak_reward_for)
 *   • Fires a 🔥 haptic on first successful advance so the user feels rewarded
 *   • Toasts a soft celebration when streak crosses a milestone day
 *     (7, 14, 30) — only once per day per milestone via AsyncStorage key
 *     ``streak_milestone_<UTCday>``.
 *
 * Failure modes:
 *   • Offline / 5xx → silently skipped; next cold-start retries.
 *   • 401 → handled by global axios interceptor (redirects to /unlock).
 */
import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';

export function useDailyCheckIn() {
  const fired = useRef(false);
  const lastTokenRef = useRef<string | null>(null);
  const token = useAuthStore((s) => s.token);
  // Don't fire while the app-lock screen (/unlock) is active.
  // The toast must only appear on the home screen after PIN/biometric passes.
  const locked = useAuthStore((s) => s.locked);

  useEffect(() => {
    // Round 34 fix — reset the fire-guard whenever the JWT actually
    // changes identity. Previous logic let the guard persist across a
    // logout→login cycle, so the second user never got their streak
    // bumped until a full app kill.
    if (token !== lastTokenRef.current) {
      fired.current = false;
      lastTokenRef.current = token;
    }

    // Wait until the user has passed the lock screen before showing any toast.
    if (fired.current || !token || locked) return;
    fired.current = true;

    (async () => {
      try {
        const r = await api.post('/streak/check-in');
        const data = r.data || {};

        // No-op branch — user already checked in today. Silent.
        if (data.already_checked_in) return;

        // Streak just advanced — give a tactile + visual nudge.
        if (data.incremented) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

          const streak = Number(data.streak_current || 0);
          const coins = Number(data.coins_awarded || 0);
          const milestoneBonus = Number(data.milestone_bonus || 0);
          const freezeUsed = !!data.freeze_used;

          // Freeze saved the streak — dedicated celebration.
          if (freezeUsed) {
            Toast.show({
              type: 'success',
              text1: '❄️ Streak Freeze used!',
              text2: `Your ${streak}-day streak is safe · +${coins} coins`,
              visibilityTime: 4500,
            });
            return;
          }

          // Milestone celebration (only once per milestone day).
          const isMilestone = [3, 7, 14, 30, 50, 100].includes(streak);
          const today = new Date().toISOString().slice(0, 10);
          const seenKey = `streak_milestone_${streak}_${today}`;
          const already = await AsyncStorage.getItem(seenKey).catch(() => null);

          if (milestoneBonus > 0) {
            // Weekly / monthly bonus — bigger, louder toast.
            await AsyncStorage.setItem(seenKey, '1').catch(() => {});
            const isMonthly = streak % 30 === 0;
            Toast.show({
              type: 'success',
              text1: isMonthly ? `🏆 ${streak}-day MEGA bonus!` : `🎯 Weekly bonus unlocked!`,
              text2: `+${coins} coins (+${milestoneBonus} milestone) · You're unstoppable`,
              visibilityTime: 5000,
            });
          } else if (isMilestone && !already) {
            await AsyncStorage.setItem(seenKey, '1').catch(() => {});
            Toast.show({
              type: 'success',
              text1: `🔥 ${streak}-day streak!`,
              text2: `+${coins} coins · You're on a roll`,
              visibilityTime: 4000,
            });
          } else if (coins > 0) {
            Toast.show({
              type: 'success',
              text1: `🔥 Day ${streak}`,
              text2: `+${coins} coins earned`,
              visibilityTime: 2500,
            });
          }
        }
      } catch {
        // Silently swallow — don't block the app over a streak call.
      }
    })();
  }, [token, locked]);
}
