/**
 * Premium Hub — full-screen dashboard of all premium functions.
 *
 * Free users: see a locked empty state with a single CTA that routes to the
 *   Profile → Premium payment card.
 * Premium users: see a grid of actionable tool tiles — each opens the matching
 *   premium feature (Deep Reports, AI Coach, Tax Calculator, Investment
 *   Planner, Money School, Auto-Categorise, WhatsApp Bot, Reports archive).
 *
 * This is the single entry point referenced from the "Premium Hub" card on
 * the Home screen.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../utils/api';
import FullScreenLoader from '../components/FullScreenLoader';
import { fetchPremiumStatus } from '../services/premium';
import { makeStyles } from '../utils/makeStyles';

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
  const s = useStyles();
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = { data: await fetchPremiumStatus() };
      setStatus(res.data);
    } catch { setStatus({ is_premium: false }); }
  };

  useEffect(() => { (async () => { await fetchStatus(); setLoading(false); })(); }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchStatus(); setRefreshing(false); };

  const isPremium = !!status?.is_premium;

  // ── Tools available to premium users ──────────────────────────────
  const tools: Tool[] = [
    { id: 'reports', title: 'Deep Reports', desc: 'Personalised analytics + downloadable PDF with graphs & tables.', icon: 'stats-chart', tint: '#F56E1E', action: () => router.push('/premium-reports' as any), badge: 'NEW' },
    { id: 'coach',   title: 'AI Smart Coach', desc: 'Unlimited GPT-5.2 chats · priority queue · personalised plans.', icon: 'chatbubbles', tint: '#8B5CF6', action: () => router.push('/(tabs)' as any), badge: 'AI' },
    { id: 'tax',     title: 'Tax Planner', desc: 'New vs Old regime · 80C/80D suggestions · ITR-ready export.', icon: 'receipt', tint: '#3B82F6', action: () => router.push('/tax-planner' as any) },
    { id: 'invest',  title: 'Investment Planner', desc: 'SIP allocation · risk profile · fund recommendations.', icon: 'trending-up', tint: '#10B981', action: () => router.push('/invest-planner' as any) },
    { id: 'school',  title: 'Money School', desc: 'Daily 60-second finance lessons, Indian context.', icon: 'school', tint: '#F59E0B', action: () => router.push('/money-school' as any) },
    { id: 'cat',     title: 'Auto-Categorise', desc: 'Budgets & txns sorted by AI — edit the taxonomy.', icon: 'sparkles', tint: '#EC4899', action: () => router.push('/(tabs)/budget' as any), badge: 'AI' },
    { id: 'badges',  title: 'Badges & Rewards', desc: 'Exclusive saffron badges, leaderboard ranks, share cards.', icon: 'trophy', tint: '#EAB308', action: () => router.push('/(tabs)/profile' as any) },
    { id: 'support', title: 'Priority Support', desc: 'Skip the queue · email & in-app chat.', icon: 'shield-checkmark', tint: '#14B8A6', action: () => router.push('/support' as any) },
  ];

  if (loading) return <FullScreenLoader tagline="Loading your premium perks…" />;

  return (
    <SafeAreaView style={s.bg} edges={['top']}>
      {/* Top bar */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="premium-hub-back">
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.topTitle}>Premium Hub</Text>
          <Text style={s.topSub}>{isPremium ? 'All tools unlocked' : 'Locked — upgrade to access'}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: isPremium ? '#10B98118' : '#9CA3AF18', borderColor: isPremium ? '#10B981' : '#D1D5DB' }]}>
          <Ionicons name={isPremium ? 'checkmark-circle' : 'lock-closed'} size={14} color={isPremium ? '#10B981' : '#6B7280'} />
          <Text style={[s.statusTxt, { color: isPremium ? '#047857' : '#374151' }]}>{isPremium ? 'ACTIVE' : 'PREVIEW'}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F56E1E" />}
      >
        {/* Locked state — free users */}
        {!isPremium && (
          <LockedState onUnlock={() => router.push('/(tabs)/profile' as any)} />
        )}

        {/* Active premium hero */}
        {isPremium && (
          <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.activeHero}>
            <View style={s.activeHeroTop}>
              <View style={s.diamondBox}><Ionicons name="diamond" size={22} color="#F56E1E" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.activeTitle}>You're Premium ✨</Text>
                <Text style={s.activeSub}>
                  {String(status?.plan || 'Premium').toUpperCase()}
                  {status?.premium_until ? ` · until ${new Date(status.premium_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </Text>
              </View>
            </View>
            <Text style={s.activeBody}>
              All {tools.length} premium tools are unlocked. Tap any tile to start.
            </Text>
          </LinearGradient>
        )}

        {/* Tools grid */}
        <Text style={s.sectionTitle}>Premium tools</Text>
        <View style={s.grid}>
          {tools.map((t) => (
            <ToolTile key={t.id} tool={t} locked={!isPremium} onLockedTap={() => router.push('/(tabs)/profile' as any)} />
          ))}
        </View>

        {/* Perk strip */}
        <View style={s.perkStrip}>
          <Ionicons name="shield-checkmark" size={18} color="#10B981" />
          <Text style={s.perkStripTxt}>Zero ads, priority AI queue, unlimited chats — always-on for premium members.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function LockedState({ onUnlock }: { onUnlock: () => void }) {
  const s = useStyles();
  return (
    <LinearGradient colors={['#1F2937', '#0F172A']} style={s.lockedHero}>
      <View style={s.lockBig}>
        <Ionicons name="lock-closed" size={34} color="#F56E1E" />
      </View>
      <Text style={s.lockedTitle}>Premium tools are locked</Text>
      <Text style={s.lockedBody}>
        Unlock AI Coach, Deep Reports, Tax & Investment planners, Money School and more.
        Subscription lives in your Profile — pay once, access forever.
      </Text>
      <TouchableOpacity activeOpacity={0.9} onPress={onUnlock} style={s.unlockBtn} testID="premium-hub-unlock">
        <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.unlockGrad}>
          <Ionicons name="lock-open" size={18} color="#fff" />
          <Text style={s.unlockTxt}>Go to Profile → Unlock</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </LinearGradient>
  );
}

function ToolTile({ tool, locked, onLockedTap }: { tool: Tool; locked: boolean; onLockedTap: () => void }) {
  const s = useStyles();
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={locked ? onLockedTap : tool.action}
      style={[s.tile, locked && s.tileLocked]}
      testID={`premium-tool-${tool.id}`}
    >
      <View style={[s.tileIcon, { backgroundColor: locked ? '#F3F4F6' : tool.tint + '18' }]}>
        <Ionicons name={tool.icon} size={20} color={locked ? '#9CA3AF' : tool.tint} />
      </View>

      <Text style={[s.tileTitle, locked && { color: '#6B7280' }]} numberOfLines={1}>{tool.title}</Text>
      <Text style={[s.tileDesc, locked && { color: '#9CA3AF' }]} numberOfLines={3}>{tool.desc}</Text>

      {/* Badge corner */}
      {!locked && tool.badge && (
        <View style={[s.tileBadge, { backgroundColor: tool.badge === 'NEW' ? '#10B981' : tool.badge === 'AI' ? '#8B5CF6' : '#F56E1E' }]}>
          <Text style={s.tileBadgeTxt}>{tool.badge}</Text>
        </View>
      )}

      {/* Locked overlay */}
      {locked && (
        <View style={s.lockOverlay}>
          <Ionicons name="lock-closed" size={14} color="#6B7280" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: '#FAFAF9' },

  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.bg.elevated, borderBottomWidth: 1, borderBottomColor: c.gray[100] },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.gray[100], alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  topSub: { fontSize: 11, color: c.text.muted, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  statusTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Locked hero
  lockedHero: { padding: 22, borderRadius: 18, alignItems: 'center', marginBottom: 20 },
  lockBig: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(245,110,30,0.18)', borderWidth: 2, borderColor: c.accent.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lockedTitle: { color: c.bg.elevated, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  lockedBody: { color: c.gray[300], fontSize: 12.5, textAlign: 'center', lineHeight: 18, marginBottom: 18 },
  unlockBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  unlockGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13 },
  unlockTxt: { color: c.bg.elevated, fontSize: 14, fontWeight: '800' },

  // Active hero
  activeHero: { padding: 16, borderRadius: 18, marginBottom: 18 },
  activeHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  diamondBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  activeTitle: { color: c.bg.elevated, fontSize: 16, fontWeight: '800' },
  activeSub: { color: '#FFE4CC', fontSize: 11, fontWeight: '700', marginTop: 2 },
  activeBody: { color: c.bg.elevated, fontSize: 12.5, marginTop: 10, opacity: 0.9 },

  sectionTitle: { fontSize: 12, fontWeight: '800', color: c.gray[400], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 2 },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', backgroundColor: c.bg.elevated, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.gray[100], position: 'relative', overflow: 'hidden', minHeight: 130 },
  tileLocked: { backgroundColor: '#FAFAF9', borderColor: c.gray[200] },
  tileIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileTitle: { fontSize: 13.5, fontWeight: '800', color: c.text.primary, marginBottom: 4 },
  tileDesc: { fontSize: 11, color: c.text.muted, lineHeight: 15 },
  tileBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tileBadgeTxt: { color: c.bg.elevated, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  lockOverlay: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFFE0', borderWidth: 1, borderColor: c.gray[200], alignItems: 'center', justifyContent: 'center' },

  perkStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#D1FAE5' },
  perkStripTxt: { flex: 1, fontSize: 11.5, color: '#065F46', fontWeight: '600', lineHeight: 16 },
}));
