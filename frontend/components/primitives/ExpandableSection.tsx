/**
 * ExpandableSection — accordion with spring animation.
 *
 * DS2.0 primitive. Replaces the ad-hoc `expanded ? null : <View>` toggles
 * used in ~8 places across settings/profile/split screens.
 *
 * Usage:
 *   <ExpandableSection title="Advanced options" icon="settings">
 *     <YourContent />
 *   </ExpandableSection>
 *
 * Features:
 *  - Caret icon rotates 180° on expand.
 *  - Content height measured via onLayout then animated smoothly.
 *  - Optional `startOpen` to control initial state.
 *  - Haptic selection on toggle.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../../utils/haptics';
import { SPRING } from '../../utils/motion';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';

export interface ExpandableSectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  startOpen?: boolean;
  children?: React.ReactNode;
}

function ExpandableSectionImpl({ title, subtitle, icon, startOpen = false, children }: ExpandableSectionProps) {
  const [open, setOpen] = useState(startOpen);
  const [contentH, setContentH] = useState(0);
  const h = useSharedValue(startOpen ? 9999 : 0);
  const rot = useSharedValue(startOpen ? 1 : 0);

  const toggle = useCallback(() => {
    haptic.select();
    setOpen((o) => {
      const next = !o;
      h.value = withSpring(next ? contentH : 0, SPRING.snappy);
      rot.value = withTiming(next ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
      return next;
    });
  }, [h, rot, contentH]);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setContentH(next);
    if (open) h.value = next;
  }, [h, open]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: h.value,
    opacity: contentH > 0 ? Math.min(1, h.value / Math.max(1, contentH)) : 0,
  }));

  const caretStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value * 180}deg` }],
  }));

  return (
    <View style={styles.wrap}>
      <Pressable onPress={toggle} style={styles.header} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        {icon ? <Ionicons name={icon} size={18} color={COLORS.accent.primary} style={{ marginRight: 10 }} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Animated.View style={caretStyle}>
          <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
        </Animated.View>
      </Pressable>

      <Animated.View style={[{ overflow: 'hidden' }, bodyStyle]}>
        {/* Ghost measurer */}
        <View onLayout={onContentLayout} style={styles.body}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

export const ExpandableSection = React.memo(ExpandableSectionImpl);
ExpandableSection.displayName = 'ExpandableSection';
export default ExpandableSection;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.subtle,
    marginBottom: SPACE.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.md,
    minHeight: 52,
  },
  title: { ...TYPO.h3, color: COLORS.text.primary },
  subtitle: { ...TYPO.caption, color: COLORS.text.muted, marginTop: 2 },
  body: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.md },
});
