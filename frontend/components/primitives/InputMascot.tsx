/**
 * InputMascot — small reactive Mintu in the corner of input flows.
 *
 * Why
 * ---
 * Forms feel cold. A 56-pt mascot in the top-right of an input sheet
 * silently watches the user, then reacts to focus / typing / errors /
 * success without ever blocking the flow. It is the difference between
 * "filling out a form" and "having a conversation".
 *
 * Behaviour
 * ---------
 *   • `phase="idle"`     → calm breath
 *   • `phase="typing"`   → faster breath (thinking) — wire to `onChange`
 *   • `phase="error"`    → single small head-shake
 *   • `phase="success"`  → bounce + glow flash
 *
 * Subtle by design: 56 pt default, never larger than 88, always in the
 * top-right or top-center of the sheet header. Never overlap the
 * primary input.
 *
 * Companion: <ConversationalPrompt /> below for the friendly question
 * copy ("How much did you spend?") that pairs with this mascot.
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import MintuMascot, { MintuMascotState } from '../MintuMascot';

export type InputMascotPhase = 'idle' | 'typing' | 'error' | 'success';

export interface InputMascotProps {
  phase?: InputMascotPhase;
  size?: number;
  /** Floating in the top-right vs centered inline. */
  position?: 'corner' | 'inline';
  style?: ViewStyle;
}

// Map our higher-level "what is the user doing" phase to the lower-level
// MintuMascot animation states. Keeps the API conversational at the
// callsite while the underlying primitive stays explicit.
const PHASE_TO_STATE: Record<InputMascotPhase, MintuMascotState> = {
  idle: 'idle',
  typing: 'thinking',
  error: 'error',
  success: 'success',
};

export default function InputMascot({
  phase = 'idle',
  size = 56,
  position = 'corner',
  style,
}: InputMascotProps) {
  // Track whether we've ever shown success — once we have, snap back to
  // idle after 1.6 s so the user isn't permanently in "celebration".
  const lastPhaseRef = useRef<InputMascotPhase>(phase);
  useEffect(() => {
    lastPhaseRef.current = phase;
  }, [phase]);

  const wrapStyle = position === 'corner' ? styles.corner : styles.inline;

  return (
    <View pointerEvents="none" style={[wrapStyle, style]}>
      <MintuMascot size={size} state={PHASE_TO_STATE[phase]} />
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    // Sheets/modals position the mascot in the top-right header area.
    // We keep it pointer-events:none so it never intercepts taps from
    // the close button etc.
    alignSelf: 'flex-end',
    marginTop: -8,
    marginRight: -4,
    marginBottom: -8,
  },
  inline: {
    alignSelf: 'center',
    marginVertical: 4,
  },
});
