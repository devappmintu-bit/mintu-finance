/**
 * Brutal primitive barrel. Lets screens do:
 *   import { BrutalCard, BrutalButton } from '@/components/brutal';
 */
export { default as BrutalCard, type BrutalCardProps } from './BrutalCard';
export { default as BrutalButton, type BrutalButtonProps } from './BrutalButton';
export { default as BrutalChip, type BrutalChipProps } from './BrutalChip';
export { default as BrutalInput, type BrutalInputProps } from './BrutalInput';
export { default as BrutalBadge, type BrutalBadgeProps } from './BrutalBadge';
export { default as BrutalProgress, type BrutalProgressProps } from './BrutalProgress';
export { default as BrutalToast, type BrutalToastProps } from './BrutalToast';
export { default as BrutalTabBar, type BrutalTabBarProps, type BrutalTabItem } from './BrutalTabBar';
export { default as BrutalEmptyState, type BrutalEmptyStateProps } from './BrutalEmptyState';
export { default as BrutalScreenHeader, type BrutalScreenHeaderProps } from './BrutalScreenHeader';
// R104 — Trust layer primitives. Stamp insights with provenance,
// gate charts behind data thresholds. See `ConfidenceBadge.tsx`
// and `TrustGuard.tsx` for usage.
export { default as ConfidenceBadge, tierFromConfidence, type ConfidenceTier, type Provenance, type ConfidenceBadgeProps } from './ConfidenceBadge';
export { default as TrustGuard, type TrustGuardProps } from './TrustGuard';

// Re-export tokens so screens can do `import { BR_COLORS, BR_SHADOW } from '@/components/brutal'`.
export {
  PALETTE,
  BR_COLORS,
  BR_BORDER,
  BR_SHADOW,
  BR_RADIUS,
  BR_SPACE,
  BR_FONT,
  BR_SPRING,
  BR_TIMING,
  BR_Z,
  BR_CARD,
  TONE_BG,
  TONE_FG,
  INK,
  PAPER,
  CREAM,
  ACCENT_BRAND,
  ACCENT_YELLOW,
  ACCENT_LIME,
  ACCENT_PURPLE,
  ACCENT_PEACH,
  ACCENT_CYAN,
} from '../../theme/brutal';
export type { BrutalTone } from '../../theme/brutal';
