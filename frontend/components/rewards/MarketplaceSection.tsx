/**
 * MarketplaceSection.tsx — 3-lane reward marketplace.
 *
 * Sections:
 *   🔥 Trending Now           — top-popularity non-premium rewards
 *   🎯 Recommended For You    — per-user category matches
 *   💎 Premium (Pro-locked)   — masked cards with unlock CTA
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

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
  limited:  { txt: 'Limited', color: '#EF4444' },
  trending: { txt: 'Trending', color: '#F59E0B' },
  pro:      { txt: 'PRO', color: '#7C3AED' },
};

export default function MarketplaceSection({ trending, recommended, premium, isPro, userCoins, onClaim }: Props) {
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

function Lane({ emoji, title, subtitle, items, userCoins, isPro, onClaim, testIDPrefix, showUnlockCTA }:
  { emoji: string; title: string; subtitle?: string; items: Reward[]; userCoins: number; isPro: boolean; onClaim?: (r: Reward) => void; testIDPrefix: string; showUnlockCTA?: boolean }) {
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
  const canAfford = userCoins >= reward.cost_coins;
  const locked = reward.locked;
  const urgency = reward.urgency && URGENCY_COPY[reward.urgency];
  const logo = BRAND_LOGOS[reward.brand];
  const [imgError, setImgError] = React.useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => {
        if (locked) { router.push('/premium' as any); return; }
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onClaim && onClaim(reward);
      }}
      testID={testID}
    >
      <View style={[s.card, locked && s.cardLocked]}>
        {/* Coloured top band with real brand logo (or emoji fallback) */}
        <LinearGradient
          colors={[reward.color, shade(reward.color, -0.2)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.cardBand}
        >
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
              <Ionicons name="lock-closed" size={22} color="#fff" />
            </View>
          )}
        </LinearGradient>
        <View style={s.cardBody}>
          <Text style={s.brandTxt} numberOfLines={1}>{reward.brand}</Text>
          <Text style={s.discTxt} numberOfLines={1}>{reward.discount}</Text>
          {!!reward.min_order && <Text style={s.minTxt} numberOfLines={1}>Min. {reward.min_order}</Text>}
          <View style={s.popRow}>
            <Ionicons name="flame" size={10} color="#F59E0B" />
            <Text style={s.popTxt} numberOfLines={1}>{reward.popularity_label}</Text>
          </View>
          <View style={[s.claimBtn, locked && { backgroundColor: '#E5E7EB' }]}>
            <Text style={[s.coinTxt, locked && { color: '#9CA3AF' }]}>🪙 {reward.cost_coins}</Text>
            <Ionicons name={locked ? 'lock-closed' : 'arrow-forward'} size={11} color={locked ? '#9CA3AF' : '#fff'} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function shade(hex: string, pct: number) {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const adj = (v: number) => Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v * pct : (255 - v) * pct))));
    return `#${[adj(r), adj(g), adj(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  } catch { return hex; }
}

const s = StyleSheet.create({
  laneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  laneEmoji: { fontSize: 17 },
  laneTitle: { fontSize: 15, fontWeight: '900', color: '#111827', letterSpacing: -0.2 },
  laneSub: { fontSize: 10.5, fontWeight: '700', color: '#6B7280', marginTop: 1 },
  unlockTxt: { fontSize: 11.5, fontWeight: '900', color: '#F56E1E', letterSpacing: 0.2 },

  card: { width: 160, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardLocked: { opacity: 0.9 },
  cardBand: { height: 68, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cardEmoji: { fontSize: 34 },
  logoFrame: { width: 54, height: 42, backgroundColor: '#fff', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4 },
  logoImg: { width: '100%', height: '100%' },
  urgencyPill: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  urgencyTxt: { fontSize: 8.5, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },

  cardBody: { padding: 10, gap: 3 },
  brandTxt: { fontSize: 13, fontWeight: '900', color: '#111827', letterSpacing: -0.1 },
  discTxt: { fontSize: 12, fontWeight: '800', color: '#F56E1E' },
  minTxt: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  popRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  popTxt: { fontSize: 9.5, fontWeight: '700', color: '#6B7280' },
  claimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F56E1E' },
  coinTxt: { fontSize: 11, fontWeight: '900', color: '#fff' },
});
