/**
 * ReferralMascotCard — Toing-style expandable mascot card.
 *
 * Sits at the bottom of Home. Collapsed = a slim mascot teaser line
 * ("Refer a friend, earn premium days"). Tapping the row expands the
 * card to reveal the user's referral code, share CTA, and the four
 * tier rewards (3 / 7 / 30 / 365 PREMIUM DAYS).
 *
 * Mechanics:
 *   - One tap on the head row → expand / collapse (no nav).
 *   - Whole card uses MintuMascot in 'idle' state on collapse, switches
 *     to 'success' briefly when copied/shared (positive feedback loop).
 *   - Reward currency is PREMIUM DAYS, not coins (gamification killed).
 *   - Network: /api/referral/enhanced-status (already mounted backend).
 *
 * Visual: strict Brutalist — hairline ink border, 2px stamp drop, no
 * shadows, mono numerals.
 */
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Share, Platform, LayoutAnimation, UIManager,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_STAMP } from '../../utils/brutalist';
import MintuMascot from '../MintuMascot';
import { fetchReferralStatus } from '../../services/rewards';

// Enable LayoutAnimation on Android once.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  try { UIManager.setLayoutAnimationEnabledExperimental(true); } catch { /* noop */ }
}

type TierReward = {
  count: number;       // referrals required
  days: number;        // premium days awarded
  unlocked: boolean;
};

// Static fallback so the card never reads as broken when the network is slow.
const FALLBACK_TIERS: TierReward[] = [
  { count: 1,  days: 3,   unlocked: false },
  { count: 3,  days: 7,   unlocked: false },
  { count: 5,  days: 30,  unlocked: false },
  { count: 10, days: 365, unlocked: false },
];

