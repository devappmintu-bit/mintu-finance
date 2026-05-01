/**
 * ConversationalPrompt — friendly microcopy header used at the top of
 * input flows. Replaces flat field labels with a question.
 *
 *   Before:  "Amount" + boring input box
 *   After:   "How much did you spend? — Tap a chip or type below"
 *
 * Pair with <InputMascot /> for the full assistant feel:
 *
 *     <InputAssistantHeader
 *       prompt="How much did you spend?"
 *       hint="Tap a chip or type below"
 *       phase={typing ? 'typing' : amount ? 'success' : 'idle'}
 *     />
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACE, TYPO } from '../../utils/theme';
import InputMascot, { InputMascotPhase } from './InputMascot';

export interface ConversationalPromptProps {
  /** The question — short, friendly, ends in a "?" most of the time. */
  prompt: string;
  /** A second-line hint that nudges the user to the fastest path. */
  hint?: string;
}

export default function ConversationalPrompt({ prompt, hint }: ConversationalPromptProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{prompt}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * InputAssistantHeader — the canonical header for any sheet/modal that
 * collects input. Combines the mascot (top-right corner) with a
 * conversational prompt (left-aligned). Drop this in once per sheet.
 */
export function InputAssistantHeader({
  prompt,
  hint,
  phase = 'idle',
  mascotSize = 56,
}: {
  prompt: string;
  hint?: string;
  phase?: InputMascotPhase;
  mascotSize?: number;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={{ flex: 1, paddingRight: SPACE.sm }}>
        <Text style={styles.prompt}>{prompt}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <InputMascot phase={phase} size={mascotSize} position="corner" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: SPACE.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  prompt: {
    ...TYPO.h2,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  hint: {
    ...TYPO.caption,
    color: COLORS.text.muted,
    marginTop: 4,
  },
});
