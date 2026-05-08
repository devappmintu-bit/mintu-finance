/**
 * MascotCelebration — full-screen mascot celebration overlay.
 *
 * Modal-style overlay that fires on real earned events:
 *   • Goal hit (100%)
 *   • Streak milestone (7/14/30/50/100)
 *   • First-ever transaction logged
 *   • Big-win moments (e.g., budget under-spent for the week)
 *
 * Auto-dismisses after 3.5s with confetti + haptic. Optional share CTA.
 *
 * Honest-UX: caller must only fire this on REAL earned events.
 * The component intentionally has no logic to fire itself — the
 * surface that detects the milestone owns the trigger.
 */
import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import MascotPresence from './MascotPresence';
import Confetti from '../Confetti';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onDismiss: () => void;
  onShare?: () => void;
  /** Auto-dismiss after ms. Default 3500. Set to 0 to require manual. */
  autoDismissMs?: number;
};

export default function MascotCelebration({
  visible, title, subtitle, onDismiss, onShare, autoDismissMs = 3500,
}: Props) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      opacity.value = withTiming(1, { duration: 180 });
      scale.value = withSequence(
        withSpring(1.08, { damping: 8, stiffness: 140 }),
        withSpring(1, { damping: 10, stiffness: 180 }),
      );
      if (autoDismissMs > 0) {
        const t = setTimeout(() => {
          opacity.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }, () => {});
          setTimeout(onDismiss, 260);
        }, autoDismissMs);
        return () => clearTimeout(t);
      }
    } else {
      opacity.value = 0;
      scale.value = 0.5;
    }
  }, [visible, autoDismissMs, onDismiss, opacity, scale]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Dismiss celebration">
        <Confetti trigger={visible} />
        <Animated.View style={[styles.card, cardStyle]}>
          <MascotPresence size={140} mood="celebrating" showWhenGated />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {onShare ? (
            <Pressable
              onPress={onShare}
              style={({ pressed }) => [styles.shareBtn, pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}
              accessibilityRole="button"
            >
              <Text style={styles.shareText}>SHARE THE MOMENT</Text>
            </Pressable>
          ) : null}
          <Text style={styles.dismissHint}>Tap anywhere to dismiss</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#FFF',
    borderWidth: 3,
    borderColor: '#0B0B0B',
    paddingHorizontal: 28,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 14,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0B0B0B',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#404040',
    textAlign: 'center',
    lineHeight: 20,
  },
  shareBtn: {
    backgroundColor: '#FF6B1A',
    borderWidth: 2,
    borderColor: '#0B0B0B',
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 6,
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  shareText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  dismissHint: { fontSize: 10, color: '#9CA3AF', marginTop: 8, letterSpacing: 0.6 },
});
