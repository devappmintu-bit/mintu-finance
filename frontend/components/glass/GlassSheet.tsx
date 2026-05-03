/**
 * components/glass/GlassSheet.tsx
 *
 * Round 55 — iOS-Crystal modal / bottom sheet primitive.
 * Frosted backdrop (BlurView) + translucent rounded-top sheet that
 * springs in from the bottom. Tap-outside dismisses.
 *
 * For complex sheet content (forms, inputs), prefer mounting a
 * KeyboardAvoidingView OUTSIDE this primitive — we deliberately keep
 * GlassSheet thin so it composes well.
 */
import React, { useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { GLASS, COLORS } from '../../utils/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Sheet height as a fraction of screen height. Default 0.55. */
  heightFraction?: number;
  /** Disable the swipe/tap-outside dismiss for blocking flows. */
  dismissable?: boolean;
  /** Hide the drag-handle pill at the top. */
  hideHandle?: boolean;
  children?: React.ReactNode;
};

export default function GlassSheet({
  visible,
  onClose,
  heightFraction = 0.55,
  dismissable = true,
  hideHandle = false,
  children,
}: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = Math.round(screenHeight * heightFraction);
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 22, stiffness: 240 });
      backdropOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    } else {
      translateY.value = withTiming(sheetHeight, { duration: 200, easing: Easing.in(Easing.quad) });
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible, sheetHeight, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissable ? onClose : undefined}
          >
            {/* Frosted backdrop — blur the screen behind for iOS depth. */}
            {Platform.OS !== 'web' ? (
              <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.webBackdrop]} />
            )}
            <View style={[StyleSheet.absoluteFill, styles.dimOverlay]} />
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.sheet, { height: sheetHeight }, sheetStyle]}>
          {Platform.OS !== 'web' ? (
            <BlurView
              intensity={50}
              tint="light"
              style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 0, borderTopRightRadius: 0, overflow: 'hidden' }]}
            />
          ) : null}
          <View
            style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 0, borderTopRightRadius: 0 }, { backgroundColor: 'rgba(255,255,255,0.92)' }]}
          />
          <View style={styles.sheetContent}>
            {!hideHandle && <View style={styles.handle} />}
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  webBackdrop: { backgroundColor: 'rgba(245,247,250,0.65)' },
  dimOverlay: { backgroundColor: 'rgba(17,24,39,0.18)' },
  sheet: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderLight,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -8 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  sheetContent: { flex: 1, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(17,24,39,0.18)',
    marginBottom: 16,
  },
});