function ReferralMascotCardImpl() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string>('');
  const [count, setCount] = useState<number>(0);
  const [tiers, setTiers] = useState<TierReward[]>(FALLBACK_TIERS);
  const [mascotState, setMascotState] = useState<'idle' | 'success'>('idle');
  const [loaded, setLoaded] = useState(false);

  // Lazy-load the referral payload only when the user expands the card.
  // Saves a network round trip on every Home paint for a feature that
  // most users won't engage with on their first session.
  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetchReferralStatus();
        if (!alive) return;
        if (typeof r?.referral_code === 'string') setCode(r.referral_code);
        if (typeof r?.referral_count === 'number') setCount(r.referral_count);
        // Backend `pro_day_rewards` shape: [{ days_required, count_required, awarded }]
        // We rebuild the tier list from any available fields, falling back gracefully.
        const raw = Array.isArray(r?.pro_day_rewards) ? r.pro_day_rewards : null;
        if (raw && raw.length === 4) {
          setTiers(raw.map((t: any, idx: number) => ({
            count: Number(t.count_required ?? FALLBACK_TIERS[idx].count),
            days:  Number(t.days ?? FALLBACK_TIERS[idx].days),
            unlocked: !!t.awarded,
          })));
        }
        setLoaded(true);
      } catch { /* keep fallback */ }
    })();
    return () => { alive = false; };
  }, [open, loaded]);

  const toggleOpen = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }, []);

  const flashSuccess = useCallback(() => {
    setMascotState('success');
    setTimeout(() => setMascotState('idle'), 1200);
  }, []);

  const onCopy = useCallback(async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      flashSuccess();
      Toast.show({ type: 'success', text1: 'Code copied', text2: code, position: 'bottom' });
    } catch { /* noop */ }
  }, [code, flashSuccess]);

  const onShare = useCallback(async () => {
    const referralCode = code || 'MINTU';
    const message =
      `I'm using MintU to track my money and it's actually working.\n\n` +
      `Use my code ${referralCode} to sign up and we BOTH get free Premium days. ` +
      `https://mintu.app`;
    try {
      await Share.share({ message });
      flashSuccess();
    } catch { /* user cancelled */ }
  }, [code, flashSuccess]);

  // Visible code — show a placeholder while we load so the row never
  // collapses to an empty state on first expand.
  const codeDisplay = code || '••••••••';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggleOpen}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Collapse referral card' : 'Expand referral card'}
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        style={({ pressed }) => [
          styles.head,
          BR_STAMP.md,
          pressed && styles.pressed,
        ]}
        testID="home-referral-card-head"
      >
        <View style={styles.mascotSlot}>
          <MintuMascot size={56} state={mascotState} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>REFER & EARN</Text>
          <Text style={styles.title} numberOfLines={1}>
            {open ? 'Tap a tier to share' : 'Earn up to 365 premium days'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {count > 0 ? `${count} friend${count === 1 ? '' : 's'} joined so far` : 'Friends save too — everyone wins.'}
          </Text>
        </View>
        <View style={styles.chev}>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={BR_COLORS.ink} />
        </View>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {/* Code block — copy + share affordances */}
          <View style={styles.codeRow}>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>YOUR CODE</Text>
              <Text style={styles.codeTxt} selectable>{codeDisplay}</Text>
            </View>
            <Pressable
              onPress={onCopy}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
              accessibilityLabel="Copy referral code"
              testID="referral-copy"
            >
              <Ionicons name="copy-outline" size={18} color={BR_COLORS.ink} />
            </Pressable>
            <Pressable
              onPress={onShare}
              style={({ pressed }) => [styles.shareBtn, pressed && styles.btnPressed]}
              accessibilityLabel="Share referral code"
              testID="referral-share"
            >
              <Ionicons name="share-social" size={16} color={BR_COLORS.accentInk} />
              <Text style={styles.shareTxt}>SHARE</Text>
            </Pressable>
          </View>

          {/* Tier rewards — premium days, NOT coins. */}
          <Text style={[styles.kicker, { marginTop: BR_SPACE.lg }]}>REWARDS</Text>
          <View style={styles.tierGrid}>
            {tiers.map((t) => {
              const reached = count >= t.count || t.unlocked;
              return (
                <View
                  key={t.count}
                  style={[
                    styles.tierBox,
                    reached && styles.tierUnlocked,
                  ]}
                  testID={`referral-tier-${t.count}`}
                >
                  <Text style={[styles.tierCount, reached && { color: BR_COLORS.accent }]}>
                    {t.count}
                  </Text>
                  <Text style={styles.tierLabel}>FRIEND{t.count === 1 ? '' : 'S'}</Text>
                  <View style={styles.tierDivider} />
                  <Text style={styles.tierDays}>{t.days}d</Text>
                  <Text style={styles.tierLabel}>PREMIUM</Text>
                </View>
              );
            })}
          </View>

          {/* How it works — 3 short lines, no bloat. */}
          <View style={styles.howWrap}>
            <Text style={styles.howRow}>1. Share your code with friends.</Text>
            <Text style={styles.howRow}>2. They sign up & log their first expense.</Text>
            <Text style={styles.howRow}>3. You both get premium days — auto.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// R100Q-perf — memo so Home tab repaints (e.g. budget refresh, route
// focus) don't redraw the entire referral card subtree. The card has
// a heavy gradient stamp + mascot SVG that re-renders cost noticeable
// frame budget on lower-end devices.
const ReferralMascotCard = memo(ReferralMascotCardImpl);
export default ReferralMascotCard;


const styles = StyleSheet.create({
  wrap: {
    marginTop: BR_SPACE.xl,
  },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.md,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    minHeight: 80,
    gap: BR_SPACE.md,
  },
  pressed: { transform: [{ translateX: 1 }, { translateY: 1 }], opacity: 0.96 },
  mascotSlot: {
    width: 56, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: {
    ...BR_TYPE.labelSm,
    color: BR_COLORS.muted,
  },
  title: {
    ...BR_TYPE.bodyBold,
    color: BR_COLORS.ink,
    fontSize: 15,
    marginTop: 2,
  },
  sub: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 2,
  },
  chev: {
    width: 26, height: 26,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BR_COLORS.paper,
  },

  // Expanded body — sits INSIDE the same border block, hairline at top.
  body: {
    borderLeftWidth: BR_BORDER.bold,
    borderRightWidth: BR_BORDER.bold,
    borderBottomWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    paddingHorizontal: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    paddingBottom: BR_SPACE.lg,
  },

  codeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: BR_SPACE.sm,
  },
  codeBox: {
    flex: 1,
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.sm,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
  },
  codeLabel: { ...BR_TYPE.labelSm, color: BR_COLORS.muted },
  codeTxt: {
    ...BR_TYPE.num,
    fontSize: 18,
    color: BR_COLORS.ink,
    marginTop: 2,
    letterSpacing: 1,
  },
  iconBtn: {
    width: 44, height: '100%',
    minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: BR_SPACE.md,
    minHeight: 44,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.accent,
  },
  btnPressed: { opacity: 0.85 },
  shareTxt: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1.4,
    color: BR_COLORS.accentInk,
  },

  // Tier grid — 4 boxes side by side.
  tierGrid: {
    flexDirection: 'row',
    marginTop: BR_SPACE.sm,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  tierBox: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: BR_SPACE.md,
    borderRightWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
  },
  tierUnlocked: { backgroundColor: BR_COLORS.paperAlt },
  tierCount: {
    ...BR_TYPE.num,
    fontSize: 18,
    color: BR_COLORS.ink,
  },
  tierLabel: {
    ...BR_TYPE.labelSm,
    color: BR_COLORS.muted,
  },
  tierDivider: {
    width: 14, height: 1,
    marginVertical: 4,
    backgroundColor: BR_COLORS.line,
  },
  tierDays: {
    ...BR_TYPE.num,
    fontSize: 14,
    color: BR_COLORS.accent,
  },

  howWrap: {
    marginTop: BR_SPACE.lg,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
    gap: 4,
  },
  howRow: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    fontSize: 12,
  },
});
