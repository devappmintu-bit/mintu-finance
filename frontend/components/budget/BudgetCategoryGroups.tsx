/**
 * BudgetCategoryGroups — Round 83 P3.
 *
 * Replaces the flat FlashList of budgets with 4 semantic groups:
 *
 *   🏠 ESSENTIALS     Food, Groceries, Bills, Transport, Rent, Utilities
 *   🎬 LIFESTYLE      Entertainment, Shopping, Dining, Travel, Subscriptions
 *   💳 COMMITMENTS    EMI, Insurance, Loan, Investment
 *   📦 OTHER          Everything else
 *
 * Each group:
 *   • Collapsible accordion (tap header to expand/collapse).
 *   • Shows % spent + amount spent / total budget.
 *   • Red tint + open-by-default when any child category is
 *     over budget (so user sees the problem without tapping).
 *   • Renders child BudgetCard components when expanded.
 *
 * Plus an "AI Reallocate" banner at the top when any category is
 * overspent — tapping opens the ReallocationSuggestionSheet.
 */
import React, { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BudgetCard from './BudgetCard';
import { COLORS, SPACING, TYPO } from '../../utils/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GROUP_DEFS = [
  {
    key: 'essentials',
    title: 'Essentials',
    emoji: '🏠',
    match: (cat: string) => /food|grocery|bill|transport|rent|fuel|petrol|utilit|electric|gas|water|milk/i.test(cat),
  },
  {
    key: 'lifestyle',
    title: 'Lifestyle',
    emoji: '🎬',
    match: (cat: string) => /entertain|shop|dining|travel|subscription|movie|restaurant|gym|salon|beauty|hobby/i.test(cat),
  },
  {
    key: 'commitments',
    title: 'Commitments',
    emoji: '💳',
    match: (cat: string) => /emi|insurance|loan|invest|sip|mutual|premium|mortgage/i.test(cat),
  },
  {
    key: 'other',
    title: 'Other',
    emoji: '📦',
    match: () => true, // catch-all
  },
];

type Budget = {
  id: string;
  category: string;
  amount?: number;
  budget?: number;
  spent?: number;
  period?: string;
  days_left?: number;
  daysLeft?: number;
};

interface Props {
  budgets: Budget[];
  onEdit: (b: Budget) => void;
  onDelete: (b: Budget) => void;
  onAddExpense: (b: Budget) => void;
  onInsights: (ctx: { category: string; spent: number; amount: number; daysLeft: number }) => void;
  /** Called when the user taps the "AI Reallocate" banner. */
  onReallocate: () => void;
}

function bucketFor(cat: string): string {
  for (const g of GROUP_DEFS) {
    if (g.match(cat)) return g.key;
  }
  return 'other';
}

