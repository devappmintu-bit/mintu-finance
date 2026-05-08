/**
 * BrutalInput — chunky tactile input field.
 *
 * Variants:
 *   • base    — single-line, ink frame, paper fill
 *   • amount  — large mono numeric for ₹ entry
 *   • search  — leading magnifier icon, paper fill
 *
 * Focus is signaled by a 3px ink border (vs 2px idle), no glow.
 * Brutal rule: no soft accents, no halo, no rounded shadows.
 */
import React, { useState, forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BR_BORDER,
  BR_COLORS,
  BR_FONT,
  BR_RADIUS,
  PALETTE,
} from '../../theme/brutal';

type Variant = 'base' | 'amount' | 'search';

export type BrutalInputProps = TextInputProps & {
  label?: string;
  variant?: Variant;
  error?: string;
  helper?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Render an icon BEFORE the input (e.g. ₹ for amount). */
  prefix?: React.ReactNode;
  /** Render an icon AFTER the input (e.g. clear button). */
  suffix?: React.ReactNode;
};

const BrutalInput = forwardRef<TextInput, BrutalInputProps>(
  function BrutalInput(
    {
      label,
      variant = 'base',
      error,
      helper,
      containerStyle,
      style,
      prefix,
      suffix,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    const isAmount = variant === 'amount';
    const isSearch = variant === 'search';

    return (
      <View style={[containerStyle]}>
        {label && (
          <Text style={s.label}>{label}</Text>
        )}
        <View
          style={[
            s.frame,
            focused && s.frameFocus,
            error && s.frameError,
            isAmount && s.frameAmount,
          ]}
        >
          {isSearch && (
            <Ionicons
              name="search"
              size={16}
              color={focused ? PALETTE.ink : PALETTE.smoke}
              style={{ marginRight: 6 }}
            />
          )}
          {isAmount && (
            <Text style={s.rupee}>₹</Text>
          )}
          {prefix}
          <TextInput
            ref={ref}
            placeholderTextColor={PALETTE.ash}
            style={[
              s.input,
              isAmount && s.inputAmount,
              style,
            ]}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            {...rest}
          />
          {suffix}
        </View>
        {!!error && <Text style={s.errorTxt}>{error}</Text>}
        {!error && !!helper && <Text style={s.helperTxt}>{helper}</Text>}
      </View>
    );
  }
);

export default BrutalInput;

const s = StyleSheet.create({
  label: {
    ...BR_FONT.stampSm,
    color: BR_COLORS.textMuted,
    marginBottom: 6,
  },
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  frameFocus: {
    borderWidth: BR_BORDER.thick,
    paddingVertical: 9, // compensate for the +1 border to avoid jump
  },
  frameError: {
    borderColor: BR_COLORS.danger,
  },
  frameAmount: {
    paddingVertical: 14,
  },
  rupee: {
    fontSize: 18,
    fontWeight: '900',
    color: BR_COLORS.textMuted,
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: BR_COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  inputAmount: {
    fontFamily: BR_FONT.mono.fontFamily,
    fontSize: 24,
    fontWeight: '900',
  },
  errorTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: BR_COLORS.danger,
    marginTop: 6,
  },
  helperTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: BR_COLORS.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
