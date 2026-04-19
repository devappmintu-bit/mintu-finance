// Expenses tab content inside a group chat — balance, debts, and recent expenses.
// Recent activities sorted oldest→newest (pushed to the end per UX requirement).
// Supports swipe-to-edit and swipe-to-delete per expense (via SwipeableRow).
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS } from '../../utils/theme';
import { MEMBER_COLORS } from './theme';
import SwipeableRow from '../SwipeableRow';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';

interface Props {
  summary: any;
  currentUserId?: string;
  onAddExpense: () => void;
  onEditExpense?: (exp: any) => void;
  onDeleteExpense?: (exp: any) => void;
}

export default function ExpensesTab({ summary, currentUserId, onAddExpense, onEditExpense, onDeleteExpense }: Props) {
  const { lang } = useLangStore();

  const owedByYou =
    summary?.simplified_debts?.filter((d: any) => d.from_id === currentUserId).reduce((acc: number, d: any) => acc + d.amount, 0) || 0;
  const owedToYou =
    summary?.simplified_debts?.filter((d: any) => d.to_id === currentUserId).reduce((acc: number, d: any) => acc + d.amount, 0) || 0;

  // Reverse the recent expenses so newest appears at the BOTTOM (per user request)
  const orderedExpenses: any[] = summary?.recent_expenses ? [...summary.recent_expenses].reverse() : [];

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={s.balanceCard}>
        <View style={s.balHalf}>
          <Text style={s.balAmount}>₹{owedByYou.toFixed(0)}</Text>
          <Text style={s.balLabel}>{t('owed_by_you', lang)}</Text>
        </View>
        <View style={s.balDivider} />
        <View style={s.balHalf}>
          <Text style={[s.balAmount, { color: COLORS.accent.moneyIn }]}>₹{owedToYou.toFixed(0)}</Text>
          <Text style={s.balLabel}>{t('owed_to_you', lang)}</Text>
        </View>
      </View>

      {summary?.simplified_debts?.length > 0 && (
        <>
          <Text style={s.secTitle}>{t('settle_up', lang)}</Text>
          {summary.simplified_debts.map((d: any, i: number) => (
            <View key={i} style={s.debtRow}>
              <View style={[s.avatar, { backgroundColor: MEMBER_COLORS[i % 8] + '20' }]}>
                <Text style={[s.avatarT, { color: MEMBER_COLORS[i % 8] }]}>{(d.from_name || '?')[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.debtNames}>{d.from_name} → {d.to_name}</Text>
              </View>
              <Text style={s.debtAmt}>₹{d.amount.toFixed(0)}</Text>
            </View>
          ))}
        </>
      )}

      {orderedExpenses.length > 0 && (
        <>
          <Text style={[s.secTitle, { marginTop: 16 }]}>{t('recent_expenses', lang)}</Text>
          {orderedExpenses.map((e: any, i: number) => {
            const row = (
              <View style={s.expRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.expDesc}>{e.description}</Text>
                  <Text style={s.expMeta}>{t('paid_by', lang)} {e.paid_by_name}</Text>
                </View>
                <Text style={s.expAmt}>₹{e.amount.toFixed(0)}</Text>
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
        </>
      )}

      <TouchableOpacity style={s.addExpBtn} onPress={onAddExpense}>
        <Text style={s.addExpBtnT}>{t('split_expense', lang)}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  balanceCard: { flexDirection: 'row', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border.card },
  balHalf: { flex: 1, alignItems: 'center' },
  balAmount: { fontSize: 24, fontWeight: '800', color: COLORS.text.primary },
  balLabel: { fontSize: 12, color: COLORS.text.muted, marginTop: 4 },
  balDivider: { width: 1, backgroundColor: COLORS.border.subtle },
  secTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text.muted, marginBottom: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  avatarT: { fontSize: 12, fontWeight: '700' },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  debtNames: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  debtAmt: { fontSize: 16, fontWeight: '800', color: COLORS.accent.moneyOut },
  expRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, backgroundColor: 'transparent' },
  expDesc: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  expMeta: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  expAmt: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary },
  addExpBtn: { backgroundColor: COLORS.accent.primary + '12', borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: COLORS.accent.primary + '25' },
  addExpBtnT: { fontSize: 15, fontWeight: '700', color: COLORS.accent.primary },
});
