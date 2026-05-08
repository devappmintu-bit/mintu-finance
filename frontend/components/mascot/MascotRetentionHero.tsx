/**
 * MascotRetentionHero — R110.
 *
 * Live retention loop surface. Polls /api/streak/status to render
 * the user's streak with hard-stamp brutalist styling and surfaces
 * three high-leverage CTAs based on backend state:
 *
 *   • `about_to_reset === true`      → big urgent card "1 DAY LEFT"
 *     (uses streak freezes if premium has any, otherwise check-in CTA)
 *   • `needs_check_in === true`      → standard "log today" CTA
 *   • `streak_current >= 7 && !needs_check_in` → "ON FIRE" celebration
 *
 * Differs from the legacy MascotStreakHero by:
 *   - Real backend snapshot (not just last-txn proximity heuristic)
 *   - Freeze inventory as a stamp pill ("3 SHIELDS LEFT")
 *   - Brutal primitives end-to-end (BrutalCard / BrutalButton)
 *   - Clear next-reward preview line
 *
 * Mounts on Home above the day-action band. Auto-hides for users
 * with no streak history (streak_current === 0 AND total_check_ins
 * === 0) so we never fake gamification.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import api from '../../utils/api';
import { showBrutalToast } from '../../store/brutalToastStore';
import {
  BrutalCard,
  BrutalButton,
  BR_COLORS,
  BR_BORDER,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../brutal';

type StreakStatus = {
  streak_current: number;
  streak_longest: number;
  last_active_date?: string;
  needs_check_in: boolean;
  about_to_reset: boolean;
  next_reward_preview?: { coins?: number; label?: string };
  today?: string;
  total_check_ins: number;
  is_premium: boolean;
  freezes_available: number;
  freezes_max_per_month: number;
};

type Mode = 'urgent' | 'today' | 'fire' | 'idle';

function modeFor(s: StreakStatus | null): Mode {
  if (!s) return 'idle';
  if (s.about_to_reset) return 'urgent';
  if (s.needs_check_in) return 'today';
  if (s.streak_current >= 7) return 'fire';
  return 'idle';
}

export default function MascotRetentionHero() {
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [hide, setHide] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/streak/status');
      setStatus(r?.data || null);
    } catch {
      // Soft-fail: hide self so we never render stale gamification.
      setHide(true);
    }
  }, []);

  useEffect(() => {
    load();
    // Re-poll every 60s while mounted so the at-risk banner clears
    // immediately after a check-in fires from elsewhere.
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const checkIn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const r = await api.post('/streak/check-in', {});
      const next = r?.data;
      const day = next?.streak_current ?? (status?.streak_current ?? 0) + 1;
      showBrutalToast(`✓ Day ${day} locked in`, 'positive', 1800);
      // Re-fetch so freezes / next-reward preview update.
      await load();
    } catch (e: any) {
      showBrutalToast(
        e?.response?.data?.detail || 'Check-in failed',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, load, status?.streak_current]);

  if (hide || !status) return null;

  // R110 — never fake gamification: hide entirely for never-engaged users.
  const everEngaged =
    (status.streak_current || 0) > 0 || (status.total_check_ins || 0) > 0;
  if (!everEngaged) return null;

  const mode: Mode = modeFor(status);
  const days = status.streak_current;
  const longest = status.streak_longest;
  const freezes = status.freezes_available;

  // ──────────────── URGENT — about to reset ────────────────
  if (mode === 'urgent') {
    const hasShield = status.is_premium && freezes > 0;
    return (
      <BrutalCard variant="warm" style={styles.wrap}>
        <View style={styles.row}>
          <View style={[styles.stamp, { backgroundColor: PALETTE.danger }]}>
            <Text style={[styles.stampText, { color: '#fff' }]}>1 DAY LEFT</Text>
          </View>
          {hasShield && (
            <View style={styles.shieldPill}>
              <Ionicons name="shield-checkmark" size={11} color={BR_COLORS.ink} />
              <Text style={styles.shieldText}>{freezes} SHIELDS</Text>
            </View>
          )}
        </View>
        <Text style={styles.titleLg}>
          Your {days}-day streak{'\n'}is hanging by a thread.
        </Text>
        <Text style={styles.sub}>
          Skip today and {hasShield ? 'we burn 1 shield to save it' : 'you reset to Day 1'}. Lock in a transaction or tap below.
        </Text>
        <BrutalButton
          label={hasShield ? 'Use shield + check-in' : 'Check in now'}
          icon={hasShield ? 'shield-outline' : 'flame-outline'}
          tone="ink"
          size="md"
          fullWidth
          loading={busy}
          onPress={checkIn}
          style={{ marginTop: BR_SPACE['3'] }}
          testID="streak-checkin-urgent"
        />
      </BrutalCard>
    );
  }

  // ──────────────── TODAY — needs check-in ────────────────
  if (mode === 'today') {
    return (
      <BrutalCard variant="highlight" style={styles.wrap}>
        <View style={styles.row}>
          <View style={styles.stamp}>
            <Text style={styles.stampText}>STREAK · DAY {days + 1}</Text>
          </View>
          {status.is_premium && (
            <View style={styles.shieldPill}>
              <Ionicons name="shield-checkmark" size={11} color={BR_COLORS.ink} />
              <Text style={styles.shieldText}>
                {freezes}/{status.freezes_max_per_month}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.titleLg}>
          {days} day{days === 1 ? '' : 's'} strong.
        </Text>
        <Text style={styles.sub}>
          Check in today to keep the chain alive. Longest run: {longest} days.
        </Text>
        <BrutalButton
          label="Check in"
          icon="checkmark-circle-outline"
          tone="ink"
          size="md"
          fullWidth
          loading={busy}
          onPress={checkIn}
          style={{ marginTop: BR_SPACE['3'] }}
          testID="streak-checkin-today"
        />
      </BrutalCard>
    );
  }

  // ──────────────── FIRE — 7+ days locked in ────────────────
  if (mode === 'fire') {
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          try {
            router.push('/(tabs)/rewards' as any);
          } catch { /* noop */ }
        }}
        accessibilityLabel={`Streak ${days} days, on fire`}
      >
        <BrutalCard variant="lime" style={styles.wrap}>
          <View style={styles.row}>
            <View style={styles.stamp}>
              <Text style={styles.stampText}>ON FIRE</Text>
            </View>
            <Text style={styles.flame}>🔥</Text>
          </View>
          <Text style={styles.titleLg}>{days} days. Untouchable.</Text>
          <Text style={styles.sub}>
            Longest streak {longest}d · {status.total_check_ins} check-ins all-time. Tap to see rewards.
          </Text>
        </BrutalCard>
      </Pressable>
    );
  }

  // ──────────────── IDLE — checked in already, < 7 days ────────────────
  return (
    <BrutalCard variant="base" style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.stamp}>
          <Text style={styles.stampText}>STREAK</Text>
        </View>
        <Text style={styles.flameSm}>🔥</Text>
      </View>
      <Text style={styles.titleSm}>
        Day {days} · longest {longest}
      </Text>
      <Text style={styles.subSm}>
        Logged for today ✓. Come back tomorrow to level up.
      </Text>
    </BrutalCard>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: BR_SPACE['2'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: BR_SPACE['2'],
  },
  stamp: {
    backgroundColor: BR_COLORS.ink,
    paddingHorizontal: BR_SPACE['2'],
    paddingVertical: 3,
  },
  stampText: {
    ...BR_FONT.stamp,
    color: '#fff',
    fontSize: 10,
  },
  shieldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  shieldText: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 9,
  },
  titleLg: {
    ...BR_FONT.h2,
    color: BR_COLORS.ink,
    fontSize: 22,
    lineHeight: 26,
  },
  titleSm: {
    ...BR_FONT.h3,
    color: BR_COLORS.ink,
    fontSize: 16,
  },
  sub: {
    ...BR_FONT.body,
    color: BR_COLORS.ink,
    opacity: 0.85,
    fontSize: 13,
    lineHeight: 17,
    marginTop: BR_SPACE['1'],
  },
  subSm: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  flame: { fontSize: 24 },
  flameSm: { fontSize: 16 },
});
