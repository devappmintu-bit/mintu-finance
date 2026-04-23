// Expenses tab content inside a group — redesigned to feel less gpay-like.
// Structure:
//  1. Hero balance card (saffron gradient) — net you owe / are owed + quick stats
//  2. Quick-action strip (Add expense · Remind all · Direct pay)
//  3. Settle Up — coloured avatar tiles, each with its own saffron Pay button
//  4. Recent expenses — timeline cards with category chip, paid-by avatar,
//     "your share" badge, date, and swipe-to-delete / tap-to-edit
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { MEMBER_COLORS, C } from './theme';
import SwipeableRow from '../SwipeableRow';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';

interface Props {
  summary: any;
  currentUserId?: string;
  onAddExpense: () => void;
  onEditExpense?: (exp: any) => void;
  onDeleteExpense?: (exp: any) => void;
  onDirectPay?: (debt: any) => void;
  onRemind?: (debt: any) => void;
}

const catIcon = (desc: string): { emoji: string; color: string } => {
  const d = (desc || '').toLowerCase();
  if (/(food|restaurant|dinner|lunch|breakfast|swiggy|zomato|coffee)/.test(d)) return { emoji: '🍽', color: '#F59E0B' };
  if (/(uber|ola|taxi|cab|fuel|petrol|transport)/.test(d))                   return { emoji: '🚕', color: '#3B82F6' };
  if (/(movie|netflix|entertainment|concert|party)/.test(d))                 return { emoji: '🎬', color: '#8B5CF6' };
  if (/(grocery|vegetable|bigbasket|blinkit|fruit)/.test(d))                 return { emoji: '🛒', color: '#10B981' };
  if (/(rent|flat|hostel|bnb|hotel|room)/.test(d))                           return { emoji: '🏠', color: '#F56E1E' };
  if (/(medic|doctor|pharmacy|hospital|health)/.test(d))                     return { emoji: '💊', color: '#EF4444' };
  if (/(shopping|amazon|flipkart|myntra|mall)/.test(d))                      return { emoji: '🛍', color: '#EC4899' };
  return { emoji: '💰', color: '#6B7280' };
};

