/**
 * Premium Hub — R113 brutal convergence.
 *
 * Free users: locked-state hero + grid of greyed tool tiles routing to
 *   Profile → Premium upsell.
 * Premium users: ink-on-cyan active hero + colored tool tiles unlocking
 *   Deep Reports, AI Coach, Tax, Invest, Money School, Auto-Categorise.
 *
 * Migrated to BrutalCard / BrutalButton / brutal tokens.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PremiumHubSkeleton } from '../components/SkeletonLoader';
import { fetchPremiumStatus } from '../services/premium';
import PremiumCardStack from '../components/premium/PremiumCardStack';
import { StaggeredEntrance } from '../components/primitives';

import {
  BrutalCard,
  BrutalButton,
  BrutalBadge,
  BR_COLORS,
  BR_BORDER,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../components/brutal';

type Status = { is_premium?: boolean; tier?: string; plan?: string; premium_until?: string } | null;

type Tool = {
  id: string;
  title: string;
  desc: string;
  icon: any;
  tint: string;
  action: () => void;
  badge?: 'NEW' | 'PRO' | 'AI';
};

export default function PremiumHubScreen() {
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await fetchPremiumStatus();
      setStatus(data);
    } catch { setStatus({ is_premium: false }); }
  };

  useEffect(() => { (async () => { await fetchStatus(); setLoading(false); })(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchStatus(); setRefreshing(false); };

  const isPremium = !!status?.is_premium;

  const tools: Tool[] = [
    { id: 'reports', title: 'Deep Reports',  desc: 'Personalised analytics + downloadable PDF.', icon: 'stats-chart',     tint: PALETTE.brand,   action: () => router.push('/premium-reports' as any), badge: 'NEW' },
    { id: 'coach',   title: 'AI Smart Coach', desc: 'Unlimited GPT-5.2 chats · priority queue.',  icon: 'chatbubbles',     tint: PALETTE.purple,  action: () => router.push('/(tabs)' as any),          badge: 'AI' },
    { id: 'tax',     title: 'Tax Planner',    desc: 'New vs Old regime · 80C/80D · ITR-ready.',    icon: 'receipt',         tint: PALETTE.cyan,    action: () => router.push('/premium/tax' as any) },
    { id: 'invest',  title: 'Investment Plan', desc: 'SIP allocation · risk profile · funds.',     icon: 'trending-up',     tint: PALETTE.lime,    action: () => router.push('/premium/invest' as any) },
    { id: 'school',  title: 'Money School',   desc: '60-second daily lessons, Indian context.',   icon: 'school',          tint: PALETTE.yellow,  action: () => router.push('/money-school' as any) },
    { id: 'cat',     title: 'Auto-Categorise', desc: 'Budgets & txns sorted by AI — edit taxonomy.', icon: 'sparkles',     tint: PALETTE.peach,   action: () => router.push('/(tabs)/budget' as any),  badge: 'AI' },
    { id: 'badges',  title: 'Badges & Rewards', desc: 'Saffron badges, leaderboard, share cards.',  icon: 'trophy',         tint: PALETTE.warm,    action: () => router.push('/(tabs)/profile' as any) },
    { id: 'support', title: 'Priority Support', desc: 'Skip the queue · email & in-app chat.',      icon: 'shield-checkmark', tint: PALETTE.lavender, action: () => router.push('/(tabs)/profile' as any) },
  ];

  if (loading) return (
    <SafeAreaView style={s.bg} edges={['top']}>
      <PremiumHubSkeleton />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.bg} edges={['top']}>
      {/* Brutal header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.headerBtn} testID="premium-hub-back">
          <Ionicons name="chevron-back" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>PREMIUM HUB</Text>
          <Text style={s.headerSub}>{isPremium ? 'ALL TOOLS UNLOCKED' : 'PREVIEW · UPGRADE TO ACCESS'}</Text>
        </View>
        <BrutalBadge label={isPremium ? 'ACTIVE' : 'LOCKED'} tone={isPremium ? 'positive' : 'paper'} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: BR_SPACE['4'], paddingBottom: 60, gap: BR_SPACE['3'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BR_COLORS.ink} />}
      >
        <StaggeredEntrance delayMs={70} duration={420} distance={14}>
          {!isPremium ? (
            <LockedState onUnlock={() => router.push('/(tabs)/profile' as any)} />
          ) : (
            <BrutalCard variant="purple" style={s.activeHero}>
              <View style={s.activeHeroTop}>
                <View style={s.diamondBox}>
                  <Ionicons name="diamond" size={22} color={BR_COLORS.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.activeTitle}>YOU'RE PREMIUM ✨</Text>
                  <Text style={s.activeSub}>
                    {String(status?.plan || 'Premium').toUpperCase()}
                    {status?.premium_until ? ` · UNTIL ${new Date(status.premium_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase()}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={s.activeBody}>
                All {tools.length} premium tools are unlocked. Tap any tile to start.
              </Text>
            </BrutalCard>
          )}

          {/* Tools grid */}
          <Text style={s.sectionTitle}>PREMIUM TOOLS</Text>
          <View style={s.grid}>
            {tools.map((t) => (
              <ToolTile
                key={t.id}
                tool={t}
                locked={!isPremium}
                onLockedTap={() => router.push('/(tabs)/profile' as any)}
              />
            ))}
          </View>

          {/* Featured stack */}
          {isPremium ? (
            <>
              <Text style={[s.sectionTitle, { marginTop: BR_SPACE['3'] }]}>FEATURED</Text>
              <PremiumCardStack />
            </>
          ) : null}

          {/* Perk strip */}
          <BrutalCard variant="lime" style={s.perkStrip}>
            <Ionicons name="shield-checkmark" size={18} color={BR_COLORS.ink} />
            <Text style={s.perkStripTxt}>
              Zero ads, priority AI queue, unlimited chats — always-on for premium members.
            </Text>
          </BrutalCard>
        </StaggeredEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}

