// Haptic feedback helper — safe on web (no-op) + native
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  light: () => { if (isNative) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  medium: () => { if (isNative) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  heavy: () => { if (isNative) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); },
  success: () => { if (isNative) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warning: () => { if (isNative) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
  error: () => { if (isNative) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); },
  selection: () => { if (isNative) Haptics.selectionAsync().catch(() => {}); },
};

export default haptic;
