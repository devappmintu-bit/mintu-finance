/**
 * AskMintuPill — Wave 5.4 primary CTA for the AI Coach tab.
 *
 * Replaces the old "Ask" button that was hidden in the NeonButton row
 * at the bottom of the insights header. Now THE primary action on the
 * AI Coach surface: full-width orange pill + subtle shimmer when idle
 * + three tappable suggested prompts that open the chat pre-filled.
 *
 * Props:
 *   onAsk          — called when user taps the pill or a suggestion.
 *                    Receives either null (empty chat) or a pre-fill string.
 *   disabled       — greys out + stops shimmer (offline mode)
 *   suggestions    — optional list of 3 quick prompts (defaults shipped)
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, SPACE, TYPO, ELEVATION } from '../../utils/theme';

const DEFAULT_PROMPTS = [
  'Where did my money go this week?',
  'Can I afford this?',
  'Best tax regime for me?',
];

function haptic() {
  if (Platform.OS !== 'web') {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
  }
}

export interface AskMintuPillProps {
  onAsk: (prefill?: string) => void;
  disabled?: boolean;
  suggestions?: string[];
}

function AskMintuPillImpl({
  onAsk, disabled = false, suggestions = DEFAULT_PROMPTS,
}: AskMintuPillProps) {
  // Shimmer: slow pulse of the gradient mid-stop to draw the eye at idle
  const shimmer = useSharedValue(0);
  useEffect(() => {
    if (disabled) {
      shimmer.value = 0;
      return;
    }
    shimmer.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true
    );
  }, [disabled, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + (shimmer.value * 0.25),
    transform: [{ translateX: (shimmer.value - 0.5) * 60 }],
  }));

  const handlePress = React.useCallback(() => {
    if (disabled) return;
    haptic();
    onAsk();
  }, [disabled, onAsk]);

  return (
    <View style={styles.wrap}>
      {/* PRIMARY PILL */}
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.pill,
          pressed && !disabled && { transform: [{ scale: 0.97 }], opacity: 0.92 },
          disabled && styles.pillDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={disabled ? 'Ask Mintu (offline)' : 'Ask Mintu anything about your money'}
        testID="ask-mintu-pill"
      >
        {!disabled ? (
          <LinearGradient
            colors={['#E84A0C', '#D43A08', '#E84A0C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.bg.dark }]} />
        )}

        {/* Shimmer streak over the pill */}
        {!disabled && (
          <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none">
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}

        {/* Content */}
        <View style={styles.pillInner}>
          <View style={styles.pillIcon}>
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.pillText} numberOfLines={1}>
            {disabled ? 'Offline — back soon' : 'Ask Mintu anything'}
          </Text>
          {!disabled && <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />}
        </View>
      </Pressable>

      {/* QUICK PROMPTS */}
      {!disabled && suggestions.length > 0 && (
        <View style={styles.promptsRow}>
          {suggestions.slice(0, 3).map((p, i) => (
            <Prompt key={i} text={p} onPress={onAsk} />
          ))}
        </View>
      )}
    </View>
  );
}

function PromptImpl({ text, onPress }: { text: string; onPress: (s: string) => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handle = React.useCallback(() => {
    scale.value = withTiming(0.94, { duration: 80 }, () => {
      scale.value = withTiming(1, { duration: 120 });
    });
    haptic();
    onPress(text);
  }, [text, onPress, scale]);
  return (
    <Animated.View style={[styles.prompt, animStyle]}>
      <Pressable onPress={handle} accessibilityRole="button" accessibilityLabel={text}>
        <Text style={styles.promptText} numberOfLines={2}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}
const Prompt = React.memo(PromptImpl);

export const AskMintuPill = React.memo(AskMintuPillImpl);
AskMintuPill.displayName = 'AskMintuPill';
export default AskMintuPill;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  pill: {
    height: 56,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    justifyContent: 'center',
    ...ELEVATION.z2,
    shadowColor: '#E84A0C',
    shadowOpacity: 0.25,
  },
  pillDisabled: {
    shadowOpacity: 0,
    opacity: 0.7,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    gap: 12,
  },
  pillIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    ...TYPO.h3,
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  shimmer: {
    position: 'absolute',
    top: 0, bottom: 0,
    left: '30%',
    width: '40%',
  },
  promptsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACE.md,
  },
  prompt: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 58,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.accent.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,74,12,0.14)',
    justifyContent: 'center',
  },
  promptText: {
    ...TYPO.caption,
    fontSize: 11.5,
    lineHeight: 15,
    color: COLORS.accent.primaryDark,
    fontWeight: '600',
  },
});