const fmtDate = (s: string): string => {
  if (!s) return '';
  try {
    const d = new Date(s);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 36e5;
    if (diffH < 24 && d.getDate() === now.getDate()) return 'Today';
    if (diffH < 48) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch { return ''; }
};

export default function ExpensesTab({ summary, currentUserId, onAddExpense, onEditExpense, onDeleteExpense, onDirectPay, onRemind }: Props) {
  const s = useStyles();
  const { lang } = useLangStore();

  const owedByYou =
    summary?.simplified_debts?.filter((d: any) => d.from_id === currentUserId).reduce((acc: number, d: any) => acc + d.amount, 0) || 0;
  const owedToYou =
    summary?.simplified_debts?.filter((d: any) => d.to_id === currentUserId).reduce((acc: number, d: any) => acc + d.amount, 0) || 0;
  const net = owedToYou - owedByYou;

  const orderedExpenses: any[] = summary?.recent_expenses ? [...summary.recent_expenses].reverse() : [];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* 1. Hero balance card ----------------------------------------- */}
      <LinearGradient
        colors={net >= 0 ? ['#047857', '#10B981'] : ['#C14A06', '#F56E1E']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={s.heroHead}>
          <Text style={s.heroLbl}>{net >= 0 ? "You're net owed" : "You owe net"}</Text>
          <Ionicons name={net >= 0 ? 'trending-up' : 'trending-down'} size={16} color="#fff" />
        </View>
        <Text style={s.heroAmt}>₹{Math.abs(net).toLocaleString('en-IN')}</Text>

        <View style={s.heroSplits}>
          <View style={s.heroSplit}>
            <View style={[s.heroDot, { backgroundColor: 'rgba(255,255,255,0.85)' }]} />
            <Text style={s.heroSplitLbl}>{t('owed_to_you', lang)}</Text>
            <Text style={s.heroSplitVal}>₹{owedToYou.toFixed(0)}</Text>
          </View>
          <View style={s.heroSplitDiv} />
          <View style={s.heroSplit}>
            <View style={[s.heroDot, { backgroundColor: 'rgba(255,255,255,0.55)' }]} />
            <Text style={s.heroSplitLbl}>{t('owed_by_you', lang)}</Text>
            <Text style={s.heroSplitVal}>₹{owedByYou.toFixed(0)}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* 2. Quick-action strip --------------------------------------- */}
      <View style={s.quickRow}>
        <TouchableOpacity style={s.quickBtn} onPress={onAddExpense} activeOpacity={0.85} testID="quick-add-expense">
          <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.quickIconSaff}>
            <Ionicons name="add" size={18} color="#fff" />
          </LinearGradient>
          <Text style={s.quickTxt}>{t('split_expense', lang)}</Text>
        </TouchableOpacity>

        {summary?.simplified_debts?.length > 0 && (
          <TouchableOpacity
            style={s.quickBtn}
            onPress={() => onRemind?.(summary.simplified_debts[0])}
            activeOpacity={0.85}
          >
            <View style={[s.quickIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="notifications" size={18} color="#F59E0B" />
            </View>
            <Text style={s.quickTxt}>Remind</Text>
          </TouchableOpacity>
        )}

        {owedByYou > 0 && (
          <TouchableOpacity
            style={s.quickBtn}
            onPress={() => onDirectPay?.(summary.simplified_debts.find((d: any) => d.from_id === currentUserId))}
            activeOpacity={0.85}
          >
            <View style={[s.quickIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="flash" size={18} color="#10B981" />
            </View>
            <Text style={s.quickTxt}>Direct Pay</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 3. Settle Up tiles ------------------------------------------- */}
      {summary?.simplified_debts?.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <Text style={s.sectHead}>{t('settle_up', lang)}</Text>
          {summary.simplified_debts.map((d: any, i: number) => {
            const iAmPayer = d.from_id === currentUserId;
            const colour = MEMBER_COLORS[i % 8];
            const other = iAmPayer ? d.to_name : d.from_name;
            const otherInitial = (other || '?')[0].toUpperCase();
            return (
              <View key={i} style={s.debtCard}>
                <View style={[s.avatarLarge, { backgroundColor: colour + '1A', borderColor: colour + '40' }]}>
                  <Text style={[s.avatarTxt, { color: colour }]}>{otherInitial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.debtTitle} numberOfLines={1}>
                    {iAmPayer ? `Pay ${other}` : `${other} owes you`}
                  </Text>
                  <Text style={s.debtSub}>₹{d.amount.toFixed(0)}</Text>
                </View>
                {iAmPayer ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onDirectPay?.(d)}
                    style={s.payBtn}
                    testID={`direct-pay-${i}`}
                  >
                    <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.payBtnGrad}>
                      <Ionicons name="flash" size={14} color="#fff" />
                      <Text style={s.payBtnTxt}>Pay</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onRemind?.(d)}
                    style={s.bellOnly}
                    testID={`remind-${i}`}
                  >
                    <Ionicons name="notifications" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* 4. Recent expenses — timeline cards ------------------------- */}
      {orderedExpenses.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <Text style={s.sectHead}>{t('recent_expenses', lang)}</Text>
          {orderedExpenses.map((e: any, i: number) => {
            const ic = catIcon(e.description || e.category);
            const yourShare = Number(e.your_share ?? e.split_amount ?? 0);
            const iPaid = e.paid_by_id === currentUserId;
            // Settlement progress (falls back gracefully when payload is missing)
            const totalShares = Number(e.split_count || (e.splits ? Object.keys(e.splits).length : 0));
            const paidCount = Number(e.paid_count != null ? e.paid_count : 1);
            const pct = totalShares > 0 ? Math.min(100, (paidCount / totalShares) * 100) : 100;
            const isFullyPaid = totalShares > 0 && paidCount >= totalShares;
            const row = (
              <View style={s.expCard}>
                <View style={[s.expIcon, { backgroundColor: ic.color + '1A' }]}>
                  <Text style={{ fontSize: 18 }}>{ic.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.expDesc} numberOfLines={1}>{e.description}</Text>
                  <View style={s.expMetaRow}>
                    <View style={[s.paidByChip, { backgroundColor: iPaid ? '#DCFCE7' : '#F3F4F6' }]}>
                      <Text style={[s.paidByTxt, { color: iPaid ? '#065F46' : '#374151' }]}>
                        {iPaid ? 'You paid' : e.paid_by_name}
                      </Text>
                    </View>
                    <Text style={s.expDate}>{fmtDate(e.created_at || e.date)}</Text>
                  </View>
                  {totalShares > 0 && (
                    <View style={s.progWrap}>
                      <View style={s.progTrack}>
                        <View style={[s.progFill, { width: `${pct}%`, backgroundColor: isFullyPaid ? '#10B981' : '#F56E1E' }]} />
                      </View>
                      <Text style={[s.progLbl, isFullyPaid && { color: '#065F46' }]}>
                        {isFullyPaid ? '✓ Settled' : `${paidCount}/${totalShares} paid`}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.expAmt}>₹{Number(e.amount).toFixed(0)}</Text>
                  {yourShare > 0 && (
                    <Text style={s.expShare}>
                      {iPaid ? 'Your share ' : 'You owe '}
                      <Text style={{ color: iPaid ? '#065F46' : '#C14A06', fontWeight: '800' }}>
                        ₹{yourShare.toFixed(0)}
                      </Text>
                    </Text>
                  )}
                </View>
              </View>
            );
            if (!onEditExpense && !onDeleteExpense) return <View key={e.id || i}>{row}</View>;
            return (
              <SwipeableRow
                key={e.id || i}
                onEdit={onEditExpense ? () => onEditExpense(e) : undefined}
                onDelete={onDeleteExpense ? () => onDeleteExpense(e) : undefined}
                editLabel={t('edit', lang)}
                deleteLabel={t('delete', lang)}
              >
                {row}
              </SwipeableRow>
            );
          })}
        </View>
      )}

      {/* Empty state */}
      {!summary?.simplified_debts?.length && !orderedExpenses.length && (
        <View style={s.empty}>
          <Text style={{ fontSize: 34 }}>🧾</Text>
          <Text style={s.emptyTitle}>No expenses yet</Text>
          <Text style={s.emptySub}>Add your first shared expense and MintU will split it evenly.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  // Hero
  hero: { borderRadius: 22, padding: 18, overflow: 'hidden' },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLbl: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  heroAmt: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  heroSplits: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' },
  heroSplit: { flex: 1, alignItems: 'flex-start' },
  heroDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  heroSplitLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroSplitVal: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  heroSplitDiv: { width: 1, height: 38, backgroundColor: 'rgba(255,255,255,0.25)' },

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  quickBtn: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: C.card, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder },
  quickIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  quickIconSaff: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  quickTxt: { fontSize: 11, fontWeight: '700', color: C.text1 },

  // Section
  sectHead: { fontSize: 11, fontWeight: '800', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 4 },

  // Debt tile
  debtCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder },
  avatarLarge: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarTxt: { fontSize: 16, fontWeight: '800' },
  debtTitle: { fontSize: 14, fontWeight: '700', color: C.text1 },
  debtSub: { fontSize: 18, fontWeight: '800', color: C.accent, marginTop: 2 },
  payBtn: { borderRadius: 999, overflow: 'hidden' },
  payBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8 },
  payBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  bellOnly: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },

  // Expense card
  expCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder },
  expIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expDesc: { fontSize: 14, fontWeight: '700', color: C.text1 },
  expMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  paidByChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  paidByTxt: { fontSize: 10.5, fontWeight: '700' },
  expDate: { fontSize: 10.5, color: C.text3, fontWeight: '600' },
  expAmt: { fontSize: 15, fontWeight: '800', color: C.text1 },
  expShare: { fontSize: 10.5, color: C.text2, marginTop: 2, fontWeight: '600' },
  progWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  progTrack: { flex: 1, height: 3, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 2 },
  progLbl: { fontSize: 9.5, fontWeight: '800', color: C.accent, letterSpacing: 0.2 },

  empty: { alignItems: 'center', paddingVertical: 36 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.text1, marginTop: 10 },
  emptySub: { fontSize: 12, color: C.text2, marginTop: 4, textAlign: 'center', maxWidth: 260 },
}));