function fmtINR(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function BudgetCategoryGroupsImpl({
  budgets,
  onEdit,
  onDelete,
  onAddExpense,
  onInsights,
  onReallocate,
}: Props) {
  // Partition budgets into group buckets.
  const grouped = useMemo(() => {
    const map: Record<string, Budget[]> = { essentials: [], lifestyle: [], commitments: [], other: [] };
    for (const b of budgets) {
      const key = bucketFor(b.category || '');
      map[key].push(b);
    }
    return map;
  }, [budgets]);

  // Overspend detection — used for AI reallocation banner AND to
  // auto-expand any group that contains an over-budget child.
  const overspent = useMemo(
    () => budgets.filter((b) => (b.spent || 0) > (b.amount || 0) && (b.amount || 0) > 0),
    [budgets],
  );
  const overspentGroups = useMemo(
    () => new Set(overspent.map((b) => bucketFor(b.category || ''))),
    [overspent],
  );

  // Expand state — default to expanded for groups containing overspend
  // OR the first group with any budgets.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    let anyOpened = false;
    for (const g of GROUP_DEFS) {
      if (overspentGroups.has(g.key)) {
        init[g.key] = true;
        anyOpened = true;
      }
    }
    if (!anyOpened) {
      // Open the first non-empty group.
      for (const g of GROUP_DEFS) {
        if ((grouped[g.key] || []).length > 0) {
          init[g.key] = true;
          break;
        }
      }
    }
    return init;
  });

  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <View>
      {/* AI Reallocate banner — only when overspend exists. */}
      {overspent.length > 0 && (
        <TouchableOpacity
          onPress={onReallocate}
          activeOpacity={0.86}
          style={styles.reallocBanner}
          accessibilityRole="button"
          accessibilityLabel="Get AI reallocation suggestion"
        >
          <View style={styles.reallocIcon}>
            <Ionicons name="sparkles" size={16} color="#B91C1C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reallocTitle}>
              {overspent.length === 1
                ? `${overspent[0].category} is over budget`
                : `${overspent.length} categories over budget`}
            </Text>
            <Text style={styles.reallocSub}>
              Tap for an AI reallocation plan — rebalance in seconds
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B91C1C" />
        </TouchableOpacity>
      )}

      {GROUP_DEFS.map((g) => {
        const items = grouped[g.key] || [];
        if (items.length === 0) return null;

        const total = items.reduce((a, b) => a + (b.amount || 0), 0);
        const spent = items.reduce((a, b) => a + (b.spent || 0), 0);
        const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
        const isOver = overspentGroups.has(g.key);
        const open = !!expanded[g.key];

        return (
          <View key={g.key} style={[styles.group, isOver && styles.groupDanger]}>
            <TouchableOpacity
              onPress={() => toggle(g.key)}
              activeOpacity={0.75}
              style={styles.header}
              accessibilityRole="button"
              accessibilityLabel={`${g.title} group — ${items.length} budgets, ${pct}% spent`}
              accessibilityState={{ expanded: open }}
            >
              <Text style={styles.emoji}>{g.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {g.title.toUpperCase()}
                  <Text style={styles.countPill}>  ·  {items.length}</Text>
                </Text>
                <Text style={[styles.meta, isOver && styles.metaDanger]}>
                  {fmtINR(spent)} / {fmtINR(total)}  ·  {pct}%
                </Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={isOver ? '#B91C1C' : '#4B5563'} />
            </TouchableOpacity>

            {/* Inline progress bar — glanceable group-level health. */}
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${pct}%`,
                    backgroundColor: pct > 100 ? '#DC2626' : pct > 80 ? '#F59E0B' : '#10B981',
                  },
                ]}
              />
            </View>

            {open && (
              <View style={styles.body}>
                {items.map((item) => (
                  <BudgetCard
                    key={item.id}
                    item={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item)}
                    onAddExpense={() => onAddExpense(item)}
                    onInsights={() => onInsights({
                      category: item.category,
                      spent: Number(item.spent || 0),
                      amount: Number(item.amount || item.budget || 0),
                      daysLeft: Number(item.days_left ?? item.daysLeft ?? 0),
                    })}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  reallocBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderRadius: 0,
    marginBottom: SPACING.md,
  },
  reallocIcon: {
    width: 32, height: 32, borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#FCA5A5',
    alignItems: 'center', justifyContent: 'center',
  },
  reallocTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#991B1B',
    letterSpacing: -0.2,
  },
  reallocSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 15,
  },

  group: {
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 0,
    overflow: 'hidden',
  },
  groupDanger: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 64,
  },
  emoji: { fontSize: 22 },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.text.primary,
    letterSpacing: 0.8,
  },
  countPill: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text.muted,
    letterSpacing: 0.2,
  },
  meta: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  metaDanger: {
    color: '#B91C1C',
  },
  barTrack: {
    height: 4,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
  },
  body: {
    padding: 10,
    backgroundColor: '#FAFAFA',
  },
});

export default memo(BudgetCategoryGroupsImpl);
