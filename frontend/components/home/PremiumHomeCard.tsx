/**
 * PremiumHomeCard — compact premium slab that lives on the Home screen
 * right below the greeting + avatar, per the design ask:
 *
 *   "Move all the benefits tabs of the 'go premium' to the home section
 *    inside an expandable premium card next to profile avatar which can
 *    be unlocked post payments ONLY - showcase it locked for the free category"
 *
 * Free users see a LOCKED state: benefits list with a lock on each + Upgrade CTA.
 * Premium users see an UNLOCKED state: same benefits with green checks +
 * quick-access "Deep Reports" & "Manage plan" actions.
 *
 * Tap the header row to collapse / expand.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../../utils/api';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, useAppColors } from '../../utils/theme';

type Status = { is_premium?: boolean; tier?: string; plan?: string; premium_until?: string } | null;

const PERKS: { icon: any; title: string; sub: string }[] = [
  { icon: 'chatbubbles',   title: 'Personalised AI Coach',       sub: 'Unlimited GPT-5.2 chats, no queue' },
  { icon: 'sparkles',      title: 'Auto-categorisation (AI)',    sub: 'Budgets & txns sorted intelligently' },
  { icon: 'stats-chart',   title: 'Deep analytics reports',      sub: 'Downloadable PDF with graphs & tables' },
  { icon: 'receipt',       title: 'Tax & investment planner',    sub: 'New vs Old regime + SIP allocator' },
  { icon: 'school',        title: 'Money School lessons',        sub: 'Daily 60-sec finance lessons' },
  { icon: 'trophy',        title: 'Exclusive badges & leaderboard', sub: 'Shareable score cards' },
  { icon: 'shield-checkmark', title: 'Zero ads · Priority support', sub: 'Skip the queue, forever' },
];

function PremiumHomeCard() {
  const s = useStyles();
  const c = useAppColors();
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/premium/status');
        if (mounted) setStatus(res.data);
      } catch { if (mounted) setStatus({ is_premium: false }); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <View style={s.skeleton} />;

  const isPremium = !!status?.is_premium;

  // ── Header ─────────────────────────────────────────────────────────
  const headerColors: [string, string] = isPremium ? [COLORS.accent.brand, COLORS.accent.brandDark] : ['#1F2937', '#0F172A'];
  const header = (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => setExpanded(v => !v)}
      testID="premium-home-card-header"
    >
      <LinearGradient colors={headerColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <View style={[s.iconBadge, isPremium ? s.iconBadgePremium : s.iconBadgeLocked]}>
          <Ionicons name={isPremium ? 'diamond' : 'flash'} size={20} color={COLORS.accent.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>
            {isPremium ? 'Premium · active' : 'Financial Superpowers'}
          </Text>
          <Text style={s.headerSub} numberOfLines={1}>
            {isPremium
              ? `${PERKS.length} features unlocked · tap to view`
              : `Explore Pro · ${PERKS.length} upgrades await`}
          </Text>
        </View>
        {!isPremium && (
          <View style={s.lockBadge}><Text style={s.lockBadgeTxt}>PRO</Text></View>
        )}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#FFFFFF" />
      </LinearGradient>
    </TouchableOpacity>
  );

  if (!expanded) return <View style={s.wrap}>{header}</View>;

  // ── Expanded body ──────────────────────────────────────────────────
  return (
    <View style={s.wrap}>
      {header}
      <View style={s.body}>
        {/* Perks list */}
        {PERKS.map((p, i) => (
          <View key={p.title} style={[s.perkRow, i !== 0 && s.perkBorder]}>
            <View style={[s.perkIcon, isPremium ? s.perkIconOn : s.perkIconOff]}>
              <Ionicons name={p.icon} size={16} color={isPremium ? COLORS.accent.brand : COLORS.text.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.perkTitle, !isPremium && s.lockedText]}>{p.title}</Text>
              <Text style={[s.perkSub, !isPremium && s.lockedSub]} numberOfLines={2}>{p.sub}</Text>
            </View>
            {isPremium
              ? <Ionicons name="checkmark-circle" size={18} color={c.state.success} />
              : <Ionicons name="lock-closed" size={14} color={c.text.muted} />}
          </View>
        ))}

        {/* CTA row */}
        {isPremium ? (
          <View style={s.ctaRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/premium-hub' as any)}
              style={[s.primaryCta, { flex: 1 }]}
              testID="premium-home-hub"
            >
              <LinearGradient colors={[COLORS.accent.brand, COLORS.accent.brandDark]} style={s.ctaGrad}>
                <Ionicons name="grid" size={16} color="#FFFFFF" />
                <Text style={s.ctaText}>Open Premium Hub</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/premium-hub' as any)}
              style={s.primaryCta}
              testID="premium-home-hub-locked"
            >
              <LinearGradient colors={[COLORS.accent.brand, COLORS.accent.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ctaGrad}>
                <Ionicons name="grid" size={16} color="#FFFFFF" />
                <Text style={s.ctaText}>Open Premium Hub</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/profile' as any)}
              style={s.secondaryCtaFull}
              testID="premium-home-card-cta"
            >
              <Ionicons name="lock-open" size={14} color="#7C2D12" />
              <Text style={s.secondaryCtaFullTxt}>Unlock in Profile →</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { marginBottom: 14, borderRadius: 18, overflow: 'hidden' },
  skeleton: { height: 62, borderRadius: 18, backgroundColor: c.gray[100], marginBottom: 14 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  iconBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  iconBadgePremium: { backgroundColor: c.bg.elevated },
  iconBadgeLocked: { backgroundColor: 'rgba(245,110,30,0.16)', borderWidth: 1, borderColor: 'rgba(245,110,30,0.4)' },
  headerTitle: { color: c.bg.elevated, fontSize: 15, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  lockBadge: { backgroundColor: c.accent.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  lockBadgeTxt: { color: c.bg.elevated, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },

  body: { backgroundColor: c.bg.elevated, padding: 12, borderTopWidth: 1, borderTopColor: c.gray[100] },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  perkBorder: { borderTopWidth: 1, borderTopColor: c.gray[50] },
  perkIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  perkIconOn: { backgroundColor: c.accent.brandSoft },
  perkIconOff: { backgroundColor: c.gray[100] },
  perkTitle: { fontSize: 13, fontWeight: '700', color: c.text.primary },
  perkSub: { fontSize: 11, color: c.text.muted, marginTop: 1 },
  lockedText: { color: c.text.muted },
  lockedSub: { color: c.gray[400] },

  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  primaryCta: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 16 },
  ctaText: { color: c.bg.elevated, fontWeight: '800', fontSize: 13.5, letterSpacing: 0.2 },
  secondaryCta: { backgroundColor: c.gray[100], paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryCtaTxt: { color: c.text.primary, fontWeight: '800', fontSize: 13.5 },
  secondaryCtaFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, marginTop: 8,
    backgroundColor: c.accent.brandSoft, borderWidth: 1, borderColor: '#FED7AA',
  },
  secondaryCtaFullTxt: { color: '#7C2D12', fontWeight: '800', fontSize: 12.5 },
}));

// Round 43 perf — memoized so unrelated parent state changes don't re-render this widget.
export default React.memo(PremiumHomeCard);
