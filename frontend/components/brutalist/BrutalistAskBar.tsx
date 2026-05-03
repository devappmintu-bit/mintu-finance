/**
 * components/brutalist/BrutalistAskBar.tsx — Round 76.
 *
 * Brutalist replacement for the glass AskBar (R71). Same behaviour:
 * sticky bar above the tab bar, rotating prompt, tap-to-type, send.
 *
 * Visual shift:
 *   • Solid black (ink) surface — no blur, no glass
 *   • Hard hairline white border — no soft shadows
 *   • Mono accent for the prompt text — honoured numbers/labels
 *   • Sharp 4 px radius max — no pills
 *   • Orange send block (solid, flat) — no gradient
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Platform, Animated, Easing, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_RADIUS } from '../../utils/brutalist';

const PROMPTS = [
  'Where did my money go this week?',
  'Can I afford this purchase?',
  'How can I save ₹5,000 more this month?',
  'Best tax regime for me?',
];
const ROTATION_MS = 7000;

interface Props {
  disabled?: boolean;
  onSubmit: (prefill: string) => void;
  bottomOffset?: number;
}

function hap(s: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS !== 'web') { try { Haptics.impactAsync(s); } catch { /* */ } }
}

export default function BrutalistAskBar({ disabled = false, onSubmit, bottomOffset = 122 }: Props) {
  const [idx, setIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (typing || disabled) return;
    const id = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 180, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        setIdx((i) => (i + 1) % PROMPTS.length);
        Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.linear, useNativeDriver: true }).start();
      });
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [typing, disabled, fade]);

  const currentPrompt = PROMPTS[idx];

  const fire = useCallback((text: string) => {
    if (!text.trim() || disabled) return;
    hap(Haptics.ImpactFeedbackStyle.Medium);
    setDraft('');
    setTyping(false);
    Keyboard.dismiss();
    onSubmit(text.trim());
  }, [disabled, onSubmit]);

  const handleBarPress = useCallback(() => {
    if (disabled) return;
    hap();
    if (typing) return;
    setTyping(true);
    setDraft(currentPrompt);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [disabled, typing, currentPrompt]);

  const handleSend = useCallback(() => {
    if (disabled) return;
    if (typing) fire(draft);
    else fire(currentPrompt);
  }, [disabled, typing, draft, currentPrompt, fire]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomOffset }]}>
      <View style={styles.shell}>
        <Pressable
          onPress={handleBarPress}
          disabled={disabled}
          style={({ pressed }) => [styles.bar, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityLabel={`Ask Mintu: ${currentPrompt}`}
          testID="brutalist-ask-bar"
        >
          {/* LABEL column — Swiss left rail */}
          <View style={styles.labelCol}>
            <Text style={styles.labelTxt}>ASK</Text>
          </View>

          {/* PROMPT / INPUT — mono accent */}
          {typing ? (
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => fire(draft)}
              placeholder={currentPrompt}
              placeholderTextColor={BR_COLORS.quiet}
              style={styles.input}
              returnKeyType="send"
              autoCorrect={false}
              autoCapitalize="sentences"
              maxLength={240}
            />
          ) : (
            <Animated.Text numberOfLines={1} style={[styles.promptTxt, { opacity: fade }]}>
              {currentPrompt}
            </Animated.Text>
          )}

          {/* SEND — flat orange block */}
          <Pressable
            onPress={handleSend}
            disabled={disabled}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Send to Mintu"
          >
            <Ionicons name={typing ? 'arrow-up' : 'arrow-forward'} size={16} color={BR_COLORS.accentInk} />
          </Pressable>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: BR_SPACE.lg,
    right: BR_SPACE.lg,
    alignItems: 'stretch',
    zIndex: 10,
  },
  shell: {
    backgroundColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.m,
    overflow: 'hidden',
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 52,
  },
  labelCol: {
    paddingHorizontal: BR_SPACE.md,
    justifyContent: 'center',
    borderRightWidth: BR_BORDER.hair,
    borderRightColor: '#2A2A2A',
  },
  labelTxt: {
    ...BR_TYPE.label,
    color: BR_COLORS.quiet,
  },
  promptTxt: {
    flex: 1,
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.md,
    ...BR_TYPE.bodyBold,
    color: BR_COLORS.paper,
    letterSpacing: -0.1,
  },
  input: {
    flex: 1,
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: 0,
    ...BR_TYPE.bodyBold,
    color: BR_COLORS.paper,
    ...Platform.select({ web: { outlineStyle: 'none' as any } }),
  },
  sendBtn: {
    backgroundColor: BR_COLORS.accent,
    paddingHorizontal: BR_SPACE.lg,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 56,
  },
});
