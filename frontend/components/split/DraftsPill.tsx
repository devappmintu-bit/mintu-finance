/**
 * DraftsPill — Round 51j.
 *
 * Single-row, dual-purpose surface on the Split tab:
 *   • When drafts exist → "N unattached drafts" pill that links to /split/drafts
 *   • When no drafts    → ghost CTA "+ Quick add (no group)" linking to /split/quick-add
 *
 * Why one component, two states?
 *   The Drafts inbox MUST be discoverable from the Split tab, AND
 *   the "capture without picking a group" flow MUST be discoverable
 *   too. Combining them into a single row keeps the tab compact and
 *   makes the relationship between "save now" and "attached later"
 *   visually obvious.
 *
 * Performance:
 *   - Lazy fetch in an InteractionManager callback to avoid blocking
 *     the tab cold-load.
 *   - Re-fetches when the screen becomes focused so a freshly
 *     created/attached draft updates immediately.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, InteractionManager, Platform } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fetchDraftExpenses } from '../../services/split';
import { makeStyles } from '../../utils/makeStyles';

export default function DraftsPill() {
  const s = useStyles();
  const [count, setCount] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetchDraftExpenses();
      setCount(r?.count ?? (r?.drafts?.length ?? 0));
    } catch {
      // Silent — drafts are optional UX, never block the Split tab.
    } finally {
      setLoaded(true);
    }
  }, []);

  // Cold-load: defer until interactions settle so we don't compete
  // with the hero / balances paint.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { refresh(); });
    return () => task?.cancel?.();
  }, [refresh]);

  // Re-fetch on focus (after user comes back from Drafts/QuickAdd screen).
  useFocusEffect(useCallback(() => { if (loaded) refresh(); }, [loaded, refresh]));

  // Don't render until first load completes — avoids a layout shift
  // between the ghost "+" state and a populated drafts pill.
  if (!loaded) return null;

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  if (count === 0) {
    // Ghost CTA — "Quick add (no group)"
    return (
      <TouchableOpacity
        onPress={() => { haptic(); router.push('/split/quick-add' as any); }}
        activeOpacity={0.85}
        style={s.ghostWrap}
        accessibilityLabel="Quick add expense without picking a group"
      >
        <View style={s.ghostIconWrap}>
          <Ionicons name="add" size={16} color="#FFFFFF" />
        </View>
        <Text style={s.ghostTitle} numberOfLines={1}>Quick add — no group needed</Text>
        <Ionicons name="chevron-forward" size={16} color="#FFFFFF" style={{ opacity: 0.85 }} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => { haptic(); router.push('/split/drafts' as any); }}
      activeOpacity={0.85}
      style={s.wrap}
      accessibilityLabel={`${count} draft expense${count === 1 ? '' : 's'}`}
    >
      <View style={s.iconWrap}>
        <Ionicons name="document-text-outline" size={14} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>
          {count} unattached draft{count === 1 ? '' : 's'}
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          Tap to attach to a group
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#FFFFFF" style={{ opacity: 0.85 }} />
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((c) => ({
  // Drafts present — solid brand pill
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.accent.primary,
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 1 },

  // No drafts — gentler ghost CTA, still tinted brand
  ghostWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.accent.brandDark,
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ghostIconWrap: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  ghostTitle: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
}));
