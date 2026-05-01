/**
 * EmptyState (legacy API shim)
 *
 * This file used to contain a standalone implementation. As part of
 * Refactor Wave R5 (legacy primitive consolidation) it was converted
 * to a thin shim over the DS 2.0 primitive `primitives/EmptyState`.
 *
 * Why keep the shim at all?
 *   - 8 files across the app still import from `components/ui/EmptyState`
 *     with slightly different prop names (`ctaLabel` + `onCta` +
 *     `subtitle` + `compact` instead of the DS2.0 `actionLabel` +
 *     `onAction` + `body`). Migrating every call-site at once would
 *     touch 8 load-bearing screens — too much risk for one session.
 *   - The shim normalises the old props into the new primitive's
 *     API so every caller instantly inherits the new brand halo,
 *     DS2.0 spacing, and PremiumButton CTA — with zero edit.
 *
 * Future: when the 8 call-sites all adopt the new prop names, this
 * file can be deleted and the import paths repointed at
 * `components/primitives`.
 */
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PremiumEmptyState from '../primitives/EmptyState';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  /** When true, swaps the icon/emoji halo for the breathing MintuMascot.
   * Round 55 — opt-in so list-rendered empty states stay lightweight. */
  mascot?: boolean;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
  compact?: boolean;
}

export default function EmptyState({
  icon,
  emoji,
  mascot,
  title,
  subtitle,
  ctaLabel,
  onCta,
  compact,
}: Props) {
  // `compact` used to squeeze the padding — we approximate by wrapping
  // in a View with -vertical margin so the halo stays the same visual
  // size, matching previous behaviour.
  const content = (
    <PremiumEmptyState
      icon={icon}
      emoji={emoji}
      mascot={mascot}
      title={title}
      body={subtitle}
      actionLabel={ctaLabel}
      onAction={onCta}
    />
  );

  if (!compact) return content;

  // Compact: same content, tighter vertical padding via negative margin.
  return <View style={{ marginVertical: -12 }}>{content}</View>;
}
