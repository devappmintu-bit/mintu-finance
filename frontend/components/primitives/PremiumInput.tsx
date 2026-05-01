/**
 * PremiumInput — DS2.0 text field.
 *
 * Features:
 *  - Floating label that lifts on focus / filled.
 *  - Focus glow (brand-tinted border + soft inner halo).
 *  - Inline validation message + icon when `error` is set.
 *  - Optional leading icon, trailing right-slot (e.g. visibility toggle).
 *  - Press-in spring on the wrapper for tactile feel.
 *  - (new) forwardRef exposes `focus() / blur() / clear()` so forms
 *    can wire keyboard "Next" chaining (see docs example below).
 *
 * Why: 40+ input call-sites across auth / goals / budgets / split use
 * inconsistent border treatments and zero focus feedback. This
 * primitive centralises the spec.
 *
 * Example — keyboard Next-field chain:
 *   const emailRef = useRef<PremiumInputHandle>(null);
 *   const pinRef   = useRef<PremiumInputHandle>(null);
 *   <PremiumInput ref={emailRef}
 *     returnKeyType="next"
 *     onSubmitEditing={() => pinRef.current?.focus()}
 *     ... />
 *   <PremiumInput ref={pinRef}
 *     returnKeyType="done" ... />
 */
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform, TextInputProps,
  StyleProp, ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';

export interface PremiumInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  leadingIcon?: React.ComponentProps<typeof Ionicons>['name'];
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Imperative handle exposed via `ref`. Keeps the API minimal —
 * callers should only need focus/blur/clear for field chaining.
 */
export interface PremiumInputHandle {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  /** Escape hatch to the raw TextInput if ever needed. */
  getRef: () => TextInput | null;
}

const PremiumInputInner = forwardRef<PremiumInputHandle, PremiumInputProps>(function PremiumInputImpl({
  label,
  error,
  hint,
  leadingIcon,
  right,
  containerStyle,
  value,
  onFocus,
  onBlur,
  testID,
  ...rest
}, ref) {
  const [focused, setFocused] = useState(false);
  const hasValue = !!(value && String(value).length > 0);
  const floating = focused || hasValue;

  const inputRef = useRef<TextInput>(null);

  // Expose the imperative focus API so parent forms can chain fields.
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    clear: () => inputRef.current?.clear(),
    getRef: () => inputRef.current,
  }), []);

  // Label float animation
  const labelProg = useSharedValue(floating ? 1 : 0);
  useEffect(() => {
    labelProg.value = withTiming(floating ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [floating, labelProg]);

  // Focus glow
  const focusProg = useSharedValue(0);
  useEffect(() => {
    focusProg.value = withSpring(focused ? 1 : 0, { damping: 16, stiffness: 260 });
  }, [focused, focusProg]);

  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -14 * labelProg.value },
      { scale: 1 - 0.15 * labelProg.value },
    ],
    // shift left slightly so the floated label is tight to the top-left edge
    marginLeft: -6 * labelProg.value,
  }));

  const wrapStyle = useAnimatedStyle(() => {
    const brand = error ? COLORS.state.danger : COLORS.accent.primary;
    return {
      borderColor: interpolateColor(
        focusProg.value,
        [0, 1],
        [error ? COLORS.state.danger : COLORS.border.subtle, brand]
      ),
      // Soft glow on focus via shadow
      shadowColor: brand,
      shadowOpacity: 0.18 * focusProg.value,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
    };
  });

  return (
    <View style={[{ marginBottom: SPACE.md }, containerStyle]} testID={testID}>
      <Animated.View style={[styles.wrap, wrapStyle]}>
        {/* Leading icon */}
        {leadingIcon ? (
          <Ionicons
            name={leadingIcon}
            size={18}
            color={focused ? COLORS.accent.primary : COLORS.text.muted}
            style={{ marginRight: 8 }}
          />
        ) : null}

        <View style={{ flex: 1, justifyContent: 'center' }}>
          {/* Floating label */}
          <Animated.Text
            pointerEvents="none"
            style={[
              styles.label,
              {
                color: focused
                  ? (error ? COLORS.state.danger : COLORS.accent.primary)
                  : COLORS.text.muted,
              },
              labelStyle,
            ]}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>

          <TextInput
            ref={inputRef}
            {...rest}
            value={value}
            placeholder={floating ? rest.placeholder : ''}
            placeholderTextColor={COLORS.text.muted}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            style={[
              styles.input,
              Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : null,
            ]}
          />
        </View>

        {right ? <View style={{ marginLeft: 8 }}>{right}</View> : null}
      </Animated.View>

      {/* Error / hint row */}
      {error ? (
        <View style={styles.msgRow}>
          <Ionicons name="alert-circle" size={12} color={COLORS.state.danger} />
          <Text style={[styles.msg, { color: COLORS.state.danger }]} numberOfLines={2}>{error}</Text>
        </View>
      ) : hint ? (
        <View style={styles.msgRow}>
          <Text style={[styles.msg, { color: COLORS.text.muted }]} numberOfLines={2}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
});

export const PremiumInput = React.memo(PremiumInputInner);
(PremiumInput as any).displayName = 'PremiumInput';
export default PremiumInput;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg.card,
    borderWidth: 1.4,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    minHeight: 56,
  },
  label: {
    position: 'absolute',
    top: 18,
    left: 0,
    ...TYPO.body,
    fontWeight: '500',
  },
  input: {
    ...TYPO.body,
    color: COLORS.text.primary,
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 0,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    marginLeft: SPACE.sm,
  },
  msg: { ...TYPO.caption },
});
