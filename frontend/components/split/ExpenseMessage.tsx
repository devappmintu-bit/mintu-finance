/**
 * ExpenseMessage — R101F GPay-style payment card.
 *
 * Reference: the user shared a Google Pay screenshot with "Requested
 * for 'flight - 1' / ₹2,000 / payer avatar / progress bar / Unpaid · 1 May
 * → / [Pay]" — the gold standard for embedded social payment cards.
 *
 * What this card does (in priority order):
 *   1.  Tells the user "what is this?"   — title + amount, big.
 *   2.  Tells them "who paid?"           — payer avatar + name.
 *   3.  Tells them "where are we?"       — progress bar + "N of M paid".
 *   4.  Tells them "what's the state?"   — Paid · date  /  Unpaid · date.
 *   5.  Gives them THE action            — a single Pay pill, when owed.
 *
 * The Pay button only renders when the current user is NOT the payer
 * AND the expense is not fully settled. Tapping it bubbles up via
 * `onPay` to the parent (GroupChat → split/[id] → PaySheet → UPI deep
 * link) so the chat row stays a thin presentational card.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { MEMBER_COLORS } from './theme';
import { inr } from '../../utils/inr';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', marginBottom: 14 },
  rowL: { justifyContent: 'flex-start' },
  rowR: { justifyContent: 'flex-end' },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginTop: 18,
  },
  avatarT: { fontSize: 12, fontWeight: '700' },
  senderName: {
    fontSize: 13, fontWeight: '700',
    color: c.text.primary, marginBottom: 4, marginLeft: 4,
  },
  // Card — slightly raised, generous padding, GPay-ish geometry but
  // honoring MintU's brutalist spine (1px hairline, no soft glow).
  card: {
    backgroundColor: c.bg.card,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: c.border.card,
    minWidth: 260,
    gap: 12,
  },
  title: { fontSize: 14, fontWeight: '600', color: c.text.primary, lineHeight: 19 },
  titleQuote: { fontWeight: '700' },
  amount: { fontSize: 32, fontWeight: '800', color: c.text.primary, letterSpacing: -0.5 },
  payerRow: { flexDirection: 'row', alignItems: 'center' },
  payerAvatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  payerAvT: { fontSize: 12, fontWeight: '800' },
  // Progress block — track + label below, mirrors GPay layout.
  progressBlock: { gap: 6 },
  progressTrack: {
    height: 4, backgroundColor: c.bg.secondary,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressLabel: { fontSize: 12, fontWeight: '600', color: c.text.muted },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  // Pay pill — rounded, accent-tinted, big tap target. GPay uses a
  // pale-blue fill; we use the MintU accent at low alpha so the brand
  // colour carries through but the brutal contrast steps down for an
  // action-pill (not a primary balance).
  payBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: c.accent.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnT: {
    fontSize: 15,
    fontWeight: '800',
    color: c.accent.primary,
    letterSpacing: 0.2,
  },
  time: { fontSize: 10, color: c.text.muted, marginTop: 4, marginLeft: 4 },
}));

interface Props {
  item: any;
  isMe: boolean;
  formatTime: (iso: string) => string;
  /** When provided, an "Pay" pill is rendered for unpaid rows where
   *  the current user is NOT the payer. Wire to PaySheet. */
  onPay?: (item: any) => void;
}

// Format a short calendar date for the status row, e.g. "1 May".
// Falls back to formatTime when the date is unparseable.
const fmtShortDate = (iso: string, fallback: (s: string) => string) => {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return fallback(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch { return fallback(iso); }
};

export default function ExpenseMessage({ item, isMe, formatTime, onPay }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const ed = item.expense_data || {};
  const totalSplits = ed.split_count || ed.splits_count || 0;
  const paidCount = ed.paid_count != null ? ed.paid_count : 1;
  const progressPct = totalSplits > 0 ? Math.min(100, (paidCount / totalSplits) * 100) : 100;
  const isFullyPaid = paidCount >= totalSplits;
  const memberNames: string[] = ed.member_names || [];

  // R101F — GPay rule: the Pay pill only appears when (a) the current
  // user is not the payer, (b) the expense is not fully settled. We
  // can't yet distinguish "I personally already paid" from the lighter
  // expense_data payload, so the pill is conservative-shown — when
  // the user taps Pay and no debt remains for them, PaySheet will
  // resolve the no-op gracefully.
  const showPay = !!onPay && !isMe && !isFullyPaid;

  // Status row composition. GPay shows two flavours:
  //   ✅ Paid · 1 May        — green, settled
  //   🕒 Unpaid · 1 May      — neutral, owes
  const statusIcon: 'checkmark-circle' | 'time-outline' = isFullyPaid ? 'checkmark-circle' : 'time-outline';
  const statusColor = isFullyPaid ? COLORS.accent.moneyIn : c.text.muted;
  const statusLabel = isFullyPaid ? 'Paid' : 'Unpaid';
  const dateLabel = fmtShortDate(item.created_at, formatTime);

  return (
    <View style={[s.row, isMe ? s.rowR : s.rowL]}>
      {!isMe && (
        <View style={[s.avatar, { backgroundColor: MEMBER_COLORS[0] + '22' }]}>
          <Text style={[s.avatarT, { color: MEMBER_COLORS[0] }]}>{(item.sender_name || '?')[0]}</Text>
        </View>
      )}
      <View style={{ maxWidth: '86%', flex: 1 }}>
        {!isMe && <Text style={s.senderName}>{item.sender_name}</Text>}
        <View style={s.card}>
          {/* Title row — "Requested for '<description>'" framing */}
          <Text style={s.title} numberOfLines={2}>
            Requested for <Text style={s.titleQuote}>'{item.content || 'expense'}'</Text>
          </Text>

          {/* The big amount — Indian-grouping, never abbreviated. */}
          <Text style={s.amount} numberOfLines={1}>{inr(ed.amount)}</Text>

          {/* Payer avatar — single, not a stack. GPay's "who paid" cue. */}
          <View style={s.payerRow}>
            <View style={[s.payerAvatar, { backgroundColor: MEMBER_COLORS[1] + '24' }]}>
              <Text style={[s.payerAvT, { color: MEMBER_COLORS[1] }]}>
                {((ed.paid_by || item.sender_name || '?')[0] || '?').toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Progress + count: "1/N paid" rendering — GPay-grade. */}
          <View style={s.progressBlock}>
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressFill,
                  {
                    width: `${progressPct}%`,
                    backgroundColor: isFullyPaid ? COLORS.accent.moneyIn : c.accent.primary,
                  },
                ]}
              />
            </View>
            <Text style={s.progressLabel}>{paidCount}/{totalSplits || 1} paid</Text>
          </View>

          {/* Status row — icon + state + date */}
          <View style={s.footerRow}>
            <Ionicons name={statusIcon} size={14} color={statusColor} />
            <Text style={[s.statusText, { color: statusColor }]}>
              {statusLabel} · {dateLabel}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={c.text.muted} style={{ marginLeft: 'auto' }} />
          </View>

          {/* THE Pay pill — single CTA, rendered only when actionable. */}
          {showPay && (
            <TouchableOpacity
              testID="expense-pay-btn"
              activeOpacity={0.85}
              onPress={() => onPay?.(item)}
              style={s.payBtn}
              accessibilityRole="button"
              accessibilityLabel={`Pay your share of ${ed.paid_by || item.sender_name}'s ${item.content}`}
            >
              <Text style={s.payBtnT}>Pay</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[s.time, isMe && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

