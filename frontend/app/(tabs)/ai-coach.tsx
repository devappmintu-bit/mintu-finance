/**
 * AI Coach tab — INSIGHT-DRIVEN UI (v3 redesign).
 *
 * Replaces the pure chat bubble UX with a curated stream of AI-generated
 * insights powered by existing backend endpoints. Users scan 4-6 glanceable
 * `InsightCard`s that answer: "What matters with my money RIGHT NOW?"
 *
 * Each card surfaces a real number + a playful human tone + a CTA deep-link.
 *
 * The existing conversational AICoachChat is still accessible via a floating
 * "Ask Mintu anything" NeonButton that opens it in a full-screen sheet.
 *
 * Data sources (all existing, no new backend work):
 *   • /api/stats/overview           → pulse (weekly spend vs last week)
 *   • /api/waste-detector           → wasteful subscriptions found
 *   • /api/budgets/live             → budget health
 *   • /api/split/insights           → group balance analytics
 *   • /api/gamification/status      → streak + rank
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Modal, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AICoachChat from '../../components/AICoachChat';
import InsightCard from '../../components/ui/InsightCard';
import NeonButton from '../../components/ui/NeonButton';
import GlowPill from '../../components/ui/GlowPill';
import Skeleton from '../../components/ui/Skeleton';
import ThinkingDots from '../../components/ui/ThinkingDots';
import { COLORS, FONT_FAMILY, GRADIENT, SPACING, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import api from '../../utils/api';
import { useIsOnline } from '../../hooks/useIsOnline';
import TaxCalculator from '../../components/premium/TaxCalculator';
import InvestmentSuggester from '../../components/premium/InvestmentSuggester';
import PremiumUnlockTeaser from '../../components/premium/PremiumUnlockTeaser';
import { useActivePlan, FEATURES, canAccess } from '../../utils/premium';
import MascotMoment from '../../components/MascotMoment';

type Pulse = {
  currency_week_total?: number;
  delta_pct?: number;
  top_category?: string;
  top_category_amount?: number;
  saving_this_month?: number;
  streak_days?: number;
};

// Friendly, mildly-cheeky copy — never preachy
const LOAD_HELLOS = [
  'Reading your money vibes…',
  'Crunching the numbers…',
  'Brewing fresh insights…',
];

function pickHello() {
  return LOAD_HELLOS[Math.floor(Math.random() * LOAD_HELLOS.length)];
}

function AICoachTab() {
  const s = useStyles();
  const c = useAppColors();
  const isOnline = useIsOnline();
  const [activeTab, setActiveTab] = useState<'insights' | 'tax' | 'invest' | 'school'>('insights');
  const [plan] = useActivePlan();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [waste, setWaste] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [gami, setGami] = useState<any>(null);
  const [helloMsg] = useState(pickHello());

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    // Parallel — we want all insights at once, don't block on one slow endpoint.
    const [s, w, b, g] = await Promise.allSettled([
      api.get('/stats/overview').then(r => r.data),
      api.get('/waste-detector').then(r => r.data),
      api.get('/budgets/live').then(r => r.data),
      api.get('/gamification/status').then(r => r.data),
    ]);

    setStats(s.status === 'fulfilled' ? s.value : null);
    setWaste(w.status === 'fulfilled' ? w.value : null);
    setBudgets(b.status === 'fulfilled' ? (b.value?.items || []) : []);
    setGami(g.status === 'fulfilled' ? g.value : null);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Derive punchy insights from raw stats
  const pulse: Pulse = useMemo(() => ({
    currency_week_total: stats?.week_spent || 0,
    delta_pct: stats?.delta_pct || 0,
    top_category: stats?.top_category,
    top_category_amount: stats?.top_category_amount,
    saving_this_month: stats?.month_saved || 0,
    streak_days: gami?.streak_days || 0,
  }), [stats, gami]);

  const budgetAlert = useMemo(() => {
    if (!budgets?.length) return null;
    const over = budgets.find((b: any) => b.percent > 90);
    return over || null;
  }, [budgets]);

  const wastedAmt = waste?.total_wasted || 0;
  const wasteCount = waste?.items?.length || 0;

  // Format currency compactly (Indian format)
  const fmtINR = (n: number) => {
    if (!n && n !== 0) return '—';
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${Math.round(n)}`;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Round 53l — MintU Personality burst on tab focus.
          The coach surface gets the bigger, expressive moment
          (vs the slim home variant). The mascot stays visible so
          users feel an "assistant is awake" beat. */}
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: 4, paddingBottom: 4 }}>
        <MascotMoment mode="coach" autoDismissMs={0} />
      </View>

      {/* Tab strip — Insights / Tax / Invest / School */}
      <View style={s.tabStrip}>
        {([
          { id: 'insights', emoji: '🧠', label: 'Insights', feature: undefined },
          { id: 'tax',      emoji: '🧾', label: 'Tax',      feature: FEATURES.TAX_CALCULATOR },
          { id: 'invest',   emoji: '💰', label: 'Invest',   feature: FEATURES.INVESTMENT_SUGGESTER },
          { id: 'school',   emoji: '🎓', label: 'School',   feature: FEATURES.MONEY_SCHOOL },
        ] as const).map(t => {
          // top-right of the icon when the feature is gated and the
          // user isn't on a qualifying plan. Keeps the row tight on
          // 360-px viewports (no extra inline pill that would push
          // the label off-screen).
          const locked = !!t.feature && !canAccess(t.feature, plan);
          return (
          <TouchableOpacity
            key={t.id}
            onPress={() => setActiveTab(t.id)}
            style={[s.tabItem, activeTab === t.id && s.tabItemActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === t.id }}
            accessibilityLabel={locked ? `${t.label} (Premium)` : t.label}
          >
            <View>
              <Text style={s.tabEmoji}>{t.emoji}</Text>
              {locked && <View style={s.tabLockDot} />}
            </View>
            <Text
              style={[s.tabLabel, activeTab === t.id && s.tabLabelActive]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
          );
        })}
      </View>

      {/* Non-insights tabs render their own scroll views */}
      {activeTab === 'tax' && (
        <View style={{ flex: 1 }}>
          {canAccess(FEATURES.TAX_CALCULATOR, plan) ? (
            <TaxCalculator />
          ) : (
            <View style={s.lockedWrap}>
              <PremiumUnlockTeaser context="tax_calculator" />
              <Text style={s.lockedHint}>Upgrade to unlock the Old vs New regime calculator and save up to ₹1.5 L every year.</Text>
            </View>
          )}
        </View>
      )}
      {activeTab === 'invest' && (
        <View style={{ flex: 1 }}>
          {canAccess(FEATURES.INVESTMENT_SUGGESTER, plan) ? (
            <InvestmentSuggester />
          ) : (
            <View style={s.lockedWrap}>
              <PremiumUnlockTeaser context="investment_suggester" />
              <Text style={s.lockedHint}>Upgrade for personalised SIP & mutual-fund picks based on your actual income and risk profile.</Text>
            </View>
          )}
        </View>
      )}
      {activeTab === 'school' && (
        <View style={{ flex: 1 }}>
          {canAccess(FEATURES.MONEY_SCHOOL, plan) ? (
            <TouchableOpacity
              style={s.schoolCta}
              onPress={() => router.push('/money-school' as any)}
              activeOpacity={0.85}
            >
              <Text style={s.schoolCtaEmoji}>🎓</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.schoolCtaTitle}>Money School</Text>
                <Text style={s.schoolCtaSub}>Daily 60-second finance lessons in Indian context — SIPs, PPF, tax saving & more.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.accent.primary} />
            </TouchableOpacity>
          ) : (
            // Round 52b — Money School is yearly-tier only. Show the
            // teaser + a hint instead of routing into a screen the
            // user can't actually use. Keeps the upsell in flow.
            <View style={s.lockedWrap}>
              <TouchableOpacity
                style={s.schoolCta}
                onPress={() => router.push('/premium' as any)}
                activeOpacity={0.85}
              >
                <Text style={s.schoolCtaEmoji}>🎓</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.schoolCtaTitle}>Money School</Text>
                    <View style={s.proPill}>
                      <Ionicons name="diamond" size={9} color="#FFB020" />
                      <Text style={s.proPillT}>PRO</Text>
                    </View>
                  </View>
                  <Text style={s.schoolCtaSub}>Daily 60-second lessons — SIPs, PPF, tax saving & more. Unlock with Pro Yearly.</Text>
                </View>
                <Ionicons name="lock-closed" size={16} color={COLORS.accent.primary} />
              </TouchableOpacity>
              <Text style={s.lockedHint}>Money School is part of Pro Yearly. Tap above to compare plans.</Text>
            </View>
          )}
        </View>
      )}

      {activeTab !== 'insights' ? null : <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAll(true)}
            tintColor={COLORS.accent.primary}
            colors={[COLORS.accent.primary]}
          />
        }
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.kicker}>AI COACH</Text>
            <Text style={s.title}>Hey, let's talk{'\n'}money 💬</Text>
          </View>
          <View style={s.headerPills}>
            {/* Round 36 — explicit "Regenerate" button. Pull-to-refresh on a
                non-list screen isn't discoverable; a tappable icon is. */}
            <TouchableOpacity
              testID="ai-regenerate-btn"
              accessibilityRole="button"
              accessibilityLabel="Refresh insights"
              onPress={() => !loading && loadAll(true)}
              disabled={loading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[s.regenBtn, loading && { opacity: 0.5 }]}
              activeOpacity={0.7}
            >
              <Ionicons
                name="refresh"
                size={18}
                color={COLORS.accent.primary}
              />
              <Text style={s.regenTxt}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
            </TouchableOpacity>
            <GlowPill label="LIVE" tone="danger" pulse />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.subtitle}>{loading ? helloMsg : 'Your personalised money pulse, fresh.'}</Text>
          {loading && <ThinkingDots />}
        </View>

        {/* Round 42 — offline card. AI Coach needs the network to fetch
            insights and to call the LLM, so we show a clear non-blocking
            note instead of letting requests fail silently. */}
        {!isOnline && (
          <View style={s.offlineCard} testID="ai-coach-offline">
            <Ionicons name="cloud-offline" size={20} color={c.state.warning} />
            <View style={{ flex: 1 }}>
              <Text style={s.offlineTitle}>You're offline</Text>
              <Text style={s.offlineSub}>Insights and chat will resume once you reconnect. Showing cached data when available.</Text>
            </View>
          </View>
        )}

        {/* Loading skeleton */}
        {loading && (
          <View style={{ gap: 14, marginTop: SPACING.md }}>
            <Skeleton.Box h={160} radius={24} />
            <Skeleton.Box h={140} radius={24} />
            <Skeleton.Box h={140} radius={24} />
          </View>
        )}

        {!loading && (
          <View style={{ gap: 14, marginTop: SPACING.md }}>
            {/* Pulse — hero insight */}
            <InsightCard
              icon="pulse"
              tag="MONEY PULSE"
              tagTone="neon"
              bigValue={fmtINR(pulse.currency_week_total || 0)}
              bigValueSuffix="this week"
              headline={
                (pulse.delta_pct || 0) < 0
                  ? `Down ${Math.abs(Math.round(pulse.delta_pct || 0))}% vs last week 🎯`
                  : (pulse.delta_pct || 0) > 0
                  ? `Up ${Math.round(pulse.delta_pct || 0)}% vs last week — keep an eye`
                  : 'Holding steady vs last week'
              }
              body={pulse.top_category ? `Your ${pulse.top_category} spend is leading the pack at ${fmtINR(pulse.top_category_amount || 0)}.` : 'Building your pattern — add a few more transactions and I\'ll tell you more.'}
              ctaLabel="See full breakdown"
              onPressCta={() => router.push('/premium-reports' as any)}
            />

            {/* Budget alert — only if over 90% */}
            {budgetAlert && (
              <InsightCard
                icon="flash"
                tag="BUDGET HEAT"
                tagTone="warning"
                bigValue={`${Math.round(budgetAlert.percent)}%`}
                bigValueSuffix={budgetAlert.category}
                headline={`You're cooking close to your ${budgetAlert.category} limit 🔥`}
                body={`${fmtINR(budgetAlert.spent)} spent of ${fmtINR(budgetAlert.budget)}. A ${fmtINR(budgetAlert.budget - budgetAlert.spent)} breather left for the month.`}
                ctaLabel="Open budget"
                onPressCta={() => router.push('/(tabs)/budget')}
                gradientStops={GRADIENT.moneyOut}
              />
            )}

            {/* Waste detector */}
            {wasteCount > 0 && (
              <InsightCard
                icon="trash-bin"
                tag="WASTE WATCH"
                tagTone="danger"
                bigValue={fmtINR(wastedAmt)}
                bigValueSuffix={`in ${wasteCount} leaks`}
                headline="Subscriptions you're barely using 💸"
                body="Cancel any of these and pocket the cash. I'll help you decide."
                ctaLabel="Review leaks"
                onPressCta={() => router.push('/(tabs)/transactions')}
                gradientStops={GRADIENT.moneyOut}
              />
            )}

            {/* Streak — gamification */}
            {(pulse.streak_days || 0) > 2 && (
              <InsightCard
                icon="flame"
                tag="STREAK"
                tagTone="success"
                bigValue={String(pulse.streak_days)}
                bigValueSuffix={`day${pulse.streak_days === 1 ? '' : 's'} on fire`}
                headline="You're building a habit 🔥"
                body="Consistency is where real wealth starts. Log a transaction today to keep it alive."
                ctaLabel="Log one now"
                onPressCta={() => router.push('/(tabs)/transactions')}
                gradientStops={GRADIENT.success}
              />
            )}

            {/* Savings nudge */}
            {(pulse.saving_this_month || 0) > 0 && (
              <InsightCard
                icon="trending-up"
                tag="SAVINGS WIN"
                tagTone="success"
                bigValue={fmtINR(pulse.saving_this_month || 0)}
                bigValueSuffix="saved this month"
                headline="Look at you, silent saver ✨"
                body="Try tucking 20% of this into an SIP. Small moves compound fast."
                ctaLabel="See schools"
                onPressCta={() => router.push('/money-school' as any)}
              />
            )}

            {/* Fallback when all clean */}
            {!budgetAlert && wasteCount === 0 && (pulse.saving_this_month || 0) <= 0 && (
              <InsightCard
                icon="sparkles"
                tag="ALL CLEAR"
                tagTone="success"
                headline="Nothing's on fire today ✌️"
                body="Your money is behaving. Ask me anything below — I'm bored."
              />
            )}
          </View>
        )}

        {/* Ask-anything shortcut */}
        <View style={s.askBox}>
          <View style={{ flex: 1 }}>
            <Text style={s.askTitle}>Got a money question?</Text>
            <Text style={s.askSub}>{!isOnline ? "Offline — connect to chat with Mintu" : 'I can explain anything — from SIPs to tax tricks.'}</Text>
          </View>
          <NeonButton label={!isOnline ? 'Offline' : 'Ask'} icon="chatbubbles" onPress={() => isOnline && setChatOpen(true)} size="md" pulse={isOnline} disabled={!isOnline} />
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>}

      {/* Full-screen chat sheet */}
      <Modal
        visible={chatOpen}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
        onRequestClose={() => setChatOpen(false)}
      >
        <SafeAreaView style={s.safe} edges={['top']}>
          <AICoachChat onClose={() => setChatOpen(false)} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 120 },

  tabStrip: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    gap: 3,
  },
  tabItemActive: {
    backgroundColor: c.accent.primary + '18',
    borderWidth: 1,
    borderColor: c.accent.primary + '44',
  },
  tabEmoji: { fontSize: 16 },
  tabLabel: { fontSize: 10.5, fontWeight: '700', color: c.text.muted, letterSpacing: 0.3 },
  tabLabelActive: { color: c.accent.primary, fontWeight: '900' },

  schoolCta: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: SPACING.lg, padding: 18,
    backgroundColor: c.bg.secondary,
    borderRadius: 18, borderWidth: 1, borderColor: c.border.subtle,
  },
  schoolCtaEmoji: { fontSize: 32 },
  schoolCtaTitle: { fontSize: 16, fontWeight: '900', color: c.text.primary, letterSpacing: -0.3 },
  schoolCtaSub: { fontSize: 12.5, color: c.text.muted, marginTop: 4, lineHeight: 17 },

  lockedWrap: { padding: SPACING.lg, gap: 14 },
  lockedHint: { fontSize: 13, color: c.text.muted, lineHeight: 19, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 },

  // Round 52b — locked-tab affordance: tiny dot at the top-right
  // of the icon. 8 px diameter — visible at thumb-glance distance
  // but never crowds the 360-px strip.
  tabLockDot: {
    position: 'absolute', top: -2, right: -6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FFB020',
    borderWidth: 1.5, borderColor: c.bg.primary,
  },
  proPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    backgroundColor: 'rgba(255,176,32,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,176,32,0.45)',
  },
  proPillT: { fontSize: 9, fontWeight: '900', color: '#B45309', letterSpacing: 0.4 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  headerPills: { paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.accent.primary + '14',
    borderWidth: 1,
    borderColor: COLORS.accent.primary + '33',
  },
  regenTxt: { fontSize: 12, fontWeight: '700', color: COLORS.accent.primary, letterSpacing: 0.2 },
  kicker: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.4,
    color: c.accent.primary,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontFamily: FONT_FAMILY.black,
    color: c.text.primary,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.regular,
    color: c.text.secondary,
    marginTop: 10,
    marginBottom: 4,
  },
  askBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(26,26,36,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,26,0.3)',
    marginTop: 24,
  },
  askTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.bold,
    color: c.text.primary,
    letterSpacing: -0.2,
  },
  askSub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
    color: c.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  offlineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: c.state.warningBg,
    borderWidth: 1,
    borderColor: c.state.warningBorder,
    marginTop: 12,
  },
  offlineTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: c.state.warning,
  },
  offlineSub: {
    fontSize: 11.5,
    color: c.state.warning,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 16,
    opacity: 0.85,
  },
}));


// Round 41 — wrap with tab-level ErrorBoundary so a crash here
// doesn't blank the whole app; the user sees a Retry CTA instead.
import { withTabBoundary as _wrapTab_AICoachTab } from '../../components/withTabBoundary';
export default _wrapTab_AICoachTab(AICoachTab, 'AI Coach');
