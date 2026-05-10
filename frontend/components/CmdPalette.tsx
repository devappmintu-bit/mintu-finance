/**
 * CmdPalette.tsx — R117 power-user quick navigator.
 *
 * A modal overlay listing every primary destination in the app +
 * common quick actions. Triggered via long-press on the tab bar OR
 * Cmd/Ctrl+K on web. Reduces the cognitive load of "how do I get to
 * X right now" — every action is one tap away.
 *
 * Sections:
 *   1. QUICK ACTIONS — Add expense, Scan SMS, Settle, AI Chat, etc.
 *   2. TABS         — Home / Transactions / Budget / Split / Profile / Coach / Pulse / Rewards.
 *   3. UTILITIES    — Goals, Insights, Notifications, Premium.
 *
 * Picks a destination → pushes via expo-router.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import useCmdPaletteStore from '../store/cmdPaletteStore';
import { BR_COLORS } from '../utils/brutalist';

const { ink: INK, paper: PAPER, accent: ACCENT, line: LINE, muted: MUTED } = BR_COLORS;

type Entry = {
  id: string;
  label: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  group: 'action' | 'tab' | 'util';
  go: () => void;
  keywords?: string;
};

function buildEntries(): Entry[] {
  const safePush = (path: string) => () => {
    try { router.push(path as any); } catch {}
  };
  return [
    // QUICK ACTIONS
    { id: 'add-expense',  label: 'Add expense',     hint: 'Quick log a debit',   icon: 'add-circle-outline', group: 'action', go: safePush('/(tabs)/transactions?openAdd=1'), keywords: 'spend debit log' },
    { id: 'add-income',   label: 'Add income',      hint: 'Log a credit',         icon: 'cash-outline',       group: 'action', go: safePush('/(tabs)/transactions?openAdd=1&type=credit'), keywords: 'credit salary' },
    { id: 'scan-sms',     label: 'Scan SMS',        hint: 'AI-parse bank alerts', icon: 'scan-outline',       group: 'action', go: safePush('/sms-import'), keywords: 'sms parse bank alert' },
    { id: 'new-group',    label: 'New split group', hint: 'Track shared spends',  icon: 'people-outline',     group: 'action', go: safePush('/split/new-group'), keywords: 'split friends share' },
    { id: 'ai-chat',      label: 'Ask AI',          hint: 'Coach + analytics',    icon: 'sparkles-outline',   group: 'action', go: safePush('/(tabs)/ai-coach'), keywords: 'ai coach chat help' },
    { id: 'search',       label: 'Search',          hint: 'Anywhere',             icon: 'search-outline',     group: 'action', go: safePush('/search'), keywords: 'find search' },

    // TABS
    { id: 'tab-home',     label: 'Home',         icon: 'home-outline',          group: 'tab', go: safePush('/(tabs)') },
    { id: 'tab-tx',       label: 'Transactions', icon: 'list-outline',          group: 'tab', go: safePush('/(tabs)/transactions') },
    { id: 'tab-budget',   label: 'Budget',       icon: 'pie-chart-outline',     group: 'tab', go: safePush('/(tabs)/budget') },
    { id: 'tab-split',    label: 'Split',        icon: 'people-outline',        group: 'tab', go: safePush('/(tabs)/split') },
    { id: 'tab-coach',    label: 'AI Coach',     icon: 'sparkles-outline',      group: 'tab', go: safePush('/(tabs)/ai-coach') },
    { id: 'tab-rewards',  label: 'Rewards',      icon: 'gift-outline',          group: 'tab', go: safePush('/(tabs)/rewards') },
    { id: 'tab-profile',  label: 'Profile',      icon: 'person-outline',        group: 'tab', go: safePush('/(tabs)/profile') },

    // UTILITIES
    { id: 'util-goals',     label: 'Goals',         icon: 'flag-outline',          group: 'util', go: safePush('/goals') },
    { id: 'util-insights',  label: 'Spending insights', icon: 'analytics-outline', group: 'util', go: safePush('/spending-insights') },
    { id: 'util-pulse',     label: 'Money pulse',   icon: 'pulse-outline',         group: 'util', go: safePush('/pulse-v2') },
    { id: 'util-notif',     label: 'Notifications', icon: 'notifications-outline', group: 'util', go: safePush('/notifications') },
    { id: 'util-premium',   label: 'Premium hub',   icon: 'star-outline',          group: 'util', go: safePush('/premium-hub') },
    { id: 'util-school',    label: 'Money school',  icon: 'school-outline',        group: 'util', go: safePush('/money-school') },
  ];
}

const GROUP_LABEL: Record<Entry['group'], string> = {
  action: 'QUICK ACTIONS',
  tab:    'TABS',
  util:   'UTILITIES',
};

function CmdPaletteImpl() {
  const visible = useCmdPaletteStore((s) => s.visible);
  const close   = useCmdPaletteStore((s) => s.close);
  const [query, setQuery] = useState('');

  const entries = useMemo(buildEntries, []);

  // Cmd/Ctrl + K shortcut on web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useCmdPaletteStore.getState().toggle();
      }
      if (e.key === 'Escape' && useCmdPaletteStore.getState().visible) {
        useCmdPaletteStore.getState().close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const haystack = `${e.label} ${e.hint || ''} ${e.keywords || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);

  const grouped = useMemo(() => {
    const out: Record<Entry['group'], Entry[]> = { action: [], tab: [], util: [] };
    for (const e of filtered) out[e.group].push(e);
    return out;
  }, [filtered]);

  const onPick = useCallback((e: Entry) => {
    setQuery('');
    close();
    // Defer one tick so the modal fades cleanly before navigation pushes.
    setTimeout(() => e.go(), 60);
  }, [close]);

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={INK} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Where to? (e.g. add, split, premium)"
              placeholderTextColor={MUTED}
              style={styles.searchInput}
              returnKeyType="go"
              onSubmitEditing={() => {
                const first = filtered[0];
                if (first) onPick(first);
              }}
            />
            {Platform.OS === 'web' ? (
              <View style={styles.kbdHint}>
                <Text style={styles.kbdTxt}>⌘K</Text>
              </View>
            ) : null}
            <Pressable onPress={close} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={16} color={INK} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            {(['action', 'tab', 'util'] as Entry['group'][]).map((grp) => {
              const list = grouped[grp];
              if (!list.length) return null;
              return (
                <View key={grp} style={styles.groupBlock}>
                  <Text style={styles.groupLabel}>{GROUP_LABEL[grp]}</Text>
                  {list.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => onPick(e)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      <View style={styles.rowIcon}>
                        <Ionicons name={e.icon} size={16} color={INK} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel}>{e.label}</Text>
                        {e.hint ? <Text style={styles.rowHint}>{e.hint}</Text> : null}
                      </View>
                      <Ionicons name="return-down-back-outline" size={14} color={MUTED} />
                    </Pressable>
                  ))}
                </View>
              );
            })}
            {filtered.length === 0 ? (
              <View style={styles.emptyPane}>
                <Text style={styles.emptyTxt}>Nothing matches “{query}”</Text>
                <Text style={styles.emptyHint}>Try “add”, “split”, “premium”, “goals”.</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerTxt}>
              Long-press any tab to open this menu · {Platform.OS === 'web' ? 'Press ⌘K anywhere' : 'Tap close to dismiss'}
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,15,15,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'web' ? 96 : 120,
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFDF8',
    borderWidth: 2,
    borderColor: INK,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: INK,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 as any } : null),
  },
  kbdHint: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: PAPER,
  },
  kbdTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: INK },
  closeBtn: {
    width: 26, height: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: LINE,
  },
  groupBlock: { paddingTop: 12, paddingBottom: 4 },
  groupLabel: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.6, color: MUTED,
    paddingHorizontal: 14, marginBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  rowPressed: { backgroundColor: PAPER },
  rowIcon: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: LINE,
    backgroundColor: PAPER,
  },
  rowLabel: { fontSize: 14, fontWeight: '800', color: INK, letterSpacing: -0.2 },
  rowHint:  { fontSize: 11, fontWeight: '500', color: MUTED, marginTop: 1 },
  emptyPane: { padding: 28, alignItems: 'center', gap: 6 },
  emptyTxt: { fontSize: 14, fontWeight: '800', color: INK },
  emptyHint: { fontSize: 12, color: MUTED },
  footer: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: LINE,
    backgroundColor: PAPER,
  },
  footerTxt: { fontSize: 10, color: MUTED, fontWeight: '700', letterSpacing: 0.4 },
});

export default memo(CmdPaletteImpl);