function LockedState({ onUnlock }: { onUnlock: () => void }) {
  return (
    <BrutalCard variant="hero" style={s.lockedHero}>
      <View style={s.lockBig}>
        <Ionicons name="lock-closed" size={34} color={BR_COLORS.ink} />
      </View>
      <Text style={s.lockedTitle}>PREMIUM TOOLS ARE LOCKED</Text>
      <Text style={s.lockedBody}>
        Unlock AI Coach, Deep Reports, Tax & Investment planners, Money School and more.
        Subscription lives in your Profile — pay once, access forever.
      </Text>
      <BrutalButton
        label="GO TO PROFILE → UNLOCK"
        tone="accent"
        size="lg"
        icon="lock-open"
        trailingIcon="arrow-forward"
        fullWidth
        onPress={onUnlock}
        testID="premium-hub-unlock"
        style={{ marginTop: BR_SPACE['3'] }}
      />
    </BrutalCard>
  );
}

function ToolTile({
  tool, locked, onLockedTap,
}: { tool: Tool; locked: boolean; onLockedTap: () => void }) {
  return (
    <Pressable
      onPress={locked ? onLockedTap : tool.action}
      style={({ pressed }) => [
        s.tile,
        locked && s.tileLocked,
        pressed && BR_SHADOW.pressShift,
      ]}
      testID={`premium-tool-${tool.id}`}
    >
      <View style={[s.tileIcon, { backgroundColor: locked ? BR_COLORS.bg : tool.tint }]}>
        <Ionicons name={tool.icon} size={20} color={BR_COLORS.ink} />
      </View>
      <Text style={[s.tileTitle, locked && { color: BR_COLORS.textMuted }]} numberOfLines={1}>{tool.title}</Text>
      <Text style={[s.tileDesc, locked && { color: BR_COLORS.textMuted }]} numberOfLines={3}>{tool.desc}</Text>
      {!locked && tool.badge && (
        <View style={s.tileBadge}>
          <Text style={s.tileBadgeTxt}>{tool.badge}</Text>
        </View>
      )}
      {locked && (
        <View style={s.lockOverlay}>
          <Ionicons name="lock-closed" size={12} color={BR_COLORS.ink} />
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.bg,
    gap: BR_SPACE['3'],
  },
  headerBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  headerTitle: { ...BR_FONT.stamp, color: BR_COLORS.ink, fontSize: 14 },
  headerSub: { ...BR_FONT.caption, color: BR_COLORS.textMuted, fontSize: 9, marginTop: 2 },

  // Locked hero
  lockedHero: { alignItems: 'center', paddingVertical: BR_SPACE['6'] },
  lockBig: {
    width: 72, height: 72,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.thick, borderColor: BR_COLORS.ink,
    backgroundColor: PALETTE.warm,
    marginBottom: BR_SPACE['3'],
  },
  lockedTitle: { ...BR_FONT.h2, fontSize: 18, color: BR_COLORS.ink, marginBottom: 6, letterSpacing: 0.5 },
  lockedBody: { color: BR_COLORS.text, fontSize: 13, textAlign: 'center', lineHeight: 19, fontWeight: '500', marginBottom: BR_SPACE['3'] },

  // Active hero
  activeHero: { paddingVertical: BR_SPACE['4'] },
  activeHeroTop: { flexDirection: 'row', alignItems: 'center', gap: BR_SPACE['3'] },
  diamondBox: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  activeTitle: { fontSize: 16, fontWeight: '900', color: BR_COLORS.ink, letterSpacing: 0.3 },
  activeSub: { ...BR_FONT.stamp, fontSize: 10, color: BR_COLORS.ink, marginTop: 4 },
  activeBody: { color: BR_COLORS.ink, fontSize: 13, marginTop: BR_SPACE['3'], fontWeight: '600' },

  sectionTitle: {
    ...BR_FONT.stamp,
    fontSize: 11,
    color: BR_COLORS.textMuted,
    marginTop: BR_SPACE['2'],
    marginBottom: BR_SPACE['2'],
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: BR_SPACE['2'] },
  tile: {
    width: '48.5%',
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE['3'],
    minHeight: 130,
    position: 'relative',
    overflow: 'hidden',
    ...(BR_SHADOW.sm as any),
  },
  tileLocked: { backgroundColor: BR_COLORS.bg },
  tileIcon: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base, borderColor: BR_COLORS.ink,
    marginBottom: 8,
  },
  tileTitle: { fontSize: 13.5, fontWeight: '800', color: BR_COLORS.ink, marginBottom: 4 },
  tileDesc: { fontSize: 11, color: BR_COLORS.text, lineHeight: 15, fontWeight: '500' },
  tileBadge: {
    position: 'absolute', top: 8, right: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: PALETTE.brand,
    borderWidth: BR_BORDER.fine, borderColor: BR_COLORS.ink,
  },
  tileBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  lockOverlay: {
    position: 'absolute', top: 8, right: 8,
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.fine, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },

  perkStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE['3'],
    paddingVertical: BR_SPACE['3'],
    paddingHorizontal: BR_SPACE['3'],
    marginTop: BR_SPACE['3'],
  },
  perkStripTxt: {
    flex: 1, fontSize: 11.5, color: BR_COLORS.ink,
    fontWeight: '700', lineHeight: 16,
  },
});
