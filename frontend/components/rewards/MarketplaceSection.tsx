/**
 * MarketplaceSection.tsx — 3-lane reward marketplace.
 *
 * Sections:
 *   🔥 Trending Now           — top-popularity non-premium rewards
 *   🎯 Recommended For You    — per-user category matches
 *   💎 Premium (Pro-locked)   — masked cards with unlock CTA
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, useAppColors } from '../../utils/theme';
import { shade } from '../../utils/color';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  laneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  laneEmoji: { fontSize: 17 },
  laneTitle: { fontSize: 15, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  laneSub: { fontSize: 10.5, fontWeight: '700', color: c.text.muted, marginTop: 1 },
  unlockTxt: { fontSize: 11.5, fontWeight: '900', color: c.accent.brand, letterSpacing: 0.2 },

  card: { width: 160, backgroundColor: c.bg.elevated, borderRadius: 0, borderWidth: 1, borderColor: c.gray[100], overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardLocked: { opacity: 0.9 },
  cardBand: { height: 68, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cardEmoji: { fontSize: 34 },
  logoFrame: { width: 54, height: 42, backgroundColor: c.bg.elevated, borderRadius: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4 },
  logoImg: { width: '100%', height: '100%' },
  urgencyPill: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  urgencyTxt: { fontSize: 8.5, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.5 },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },

  cardBody: { padding: 10, gap: 3 },
  brandTxt: { fontSize: 13, fontWeight: '900', color: c.text.primary, letterSpacing: -0.1 },
  discTxt: { fontSize: 12, fontWeight: '800', color: c.accent.brand },
  minTxt: { fontSize: 10, fontWeight: '600', color: c.gray[400] },
  popRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  popTxt: { fontSize: 9.5, fontWeight: '700', color: c.text.muted },
  claimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, paddingVertical: 7, borderRadius: 0, backgroundColor: c.accent.brand },
  coinTxt: { fontSize: 11, fontWeight: '900', color: c.bg.elevated },
}));

// Clearbit free brand logo API — falls back gracefully to emoji if image
// fails to load (e.g. offline, rate-limited, or unknown domain).
const BRAND_LOGOS: Record<string, string> = {
  Swiggy:       'https://logo.clearbit.com/swiggy.com',
  Zomato:       'https://logo.clearbit.com/zomato.com',
  Amazon:       'https://logo.clearbit.com/amazon.in',
  Flipkart:     'https://logo.clearbit.com/flipkart.com',
  Myntra:       'https://logo.clearbit.com/myntra.com',
  MakeMyTrip:   'https://logo.clearbit.com/makemytrip.com',
  Ola:          'https://logo.clearbit.com/olacabs.com',
  BookMyShow:   'https://logo.clearbit.com/bookmyshow.com',
  'Prime Video':'https://logo.clearbit.com/primevideo.com',
  Airtel:       'https://logo.clearbit.com/airtel.in',
};

type Reward = {
  id: string;
  brand: string;
  category: string;
  discount: string;
  min_order?: string;
  emoji: string;
  color: string;
  cost_coins: number;
  popularity: number;
  popularity_label: string;
  premium: boolean;
  locked: boolean;
  urgency?: string | null;
};

type Props = {
  trending: Reward[];
  recommended: Reward[];
  premium: Reward[];
  isPro: boolean;
  userCoins: number;
  onClaim?: (r: Reward) => void;
};

const URGENCY_COPY: Record<string, { txt: string; color: string }> = {
  limited:  { txt: 'Limited', color: COLORS.state.danger },
  trending: { txt: 'Trending', color: COLORS.accent.secondary },
  pro:      { txt: 'PRO', color: '#7C3AED' },
};

export default function MarketplaceSection({ trending, recommended, premium, isPro, userCoins, onClaim }: Props) {
  const s = useStyles();
  const c = useAppColors();
  return (
    <View style={{ gap: 22 }}>
      <Lane
        emoji="🔥"
        title="Trending Now"
        items={trending}
        userCoins={userCoins}
        isPro={isPro}
        onClaim={onClaim}
        testIDPrefix="trending"
      />
      <Lane
        emoji="🎯"
        title="Recommended for you"
        items={recommended}
        userCoins={userCoins}
        isPro={isPro}
        onClaim={onClaim}
        testIDPrefix="recommended"
        subtitle="Based on your spend categories"
      />
      <Lane
        emoji="💎"
        title="Premium Rewards"
        items={premium}
        userCoins={userCoins}
        isPro={isPro}
        onClaim={onClaim}
        testIDPrefix="premium"
        subtitle={isPro ? 'Pro exclusive' : 'Unlock with MintU Pro'}
        showUnlockCTA={!isPro}
      />
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Lane({ emoji, title, subtitle, items, userCoins, isPro, onClaim, testIDPrefix, showUnlockCTA }:
  { emoji: string; title: string; subtitle?: string; items: Reward[]; userCoins: number; isPro: boolean; onClaim?: (r: Reward) => void; testIDPrefix: string; showUnlockCTA?: boolean }) {
  const s = useStyles();
  if (!items?.length) return null;
  return (
    <View>
      <View style={s.laneHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={s.laneEmoji}>{emoji}</Text>
          <View>
            <Text style={s.laneTitle}>{title}</Text>
            {!!subtitle && <Text style={s.laneSub}>{subtitle}</Text>}
          </View>
        </View>
        {showUnlockCTA && (
          <TouchableOpacity onPress={() => { try { Haptics.selectionAsync(); } catch {} router.push('/premium' as any); }} hitSlop={10}>
            <Text style={s.unlockTxt}>Unlock →</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingRight: 24 }}>
        {items.map((r) => (
          <RewardCard key={r.id} reward={r} userCoins={userCoins} onClaim={onClaim} testID={`${testIDPrefix}-${r.id}`} />
        ))}
      </ScrollView>
    </View>
  );
}

function RewardCard({ reward, userCoins, onClaim, testID }: { reward: Reward; userCoins: number; onClaim?: (r: Reward) => void; testID?: string }) {
  const s = useStyles();
  const c = useAppColors();
  const canAfford = userCoins >= reward.cost_coins;
  const locked = reward.locked;
  const urgency = reward.urgency && URGENCY_COPY[reward.urgency];
  const logo = BRAND_LOGOS[reward.brand];
  const [imgError, setImgError] = React.useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      // Round 41 — disable tap when user can't afford and reward isn't locked.
      // Previously a Toast fired on tap; now the visual state matches: dimmed
      // card + "Need X more" caption. Locked-by-tier rewards stay tappable to
      // route to /premium (existing behaviour).
      disabled={!locked && !canAfford}
      onPress={() => {
        if (locked) { router.push('/premium' as any); return; }
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onClaim && onClaim(reward);
      }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${reward.brand} ${reward.discount}, premium only` : (canAfford ? `Claim ${reward.brand} ${reward.discount} for ${reward.cost_coins} coins` : `${reward.brand} ${reward.discount}, need ${reward.cost_coins - userCoins} more coins`)}
      accessibilityState={{ disabled: !locked && !canAfford }}
    >
      <View style={[s.card, locked && s.cardLocked, !locked && !canAfford && { opacity: 0.55 }]}>
        {/* Coloured top band with real brand logo (or emoji fallback) */}
        <View
          style={[s.cardBand, { backgroundColor: '#0A0A0A' }]}>
          {logo && !imgError ? (
            <View style={s.logoFrame}>
              <Image
                source={{ uri: logo }}
                style={s.logoImg}
                resizeMode="contain"
                onError={() => setImgError(true)}
              />
            </View>
          ) : (
            <Text style={s.cardEmoji}>{reward.emoji}</Text>
          )}
          {urgency && (
            <View style={[s.urgencyPill, { backgroundColor: urgency.color }]}>
              <Text style={s.urgencyTxt}>{urgency.txt}</Text>
            </View>
          )}
          {locked && (
            <View style={s.lockOverlay}>
              <Ionicons name="lock-closed" size={22} color="#FFFFFF" />
            </View>
          )}
        </View>
        <View style={s.cardBody}>
          <Text style={s.brandTxt} numberOfLines={1}>{reward.brand}</Text>
          <Text style={s.discTxt} numberOfLines={1}>{reward.discount}</Text>
          {!!reward.min_order && <Text style={s.minTxt} numberOfLines={1}>Min. {reward.min_order}</Text>}
          <View style={s.popRow}>
            <Ionicons name="flame" size={10} color={c.accent.warning} />
            <Text style={s.popTxt} numberOfLines={1}>{reward.popularity_label}</Text>
          </View>
          <View style={[s.claimBtn, locked && { backgroundColor: '#E5E7EB' }, !locked && !canAfford && { backgroundColor: '#FEE2E2' }]}>
            <Text style={[s.coinTxt, locked && { color: COLORS.text.muted }, !locked && !canAfford && { color: '#991B1B' }]} numberOfLines={1}>
              {!locked && !canAfford
                ? `Need ${reward.cost_coins - userCoins} more`
                : `🪙 ${reward.cost_coins}`}
            </Text>
            <Ionicons name={locked ? 'lock-closed' : (!canAfford ? 'alert-circle' : 'arrow-forward')} size={11} color={locked ? COLORS.text.muted : (!canAfford ? '#991B1B' : '#FFFFFF')} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}


