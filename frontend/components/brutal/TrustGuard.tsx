/**
 * TrustGuard — render-gate for any chart / insight widget that needs
 * a minimum data threshold to be statistically meaningful (R104).
 *
 * The Trust brief explicitly says:
 *   "Charts must ONLY render when statistically meaningful."
 *   "If insufficient data → show 'Track more expenses to unlock'."
 *   "DO NOT extrapolate fake projections, fabricate forecasts, smooth
 *    missing data deceptively."
 *
 * Usage:
 *   <TrustGuard
 *     count={txnCount}
 *     min={5}
 *     emptyTitle="Not enough data yet"
 *     emptyBody="Track 5 expenses to unlock weekly trends."
 *   >
 *     <SpendChart data={...} />
 *   </TrustGuard>
 *
 * If `count < min`, renders an honest empty state instead of the
 * child chart. No fake projections, no synthetic smoothing — just
 * clear "needs more data" copy with progress indicator.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  BR_BORDER,
  BR_COLORS,
  BR_FONT,
  BR_RADIUS,
  PALETTE,
} from '../../theme/brutal';

export type TrustGuardProps = React.PropsWithChildren<{
  /** Current data point count (transactions, settlements, etc.) */
  count: number;
  /** Minimum count below which we refuse to render the child. */
  min: number;
  /** Title shown when below threshold. */
  emptyTitle?: string;
  /** Explainer copy shown when below threshold. */
  emptyBody?: string;
  /** Optional emoji rendered above the title. */
  emoji?: string;
  /** Render a tiny progress bar showing `count / min`. */
  showProgress?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export default function TrustGuard({
  children,
  count,
  min,
  emptyTitle = 'Not enough data yet',
  emptyBody,
  emoji = '📊',
  showProgress = true,
  style,
  testID = 'trust-guard',
}: TrustGuardProps) {
  if (count >= min) {
    return <>{children}</>;
  }
  const pct = Math.min(1, Math.max(0, count / Math.max(1, min)));
  return (
    <View style={[s.empty, style]} testID={testID}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={s.title}>{emptyTitle}</Text>
      {!!emptyBody && <Text style={s.body}>{emptyBody}</Text>}
      {showProgress && (
        <View style={s.progWrap}>
          <View style={s.progTrack}>
            <View
              style={[
                s.progFill,
                {
                  width: `${pct * 100}%`,
                  backgroundColor: PALETTE.brand,
                },
              ]}
            />
          </View>
          <Text style={s.progLabel}>
            {count}/{min}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  empty: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    borderStyle: 'dashed',
    borderRadius: BR_RADIUS.sm,
    gap: 6,
  },
  emoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  title: {
    ...BR_FONT.h3,
    color: BR_COLORS.ink,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    fontWeight: '600',
    color: BR_COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  progWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    alignSelf: 'stretch',
    paddingHorizontal: 10,
  },
  progTrack: {
    flex: 1,
    height: 8,
    backgroundColor: BR_COLORS.bg,
    borderWidth: 1,
    borderColor: BR_COLORS.ink,
    borderRadius: 0,
    overflow: 'hidden',
  },
  progFill: { height: '100%' },
  progLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: BR_COLORS.textMuted,
    letterSpacing: 1,
    fontFamily: BR_FONT.mono.fontFamily,
  },
});
