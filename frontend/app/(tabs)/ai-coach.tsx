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
import { View, Text, StyleSheet, ScrollView, RefreshControl, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AICoachChat from '../../components/AICoachChat';
import InsightCard from '../../components/ui/InsightCard';
import NeonButton from '../../components/ui/NeonButton';
import GlowPill from '../../components/ui/GlowPill';
import Skeleton from '../../components/ui/Skeleton';
import ThinkingDots from '../../components/ui/ThinkingDots';
import { COLORS, FONT_FAMILY, GRADIENT, SPACING } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import api from '../../utils/api';

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

export default function AICoachTab() {
  const s = useStyles();
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
      <ScrollView
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
            <GlowPill label="LIVE" tone="danger" pulse />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.subtitle}>{loading ? helloMsg : 'Your personalised money pulse, fresh.'}</Text>
          {loading && <ThinkingDots />}
        </View>

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
            <Text style={s.askSub}>I can explain anything — from SIPs to tax tricks.</Text>
          </View>
          <NeonButton label="Ask" icon="chatbubbles" onPress={() => setChatOpen(true)} size="md" pulse />
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

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
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  headerPills: { paddingTop: 8 },
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
}));
