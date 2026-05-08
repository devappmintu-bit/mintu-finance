/**
 * BrutalTabBar — Phase 2 primitive: floating dock tab bar.
 *
 * Designed to drop into `Tabs.Navigator > tabBar={(props) => <BrutalTabBar {...props} />}`.
 * Renders a floating brutal slab at the bottom with hard 3-px ink frame
 * + lg stamp shadow. The active tab pops with mascot orange fill, a
 * morphing icon, and a label.
 *
 * Spring physics on the active-pill via Animated. Tap compression via
 * pressShift translateY 2.
 *
 * Shipped as an OPT-IN component — existing `(tabs)/_layout.tsx` is
 * NOT auto-replaced. Wire it explicitly in Phase 3 once the home
 * screen is rebuilt to match.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BR_BORDER,
  BR_COLORS,
  BR_FONT,
  BR_RADIUS,
  BR_SHADOW,
  PALETTE,
} from '../../theme/brutal';

export type BrutalTabItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Optional icon for active state (morphs from idle → active). */
  iconActive?: keyof typeof Ionicons.glyphMap;
  /** Optional dot indicator (e.g. unread notif). */
  badge?: boolean | number;
};

export type BrutalTabBarProps = {
  items: BrutalTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Optional accessibility — describes the bar to screen readers. */
  accessibilityLabel?: string;
};

export default function BrutalTabBar({
  items,
  activeKey,
  onSelect,
  accessibilityLabel = 'Primary navigation',
}: BrutalTabBarProps) {
  const insets = useSafeAreaInsets();
  const [layoutW, setLayoutW] = React.useState(0);
  const itemW = layoutW > 0 ? layoutW / items.length : 0;
  const activeIdx = Math.max(0, items.findIndex((i) => i.key === activeKey));
  const indicatorX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!itemW) return;
    Animated.spring(indicatorX, {
      toValue: activeIdx * itemW,
      damping: 18,
      stiffness: 320,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [activeIdx, itemW, indicatorX]);

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[styles.dock, BR_SHADOW.lg]}
        onLayout={(e: LayoutChangeEvent) => setLayoutW(e.nativeEvent.layout.width)}
      >
        {/* Sliding active pill — mascot orange */}
        {itemW > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activePill,
              {
                width: itemW - 8,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
        )}
        {items.map((it) => {
          const isActive = it.key === activeKey;
          const iconName = isActive && it.iconActive ? it.iconActive : it.icon;
          const fg = isActive ? '#FFFFFF' : BR_COLORS.ink;
          return (
            <Pressable
              key={it.key}
              onPress={() => onSelect(it.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={it.label}
              style={({ pressed }) => [
                styles.tab,
                pressed && BR_SHADOW.pressShift,
              ]}
              hitSlop={6}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={iconName} size={isActive ? 22 : 20} color={fg} />
                {!!it.badge && (
                  <View style={styles.dot}>
                    {typeof it.badge === 'number' && it.badge > 0 && (
                      <Text style={styles.dotTxt}>
                        {it.badge > 9 ? '9+' : it.badge}
                      </Text>
                    )}
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  isActive && styles.labelActive,
                  { color: fg },
                ]}
                numberOfLines={1}
              >
                {it.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  dock: {
    flexDirection: 'row',
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 4,
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: PALETTE.brand,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 3,
  },
  iconWrap: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...BR_FONT.stampSm,
  },
  labelActive: {
    fontWeight: '900',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -8,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    backgroundColor: PALETTE.danger,
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 10,
  },
});
