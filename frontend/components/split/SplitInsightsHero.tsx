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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';
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

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Ionicons name="sparkles" size={13} color={COLORS.accent.primary} />
        <Text style={s.heading}>SPLIT INSIGHTS</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={192}
        decelerationRate="fast"
        contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
      >
        {cards.map((c, i) => <AnimatedCard key={c.id} card={c} index={i} />)}
      </ScrollView>
    </View>
  );
}

// Fallback shown if user has zero activity OR the API fails silently
const DEFAULT_ZERO_STATE: InsightCard[] = [
  {
    id: 'welcome',
    emoji: '✨',
    title: 'Start splitting',
    subtitle: 'Create a group and add your first expense — we\'ll do the math',
    color: '#F56E1E',
  },
  {
    id: 'how',
    emoji: '🪙',
    title: 'Earn coins',
    subtitle: 'Every settlement earns MintU coins you can redeem for vouchers',
    color: '#10B981',
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
    <Animated.View style={[s.card, { transform: [{ scale }], opacity, borderColor: card.color + '44' }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={press} style={{ flex: 1 }} testID={`insight-${card.id}`}>
        <LinearGradient
          colors={[card.color + '16', card.color + '06']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.cardInner}
        >
          <View style={[s.emojiPill, { backgroundColor: card.color + '22' }]}>
            <Text style={s.emoji}>{card.emoji}</Text>
          </View>
          <Text style={[s.title, { color: card.color }]} numberOfLines={1}>{card.title}</Text>
          <Text style={s.subtitle} numberOfLines={3}>{card.subtitle}</Text>
        </LinearGradient>
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
  card: {
    width: 182,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: c.bg.secondary,
    overflow: 'hidden',
  },
  cardInner: { padding: 12, minHeight: 110, gap: 5 },
  emojiPill: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 3,
  },
  emoji: { fontSize: 18 },
  title: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: c.text.secondary, lineHeight: 15 },
}));
