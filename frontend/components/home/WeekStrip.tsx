/**
 * WeekStrip — Round 89 Strike 2.
 *
 * Home's Block 3 — SITUATIONAL AWARENESS, compressed.
 *
 * NOT a feed. NOT a narrative. A dashboard strip — 3 rows, max:
 *
 *   1. Spend this week vs budget  (number + delta chip)
 *   2. Score movement             (↑↓ vs last week, by N points)
 *   3. Next bill                  (only if /cash/recurring has one within 10 days)
 *
 * If a row has no data, it's OMITTED — we never show an empty sparkle.
 * If this strip ever grows beyond 3 rows, you're doing it wrong.
 */
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../utils/api';
import { useFinContext } from '../../store/financialContext';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';
import { ROUTES } from '../../constants/routes';

function fmtINR(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

interface Props {
  /** MTD spend for the "vs budget" row. */
  mtdSpend: number;
  /** Optional monthly budget — if 0/null, the vs-budget row is omitted. */
  monthlyBudget?: number;
  /** Score movement — positive = up, negative = down. 0/null omits the row. */
  scoreDelta?: number | null;
}

interface Recurring {
  id: string;
  description: string;
  amount: number;
  frequency: string; // daily | weekly | monthly
  last_applied?: string | null;
}

// Module-level cache — one fetch per app session is plenty for a rarely-
// changing list of recurring bills. Keeps WeekStrip mount cost trivial.
const _recurringCache: { current: Recurring[] | null } = { current: null };

/** Return soonest upcoming bill within the next 10 days, or null. */
function nextBill(list: Recurring[] | undefined): { desc: string; amount: number; dueInDays: number } | null {
  if (!list || !list.length) return null;
  const now = Date.now();
  let best: { desc: string; amount: number; dueInDays: number } | null = null;
  for (const r of list) {
    const last = r.last_applied ? new Date(r.last_applied).getTime() : null;
    let nextDue = last;
    if (r.frequency === 'daily')   nextDue = last ? last + 86400000 : now;
    if (r.frequency === 'weekly')  nextDue = last ? last + 7 * 86400000 : now;
    if (r.frequency === 'monthly') nextDue = last ? last + 30 * 86400000 : now;
    if (!nextDue) continue;
    const dueInDays = Math.round((nextDue - now) / 86400000);
    if (dueInDays < 0 || dueInDays > 10) continue;
    if (!best || dueInDays < best.dueInDays) {
      best = { desc: r.description, amount: Number(r.amount || 0), dueInDays };
    }
  }
  return best;
}

export default function WeekStrip({ mtdSpend, monthlyBudget, scoreDelta }: Props) {
  const ctx = useFinContext();
  const weeklyDelta = Number(ctx?.score?.delta ?? scoreDelta ?? 0);

  // Fetch /cash/recurring once on mount; cache in a module-level ref
  // to survive hot-swap between tabs. We deliberately don't use SWR
  // here — the list rarely changes, and one request per session is
  // cheap. Errors are swallowed so the whole strip never crashes.
  const [recurring, setRecurring] = useState<Recurring[] | null>(_recurringCache.current);
  const fetchedRef = useRef(!!_recurringCache.current);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let alive = true;
    api.get('/cash/recurring')
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r?.data) ? r.data : [];
        _recurringCache.current = list;
        setRecurring(list);
      })
      .catch(() => { /* swallow — strip degrades gracefully */ });
    return () => { alive = false; };
  }, []);
  const bill = nextBill(recurring || undefined);

  const rows: React.ReactNode[] = [];

  // Row 1 — Spend vs budget (only if a budget exists)
  if (monthlyBudget && monthlyBudget > 0) {
    const pct = Math.min(999, Math.round((mtdSpend / monthlyBudget) * 100));
    const over = pct > 100;
    rows.push(
      <Pressable
        key="spend"
        onPress={() => { try { router.push(ROUTES.BUDGET); } catch { /* noop */ } }}
        accessibilityRole="button"
        accessibilityLabel={`Spend ${fmtINR(mtdSpend)} of ${fmtINR(monthlyBudget)} budget, ${pct} percent used`}
        style={styles.row}
      >
        <Text style={styles.rowLabel}>MTD SPEND · BUDGET</Text>
        <View style={styles.rowRight}>
          <Text style={styles.rowNum}>{fmtINR(mtdSpend)} / {fmtINR(monthlyBudget)}</Text>
          <View style={[styles.deltaChip, { backgroundColor: over ? BR_COLORS.negative : BR_COLORS.positive }]}>
            <Text style={styles.deltaTxt}>{pct}%</Text>
          </View>
        </View>
      </Pressable>,
    );
  }

  // Row 2 — Score movement (only if delta is non-zero)
  if (Number.isFinite(weeklyDelta) && weeklyDelta !== 0) {
    const up = weeklyDelta > 0;
    rows.push(
      <View key="score" style={styles.row}>
        <Text style={styles.rowLabel}>SCORE · 7D</Text>
        <View style={styles.rowRight}>
          <Ionicons
            name={up ? 'arrow-up' : 'arrow-down'}
            size={16}
            color={up ? BR_COLORS.positive : BR_COLORS.negative}
          />
          <Text style={[styles.rowNum, { color: up ? BR_COLORS.positive : BR_COLORS.negative }]}>
            {up ? '+' : ''}{weeklyDelta} pts
          </Text>
        </View>
      </View>,
    );
  }

  // Row 3 — Next bill (only if something is due within 10 days)
  if (bill) {
    rows.push(
      <Pressable
        key="bill"
        onPress={() => { try { router.push('/cash-recurring' as any); } catch { /* noop */ } }}
        accessibilityRole="button"
        accessibilityLabel={`${bill.desc}, ${fmtINR(bill.amount)} due in ${bill.dueInDays} days`}
        style={styles.row}
      >
        <Text style={styles.rowLabel}>NEXT BILL</Text>
        <View style={styles.rowRight}>
          <Text style={styles.billDesc} numberOfLines={1}>{bill.desc}</Text>
          <Text style={styles.rowNum}>{fmtINR(bill.amount)}</Text>
          <View style={[styles.deltaChip, { backgroundColor: bill.dueInDays <= 2 ? BR_COLORS.negative : BR_COLORS.warning }]}>
            <Text style={styles.deltaTxt}>{bill.dueInDays === 0 ? 'TODAY' : `${bill.dueInDays}D`}</Text>
          </View>
        </View>
      </Pressable>,
    );
  }

  // Nothing to say? Render nothing. A single "all quiet" line is
  // permitted but must pull its weight — we only show it if
  // there's at least a budget but the budget row was omitted due
  // to zero spend.
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>THIS WEEK · AT A GLANCE</Text>
      <View style={styles.rowsWrap}>
        {rows.map((r, i) => (
          <View key={i} style={i === 0 ? null : styles.divider}>{r}</View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BR_COLORS.paper,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
    marginBottom: BR_SPACE.lg,
  },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.muted, marginBottom: BR_SPACE.md },
  rowsWrap: { gap: 0 },
  divider: { borderTopWidth: 1, borderColor: BR_COLORS.line, paddingTop: BR_SPACE.md, marginTop: BR_SPACE.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 36,
  },
  rowLabel: { ...BR_TYPE.labelSm, color: BR_COLORS.muted, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  rowNum:   { ...BR_TYPE.num, color: BR_COLORS.ink, fontSize: 14 },
  billDesc: { ...BR_TYPE.bodyBold, color: BR_COLORS.ink, fontSize: 13, maxWidth: 110 },
  deltaChip: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
  },
  deltaTxt: { fontSize: 10, fontWeight: '900', color: BR_COLORS.accentInk, letterSpacing: 1.2 },
});
