/**
 * PremiumCardStack — Wave 5.8 primitive.
 *
 * Simple, gesture-free "now featured" rotation of premium features.
 * Auto-cycles every 5 s with a smooth cross-fade + tiny y-translate.
 * User can also tap the pagination dots to jump to a specific feature.
 *
 * Why no deck-swiper? We want zero extra deps and full control over
 * the card's animation + interaction. Gesture-based swipe is a
 * follow-up Wave 5.8.1 win.
 *
 * Each card renders a full-width 280pt tall feature tile with:
 *   • Big icon + feature name
 *   • 3-line value proposition
 *   • "Try it now" CTA that navigates to the feature route
 */
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SPACE, TYPO, ELEVATION } from '../../utils/theme';

export type PremiumFeature = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  tagline: string;
  cta: string;
  route: string;
  accent: [string, string]; // gradient pair
};

const DEFAULT_FEATURES: PremiumFeature[] = [
  {
    id: 'tax',
    icon: 'receipt-outline',
    title: 'Tax Planner',
    tagline: 'New vs Old regime · 80C/80D suggestions · ITR-ready export',
    cta: 'Try it now',
    route: '/premium/tax',
    accent: ['#3B82F6', '#1D4ED8'],
  },
  {
    id: 'invest',
    icon: 'trending-up-outline',
    title: 'Investment Planner',
    tagline: 'SIP allocation · risk profile · fund recommendations',
    cta: 'See your plan',
    route: '/premium/invest',
    accent: ['#10B981', '#047857'],
  },
  {
    id: 'school',
    icon: 'school-outline',
    title: 'Money School',
    tagline: 'Daily 60-second finance lessons with Indian context',
    cta: 'Start today',
    route: '/money-school',
    accent: ['#A855F7', '#7E22CE'],
  },
];

export interface PremiumCardStackProps {
  features?: PremiumFeature[];
  autoCycleMs?: number; // default 5000
}

function haptic() {
  if (Platform.OS !== 'web') {
    try { Haptics.selectionAsync(); } catch { /* noop */ }
  }
}

function PremiumCardStackImpl({
  features = DEFAULT_FEATURES, autoCycleMs = 5000,
}: PremiumCardStackProps) {
  const [idx, setIdx] = useState(0);
  const opacity = useSharedValue(1);
  const translate = useSharedValue(0);
  const timerRef = useRef<any>(null);

  const advance = React.useCallback((nextIdx: number) => {
    opacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }, () => {
      // NOTE: setIdx from UI thread needs to be wrapped; using a Reanimated
      // runOnJS is the clean way but here we just keep it simple.
    });
    translate.value = withTiming(-8, { duration: 180 });
    setTimeout(() => {
      setIdx(nextIdx);
      opacity.value = withTiming(1, { duration: 240 });
      translate.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
    }, 180);
  }, [opacity, translate]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      advance((idx + 1) % features.length);
    }, autoCycleMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx, autoCycleMs, advance, features.length]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translate.value }],
  }));

  const feat = features[idx];

  const handleCTA = React.useCallback(() => {
    haptic();
    try { router.push(feat.route as any); } catch { /* noop */ }
  }, [feat.route]);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.card, ELEVATION.z3, cardStyle]}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0A' }]}
        />
        <View style={styles.iconWrap}>
          <Ionicons name={feat.icon} size={36} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>{feat.title}</Text>
        <Text style={styles.tagline}>{feat.tagline}</Text>

        <Pressable
          onPress={handleCTA}
          style={({ pressed }) => [
            styles.cta,
            pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={feat.cta + ' — ' + feat.title}
          testID={`premium-card-cta-${feat.id}`}
        >
          <Text style={styles.ctaText}>{feat.cta}</Text>
          <Ionicons name="arrow-forward" size={16} color={feat.accent[1]} />
        </Pressable>
      </Animated.View>

      {/* Pagination dots — tappable to jump */}
      <View style={styles.dots}>
        {features.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => { haptic(); advance(i); }}
            hitSlop={10}
            testID={`premium-card-dot-${i}`}
          >
            <View style={[styles.dot, i === idx && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const PremiumCardStack = React.memo(PremiumCardStackImpl);
PremiumCardStack.displayName = 'PremiumCardStack';
export default PremiumCardStack;

const { width: SCREEN_W } = Dimensions.get('window');

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
  card: {
    minHeight: 260,
    borderRadius: RADIUS['3xl'],
    padding: SPACE.xl,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 56, height: 56,
    borderRadius: 0,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  title: {
    ...TYPO.h1,
    color: '#FFFFFF',
    fontWeight: '800',
    marginBottom: SPACE.xs,
  },
  tagline: {
    ...TYPO.body,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: SPACE.lg,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
  },
  ctaText: { ...TYPO.h3, fontWeight: '700' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: SPACE.md,
  },
  dot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border.subtle,
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.accent.primary,
  },
});
