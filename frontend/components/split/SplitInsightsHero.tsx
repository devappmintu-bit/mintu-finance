/**
 * SplitInsightsHero — lively horizontal insights carousel for Split tab.
 *
 * Replaces the static "here are your balances" feel with a scrollable strip of
 * AI-powered fun insights: savings, most-active group, streaks, top debtor/creditor,
 * friends count, and one witty GPT-5.2 fun fact per day.
 *
 * Each card animates in with a scale-in spring on mount, and hover/press gives
 * haptic feedback. Zero-state card gently nudges first-time users.
 *
 * Backend: GET /api/split/insights
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import api from '../../utils/api';
import {  COLORS, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type InsightCard = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  color: string;
};

export default function SplitInsightsHero() {
  const s = useStyles();
  const c = useAppColors();
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/split/insights');
      const got = r.data?.cards || [];
      setCards(got.length > 0 ? got : DEFAULT_ZERO_STATE);
    } catch {
      setCards(DEFAULT_ZERO_STATE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;

  const [featured, ...rest] = cards;

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Ionicons name="sparkles" size={13} color={COLORS.accent.primary} />
        <Text style={s.heading}>SPLIT INSIGHTS</Text>
      </View>

      {/* Featured — full-width hero card */}
      {featured && <FeaturedCard card={featured} />}

      {/* Rest — horizontal strip */}
      {rest.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={192}
          decelerationRate="fast"
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 10 }}
        >
          {rest.map((c, i) => <AnimatedCard key={c.id} card={c} index={i} />)}
        </ScrollView>
      )}
    </View>
  );
}

function FeaturedCard({ card }: { card: InsightCard }) {
  const s = useStyles();
  const c = useAppColors();
  const scale = useRef(new Animated.Value(0.95)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const press = () => { try { Haptics.selectionAsync(); } catch {} };

  return (
    <Animated.View style={[s.featWrap, { transform: [{ scale }], opacity }]}>
      <TouchableOpacity activeOpacity={0.92} onPress={press} testID={`insight-featured-${card.id}`}>
        <View
          style={[s.featCard, { backgroundColor: '#0A0A0A' }]}>
          <View style={s.featBlob} />
          <View style={s.featHeaderRow}>
            <View style={s.featEmojiPill}>
              <Text style={s.featEmoji}>{card.emoji}</Text>
            </View>
            <View style={s.featPill}>
              <Ionicons name="flash" size={10} color="#FFFFFF" />
              <Text style={s.featPillTxt}>FEATURED</Text>
            </View>
          </View>
          <Text style={s.featTitle} numberOfLines={1}>{card.title}</Text>
          <Text style={s.featSubtitle} numberOfLines={3}>{card.subtitle}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Fallback shown if user has zero activity OR the API fails silently
const DEFAULT_ZERO_STATE: InsightCard[] = [
  {
    id: 'welcome',
    emoji: '✨',
    title: 'Start splitting',
    subtitle: 'Create a group and add your first expense — we\'ll do the math',
    color: COLORS.accent.brand,
  },
  {
    id: 'how',
    emoji: '🪙',
    title: 'Earn coins',
    subtitle: 'Every settlement earns MintU coins you can redeem for vouchers',
    color: COLORS.state.successAlt,
  },
  {
    id: 'fun',
    emoji: '🎯',
    title: 'Stay lively',
    subtitle: 'Witty insights, streaks and AI nudges once you start splitting',
    color: '#0EA5E9',
  },
];

function AnimatedCard({ card, index }: { card: InsightCard; index: number }) {
  const s = useStyles();
  const c = useAppColors();
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = index * 80;
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 500,
        delay,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity, index]);

  const press = () => { try { Haptics.selectionAsync(); } catch {} };

  return (
    <Animated.View style={[s.card, { transform: [{ scale }], opacity, borderColor: card.color + '88' }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={press} style={{ flex: 1 }} testID={`insight-${card.id}`}>
        <View
          style={[s.cardInner, { backgroundColor: '#0A0A0A' }]}>
          <View style={[s.emojiPill, { backgroundColor: card.color + '22' }]}>
            <Text style={s.emoji}>{card.emoji}</Text>
          </View>
          <Text style={[s.title, { color: card.color }]} numberOfLines={1}>{card.title}</Text>
          <Text style={s.subtitle} numberOfLines={3}>{card.subtitle}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { marginHorizontal: -16, marginBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, marginBottom: 8 },
  heading: {
    fontSize: 10.5, fontWeight: '900',
    color: c.text.muted, letterSpacing: 1.3,
  },
  // Featured hero card (full-width)
  featWrap: { paddingHorizontal: 16, marginBottom: 4 },
  featCard: {
    borderRadius: 0, padding: 16, gap: 8, overflow: 'hidden', position: 'relative',
    shadowColor: '#000000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  featBlob: { position: 'absolute', top: -40, right: -40, width: 130, height: 130, borderRadius: 0, backgroundColor: 'rgba(255,255,255,0.12)' },
  featHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featEmojiPill: { width: 42, height: 42, borderRadius: 0, backgroundColor: 'rgba(255,255,255,0.26)', alignItems: 'center', justifyContent: 'center' },
  featEmoji: { fontSize: 22 },
  featPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' },
  featPillTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: c.bg.elevated },
  featTitle: { fontSize: 19, fontWeight: '900', color: c.bg.elevated, letterSpacing: -0.4, marginTop: 4 },
  featSubtitle: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.92)', lineHeight: 17 },
  // Compact cards
  // Round 51e — increased card border alpha (`+44` → handled inline as `+88`)
  // and added a subtle elevation/shadow so cards visually separate from
  // the page background instead of melting into it. Width 1.5px gives a
  // crisper edge at 2x DPI than the previous 1px.
  card: {
    width: 182,
    borderRadius: 0,
    borderWidth: 1.5,
    backgroundColor: c.bg.secondary,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardInner: { padding: 12, minHeight: 110, gap: 5 },
  emojiPill: {
    width: 34, height: 34, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 3,
  },
  emoji: { fontSize: 18 },
  title: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: c.text.secondary, lineHeight: 15 },
}));
