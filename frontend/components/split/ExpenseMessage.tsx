// Expense card message bubble — shown in group chat when an expense is logged.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { MEMBER_COLORS } from './theme';

interface Props {
  item: any;
  isMe: boolean;
  formatTime: (iso: string) => string;
}

export default function ExpenseMessage({ item, isMe, formatTime }: Props) {
  const s = useStyles();
  const ed = item.expense_data;
  const totalSplits = ed.split_count || ed.splits_count || 0;
  const paidCount = ed.paid_count != null ? ed.paid_count : 1;
  const progressPct = totalSplits > 0 ? Math.min(100, (paidCount / totalSplits) * 100) : 100;
  const isFullyPaid = paidCount >= totalSplits;
  const memberNames: string[] = ed.member_names || [];

  return (
    <View style={[s.row, isMe ? s.rowR : s.rowL]}>
      {!isMe && (
        <View style={[s.avatar, { backgroundColor: MEMBER_COLORS[0] + '20' }]}>
          <Text style={[s.avatarT, { color: MEMBER_COLORS[0] }]}>{(item.sender_name || '?')[0]}</Text>
        </View>
      )}
      <View style={{ maxWidth: '82%' }}>
        {!isMe && <Text style={s.senderName}>{item.sender_name}</Text>}
        <View style={s.card}>
          <View style={s.head}>
            <View style={s.emojiWrap}>
              <Ionicons name="receipt" size={16} color={COLORS.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{item.content}</Text>
              <Text style={s.sub} numberOfLines={1}>
                Paid by {ed.paid_by} · {totalSplits} {totalSplits === 1 ? 'person' : 'people'}
              </Text>
            </View>
          </View>
          <Text style={s.amount}>₹{Number(ed.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
          {memberNames.length > 0 && (
            <View style={s.avatarStack}>
              {memberNames.slice(0, 5).map((nm, i) => (
                <View
                  key={i}
                  style={[
                    s.stackAvatar,
                    { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '22', marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i },
                  ]}
                >
                  <Text style={[s.stackAvT, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>
                    {(nm || '?')[0].toUpperCase()}
                  </Text>
                </View>
              ))}
              {memberNames.length > 5 && (
                <View style={[s.stackAvatar, { backgroundColor: COLORS.bg.secondary, marginLeft: -10 }]}>
                  <Text style={[s.stackAvT, { color: COLORS.text.secondary }]}>+{memberNames.length - 5}</Text>
                </View>
              )}
            </View>
          )}
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                { width: `${progressPct}%`, backgroundColor: isFullyPaid ? COLORS.accent.moneyIn : COLORS.accent.primary },
              ]}
            />
          </View>
          <View style={s.footer}>
            <Text style={[s.status, isFullyPaid && { color: COLORS.accent.moneyIn }]}>
              {isFullyPaid ? '✅ All settled' : `${paidCount} of ${totalSplits} paid`}
            </Text>
            {!isFullyPaid && (
              <Text style={s.perPerson}>
                ₹{Math.round((ed.amount || 0) / Math.max(totalSplits, 1)).toLocaleString('en-IN')} each
              </Text>
            )}
          </View>
        </View>
        <Text style={[s.time, isMe && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', marginBottom: 12 },
  rowL: { justifyContent: 'flex-start' },
  rowR: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 16 },
  avatarT: { fontSize: 12, fontWeight: '700' },
  senderName: { fontSize: 11, fontWeight: '600', color: c.accent.primary, marginBottom: 3, marginLeft: 2 },
  card: { backgroundColor: c.bg.card, borderRadius: RADIUS.xl, padding: 16, borderWidth: 1, borderColor: c.border.card, minWidth: 240, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emojiWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.accent.primary + '15', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: c.text.primary },
  sub: { fontSize: 11, color: c.text.muted, marginTop: 1 },
  amount: { fontSize: 28, fontWeight: '800', color: c.text.primary },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  stackAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: c.bg.card },
  stackAvT: { fontSize: 11, fontWeight: '700' },
  progressTrack: { height: 4, backgroundColor: c.bg.secondary, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
  perPerson: { fontSize: 11, color: c.text.muted, fontWeight: '600' },
  time: { fontSize: 9, color: c.text.muted, marginTop: 3, marginLeft: 2 },
}));
