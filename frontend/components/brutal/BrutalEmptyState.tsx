/**
 * BrutalEmptyState — mascot-presence empty state primitive (R103E).
 *
 * Drop-in replacement for any "you have no X yet" surface across the
 * app. Audit ask: every empty state must "teach, entertain, emotionally
 * guide, encourage next action". This primitive does exactly that:
 *
 *   <BrutalEmptyState
 *     emoji="🌱"
 *     title="No expenses yet"
 *     body="Log your first one and Mintu will start spotting patterns."
 *     ctaLabel="LOG FIRST EXPENSE"
 *     onCta={() => router.push('/add')}
 *   />
 *
 * Uses BrutalCard (ghost variant) + BrutalButton (accent tone) so the
 * empty surface immediately feels on-brand instead of generic gray.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  BR_COLORS,
  BR_FONT,
  BR_SPACE,
  type BrutalTone,
} from '../../theme/brutal';
import BrutalCard from './BrutalCard';
import BrutalButton from './BrutalButton';

export type BrutalEmptyStateProps = {
  /** Emoji or short string rendered as the visual hero (60px). */
  emoji?: string;
  /** Optional custom illustration node — overrides emoji when provided. */
  illustration?: React.ReactNode;
  title: string;
  body?: string;
  /** Optional secondary line below body for tips / hint text. */
  hint?: string;
  ctaLabel?: string;
  onCta?: () => void;
  /** Optional secondary CTA (ghost button below the primary). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Card variant — `ghost` is the default for empty states. */
  variant?: 'ghost' | 'base' | 'warm' | 'lavender';
  ctaTone?: BrutalTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function BrutalEmptyState({
  emoji,
  illustration,
  title,
  body,
  hint,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
  variant = 'ghost',
  ctaTone = 'accent',
  style,
  testID = 'brutal-empty-state',
}: BrutalEmptyStateProps) {
  return (
    <BrutalCard variant={variant} style={[s.card, style]} testID={testID}>
      <View style={s.heroWrap}>
        {illustration ?? (
          <Text style={s.emoji} accessibilityRole="image">
            {emoji ?? '✨'}
          </Text>
        )}
      </View>
      <Text style={s.title}>{title}</Text>
      {!!body && <Text style={s.body}>{body}</Text>}
      {!!hint && <Text style={s.hint}>{hint}</Text>}
      {!!ctaLabel && !!onCta && (
        <View style={s.ctaWrap}>
          <BrutalButton
            label={ctaLabel}
            tone={ctaTone}
            onPress={onCta}
            size="md"
          />
          {!!secondaryLabel && !!onSecondary && (
            <BrutalButton
              label={secondaryLabel}
              tone="paper"
              onPress={onSecondary}
              size="md"
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      )}
    </BrutalCard>
  );
}

const s = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: BR_SPACE['7'],
    paddingHorizontal: BR_SPACE['5'],
  },
  heroWrap: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: BR_SPACE['4'],
  },
  emoji: {
    fontSize: 56,
    lineHeight: 62,
  },
  title: {
    ...BR_FONT.h2,
    color: BR_COLORS.ink,
    textAlign: 'center',
    marginBottom: BR_SPACE['2'],
  },
  body: {
    fontSize: 14,
    fontWeight: '600',
    color: BR_COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  hint: {
    fontSize: 11,
    fontWeight: '700',
    color: BR_COLORS.textFaint,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: BR_SPACE['2'],
    maxWidth: 260,
  },
  ctaWrap: {
    marginTop: BR_SPACE['5'],
    alignItems: 'center',
    alignSelf: 'stretch',
  },
});
