/**
 * AIQuickSheet — Round 59 "AI-first" entry point.
 *
 * A glass bottom sheet that pops up from the mascot tab button. Shows
 * 5 contextual quick prompts plus a free-text input. Each prompt
 * routes the user to the AI Coach screen with the prompt pre-loaded
 * via aiPromptStore (the AI Coach reads it on mount and auto-sends).
 *
 * Design intent: this is the most distinctive futuristic touch in the
 * app — it makes the AI feel ambient and on-call, not buried in a
 * tab. Glass surface, hairline border, no orange flood. Brand orange
 * lives only on the icons and the send-prompt CTA.
 */
import React, { useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS, GLASS, shadowStyle } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { useAIPrompt } from '../store/aiPromptStore';

interface Prompt {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  emoji: string;
}

// Curated prompts — ordered by frequency of use we expect. Tuned
// for Indian fintech context (rupees, weekend behaviour, SIPs).
const PROMPTS: Prompt[] = [
  { icon: 'trending-down', emoji: '🔍', text: 'Where am I overspending this month?' },
  { icon: 'wallet',        emoji: '💰', text: 'Can I save ₹5,000 more this month?' },
  { icon: 'calendar',      emoji: '📅', text: 'Show me my weekend spending pattern' },
  { icon: 'stats-chart',   emoji: '📊', text: 'Compare this month with last month' },
  { icon: 'bulb',          emoji: '💡', text: 'Give me one quick tip to save money' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AIQuickSheet({ visible, onClose }: Props) {
  const s = useStyles();
  const setPending = useAIPrompt((st) => st.set);
  const [draft, setDraft] = useState('');

  const fire = (text: string) => {
    if (!text.trim()) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* noop */ }
    setPending(text.trim());
    setDraft('');
    onClose();
    // Small delay lets the modal close before navigation — prevents
    // the iOS "two transitions racing" jank.
    setTimeout(() => {
      try { router.push('/(tabs)/ai-coach' as any); } catch { /* noop */ }
    }, 120);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.backdrop}
      >
        <TouchableOpacity
          style={s.backdropTouch}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Dismiss AI Quick prompts"
        />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={s.titleRow}>
              <View style={s.aiBadge}>
                <Ionicons name="sparkles" size={14} color={COLORS.accent.brand} />
              </View>
              <Text style={s.title}>Ask MintU</Text>
            </View>
            <Text style={s.subtitle}>Tap a prompt or type your own</Text>
          </View>

          {/* Quick prompts grid */}
          <View style={s.promptList}>
            {PROMPTS.map((p) => (
              <TouchableOpacity
                key={p.text}
                style={s.promptRow}
                onPress={() => fire(p.text)}
                activeOpacity={0.7}
                accessibilityLabel={p.text}
              >
                <Text style={s.promptEmoji}>{p.emoji}</Text>
                <Text style={s.promptTxt} numberOfLines={2}>{p.text}</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Free-text input */}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Or ask anything…"
              placeholderTextColor={COLORS.text.muted}
              value={draft}
              onChangeText={setDraft}
              returnKeyType="send"
              onSubmitEditing={() => fire(draft)}
            />
            <TouchableOpacity
              style={[s.sendBtn, !draft.trim() && s.sendBtnDisabled]}
              onPress={() => fire(draft)}
              disabled={!draft.trim()}
              activeOpacity={0.85}
              accessibilityLabel="Send"
            >
              <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouch: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: GLASS.solidBg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    ...shadowStyle('#111827', 12, 32, 0.10, 12),
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: c.gray[300], alignSelf: 'center', marginBottom: 14,
  },
  header: { marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: c.accent.primary + '14',
    borderWidth: 1, borderColor: c.accent.primary + '33',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 19, fontWeight: '900', color: c.text.primary, letterSpacing: -0.4 },
  subtitle: { fontSize: 12, color: c.text.muted, marginTop: 4, marginLeft: 34, fontWeight: '500' },

  promptList: { gap: 8, marginBottom: 14 },
  promptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14,
    backgroundColor: c.bg.elevated,
    borderWidth: 1, borderColor: c.border.card,
  },
  promptEmoji: { fontSize: 18 },
  promptTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text.primary, lineHeight: 19 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.bg.elevated,
    borderRadius: 999, paddingLeft: 16, paddingRight: 6, paddingVertical: 4,
    borderWidth: 1, borderColor: c.border.card,
  },
  input: {
    flex: 1, fontSize: 14, color: c.text.primary, paddingVertical: 10,
    minHeight: Platform.OS === 'ios' ? 36 : 40,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: c.accent.primary,
    justifyContent: 'center', alignItems: 'center',
    ...shadowStyle(c.accent.primary, 2, 8, 0.25, 3),
  },
  sendBtnDisabled: { backgroundColor: c.gray[400], shadowOpacity: 0 },
}));
