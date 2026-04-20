/**
 * useHaptic — one-liner haptic feedback across the app.
 *
 * Usage:
 *   const haptic = useHaptic();
 *   onPress={() => { haptic.light(); doAction(); }}
 *
 * All methods are no-ops on web/simulators — safe to call anywhere.
 */
import { useMemo } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function useHaptic() {
  return useMemo(() => {
    const safe = (fn: () => Promise<any> | any) => {
      try { if (Platform.OS !== 'web') fn(); } catch { /* noop */ }
    };
    return {
      selection: () => safe(() => Haptics.selectionAsync()),
      light:     () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
      medium:    () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
      heavy:     () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
      success:   () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
      warning:   () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
      error:     () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
    };
  }, []);
}
