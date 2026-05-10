/**
 * components/intelligence/CashFlowCard.tsx — R118 SLICE D
 *
 * Predictive cash-flow surface for the home dashboard.
 *
 * Shows:
 *   • Days remaining in current month
 *   • Projected end-of-month NET (in - out) — the main signal
 *   • Burn-rate row (₹/day)
 *   • Upcoming bills list (any subscription charges due ≤ 7 days)
 *   • Encouraging headline copy from the backend
 *
 * Behaviour:
 *   • Hidden on first paint when there's no usable history
 *   • When projected_net is negative, switch to "soft warning" cool palette
 *     (NEVER red-alarm — stays companion-tone)
 *   • Tap → expand bill alerts inline
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCashflow } from '../../hooks/useIntelligence';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_FONT } from '../../utils/brutalist';

const PALETTE = {
  warm: { bg: '#DDF5E5', ink: '#0B4E2A', ring: '#0B6E3A' },
  cool: { bg: '#D6EFFF', ink: '#0A3A66', ring: '#1865B5' },
};

function fmtINR(n: number, opts: { signed?: boolean } = {}): string {
  if (n === 0) return '₹0';
  const sign = n < 0 ? '-' : (opts.signed ? '+' : '');
  return `${sign}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
}

function fmtDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch { return '—'; }
}

export default function CashFlowCard() {
  const { data, loading } = useCashflow();
  const [expanded, setExpanded] = useState(false);

  if (loading && !data) return null;
  if (!data) return null;
  // Honest UX: if there's no real burn signal yet, hide
  if (data.tx_count < 3 || data.avg_daily_burn === 0) return null;

  const palette = data.vibe === 'warm' ? PALETTE.warm : PALETTE.cool;
  const showBills = data.bill_alerts && data.bill_alerts.length > 0;

  return (
    <Pressable
      onPress={() => showBills && setExpanded(e => !e)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.bg, borderColor: BR_COLORS.ink },
        pressed && { transform: [{ translateY: 1 }] },
      ]}
      accessibilityRole={showBills ? 'button' : 'none' as any}
      accessibilityLabel={`Projected end of month net: ${fmtINR(data.projected_net, { signed: true })}`}
    >
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: palette.ink }]}>
          PROJECTED · {data.days_to_eom}D LEFT
        </Text>
        {showBills && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={palette.ink}
          />
        )}
      </View>

      <View style={styles.bigRow}>
        <Text style={[styles.bigNum, { color: palette.ink }]}>
          {fmtINR(data.projected_net, { signed: true })}
        </Text>
        <Text style={[styles.bigLbl, { color: palette.ink }]}>EOM NET</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: palette.ink }]} />

      <View style={styles.metricsRow}>
        <View style={styles.metricCell}>
          <Text style={[styles.metricLbl, { color: palette.ink }]}>BURN/DAY</Text>
          <Text style={[styles.metricVal, { color: palette.ink }]}>
            {fmtINR(data.avg_daily_burn)}
          </Text>
        </View>
        <View style={[styles.metricCellMid, { borderColor: palette.ink }]}>
          <Text style={[styles.metricLbl, { color: palette.ink }]}>EOM SPEND</Text>
          <Text style={[styles.metricVal, { color: palette.ink }]}>
            {fmtINR(data.projected_spend)}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={[styles.metricLbl, { color: palette.ink }]}>EOM IN</Text>
          <Text style={[styles.metricVal, { color: palette.ink }]}>
            {fmtINR(data.projected_in)}
          </Text>
        </View>
      </View>

      <Text style={[styles.copy, { color: palette.ink }]}>
        {data.copy}
      </Text>

      {showBills && expanded && (
        <View style={styles.bills}>
          <Text style={[styles.billsHead, { color: palette.ink }]}>
            UPCOMING WITHIN 7D
          </Text>
          {data.bill_alerts.map(b => (
            <View key={b.merchant} style={[styles.billRow, { borderColor: palette.ink }]}>
              <Text style={styles.billEmoji}>{b.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.billMerch, { color: palette.ink }]}>{b.merchant}</Text>
                <Text style={[styles.billMeta, { color: palette.ink }]}>
                  in {b.days_until}d · {fmtDateShort(b.due_iso)}
                </Text>
              </View>
              <Text style={[styles.billAmt, { color: palette.ink }]}>
                {fmtINR(b.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {showBills && !expanded && (
        <View style={styles.billHint}>
          <Ionicons name="alarm-outline" size={12} color={palette.ink} />
          <Text style={[styles.billHintTxt, { color: palette.ink }]}>
            {data.bill_alerts.length} bill{data.bill_alerts.length === 1 ? '' : 's'} due in the next 7 days · tap to expand
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
    padding: BR_SPACE.lg,
    borderWidth: BR_BORDER.bold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: BR_SPACE.sm,
  },
  kicker: {
    ...BR_TYPE.label,
    letterSpacing: 1.8,
    fontSize: 10,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BR_SPACE.sm,
  },
  bigNum: {
    fontSize: 38,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -1.5,
    lineHeight: 42,
  },
  bigLbl: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingBottom: 6,
    opacity: 0.7,
  },
  divider: {
    height: 1.5,
    marginTop: BR_SPACE.md,
    marginBottom: BR_SPACE.md,
    opacity: 0.6,
  },
  metricsRow: {
    flexDirection: 'row',
  },
  metricCell: { flex: 1 },
  metricCellMid: {
    flex: 1,
    paddingHorizontal: BR_SPACE.md,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
  },
  metricLbl: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    opacity: 0.7,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    marginTop: 2,
    letterSpacing: -0.3,
  },

  copy: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: BR_SPACE.md,
  },

  // Bill alerts
  billHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: BR_SPACE.sm,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.15)',
  },
  billHintTxt: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.75,
  },
  bills: {
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(0,0,0,0.18)',
  },
  billsHead: {
    ...BR_TYPE.label,
    letterSpacing: 1.6,
    fontSize: 10,
    marginBottom: 8,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.md,
    padding: BR_SPACE.sm,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  billEmoji: { fontSize: 20 },
  billMerch: { fontSize: 13, fontWeight: '900', letterSpacing: -0.2 },
  billMeta: { fontSize: 10, fontWeight: '700', opacity: 0.7, marginTop: 2 },
  billAmt: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -0.3,
  },
});
