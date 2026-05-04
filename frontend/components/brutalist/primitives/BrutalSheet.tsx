/**
 * BrutalSheet — Brutalist bottom-sheet / modal primitive.
 *
 * Hard-edged, flat, and decisive. Replaces the frosted `GlassSheet`
 * where the Brutalist system has cascaded. API mirrors GlassSheet so
 * call-sites can drop-in swap with minimal diff.
 *
 * Spec:
 *   • Flat paper fill (no blur, no glass)
 *   • 3-px ink top border (the only border — sides/bottom flush to the
 *     screen edge for that "stamped from the bottom" feeling)
 *   • Hard-offset shadow above the sheet (0, -4) in ink
 *   • Flat 0-radius corners
 *   • Spring-in from bottom, dimmed backdrop, tap-outside dismiss
 *
 * Composition with keyboards: mount KeyboardAvoidingView OUTSIDE
 * BrutalSheet — we keep this primitive thin on purpose.
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
import { COLORS } from '../../utils/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Sheet height as a fraction of screen height. Default 0.55. */
  heightFraction?: number;
  /** Disable the tap-outside dismiss for blocking flows. */
  dismissable?: boolean;
  /** Hide the drag-handle pill at the top. */
  hideHandle?: boolean;
  children?: React.ReactNode;
};

export default function BrutalSheet({
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

  const sheetStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Ink-tinted dimming backdrop — no blur, no glass. */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={dismissable ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="Dismiss sheet"
          />
        </Animated.View>

        <Animated.View style={[styles.sheet, { height: sheetHeight }, sheetStyle]}>
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
  root:     { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(10,10,10,0.55)' },
  sheet: {
    backgroundColor: COLORS.bg.card,
    borderTopWidth: 3,
    borderColor: COLORS.text.primary,
    ...Platform.select({
      web:    { boxShadow: `0 -4px 0 0 ${COLORS.text.primary}` } as any,
      ios:    { shadowColor: COLORS.text.primary, shadowOpacity: 1, shadowOffset: { width: 0, height: -4 }, shadowRadius: 0 },
      android:{ elevation: 12 },
      default:{},
    }),
  },
  sheetContent: { flex: 1, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 28 },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    backgroundColor: COLORS.text.primary,
    marginBottom: 16,
  },
});
