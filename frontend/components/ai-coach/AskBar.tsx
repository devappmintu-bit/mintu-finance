/**
 * components/ai-coach/AskBar.tsx — Round 71 single AI surface.
 *
 * The ONE primary AI interaction on the AI Coach screen. Replaces:
 *   • MascotMoment (top mascot burst)
 *   • AskMintuPill (full-width orange pill + 3 chips)
 *   • Bottom askBox + NeonButton
 *   • All inline "Ask me anything" CTAs
 *
 * Design intent: a calm, glass-y bar that floats just above the tab
 * bar. It has *one* rotating prompt at any moment (cycles every 7 s)
 * so users get inspiration without chip overload. Tap anywhere on the
 * bar -> opens AICoachChat with that prompt pre-loaded. Tapping the
 * prompt text expands an in-place TextInput so the user can type
 * their own question and submit with Send.
 *
 * Layout (left → right):
 *   [ Mascot orb 36px ]  [ Prompt text · placeholder when typing ]  [ Send arrow ]
 *
 * Sticky positioning is owned by the parent screen (absolute, bottom
 * = tab bar height + small gap). This component just renders the
 * surface itself.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Platform, Animated, Easing, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { COLORS, FONT_FAMILY, RADIUS, SPACE } from '../../utils/theme';
import { useAIPrompt } from '../../store/aiPromptStore';
import Mascot from '../Mascot';

// Single curated rotation. Two prompts is the sweet spot per the
// product requirements ("rotating smart prompts (1–2 max, not 5
// chips)"). Actually four are listed here so the rotation feels
// fresh on repeated visits, but only ONE is visible at a time.
const ROTATING_PROMPTS = [
  'Where did my money go this week?',
  'Can I afford this purchase?',
  'How can I save ₹5,000 more this month?',
  'Best tax regime for me?',
];

const ROTATION_MS = 7000;

interface Props {
  /** When true, disables the bar (offline mode) */
  disabled?: boolean;
  /** Called on submit. Parent decides whether to open chat sheet
   *  inline (Modal) or push to a new screen. */
  onSubmit: (prefill: string) => void;
  /** Distance from screen bottom in px (lets parent place us above
   *  the floating tab bar). */
  bottomOffset?: number;
}

function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS !== 'web') {
    try { Haptics.impactAsync(style); } catch { /* noop */ }
  }
}

function AskBarImpl({ disabled = false, onSubmit, bottomOffset = 122 }: Props) {
  const [idx, setIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);
  const fade = useRef(new Animated.Value(1)).current;

  // Rotate the prompt every ROTATION_MS while idle (not typing).
  useEffect(() => {
    if (typing || disabled) return;
    const id = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        setIdx((i) => (i + 1) % ROTATING_PROMPTS.length);
        Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      });
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [typing, disabled, fade]);

  const currentPrompt = ROTATING_PROMPTS[idx];

  const fire = useCallback((text: string) => {
    if (!text.trim() || disabled) return;
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setDraft('');
    setTyping(false);
    Keyboard.dismiss();
    onSubmit(text.trim());
  }, [disabled, onSubmit]);

  const handleBarPress = useCallback(() => {
    if (disabled) return;
    haptic();
    if (typing) return; // already in input mode
    // Tap the surface: start typing mode AND prefill with current prompt
    setTyping(true);
    setDraft(currentPrompt);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [disabled, typing, currentPrompt]);

  const handleSendIcon = useCallback(() => {
    if (disabled) return;
    if (typing) {
      fire(draft);
    } else {
      // Skip typing — fire current prompt directly
      fire(currentPrompt);
    }
  }, [disabled, typing, draft, currentPrompt, fire]);

  const handleBlur = useCallback(() => {
    // Defer un-typing so the Send tap isn't swallowed by blur
    setTimeout(() => {
      if (!draft.trim()) setTyping(false);
    }, 120);
  }, [draft]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomOffset }]}>
      <View style={styles.shell}>
        {Platform.OS !== 'web' && (
          <BlurView
            intensity={50}
            tint="light"
            style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.pill, overflow: 'hidden' }]}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.shellTint]} pointerEvents="none" />

        <Pressable
          onPress={handleBarPress}
          disabled={disabled}
          style={({ pressed }) => [
            styles.bar,
            pressed && !disabled && !typing && { opacity: 0.92 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            disabled
              ? 'Ask Mintu — offline'
              : typing
              ? 'Type your question for Mintu'
              : `Ask Mintu: ${currentPrompt}`
          }
          testID="ai-coach-ask-bar"
        >
          {/* MASCOT ORB */}
          <View style={styles.mascotOrb}>
            <Mascot size={28} variant="auto" />
          </View>

          {/* PROMPT / INPUT */}
          {typing ? (
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              onBlur={handleBlur}
              onSubmitEditing={() => fire(draft)}
              placeholder={currentPrompt}
              placeholderTextColor={COLORS.text.muted}
              style={styles.input}
              returnKeyType="send"
              autoCorrect={false}
              autoCapitalize="sentences"
              maxLength={240}
              accessibilityLabel="Question for Mintu"
            />
          ) : (
            <Animated.Text
              numberOfLines={1}
              style={[styles.promptTxt, { opacity: fade }]}
            >
              {currentPrompt}
            </Animated.Text>
          )}

          {/* SEND ICON */}
          <Pressable
            onPress={handleSendIcon}
            disabled={disabled || (typing && !draft.trim())}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.sendBtn,
              (disabled || (typing && !draft.trim())) && styles.sendBtnDisabled,
              pressed && !disabled && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send to Mintu"
          >
            <Ionicons
              name={typing ? 'arrow-up' : 'sparkles'}
              size={16}
              color="#FFFFFF"
            />
          </Pressable>
        </Pressable>
      </View>

      {disabled && (
        <Text style={styles.offlineHint}>Offline — connect to chat with Mintu</Text>
      )}
    </View>
  );
}

export const AskBar = React.memo(AskBarImpl);
AskBar.displayName = 'AskBar';
export default AskBar;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: SPACE.lg,
    right: SPACE.lg,
    alignItems: 'center',
    zIndex: 10,
  },
  shell: {
    width: '100%',
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,74,12,0.22)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 10 },
      web: { boxShadow: '0 6px 18px rgba(17,24,39,0.10)' as any },
    }),
  },
  shellTint: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.74)',
    borderRadius: RADIUS.pill,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingLeft: 8,
    paddingRight: 8,
  },
  mascotOrb: {
    width: 38, height: 38, borderRadius: 0,
    backgroundColor: 'rgba(232,74,12,0.10)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  promptTxt: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT_FAMILY.semibold,
    color: COLORS.text.primary,
    letterSpacing: -0.1,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT_FAMILY.semibold,
    color: COLORS.text.primary,
    paddingVertical: 0,
    letterSpacing: -0.1,
    ...Platform.select({ web: { outlineStyle: 'none' as any } }),
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 0,
    backgroundColor: COLORS.accent.primary,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: COLORS.accent.primary, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
      web: { boxShadow: '0 4px 12px rgba(232,74,12,0.45)' as any },
    }),
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 }, web: { boxShadow: 'none' as any } }),
  },
  offlineHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text.muted,
    letterSpacing: 0.2,
  },
});
