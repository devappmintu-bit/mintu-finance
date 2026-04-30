/**
 * components/split/PendingSyncBanner.tsx — Phase 2 trust signal.
 *
 * Sits at the top of the Split tab. When there are pending or failed
 * offline expenses in the queue it shows:
 *   • Pending count → ⏳ "Syncing N expense(s)…"
 *   • Failed count  → ⚠️ "N expense(s) failed — Tap to retry"
 *
 * Auto-hides when the queue has no non-SYNCED rows. Subscribes to the
 * offlineQueue pub-sub so updates are instant (no polling).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  subscribeQueue,
  type OfflineExpense,
} from '../../services/offlineQueue';
import { triggerSync, subscribeSync } from '../../services/syncEngine';
import { COLORS } from '../../utils/theme';

export default function PendingSyncBanner() {
  const [queue, setQueue] = useState<OfflineExpense[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribeQueue((q) => setQueue(q)), []);
  useEffect(
    () =>
      subscribeSync((e) => {
        if (e.kind === 'sync_start') setSyncing(true);
        else if (e.kind === 'sync_end') setSyncing(false);
      }),
    [],
  );

  const pending = queue.filter((q) => q.status === 'PENDING');
  const failed = queue.filter((q) => q.status === 'FAILED');

  if (pending.length === 0 && failed.length === 0) return null;

  // Failed dominates the banner — it's the actionable state.
  if (failed.length > 0) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.failed]}
        onPress={() => triggerSync('user_tap_retry')}
        activeOpacity={0.85}
      >
        <Ionicons name="warning" size={18} color="#FCA5A5" />
        <Text style={styles.txt} numberOfLines={2}>
          {`${failed.length} expense${failed.length === 1 ? '' : 's'} failed to sync${pending.length > 0 ? ` (+${pending.length} pending)` : ''} — tap to retry`}
        </Text>
        <Ionicons name="refresh" size={16} color="#FCA5A5" />
      </TouchableOpacity>
    );
  }

  // Pure-pending state — informational, no action.
  return (
    <View style={[styles.banner, styles.pending]}>
      {syncing ? (
        <ActivityIndicator size="small" color="#FBBF24" />
      ) : (
        <Ionicons name="time-outline" size={18} color="#FBBF24" />
      )}
      <Text style={styles.txt} numberOfLines={2}>
        {`Saved offline · ${pending.length} expense${pending.length === 1 ? '' : 's'} will sync when you're back online`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  pending: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
  },
  failed: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.32)',
  },
  txt: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text.primary,
    fontWeight: '600',
    lineHeight: 18,
  },
});
