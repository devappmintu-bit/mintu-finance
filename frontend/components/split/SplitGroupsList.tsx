/**
 * SplitGroupsList — extracted from app/(tabs)/split.tsx during Wave R2
 * structural refactor.
 *
 * Responsibility: render the list of split groups (with empty-state)
 * and expose press handlers for open-chat / add-expense / manage.
 *
 * This is a pure presentational component — all data comes from props
 * and all mutations are delegated upward. Keeping it isolated means:
 *   1. The 890-LoC split.tsx gets ~40 LoC lighter.
 *   2. Future changes to the group-card visual only touch this file.
 *   3. Memoization is now practical — re-renders only when groups change.
 *
 * Pure utilities (fmtShortDate / shortIdOf / codeOf / duplicateNames)
 * are colocated here because they're only used for this list. The
 * parent no longer needs to know about any of them.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PressableGlass from '../PressableGlass';
import EmptyState from '../ui/EmptyState';
import { C, getGA } from './theme';
import { t, type LangCode } from '../../utils/i18n';

export interface SplitGroupsListProps {
  groups: any[];
  lang: LangCode;
  onPressGroup: (gr: any) => void;
  onAddExpense: (gr: any) => void;
  onManage: (gr: any) => void;
  onCreateGroup: () => void;
}

// ─── Pure helpers (moved out of split.tsx) ───────────────────────
const fmtShortDate = (iso?: string): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

const shortIdOf = (id?: string): string =>
  id ? `#${String(id).slice(-4).toUpperCase()}` : '';

// Phase 3 — prefer the backend-issued group_code when present; fall
// back to last-4 of the ObjectId so legacy groups still show *something*.
const codeOf = (gr: any): string => gr?.group_code || shortIdOf(gr?.id);

function SplitGroupsListImpl({
  groups,
  lang,
  onPressGroup,
  onAddExpense,
  onManage,
  onCreateGroup,
}: SplitGroupsListProps) {
  // Detect duplicate names so we can disambiguate them with a date/code.
  const duplicateNames = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of groups) {
      const k = (g?.name || '').trim().toLowerCase();
      if (!k) continue;
      counts[k] = (counts[k] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [groups]);

  return (
    <>
      <Text style={styles.section}>{t('groups', lang)}</Text>
      {groups.length === 0 ? (
        <EmptyState
          emoji="👥"
          title={t('no_groups', lang)}
          subtitle={t('create_first_group', lang)}
          ctaLabel="Create group"
          onCta={onCreateGroup}
        />
      ) : (
        groups.map((gr: any) => {
          const av = getGA(gr.name);
          const displayEmoji = gr.custom_emoji || av.emoji;
          const memberCount = gr.members?.length || 0;
          const memberLabel = `${memberCount} ${t('members', lang)}`;
          const isDup = duplicateNames.has((gr?.name || '').trim().toLowerCase());
          const datePart = fmtShortDate(gr.created_at);
          const code = codeOf(gr);
          const metaLine = isDup ? `${datePart || code} · ${memberLabel}` : memberLabel;
          return (
            <PressableGlass
              key={gr.id}
              onPress={() => onPressGroup(gr)}
              feedback="light"
              style={styles.groupCard}
            >
              <LinearGradient
                colors={av.colors.map((c) => c + '20') as any}
                style={styles.groupAv}
              >
                <Text style={styles.groupEmoji}>{displayEmoji}</Text>
              </LinearGradient>
              <View style={styles.groupInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.groupName} numberOfLines={1}>
                    {gr.name}
                  </Text>
                  {/* Phase 3 — Group code chip. Always shown so users
                      have an unambiguous reference for sharing /
                      disambiguation. Tap-to-copy via parent press. */}
                  {!!code && (
                    <View style={styles.groupCodeChip}>
                      <Text style={styles.groupCodeChipT}>{code}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.groupMeta} numberOfLines={1}>
                  {metaLine}
                </Text>
              </View>
              <PressableGlass onPress={() => onAddExpense(gr)} feedback="light" hitSlop={12}>
                <Ionicons name="add-circle" size={30} color={C.accent} />
              </PressableGlass>
              <PressableGlass
                onPress={() => onManage(gr)}
                feedback="light"
                hitSlop={12}
                style={{ marginLeft: 8 }}
              >
                <Ionicons name="ellipsis-vertical" size={20} color={C.text3} />
              </PressableGlass>
            </PressableGlass>
          );
        })
      )}
    </>
  );
}

export const SplitGroupsList = React.memo(SplitGroupsListImpl);
SplitGroupsList.displayName = 'SplitGroupsList';
export default SplitGroupsList;

// ═══ Styles ═══════════════════════════════════════════════════════
// These were previously inlined inside the parent split.tsx useStyles()
// block; copied here verbatim so the visual is pixel-identical.
const styles = StyleSheet.create({
  section: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text1,
    marginTop: 18,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  groupAv: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupEmoji: { fontSize: 22 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 15, fontWeight: '700', color: C.text1 },
  groupMeta: { fontSize: 12, color: C.text3, marginTop: 2 },
  groupCodeChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  groupCodeChipT: {
    fontSize: 10,
    fontWeight: '700',
    color: C.text3,
    letterSpacing: 0.5,
  },
});
