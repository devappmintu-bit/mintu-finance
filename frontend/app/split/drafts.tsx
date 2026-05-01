/**
 * /split/drafts — Round 51j.
 *
 * Lists the current user's unattached "draft" expenses and lets them
 * either attach to a group (one-tap → group picker → done) or discard.
 *
 * Why drafts exist:
 *   The classic flow forced users to pick a group BEFORE typing the
 *   expense. That's the wrong order for the most common case ("I just
 *   paid ₹450 for dinner — I'll figure out who owes me later"). Drafts
 *   let users capture the expense the moment it happens; group
 *   assignment becomes an asynchronous, low-friction step.
 *
 * Surfaces touched here, NOTHING ELSE:
 *   - This screen
 *   - A "Drafts (N)" pill on the Split tab header (separate file)
 *   - A "Save for later" button on the existing add-expense screen
 *
 * Reminders, Pay Directly, GroupChat, group balance computation —
 * all unchanged.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  Modal, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import {
  fetchDraftExpenses, deleteDraftExpense, attachDraftToGroup,
  fetchSplitGroups, type DraftExpense,
} from '../../services/split';
import type { SplitGroup } from '../../services/types';
import { COLORS, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { fmtINR } from '../../utils/format';
import { showError, showInfo } from '../../utils/toast';

export default function DraftsScreen() {
  const c = useAppColors();
  const s = useStyles();

  const [drafts, setDrafts] = useState<DraftExpense[]>([]);
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerFor, setPickerFor] = useState<DraftExpense | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [drafts_res, groups_res] = await Promise.all([
        fetchDraftExpenses(),
        fetchSplitGroups().catch(() => []),
      ]);
      setDrafts(drafts_res?.drafts || []);
      setGroups((groups_res as any) || []);
    } catch (e) {
      if (__DEV__) console.warn('drafts load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAttach = async (draft: DraftExpense, groupId: string) => {
    if (attaching) return;
    setAttaching(draft.id);
    try {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await attachDraftToGroup(draft.id, groupId);
      // Optimistic local removal; cache invalidation is server-side.
      setDrafts(prev => prev.filter(d => d.id !== draft.id));
      setPickerFor(null);
      Toast.show({
        type: 'success',
        text1: 'Expense attached ✓',
        text2: `${draft.description} added to ${groups.find(g => (g as any).id === groupId)?.name || 'group'}`,
      });
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not attach',
        text2: e?.response?.data?.detail || 'Please try again',
      });
    } finally {
      setAttaching(null);
    }
  };

  const handleDiscard = (draft: DraftExpense) => {
    Alert.alert(
      'Discard draft?',
      `"${draft.description}" — ${fmtINR(draft.amount)}`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: async () => {
          try {
            await deleteDraftExpense(draft.id);
            setDrafts(prev => prev.filter(d => d.id !== draft.id));
            showInfo('Draft discarded');
          } catch {
            showError('Could not discard');
          }
        }},
      ],
    );
  };

  const formatDate = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => (a as any).name.localeCompare((b as any).name)),
    [groups],
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="chevron-back" size={26} color={c.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Drafts</Text>
          <Text style={s.subtitle}>
            {loading ? '…' : drafts.length === 0 ? 'No saved drafts' : `${drafts.length} unattached expense${drafts.length === 1 ? '' : 's'}`}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={c.accent.primary} />
        </View>
      ) : drafts.length === 0 ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="document-text-outline" size={42} color={c.text.muted} />
          </View>
          <Text style={s.emptyTitle}>No drafts yet</Text>
          <Text style={s.emptySub}>
            Save an expense as a draft when you're not sure which group it belongs to. Attach it later in one tap.
          </Text>
          <TouchableOpacity
            style={s.emptyCta}
            onPress={() => router.replace('/split')}
            activeOpacity={0.85}
          >
            <Text style={s.emptyCtaTxt}>Back to Split</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={c.accent.primary}
            />
          }
        >
          {drafts.map((d) => (
            <View key={d.id} style={s.draftCard}>
              <View style={s.draftIconWrap}>
                <Ionicons name="receipt-outline" size={20} color={c.accent.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.draftDesc} numberOfLines={1}>{d.description}</Text>
                <Text style={s.draftMeta}>
                  {fmtINR(d.amount)} · {formatDate(d.created_at)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDiscard(d)}
                hitSlop={10}
                style={s.discardBtn}
                accessibilityLabel="Discard draft"
              >
                <Ionicons name="trash-outline" size={18} color={c.text.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPickerFor(d)}
                style={[s.attachBtn, !groups.length && { opacity: 0.5 }]}
                disabled={!groups.length || !!attaching}
                activeOpacity={0.85}
              >
                {attaching === d.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="link-outline" size={14} color="#FFFFFF" />
                    <Text style={s.attachBtnTxt}>
                      {groups.length ? 'Attach' : 'No groups'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Group picker modal */}
      <Modal
        visible={!!pickerFor}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerFor(null)}
      >
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Attach to group</Text>
            <Text style={s.sheetSub} numberOfLines={1}>
              {pickerFor ? `${pickerFor.description} · ${fmtINR(pickerFor.amount)}` : ''}
            </Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {sortedGroups.map((g: any) => (
                <TouchableOpacity
                  key={g.id}
                  style={s.groupRow}
                  onPress={() => pickerFor && handleAttach(pickerFor, g.id)}
                  disabled={!!attaching}
                  activeOpacity={0.7}
                >
                  <View style={s.groupAv}>
                    <Text style={{ fontSize: 18 }}>{g.custom_emoji || '👥'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.groupName} numberOfLines={1}>{g.name}</Text>
                    <Text style={s.groupMeta}>
                      {(g.members?.length || 0)} member{(g.members?.length || 0) === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.text.muted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setPickerFor(null)} style={s.cancelBtn}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: { padding: 6, marginLeft: -6 },
  title: { fontSize: 22, fontWeight: '900', color: c.text.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: 12.5, color: c.text.muted, marginTop: 2 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: c.accent.primary + '14',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary, textAlign: 'center' },
  emptySub: { fontSize: 13.5, color: c.text.muted, textAlign: 'center', lineHeight: 19, maxWidth: 320 },
  emptyCta: {
    backgroundColor: c.accent.primary,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, marginTop: 12,
  },
  emptyCtaTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  scroll: { paddingHorizontal: 16, paddingTop: 4 },

  draftCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, marginBottom: 10,
    backgroundColor: c.bg.secondary,
    borderRadius: 14,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  draftIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: c.accent.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  draftDesc: { fontSize: 14, fontWeight: '700', color: c.text.primary },
  draftMeta: { fontSize: 12, color: c.text.muted, marginTop: 2 },
  discardBtn: { padding: 8 },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.accent.primary,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    minWidth: 76, justifyContent: 'center',
  },
  attachBtnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  // Sheet
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: c.bg.elevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 30, gap: 6,
    borderTopWidth: 1, borderColor: c.border.subtle,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: c.text.primary, textAlign: 'center' },
  sheetSub: { fontSize: 12, color: c.text.muted, textAlign: 'center', marginBottom: 12 },
  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12,
    backgroundColor: c.bg.secondary,
    marginBottom: 8,
  },
  groupAv: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: COLORS.accent.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  groupName: { fontSize: 14, fontWeight: '700', color: c.text.primary },
  groupMeta: { fontSize: 12, color: c.text.muted, marginTop: 1 },
  cancelBtn: {
    paddingVertical: 12, borderRadius: 999, marginTop: 4,
    alignItems: 'center',
  },
  cancelTxt: { color: c.text.muted, fontWeight: '700', fontSize: 13.5 },
}));
