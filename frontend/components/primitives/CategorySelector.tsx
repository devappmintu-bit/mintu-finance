/**
 * CategorySelector — DS2.0 searchable chip selector.
 *
 * Replaces the 6+ hand-rolled category-picker UIs across the app
 * (add-transaction, add-budget, add-goal, split-expense, filter-
 * transactions, etc). One primitive, one contract, zero drift.
 *
 * Features:
 *   - Full-width scrollable chip grid (wraps to multi-row).
 *   - Optional search bar that filters chips live (case-insensitive).
 *   - Single-select by default; `multi` prop unlocks multi-select.
 *   - Chips get the brand tint when active + tactile spring-press.
 *   - Every chip carries an emoji/icon so recognition is instant.
 *
 * Usage:
 *   <CategorySelector
 *     options={CATEGORY_LIST}
 *     value={cat}
 *     onChange={setCat}
 *     searchable
 *   />
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SpringPress from './SpringPress';
import PremiumInput from './PremiumInput';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';

export interface CategoryOption {
  id: string;
  label: string;
  emoji?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

type SingleProps = {
  multi?: false;
  value: string | null;
  onChange: (id: string) => void;
};

type MultiProps = {
  multi: true;
  value: string[];
  onChange: (ids: string[]) => void;
};

export type CategorySelectorProps = (SingleProps | MultiProps) & {
  options: CategoryOption[];
  searchable?: boolean;
  maxVisibleRows?: number;
  testID?: string;
};

function CategorySelectorImpl(props: CategorySelectorProps) {
  const { options, searchable, testID } = props;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options]);

  const isActive = (id: string): boolean => {
    if (props.multi) return props.value.includes(id);
    return props.value === id;
  };

  const toggle = (id: string) => {
    if (props.multi) {
      const next = props.value.includes(id)
        ? props.value.filter((x) => x !== id)
        : [...props.value, id];
      props.onChange(next);
    } else {
      props.onChange(id);
    }
  };

  return (
    <View testID={testID}>
      {searchable ? (
        <PremiumInput
          label="Search categories"
          value={query}
          onChangeText={setQuery}
          leadingIcon="search"
          placeholder="Try 'food' or 'bills'"
        />
      ) : null}

      <View style={styles.grid}>
        {filtered.map((opt) => {
          const active = isActive(opt.id);
          return (
            <SpringPress
              key={opt.id}
              variant="tap"
              onPress={() => toggle(opt.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <View style={styles.chipInner}>
                {opt.emoji ? (
                  <Text style={{ fontSize: 14 }}>{opt.emoji}</Text>
                ) : opt.icon ? (
                  <Ionicons
                    name={opt.icon}
                    size={14}
                    color={active ? '#FFFFFF' : COLORS.accent.primary}
                  />
                ) : null}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </View>
            </SpringPress>
          );
        })}
        {filtered.length === 0 ? (
          <Text style={styles.empty}>No categories match “{query}”</Text>
        ) : null}
      </View>
    </View>
  );
}

export const CategorySelector = React.memo(CategorySelectorImpl);
CategorySelector.displayName = 'CategorySelector';
export default CategorySelector;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: SPACE.xs,
  },
  chip: {
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg.card,
    borderWidth: 1,
    borderColor: COLORS.border.subtle,
  },
  chipActive: {
    backgroundColor: COLORS.accent.primary,
    borderColor: COLORS.accent.primaryDark,
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
  },
  chipText: { ...TYPO.bodySm, color: COLORS.text.primary, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  empty: { ...TYPO.caption, color: COLORS.text.muted, padding: SPACE.md },
});
