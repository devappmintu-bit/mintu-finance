/**
 * CurrencyField — DS2.0 INR currency input.
 *
 * Built for one thing only: ingesting a rupee amount. Handles all the
 * boring details the rest of the app keeps forgetting:
 *   - Always right-aligned with a leading ₹ affix.
 *   - Masks to numbers only (strip everything else on each keystroke).
 *   - Lakh-grouped preview below the input: “≈ ₹1,23,456”.
 *   - Inline validation: min / max / required — human-language messages.
 *   - Prefers `decimal-pad` keyboard (no OS keypad wastage).
 *   - Shake-on-error via Reanimated (UI-thread).
 *   - Built on top of PremiumInput so focus/label/glow stay consistent.
 *
 * Usage:
 *   const [amt, setAmt] = useState<string>('');
 *   <CurrencyField
 *     label="Amount"
 *     value={amt}
 *     onChangeText={setAmt}
 *     placeholder="e.g. 2,500 (monthly rent)"
 *     minAmount={1}
 *   />
 *
 * The raw numeric value is exposed via `onChangeNumber`; the formatted
 * string always lives in `value`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import PremiumInput from './PremiumInput';
import { COLORS, SPACE, TYPO } from '../../utils/theme';

export interface CurrencyFieldProps {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  onChangeNumber?: (n: number) => void;
  placeholder?: string;
  minAmount?: number;
  maxAmount?: number;
  required?: boolean;
  error?: string | null;
  hint?: string;
  testID?: string;
}

/**
 * Format a numeric value as an Indian-grouping preview, e.g.
 *   1234567 → "1,23,45,670"
 */
function formatINRGroup(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  try {
    return n.toLocaleString('en-IN');
  } catch {
    return String(n);
  }
}

function CurrencyFieldImpl({
  label,
  value,
  onChangeText,
  onChangeNumber,
  placeholder = 'e.g. 2,500',
  minAmount,
  maxAmount,
  required,
  error: errorProp,
  hint,
  testID,
}: CurrencyFieldProps) {
  const [touched, setTouched] = useState(false);
  const shake = useSharedValue(0);

  const digitsOnly = useMemo(() => String(value ?? '').replace(/[^0-9.]/g, ''), [value]);
  const numeric = useMemo(() => {
    const n = parseFloat(digitsOnly);
    return Number.isFinite(n) ? n : 0;
  }, [digitsOnly]);

  // Internal validation — only surfaces after the user has touched+blurred
  const internalError: string | null = useMemo(() => {
    if (!touched) return null;
    if (required && !digitsOnly) return `${label} is required`;
    if (digitsOnly && minAmount !== undefined && numeric < minAmount) {
      return `Amount should be at least ₹${minAmount.toLocaleString('en-IN')}`;
    }
    if (digitsOnly && maxAmount !== undefined && numeric > maxAmount) {
      return `Amount can't exceed ₹${maxAmount.toLocaleString('en-IN')}`;
    }
    return null;
  }, [touched, required, digitsOnly, numeric, minAmount, maxAmount, label]);

  const error = errorProp ?? internalError;

  // Shake animation fires whenever the error transitions from falsy to truthy
  useEffect(() => {
    if (error) {
      shake.value = withSequence(
        withTiming(-6, { duration: 60, easing: Easing.out(Easing.quad) }),
        withTiming(6, { duration: 60 }),
        withTiming(-4, { duration: 55 }),
        withTiming(4, { duration: 55 }),
        withTiming(0, { duration: 55 })
      );
    }
  }, [error, shake]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const handleChange = useCallback((raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    onChangeText?.(cleaned);
    const n = parseFloat(cleaned);
    onChangeNumber?.(Number.isFinite(n) ? n : 0);
  }, [onChangeText, onChangeNumber]);

  return (
    <Animated.View style={shakeStyle}>
      <PremiumInput
        testID={testID}
        label={label}
        value={digitsOnly}
        onChangeText={handleChange}
        onBlur={() => setTouched(true)}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder={placeholder}
        error={error}
        hint={hint}
        leadingIcon="cash-outline"
        right={
          numeric > 0 ? (
            <Text style={styles.group} numberOfLines={1}>≈ ₹{formatINRGroup(numeric)}</Text>
          ) : undefined
        }
      />
    </Animated.View>
  );
}

export const CurrencyField = React.memo(CurrencyFieldImpl);
CurrencyField.displayName = 'CurrencyField';
export default CurrencyField;

const styles = StyleSheet.create({
  group: { ...TYPO.caption, color: COLORS.text.muted, fontVariant: ['tabular-nums'] },
});
