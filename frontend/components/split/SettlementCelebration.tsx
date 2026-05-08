/**
 * SettlementCelebration — R107.
 *
 * Fullscreen modal that fires when the user settles a debt in the
 * Split module. Combines:
 *   • Lime BrutalCard hero with the settled amount in oversized
 *     mono numerals
 *   • Confetti burst from the centre (existing reusable component)
 *   • Brutal-stamp tagline "CLEAN SLATE" / "BACK TO ZERO"
 *   • Auto-dismiss after 2200ms (or on tap)
 *
 * Built atop the brutal primitive set so it inherits the global
 * theme tokens. No new deps. Mounted at the screen level — caller
 * just toggles `visible` + passes `amount`.
 */
import React, { useEffect, useRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
  Easing,
} from 'react-native';
import Confetti from '../Confetti';
import {
  BR_COLORS,
  BR_BORDER,
  BR_RADIUS,
  BR_SHADOW,
  BR_FONT,
  BR_SPACE,
  PALETTE,
} from '../brutal';

type Props = {
  visible: boolean;
  amount: number;
  /** Optional name of the person you settled with — shown small. */
  withName?: string;
  onClose: () => void;
  /** Auto-dismiss after this many ms. Set 0 to require manual close. */
  autoCloseMs?: number;
};

const TAGLINES = ['CLEAN SLATE', 'BACK TO ZERO', 'SETTLED', 'PAID UP', 'NICE'];

export default function SettlementCelebration({
  visible,
  amount,
  withName,
  onClose,
  autoCloseMs = 2200,
}: Props) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Pick a tagline once per show. Stable per "open" via ref.
  const taglineRef = useRef(TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.6);
      opacity.setValue(0);
      return;
    }
    taglineRef.current = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    if (autoCloseMs > 0) {
      const t = setTimeout(() => onClose(), autoCloseMs);
      return () => clearTimeout(t);
    }
  }, [visible, autoCloseMs, onClose, scale, opacity]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} testID="settlement-celebration">
        {/* Confetti always renders behind the card */}
        <Confetti trigger={visible} />
        <Animated.View
          style={[
            styles.card,
            {
              opacity,
              transform: [
                { scale },
                // Slight playful tilt — sticker-like brutalist vibe
                { rotate: '-2deg' },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.stampPill}>
            <View style={styles.stampDot} />
            <Text style={styles.stampText}>{taglineRef.current}</Text>
          </View>
          <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
            ₹{Math.round(Math.abs(amount)).toLocaleString('en-IN')}
          </Text>
          <Text style={styles.subtitle}>
            {withName ? `Settled with ${withName}` : 'Settled'}
          </Text>
          <View style={styles.checkRow}>
            <View style={styles.checkChip}>
              <Text style={styles.checkChipText}>✓ DEBT GONE</Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: BR_SPACE['6'],
  },
  card: {
    backgroundColor: PALETTE.lime,
    borderWidth: BR_BORDER.thicker,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.md,
    paddingVertical: BR_SPACE['8'],
    paddingHorizontal: BR_SPACE['6'],
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    ...(BR_SHADOW.xl as any),
  },
  stampPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: BR_SPACE['3'],
    paddingVertical: 5,
    backgroundColor: BR_COLORS.ink,
    marginBottom: BR_SPACE['4'],
  },
  stampDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PALETTE.lime,
  },
  stampText: {
    ...BR_FONT.stamp,
    color: '#fff',
    fontSize: 11,
  },
  amount: {
    ...BR_FONT.numericLg,
    fontSize: 56,
    color: BR_COLORS.ink,
    letterSpacing: -1,
  },
  subtitle: {
    ...BR_FONT.body,
    color: BR_COLORS.ink,
    fontSize: 14,
    marginTop: BR_SPACE['2'],
    opacity: 0.85,
  },
  checkRow: {
    marginTop: BR_SPACE['5'],
    flexDirection: 'row',
  },
  checkChip: {
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['2'],
    ...(BR_SHADOW.sm as any),
  },
  checkChipText: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 11,
  },
});
