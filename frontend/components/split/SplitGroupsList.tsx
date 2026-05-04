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
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableGlass from '../PressableGlass';
import EmptyState from '../ui/EmptyState';
import { C, getGA } from './theme';
import { t, type LangCode } from '../../utils/i18n';

// Round 83 P3 — Split templates. A curated shortlist of the 4 most
// common "first group" scenarios. Tapping a chip opens the create
// sheet with the name + emoji prefilled — "create group in 1 tap".
export const SPLIT_TEMPLATES: { key: string; label: string; emoji: string; name: string }[] = [
  { key: 'trip',    label: 'Trip',    emoji: '✈️', name: 'Trip to ' },
  { key: 'weekend', label: 'Weekend', emoji: '🍻', name: 'Weekend out' },
  { key: 'rent',    label: 'Rent',    emoji: '🏠', name: 'Flat rent' },
  { key: 'dinner',  label: 'Dinner',  emoji: '🍕', name: 'Dinner' },
];

export interface SplitGroupsListProps {
  groups: any[];
  lang: LangCode;
  onPressGroup: (gr: any) => void;
  onAddExpense: (gr: any) => void;
  onManage: (gr: any) => void;
  /** Round 83 P3 — now accepts an optional template so the empty
   * state's preset chips ("Trip", "Weekend", "Rent", "Dinner") can
   * pre-fill the new-group sheet with name + emoji. */
  onCreateGroup: (template?: { name: string; emoji: string }) => void;
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
        <View>
          {/* Round 83 — guided-activation empty state. Uses the new
              EmptyState `prompt` + dual-CTA pattern so zero-data
              screens tell the user EXACTLY what to do next rather
              than showing a dead silhouette. */}
          <EmptyState
            emoji="👥"
            title={t('no_groups', lang)}
            prompt="Going out? Create a group in 1 tap to split instantly"
            actionLabel="Create group"
            onAction={() => onCreateGroup()}
          />
          {/* Template chips — each chip opens the create sheet with
              a suggested name + emoji so the user never stares at a
              blank "Name this group" field. */}
          <View style={styles.templateRow}>
            {SPLIT_TEMPLATES.map((tp) => (
              <TouchableOpacity
                key={tp.key}
                style={styles.templateChip}
                onPress={() => onCreateGroup({ name: tp.name, emoji: tp.emoji })}
                activeOpacity={0.7}
                accessibilityLabel={`Create ${tp.label} group`}
                accessibilityRole="button"
              >
                <Text style={styles.templateEmoji}>{tp.emoji}</Text>
                <Text style={styles.templateLabel}>{tp.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
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
              <View
                style={[styles.groupAv, { backgroundColor: (av.colors[0] || '#0A0A0A') + '20' }]}
              >
                <Text style={styles.groupEmoji}>{displayEmoji}</Text>
              </View>
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
    borderRadius: 0,
    borderWidth: 1,
    borderColor: C.border,
  },
  groupAv: {
    width: 48,
    height: 48,
    borderRadius: 0,
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
    borderRadius: 0,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  groupCodeChipT: {
    fontSize: 10,
    fontWeight: '700',
    color: C.text3,
    letterSpacing: 0.5,
  },
  // Round 83 P3 — Split template chips (empty state).
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: -8,
    marginBottom: 20,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: C.border,
    minHeight: 44,
  },
  templateEmoji: { fontSize: 16 },
  templateLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: C.text1,
    letterSpacing: 0.2,
  },
});
