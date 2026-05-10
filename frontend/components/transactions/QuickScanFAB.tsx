/**
 * QuickScanFAB — Wave 5.9 primitive.
 *
 * Floating multi-action button bottom-right of the Transactions tab.
 * Tapping the main (+) FAB reveals 3 sub-actions in a fan-out with
 * staggered spring arrival: Quick Cash · Scan SMS · Upload Receipt.
 * Tap any sub-action to navigate; tap backdrop/FAB again to close.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, SPACE, TYPO, ELEVATION } from '../../utils/theme';
import { haptic as hapticEngine } from '../../utils/haptics';

type SubAction = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
};

export interface QuickScanFABProps {
  onAddCash: () => void;
  onScanSms: () => void;
  onUploadReceipt: () => void;
  bottomInset?: number; // respect safe-area / tab-bar (default 80)
}

// R115 — route through the semantic haptic engine. `light` retains the
// legacy callsite ergonomics: light=true → tap (FAB main / sub-action),
// light=false → select (backdrop dismiss). Web/disabled cases auto-noop
// inside the engine, so all platform branching disappears here.
function haptic(light = true) {
  if (light) hapticEngine.tap(); else hapticEngine.select();
}

function SubActionBtn({
  action, idx, progress, open,
}: { action: SubAction; idx: number; progress: Animated.SharedValue<number>; open: boolean }) {
  const subStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: -64 * (idx + 1) * progress.value },
      { scale: 0.6 + progress.value * 0.4 },
    ],
  }));
  return (
    <Animated.View style={[styles.sub, subStyle]} pointerEvents={open ? 'auto' : 'none'}>
      <View style={styles.subLabelPill}>
        <Text style={styles.subLabelText}>{action.label}</Text>
      </View>
      <Pressable
        style={[styles.subBtn, { backgroundColor: action.color }]}
        onPress={action.onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        testID={`quickscan-sub-${action.label.toLowerCase()}`}
      >
        <Ionicons name={action.icon as any} size={22} color="#FFF" />
      </Pressable>
    </Animated.View>
  );
}

function QuickScanFABImpl({
  onAddCash, onScanSms, onUploadReceipt, bottomInset = 80,
}: QuickScanFABProps) {
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(open ? 1 : 0, { damping: 13, stiffness: 180 });
  }, [open, progress]);

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));

  const subs: SubAction[] = [
    { icon: 'cash-outline',    label: 'Cash',    color: '#10B981', onPress: () => { haptic(); setOpen(false); onAddCash(); } },
    { icon: 'scan-outline',    label: 'SMS',     color: '#3B82F6', onPress: () => { haptic(); setOpen(false); onScanSms(); } },
    { icon: 'camera-outline',  label: 'Receipt', color: '#A855F7', onPress: () => { haptic(); setOpen(false); onUploadReceipt(); } },
  ];

  return (
    <>
      {/* Backdrop (tap to close when open) */}
      {open && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { haptic(false); setOpen(false); }}
          accessibilityRole="button"
          accessibilityLabel="Close quick actions"
        />
      )}

      {/* Sub-actions (animated fan out above the FAB) */}
      <View style={[styles.fabWrap, { bottom: bottomInset }]} pointerEvents="box-none">
        {subs.map((a, i) => (
          <SubActionBtn key={i} action={a} idx={i} progress={progress} open={open} />
        ))}

        {/* Main FAB */}
        <Pressable
          onPress={() => { haptic(); setOpen(v => !v); }}
          style={({ pressed }) => [
            styles.fab,
            ELEVATION.z3,
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close add-expense menu' : 'Add expense'}
          testID="quickscan-fab"
        >
          <Animated.View style={rotateStyle}>
            <Ionicons name="add" size={30} color="#FFF" />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

export const QuickScanFAB = React.memo(QuickScanFABImpl);
QuickScanFAB.displayName = 'QuickScanFAB';
export default QuickScanFAB;

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    right: SPACE.lg,
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 0,
    backgroundColor: COLORS.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  sub: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    right: 0,
  },
  subBtn: {
    width: 48,
    height: 48,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subLabelPill: {
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    alignSelf: 'center',
  },
  subLabelText: { ...TYPO.caption, color: '#FFFFFF', fontWeight: '700' },
});
