/**
 * MascotLevelCard — Mintu's evolution journey on Profile.
 *
 * Honest progression tied to REAL streak days:
 *   Day 0     → “Mintu · Sleeping”   (locked, hidden until first txn)
 *   Day 1–6   → “Mintu · Spark”     (orange glow)
 *   Day 7–29  → “Mintu · Saver”     (silver halo)
 *   Day 30–99 → “Mintu · Sage”      (gold halo)
 *   Day 100+  → “Mintu · Legend”    (gold + sparkles)
 *
 * No fake levels — the user EARNS each tier by showing up.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MascotPresence from './MascotPresence';
import { useFinContext } from '../../store/financialContext';

type Tier = {
  id: 'sleeping' | 'spark' | 'saver' | 'sage' | 'legend';
  label: string;
  haloColor: string;
  bgColor: string;
  blurb: string;
  unlockAt: number;
};

const TIERS: Tier[] = [
  { id: 'sleeping', label: 'Mintu · Sleeping', haloColor: '#9CA3AF', bgColor: '#F3F4F6', blurb: 'Log your first expense to wake me up.', unlockAt: 0 },
  { id: 'spark', label: 'Mintu · Spark',     haloColor: '#F97316', bgColor: '#FFEDD5', blurb: 'Day 1–6. Building the habit.',         unlockAt: 1 },
  { id: 'saver', label: 'Mintu · Saver',     haloColor: '#94A3B8', bgColor: '#F1F5F9', blurb: 'Day 7–29. One week in. Real now.',     unlockAt: 7 },
  { id: 'sage',  label: 'Mintu · Sage',      haloColor: '#EAB308', bgColor: '#FEF9C3', blurb: 'Day 30–99. Patterns visible. Power up.', unlockAt: 30 },
  { id: 'legend',label: 'Mintu · Legend',    haloColor: '#A16207', bgColor: '#FEF3C7', blurb: 'Day 100+. Built different.',          unlockAt: 100 },
];

function tierFor(streak: number): Tier {
  return [...TIERS].reverse().find(t => streak >= t.unlockAt) || TIERS[0];
}
function nextTierFor(streak: number): Tier | null {
  return TIERS.find(t => streak < t.unlockAt) || null;
}

export default function MascotLevelCard() {
  const streakDays = useFinContext((s) => s.streak?.days ?? 0);
  const txnCount = useFinContext((s) => s.transactions?.count ?? 0);

  // Honest gate: cold-start users don't see this surface.
  if (txnCount === 0) return null;

  const tier = tierFor(streakDays);
  const next = nextTierFor(streakDays);
  const daysToNext = next ? Math.max(0, next.unlockAt - streakDays) : 0;
  const progressPct = next
    ? Math.min(100, Math.round(((streakDays - tier.unlockAt) / (next.unlockAt - tier.unlockAt)) * 100))
    : 100;

  return (
    <View style={[styles.card, { backgroundColor: tier.bgColor }]}>
      <View style={styles.row}>
        <View style={[styles.haloRing, { borderColor: tier.haloColor }]}>
          <MascotPresence size={64} showWhenGated />
        </View>
        <View style={styles.body}>
          <Text style={styles.label}>YOUR MASCOT</Text>
          <Text style={styles.tierName}>{tier.label}</Text>
          <Text style={styles.blurb} numberOfLines={2}>{tier.blurb}</Text>
        </View>
      </View>

      {next ? (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: tier.haloColor }]} />
          </View>
          <Text style={styles.progressText}>
            {daysToNext} days to {next.label.replace('Mintu · ', '')}
          </Text>
        </View>
      ) : (
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>⚜️ Top tier reached — keep showing up.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderColor: '#0B0B0B',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  haloRing: {
    width: 78,
    height: 78,
    borderWidth: 2,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#0B0B0B' },
  tierName: { fontSize: 17, fontWeight: '900', color: '#0B0B0B', letterSpacing: -0.3 },
  blurb: { fontSize: 12, fontWeight: '600', color: '#404040', lineHeight: 16 },
  progressRow: { gap: 4 },
  progressTrack: {
    height: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0B0B0B',
  },
  progressFill: { height: '100%' },
  progressText: { fontSize: 11, fontWeight: '700', color: '#0B0B0B', letterSpacing: 0.3 },
});
