/**
 * /app/frontend/app/subscriptions.tsx — Round 99C.
 *
 * Surface the user's recurring subscriptions so they can SEE the
 * leak and act on it. This is the missing piece that turns the
 * detector backend into a user-facing "where is my money going?"
 * answer.
 *
 * Brutalist: stark hairlines, big mono numerals, no shadows.
 */
import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable,
  StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSubscriptions, type Subscription } from '../hooks/useSubscriptions';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../utils/brutalist';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });

function fmtINR(n: number, opts: { showZero?: boolean } = {}): string {
  if (!opts.showZero && (!n || n <= 0)) return '—';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch { return '—'; }
}

function cadenceLabel(c: string): string {
  const map: Record<string, string> = {
    weekly:      'WEEKLY',
    monthly:     'MONTHLY',
    quarterly:   'QUARTERLY',
    semi_annual: 'SEMI-ANNUAL',
    yearly:      'YEARLY',
  };
  return map[c] || c.toUpperCase();
}

function statusColor(s: string): string {
  if (s === 'cancelled') return BR_COLORS.muted;
  if (s === 'dormant')   return BR_COLORS.accent;
  return BR_COLORS.positive;
}

function StatusPill({ status }: { status: string }) {
  return (
    <View style={[styles.pill, { borderColor: statusColor(status) }]}>
      <Text style={[styles.pillTxt, { color: statusColor(status) }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

function SubRow({ sub, onDismiss }: { sub: Subscription; onDismiss: (id: string) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.merchant} numberOfLines={1}>{sub.merchant_label}</Text>
          <Text style={styles.category} numberOfLines={1}>
            {sub.category} · {cadenceLabel(sub.cadence)}
          </Text>
        </View>
        <StatusPill status={sub.status} />
      </View>

      <View style={styles.rowGrid}>
        <View style={styles.cell}>
          <Text style={styles.cellLbl}>EACH</Text>
          <Text style={styles.cellVal}>{fmtINR(sub.amount_avg)}</Text>
        </View>
        <View style={[styles.cell, styles.cellDivider]}>
          <Text style={styles.cellLbl}>PER YEAR</Text>
          <Text style={[styles.cellVal, styles.leak]}>{fmtINR(sub.annualised_cost)}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.cellLbl}>NEXT</Text>
          <Text style={styles.cellVal}>{fmtDate(sub.next_predicted)}</Text>
        </View>
      </View>

      <View style={styles.rowFoot}>
        <Text style={styles.foot}>
          n={sub.occurrences} · last {fmtDate(sub.last_seen)} ·
          conf {Math.round((sub.confidence ?? 0) * 100)}%
        </Text>
        <Pressable
          onPress={() => onDismiss(sub.subscription_id)}
          style={styles.dismissBtn}
          hitSlop={8}
        >
          <Ionicons name="close" size={14} color={BR_COLORS.muted} />
          <Text style={styles.dismissTxt}>NOT MINE</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SubscriptionsScreen() {
  const { subs, summary, loading, scanning, error, refetch, scan, dismiss } =
    useSubscriptions();

  const totalLeak = summary?.annualised_active ?? 0;
  const activeCount = summary?.active ?? 0;

  // Group: active first, then cancelled.
  const grouped = useMemo(() => {
    const active = subs.filter(s => s.status === 'active');
    const dormant = subs.filter(s => s.status === 'dormant');
    const cancelled = subs.filter(s => s.status === 'cancelled');
    return { active, dormant, cancelled };
  }, [subs]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ───────────────────────────── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BR_COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>RECURRING</Text>
          <Text style={styles.title}>Subscriptions</Text>
        </View>
        <Pressable
          onPress={() => scan()}
          disabled={scanning}
          hitSlop={8}
          style={[styles.scanBtn, scanning && { opacity: 0.5 }]}
        >
          {scanning
            ? <ActivityIndicator size="small" color={BR_COLORS.ink} />
            : <Text style={styles.scanTxt}>RE-SCAN</Text>}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollPad}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => refetch()} />
        }
      >
        {/* ── Hero leak summary ──────────────── */}
        <View style={styles.hero}>
          <Text style={styles.heroLbl}>YOU&apos;RE PAYING</Text>
          <Text style={styles.heroNum}>{fmtINR(totalLeak, { showZero: true })}</Text>
          <Text style={styles.heroSub}>
            per year across {activeCount} active subscription{activeCount === 1 ? '' : 's'}
          </Text>
          {summary?.biggest_leak && (
            <View style={styles.biggestRow}>
              <Text style={styles.biggestLbl}>BIGGEST LEAK</Text>
              <Text style={styles.biggestVal}>{summary.biggest_leak}</Text>
            </View>
          )}
        </View>

        {error && (
          <View style={styles.errBox}>
            <Text style={styles.errTxt}>{error}</Text>
          </View>
        )}

        {/* ── Active list ────────────────────── */}
        {grouped.active.length === 0 && !loading && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No subscriptions detected yet.</Text>
            <Text style={styles.emptySub}>
              We need at least 2 charges from the same merchant to flag a recurring
              pattern. Add transactions or wait for SMS auto-import to kick in,
              then tap RE-SCAN above.
            </Text>
          </View>
        )}

        {grouped.active.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>ACTIVE · {grouped.active.length}</Text>
            {grouped.active.map(s => (
              <SubRow key={s.subscription_id} sub={s} onDismiss={dismiss} />
            ))}
          </>
        )}

        {grouped.dormant.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: BR_SPACE.lg }]}>
              DORMANT · {grouped.dormant.length}
            </Text>
            {grouped.dormant.map(s => (
              <SubRow key={s.subscription_id} sub={s} onDismiss={dismiss} />
            ))}
          </>
        )}

        {grouped.cancelled.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: BR_SPACE.lg, color: BR_COLORS.muted }]}>
              CANCELLED · {grouped.cancelled.length}
            </Text>
            {grouped.cancelled.map(s => (
              <SubRow key={s.subscription_id} sub={s} onDismiss={dismiss} />
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BR_COLORS.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
    borderBottomWidth: BR_BORDER.bold,
    borderBottomColor: BR_COLORS.ink,
  },
  backBtn: {
    width: 36, height: 36, borderWidth: 1.5, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center', marginRight: BR_SPACE.md,
  },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.accent, letterSpacing: 1.8 },
  title:  { fontSize: 22, fontWeight: '900', color: BR_COLORS.ink, letterSpacing: -0.4 },
  scanBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
  },
  scanTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: BR_COLORS.ink },

  scroll:    { flex: 1 },
  scrollPad: { padding: BR_SPACE.lg, paddingTop: BR_SPACE.md },

  // Hero
  hero: {
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
    backgroundColor: BR_COLORS.paper,
    marginBottom: BR_SPACE.lg,
  },
  heroLbl: { ...BR_TYPE.label, color: BR_COLORS.muted, letterSpacing: 1.6 },
  heroNum: {
    fontSize: 42, fontWeight: '900', fontFamily: MONO,
    color: BR_COLORS.negative, letterSpacing: -1.5, marginVertical: 2,
  },
  heroSub: { ...BR_TYPE.body, color: BR_COLORS.muted },
  biggestRow: {
    marginTop: BR_SPACE.md, paddingTop: BR_SPACE.md,
    borderTopWidth: 1.5, borderTopColor: BR_COLORS.ink,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  biggestLbl: { ...BR_TYPE.label, letterSpacing: 1.4 },
  biggestVal: { fontSize: 14, fontWeight: '900', color: BR_COLORS.ink },

  errBox: {
    borderWidth: 1.5, borderColor: BR_COLORS.negative,
    padding: BR_SPACE.md, marginBottom: BR_SPACE.lg,
  },
  errTxt: { ...BR_TYPE.body, color: BR_COLORS.negative },

  emptyBox: {
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg, marginBottom: BR_SPACE.lg,
    backgroundColor: BR_COLORS.paperAlt,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: BR_COLORS.ink, marginBottom: 6 },
  emptySub:   { ...BR_TYPE.body, color: BR_COLORS.muted, lineHeight: 20 },

  sectionTitle: {
    ...BR_TYPE.label,
    fontSize: 11,
    color: BR_COLORS.ink,
    marginBottom: BR_SPACE.sm,
    letterSpacing: 1.8,
  },

  // Subscription row
  row: {
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    padding: BR_SPACE.md,
    marginBottom: BR_SPACE.sm,
    backgroundColor: BR_COLORS.paper,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  merchant:  { fontSize: 16, fontWeight: '900', color: BR_COLORS.ink, letterSpacing: -0.2 },
  category:  { fontSize: 11, color: BR_COLORS.muted, marginTop: 2, letterSpacing: 0.6 },

  pill: {
    borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 3,
  },
  pillTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },

  rowGrid: {
    flexDirection: 'row',
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    borderTopWidth: 1.5, borderTopColor: BR_COLORS.ink,
  },
  cell:         { flex: 1 },
  cellDivider: {
    borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: BR_COLORS.ink,
    paddingHorizontal: 10,
  },
  cellLbl: { ...BR_TYPE.label, fontSize: 9, color: BR_COLORS.muted, letterSpacing: 1.2 },
  cellVal: {
    fontSize: 16, fontWeight: '900', fontFamily: MONO,
    color: BR_COLORS.ink, marginTop: 2,
  },
  leak: { color: BR_COLORS.negative },

  rowFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: BR_SPACE.sm, paddingTop: BR_SPACE.sm,
    borderTopWidth: 1, borderTopColor: BR_COLORS.paperAlt,
  },
  foot: { fontSize: 10, color: BR_COLORS.muted, letterSpacing: 0.4 },
  dismissBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  dismissTxt: { fontSize: 10, fontWeight: '900', color: BR_COLORS.muted, letterSpacing: 1 },
});
