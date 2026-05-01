import { makeStyles } from '../utils/makeStyles';
/**
 * Gen-Z onboarding — chunky type, bold orange, playful doodles, spring transitions.
 * Keeps MintU's saffron palette but borrows the Toing-style energy:
 *  • Huge 48pt headlines with tight letter-spacing
 *  • Solid vibrant backgrounds per slide (slight tint shift)
 *  • Floating emoji doodles (parallax on scroll)
 *  • Chunky rounded CTA with bottom-shadow
 *  • Page dots grow + pulse on active
 */
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, FlatList, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLangStore } from '../store/langStore';
import { t } from '../utils/i18n';
import ConfettiBurst from '../components/ConfettiBurst';
import { COLORS } from '../utils/theme';
import { STORAGE } from '../constants/storage';

const { width, height } = Dimensions.get('window');

// Page-level tints — stays within MintU's saffron family but each slide has a shift.
const SLIDE_BG = ['#FFEFDC', '#FFF7ED', '#FFE9CF'];
const ACCENT = COLORS.accent.brand;
const ACCENT_DEEP = COLORS.accent.brandDark;

type Slide = { id: string; emoji: string; title: string; sub: string; doodles: string[] };

const S: Slide[] = [
  {
    id: '1',
    emoji: '💸',
    title: 'Money moves,\nminus the mess.',
    sub: 'Track every rupee without lifting a finger. Yes, auto-import bank SMS + Gmail.',
    doodles: ['✨', '💳', '🎉', '★'],
  },
  {
    id: '2',
    emoji: '🧠',
    title: 'AI that actually\nspends smart.',
    sub: 'Budgets that adjust themselves. Alerts before you overspend. Insights that slap.',
    doodles: ['🔥', '⚡', '💡', '◆'],
  },
  {
    id: '3',
    emoji: '🏆',
    title: 'Split, settle,\nearn coins.',
    sub: 'Group expenses, instant UPI, real rewards. Pay the bill, unlock the flex.',
    doodles: ['🪙', '💪', '⭐', '🚀'],
  },
];

export default function Onboarding() {
  const s = useStyles();
  const [idx, setIdx] = useState(0);
  const [burstKey, setBurstKey] = useState(0);        // increments on last-slide entry → re-fires confetti
  const hasBurstedRef = useRef(false);
  const { lang } = useLangStore();
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);

  const complete = async () => {
    await AsyncStorage.setItem(STORAGE.ONBOARDING_SEEN, 'true');
    router.replace('/auth' as any);
  };

  const go = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (idx < S.length - 1) {
      listRef.current?.scrollToOffset({ offset: (idx + 1) * width, animated: true });
      setIdx(idx + 1);
    } else {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      complete();
    }
  };

  const skip = () => { try { Haptics.selectionAsync(); } catch {} complete(); };

  // Fire confetti the first time user reaches the final slide (3 of 3)
  useEffect(() => {
    if (idx === S.length - 1 && !hasBurstedRef.current) {
      hasBurstedRef.current = true;
      setBurstKey((k) => k + 1);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
  }, [idx]);

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const scale = scrollX.interpolate({ inputRange, outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' });
    const rotate = scrollX.interpolate({ inputRange, outputRange: ['-12deg', '0deg', '12deg'], extrapolate: 'clamp' });
    return (
      <View style={[s.slide, { width, backgroundColor: SLIDE_BG[index % SLIDE_BG.length] }]}>
        {/* Floating doodles — parallax via scrollX */}
        {item.doodles.map((em, i) => {
          const top = 90 + (i * 85) + ((i % 2) * 30);
          const left = (i % 2 === 0 ? 32 : width - 72) + ((i % 3) * 8);
          const offY = scrollX.interpolate({ inputRange, outputRange: [20, 0, -20], extrapolate: 'clamp' });
          return (
            <Animated.Text
              key={i}
              style={[s.doodle, { top, left, transform: [{ translateY: offY }] }]}
            >{em}</Animated.Text>
          );
        })}

        {/* Hero emoji puck */}
        <Animated.View style={[s.hero, { transform: [{ scale }, { rotate }] }]}>
          <View style={s.heroInner}><Text style={s.heroEmoji}>{item.emoji}</Text></View>
        </Animated.View>

        <View style={s.copy}>
          <Text style={s.title}>{item.title}</Text>
          <Text style={s.sub}>{item.sub}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <TouchableOpacity style={s.skip} onPress={skip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={s.skipT}>{t('skip', lang)}</Text>
      </TouchableOpacity>

      <Animated.FlatList
        ref={listRef as any}
        data={S}
        renderItem={renderSlide}
        keyExtractor={(it) => it.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: Platform.OS !== 'web' })}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={16}
      />

      {/* 🎉 Confetti burst — one-shot when user lands on the last slide */}
      {burstKey > 0 && <ConfettiBurst trigger={burstKey} particles={30} />}

      {/* Footer — dots + chunky CTA */}
      <View style={s.footer}>
        <View style={s.dots}>
          {S.map((_, i) => {
            const active = i === idx;
            return (
              <View
                key={i}
                style={[s.dot, active && s.dotActive]}
              />
            );
          })}
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={go} style={s.cta}>
          <Text style={s.ctaT}>{idx === S.length - 1 ? "Let's gooo 🚀" : t('next', lang)}</Text>
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.tos}>By continuing you agree to our <Text style={s.tosLink}>Terms</Text> & <Text style={s.tosLink}>Privacy</Text></Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.accent.brandSoft },
  skip: { position: 'absolute', top: 58, right: 22, zIndex: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)' },
  skipT: { fontSize: 13, color: '#7C2D12', fontWeight: '800', letterSpacing: 0.3 },

  slide: { flex: 1, alignItems: 'center', paddingTop: height * 0.14, paddingHorizontal: 28 },

  doodle: { position: 'absolute', fontSize: 24, opacity: 0.85 },

  hero: { alignItems: 'center', marginTop: 16, marginBottom: 36 },
  heroInner: {
    width: 220, height: 220, borderRadius: 44,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    shadowColor: ACCENT_DEEP, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 18,
  },
  heroEmoji: { fontSize: 112, transform: [{ rotate: '4deg' }] },

  copy: { alignItems: 'center', paddingHorizontal: 4 },
  title: { fontSize: 36, fontWeight: '900', color: '#1F0A02', textAlign: 'center', letterSpacing: -1.2, lineHeight: 42 },
  sub: { fontSize: 15, color: '#6B3E1F', textAlign: 'center', marginTop: 14, lineHeight: 22, paddingHorizontal: 12 },

  footer: { paddingHorizontal: 22, paddingBottom: 36, paddingTop: 8, gap: 16 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1C3B5' },
  dotActive: { width: 26, backgroundColor: ACCENT },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: ACCENT, borderRadius: 22, paddingVertical: 18,
    shadowColor: ACCENT_DEEP, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  ctaT: { color: c.bg.elevated, fontSize: 17, fontWeight: '900', letterSpacing: 0.4 },

  tos: { textAlign: 'center', fontSize: 11, color: c.gray[400], marginTop: 6 },
  tosLink: { color: ACCENT_DEEP, fontWeight: '700' },
}));
