/**
 * ConfidenceBadge — visual stamp that tells the user how grounded an
 * insight is (R104).
 *
 * Tier definitions per the Trust brief:
 *   • VERIFIED  — fact from real transaction history (high confidence)
 *   • ESTIMATED — safe inference from partial / patterned data
 *   • SUGGESTED — recommendation; not derived, not earned
 *
 * Visual language is deliberately spare: a small ALL-CAPS stamp with
 * a coloured dot + tone. No emojis (the audit forbade fake-warmth).
 *
 * The badge accepts a structured `Provenance` payload so the same
 * primitive can be tapped to show the full evidence trace
 * (source list + coverage + timestamp). The reveal is opt-in via
 * `expandable` to keep ledger surfaces calm.
 */
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BR_BORDER,
  BR_COLORS,
  BR_RADIUS,
  PALETTE,
} from '../../theme/brutal';

export type ConfidenceTier = 'verified' | 'estimated' | 'suggested';

export type Provenance = {
  /** 0..1 confidence score (decision threshold ≥0.7 → verified, ≥0.4 → estimated) */
  confidence?: number;
  /** Human-readable source list ("23 Swiggy transactions", "45 days analyzed") */
  sources?: string[];
  /** "68 days analyzed" — coverage text */
  coverage?: string;
  /** "2h ago", "just now" — UI string */
  lastUpdated?: string;
  /** Optional one-line reasoning trace for debug / transparency */
  reasoning?: string;
};

export type ConfidenceBadgeProps = {
  tier: ConfidenceTier;
  provenance?: Provenance;
  /** When true, tapping the stamp toggles the evidence trace card. */
  expandable?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const TIER_LABEL: Record<ConfidenceTier, string> = {
  verified:  'VERIFIED',
  estimated: 'ESTIMATED',
  suggested: 'SUGGESTED',
};

const TIER_DOT: Record<ConfidenceTier, string> = {
  verified:  PALETTE.success,   // green dot — earned fact
  estimated: PALETTE.peach,     // peach dot — inference
  suggested: PALETTE.purple,    // purple dot — recommendation
};

const TIER_BG: Record<ConfidenceTier, string> = {
  verified:  PALETTE.successSoft,
  estimated: PALETTE.warningSoft,
  suggested: '#F5F0FF',         // soft lavender
};

/** Decision helper — pure function so backend ↔ frontend can agree. */
export function tierFromConfidence(c: number | null | undefined): ConfidenceTier {
  if (c == null || isNaN(c as number)) return 'suggested';
  if (c >= 0.7) return 'verified';
  if (c >= 0.4) return 'estimated';
  return 'suggested';
}

export default function ConfidenceBadge({
  tier,
  provenance,
  expandable = true,
  style,
  testID = 'confidence-badge',
}: ConfidenceBadgeProps) {
  const [open, setOpen] = useState(false);
  const showTrace =
    expandable && provenance &&
    !!(provenance.sources?.length || provenance.coverage || provenance.lastUpdated);

  const Wrap: any = expandable && showTrace ? Pressable : View;

  return (
    <View style={style}>
      <Wrap
        testID={testID}
        onPress={expandable && showTrace ? () => setOpen((v) => !v) : undefined}
        accessibilityRole={expandable && showTrace ? 'button' : 'text'}
        accessibilityLabel={`${TIER_LABEL[tier]} insight${
          provenance?.coverage ? ` based on ${provenance.coverage}` : ''
        }`}
        style={[s.stamp, { backgroundColor: TIER_BG[tier] }]}
      >
        <View style={[s.dot, { backgroundColor: TIER_DOT[tier] }]} />
        <Text style={s.label}>{TIER_LABEL[tier]}</Text>
        {expandable && showTrace && (
          <Text style={s.chev}>{open ? '▾' : '▸'}</Text>
        )}
      </Wrap>
      {open && showTrace && (
        <View style={s.trace} testID="confidence-trace">
          {provenance!.sources && provenance!.sources.length > 0 && (
            <View style={s.traceBlock}>
              <Text style={s.traceLabel}>SOURCE</Text>
              {provenance!.sources.map((src, i) => (
                <Text key={i} style={s.traceLine}>· {src}</Text>
              ))}
            </View>
          )}
          {!!provenance!.coverage && (
            <View style={s.traceBlock}>
              <Text style={s.traceLabel}>COVERAGE</Text>
              <Text style={s.traceLine}>{provenance!.coverage}</Text>
            </View>
          )}
          {!!provenance!.lastUpdated && (
            <View style={s.traceBlock}>
              <Text style={s.traceLabel}>UPDATED</Text>
              <Text style={s.traceLine}>{provenance!.lastUpdated}</Text>
            </View>
          )}
          {!!provenance!.reasoning && (
            <View style={s.traceBlock}>
              <Text style={s.traceLabel}>REASONING</Text>
              <Text style={[s.traceLine, { fontStyle: 'italic' }]}>
                {provenance!.reasoning}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.xs,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: BR_COLORS.ink,
  },
  label: {
    fontSize: 9,
    fontWeight: '900',
    color: BR_COLORS.ink,
    letterSpacing: 1.4,
  },
  chev: {
    fontSize: 10,
    color: BR_COLORS.ink,
    marginLeft: 2,
  },
  trace: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.xs,
    gap: 6,
  },
  traceBlock: { gap: 2 },
  traceLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: BR_COLORS.textMuted,
  },
  traceLine: {
    fontSize: 11,
    fontWeight: '600',
    color: BR_COLORS.text,
  },
});
