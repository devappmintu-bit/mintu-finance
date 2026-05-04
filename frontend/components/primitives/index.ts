/**
 * primitives/index.ts — single entry point for Design System 2.0
 * primitives. Importing from here lets future waves refactor file
 * layouts without churning 100 import sites.
 *
 * See /app/memory/DESIGN_SYSTEM_2_0.md for full design-system docs.
 */

// ══ Motion & feedback ══════════════════════════════════════════════
export { default as SpringPress } from './SpringPress';
export { default as Shimmer } from './Shimmer';
export { default as SuccessGlow } from './SuccessGlow';
export { default as StaggeredEntrance } from './StaggeredEntrance';
export { default as StaggeredListItem } from './StaggeredListItem';
export { default as ParallaxHeader } from './ParallaxHeader';

// ══ Surfaces & primitives ═════════════════════════════════════════
export { default as PremiumCard } from './PremiumCard';
// PremiumButton removed (Round 81). Use <BrutalButton> from components/brutal.
export { default as SectionHeader } from './SectionHeader';

// ══ Input primitives (DS 2.0 I/O sweep) ═══════════════════════════
export { default as PremiumInput } from './PremiumInput';
export { default as CurrencyField } from './CurrencyField';
export { default as CategorySelector } from './CategorySelector';
export { default as SegmentedToggle } from './SegmentedToggle';
export { default as ExpandableSection } from './ExpandableSection';

// ══ Conversational input primitives (Round 57) ════════════════════
// "Inputs should feel like a smart assistant helping the user, not a
// form asking questions." — see BRAND_KIT.md §1.1.
export { default as QuickAmountChips } from './QuickAmountChips';
export { default as DatePresetChips } from './DatePresetChips';
export { default as InputMascot } from './InputMascot';
export { default as ConversationalPrompt, InputAssistantHeader } from './ConversationalPrompt';

// ══ Output primitives (states + intelligence) ═════════════════════
export { default as EmptyState } from './EmptyState';
export { default as SmartSuggestion } from './SmartSuggestion';
export { default as AlertBanner } from './AlertBanner';

// ══ Money / data display ══════════════════════════════════════════
export { default as MoneyNumber } from './MoneyNumber';
export { default as MicroBarChart } from './MicroBarChart';
export { default as PinDot } from './PinDot';

// ══ Type re-exports ═══════════════════════════════════════════════
export type { SmartSuggestionKind } from './SmartSuggestion';
export type { AlertBannerTone } from './AlertBanner';
export type { CategoryOption, CategorySelectorProps } from './CategorySelector';
export type { SegmentOption, SegmentedToggleProps } from './SegmentedToggle';
export type { PremiumInputHandle, PremiumInputProps } from './PremiumInput';
