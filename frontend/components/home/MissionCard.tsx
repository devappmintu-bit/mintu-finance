/**
 * MissionCard — R100Q Phase 1.
 *
 * The "emotional spine" surface for the Mission Backbone (services/
 * missions.py wired in R100N). Without this card the user finishes
 * onboarding with the promise "A goal, then the goal hit." and then
 * sees nothing → trust collapse on D-2.
 *
 * What this card MUST communicate at a glance:
 *   • THE GOAL — title + ₹ target
 *   • PROGRESS — saved / target as a brutalist progress bar
 *   • PACE     — day N of 30 + days_left
 *   • LAST WIN — most recent contribution if any (proof of motion)
 *
 * Visual grammar: brutalist (0 radius, 2-px ink border, BR_STAMP.lg).
 * Press → /missions (deep view, future). For now, press is a no-op
 * placeholder that taps a soft haptic so the affordance is felt.
 */
import React, { memo, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import api, { swrGet } from '../../utils/api';
import { BR_COLORS, BR_BORDER, BR_SPACE, BR_STAMP, BR_FONT } from '../../utils/brutalist';

type Mission = {
  _id?: string;
  title?: string;
  target_amount?: number;
  saved_amount?: number;
  progress_pct?: number;
  gap_amount?: number;
  days_left?: number;
  last_contribution?: { amount?: number; label?: string; ts?: string } | null;
};

const fmt = (n?: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

function MissionCardImpl() {
  const [m, setM] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((res: any) => {
    setM(res?.data?.mission || null);
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    // R100Q-perf — SWR pattern. Render the cached mission instantly
    // (sub-100ms) then refresh in the background. First-load misses
    // still fall back to the network promise.
    try {
      const { cached, promise } = swrGet('/missions/current', {
        onFresh: apply,
        staleAfter: 30_000,
      });
      if (cached) apply(cached);
      else {
        const res = await promise;
        apply(res);
      }
    } catch {
      // 404 / 400 → user hasn't seeded a mission yet. Hide silently.
      setM(null);
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    // R100Q-perf-3 — Content-shaped skeleton instead of a generic
    // spinner. Renders the same layout chrome (eyebrow + title block
    // + bar + meta row) with neutral grey blocks so the card "feels
    // already there" — perceived TTI drops ~150ms vs the spinner.
    return (
      <View style={[st.card, BR_STAMP.lg]}>
        <View style={st.eyebrowRow}>
          <View style={st.rule} />
          <View style={st.skelEyebrow} />
        </View>
        <View style={[st.skelLine, { width: '70%', height: 22, marginBottom: 14 }]} />
        <View style={[st.skelLine, { width: '45%', height: 26, marginBottom: 8 }]} />
        <View style={st.barTrack}>
          <View style={[st.barFill, { width: '12%', backgroundColor: '#E5E0D5' }]} />
        </View>
        <View style={st.metaRow}>
          <View style={[st.skelLine, { width: 56, height: 11 }]} />
          <View style={[st.skelLine, { width: 100, height: 11 }]} />
        </View>
        <View style={st.lastRow}>
          <View style={[st.skelLine, { width: '60%', height: 11 }]} />
        </View>
      </View>
    );
  }
  if (!m) return null;     // hidden when no mission — card never fakes a goal

  const progress = Math.max(0, Math.min(100, Math.round(m.progress_pct ?? 0)));
  const target = m.target_amount || 0;
  const saved = m.saved_amount || 0;
  const gap = m.gap_amount ?? Math.max(0, target - saved);
  const daysLeft = m.days_left ?? 0;
  const last = m.last_contribution;

  const onPress = () => {
    try { Haptics.selectionAsync(); } catch {}
    // Future: router.push('/missions') for deep view.
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.card,
        BR_STAMP.lg,
        pressed && { transform: [{ translateY: 1 }] },
      ]}
      testID="home-mission-card"
    >
      {/* Eyebrow ----------------------------------------------- */}
      <View style={st.eyebrowRow}>
        <View style={st.rule} />
        <Text style={st.eyebrow}>MISSION · DAY {Math.max(1, 30 - daysLeft)} OF 30</Text>
      </View>

      {/* Title -------------------------------------------------- */}
      <Text style={st.title} numberOfLines={2}>
        {m.title || `Save ${fmt(target)} this month`}
      </Text>

      {/* Progress numerals + bar ------------------------------- */}
      <View style={st.amountRow}>
        <Text style={st.savedAmt}>{fmt(saved)}</Text>
        <Text style={st.savedSep}> / </Text>
        <Text style={st.targetAmt}>{fmt(target)}</Text>
      </View>

      <View style={st.barTrack}>
        <View style={[st.barFill, { width: `${progress}%` }]} />
      </View>

      <View style={st.metaRow}>
        <Text style={st.metaLeft}>
          {progress}% there
        </Text>
        <Text style={st.metaRight}>
          {gap > 0 ? `${fmt(gap)} to go · ${daysLeft}d left` : 'Goal hit ✓'}
        </Text>
      </View>

      {/* Last contribution proof-of-motion --------------------- */}
      {last && last.amount ? (
        <View style={st.lastRow}>
          <Ionicons name="checkmark-circle" size={12} color={BR_COLORS.positive} />
          <Text style={st.lastTxt} numberOfLines={1}>
            +{fmt(last.amount)} {last.label ? `· ${last.label}` : 'last contribution'}
          </Text>
        </View>
      ) : (
        <View style={st.lastRow}>
          <Ionicons name="information-circle-outline" size={12} color={BR_COLORS.muted} />
          <Text style={[st.lastTxt, { color: BR_COLORS.muted }]} numberOfLines={1}>
            No contributions yet — every spend under budget pushes you here.
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// R100Q-perf — memo so Home re-renders (e.g. on tab switch / reload)
// don't repaint the Mission Card unless its props change. Combined
// with SWR cache, repaint cost on revisit ≈ 0.
const MissionCard = memo(MissionCardImpl);
export default MissionCard;

const st = StyleSheet.create({
  card: {
    backgroundColor: BR_COLORS.paper,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.lg,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  cardLoading: {
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  rule: { width: 14, height: 3, backgroundColor: BR_COLORS.ink },
  eyebrow: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.8,
    color: BR_COLORS.ink, textTransform: 'uppercase',
  },
  title: {
    fontSize: 22, fontWeight: '900', color: BR_COLORS.ink,
    letterSpacing: -0.4, lineHeight: 28, marginBottom: 14,
  },
  amountRow: {
    flexDirection: 'row', alignItems: 'baseline', marginBottom: 8,
  },
  savedAmt: {
    fontSize: 28, fontWeight: '900', color: BR_COLORS.ink,
    fontFamily: BR_FONT.mono, letterSpacing: -0.5,
  },
  savedSep: {
    fontSize: 18, fontWeight: '800', color: BR_COLORS.muted,
    fontFamily: BR_FONT.mono,
  },
  targetAmt: {
    fontSize: 18, fontWeight: '800', color: BR_COLORS.muted,
    fontFamily: BR_FONT.mono,
  },
  barTrack: {
    height: 14,
    backgroundColor: BR_COLORS.paperAlt,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    marginBottom: 6,
  },
  barFill: {
    height: '100%',
    backgroundColor: BR_COLORS.accent,
  },
  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  metaLeft: {
    fontSize: 12, fontWeight: '900', letterSpacing: 1, color: BR_COLORS.ink,
    textTransform: 'uppercase',
  },
  metaRight: {
    fontSize: 11, fontWeight: '700', color: BR_COLORS.muted,
    fontFamily: BR_FONT.mono, letterSpacing: 0.5,
  },
  lastRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 10,
    borderTopWidth: BR_BORDER.hair,
    borderTopColor: BR_COLORS.line,
  },
  lastTxt: {
    fontSize: 12, fontWeight: '700', color: BR_COLORS.ink, flex: 1,
  },

  // R100Q-perf-3 — skeleton placeholder primitives. Neutral grey
  // blocks shaped like real content so the user perceives "loaded
  // already, just waiting for numbers" rather than "spinner = work
  // in progress".
  skelEyebrow: {
    width: 90, height: 10, backgroundColor: BR_COLORS.line,
  },
  skelLine: {
    backgroundColor: BR_COLORS.line,
    borderRadius: 0,
  },
});
