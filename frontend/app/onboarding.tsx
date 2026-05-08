import { makeStyles } from '../utils/makeStyles';
/**
 * Onboarding — R101B rebuild.
 *
 * Three principles, lifted directly from the artifacts the user shared:
 *
 *   1. "It's the OUTCOME, not the features."  (Mobbin / Soyeon Kim)
 *      Every slide leads with what the user FEELS at the end of the
 *      promise — never with what we built. "We do the math" beats
 *      "SMS-based auto-import"; "split with names" beats "phone-based
 *      pending invites schema."
 *
 *   2. Signup → Setup → AHA → Habit                (Reforge activation
 *      loop). Onboarding's only job is to manufacture the AHA. Three
 *      cards is plenty; copy must accelerate the user toward the first
 *      log/expense, not lecture them on capabilities.
 *
 *   3. The mascot is a Distinctive Brand Asset.    (Brandology, Reena
 *      Jagtap). Mintu shows up on EVERY slide — same character, evolving
 *      mood (curious → thinking → celebrating) — so by the time the
 *      user lands in the app, the mascot is already a friend, not
 *      decoration. No emoji puck; a real mascot illustration.
 *
 * Architecture is unchanged from the prior version (FlatList, parallax
 * doodles, dots + chunky CTA, brutalist tokens). Only copy + the hero
 * surface (emoji → MintuMascot) and a mood progression are new.
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
import Confetti from '../components/Confetti';
import MintuMascot, { MintuMascotState } from '../components/MintuMascot';
import { BR_COLORS, BR_TYPE, BR_FONT, BR_SPACE, BR_BORDER } from '../utils/brutalist';
import { STORAGE } from '../constants/storage';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: BR_COLORS.paper },
  // Skip — R101C: bigger, accent-bordered pill so users can find it
  // even on small phones. Uses safe-area top inset (~58px on iPhone)
  // but adds extra zIndex and a hairline shadow so it's never lost
  // under browser chrome or status bar.
  skip: {
    position: 'absolute', top: 58, right: 22, zIndex: 100,
    paddingHorizontal: BR_SPACE.md, paddingVertical: 8,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    // Hard-offset stamp for tap affordance.
    shadowColor: BR_COLORS.ink, shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 4,
  },
  skipT: {
    fontSize: 12, color: BR_COLORS.ink, fontWeight: '900',
    letterSpacing: 1.6, textTransform: 'uppercase',
  },

  slide: { flex: 1, alignItems: 'center', paddingTop: height * 0.14, paddingHorizontal: 28 },

  doodle: { position: 'absolute', fontSize: 24, opacity: 0.85 },

  hero: { alignItems: 'center', marginTop: 16, marginBottom: 36 },
  heroInner: {
    width: 220, height: 220, borderRadius: 0,
    // R101C \u2014 Mascot plate is now WHITE across the app. The previous
    // orange/saffron plate fought with the mascot's own rupee shield
    // for attention and made the slide read as one big orange blob
    // (Brandology: a Distinctive Brand Asset reads cleanest against
    // a NEUTRAL ground, not against itself). The thick ink border
    // and hard offset shadow do all the brutalism work; the plate
    // just stages the character.
    backgroundColor: '#FFFFFF',
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    // Hard offset stamp \u2014 same Swiss-brutal language as Profile.
    shadowColor: BR_COLORS.ink, shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 18,
  },
  heroEmoji: { fontSize: 112, transform: [{ rotate: '4deg' }] },

  copy: { alignItems: 'center', paddingHorizontal: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  rule: { width: 14, height: 3, backgroundColor: BR_COLORS.ink },
  eyebrow: {
    fontSize: 10, fontWeight: '900', letterSpacing: 2.2,
    color: BR_COLORS.ink, textTransform: 'uppercase',
  },
  title: {
    fontSize: 36, fontWeight: '900', color: BR_COLORS.ink,
    textAlign: 'center', letterSpacing: -1.2, lineHeight: 42,
  },
  sub: {
    fontSize: 15, color: BR_COLORS.muted, textAlign: 'center',
    marginTop: 14, lineHeight: 22, paddingHorizontal: 12,
    fontWeight: '500',
  },

  footer: { paddingHorizontal: 22, paddingBottom: 36, paddingTop: 8, gap: 16 },

  // Page progress — brutalist 4-px ink bars, active stretches.
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 6 },
  dot: { width: 18, height: 4, backgroundColor: BR_COLORS.line },
  dotActive: { width: 34, backgroundColor: BR_COLORS.ink },

  // Primary CTA — accent fill, ink border, accent-ink (paper) text.
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: BR_COLORS.accent, paddingVertical: 18,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
  },
  ctaT: {
    color: BR_COLORS.accentInk, fontSize: 15, fontWeight: '900',
    letterSpacing: 1.4, textTransform: 'uppercase',
  },

  // Terms-of-service line — muted, mono numerals not needed here.
  tos: {
    textAlign: 'center', fontSize: 11, color: BR_COLORS.muted,
    marginTop: 6, fontWeight: '500',
  },
  tosLink: {
    color: BR_COLORS.ink, fontWeight: '800',
    textDecorationLine: 'underline',
  },
}));

const { width, height } = Dimensions.get('window');

// Slide tints stay within the MintU saffron family but each slide
// shifts by a tiny amount for parallax-perceived depth. Anchored on
// BR_COLORS.paper so the brutalist hairline rules read cleanly.
const SLIDE_BG = ['#FFEFDC', BR_COLORS.paper, '#FFE9CF'];
const ACCENT = BR_COLORS.accent;        // #F56E1E
const ACCENT_DEEP = '#7C2D12';          // saffron-deep, for shadow only

type Slide = {
  id: string;
  // R101B — mascot replaces emoji as the visual hero. Mood evolves
  // across slides to telegraph the relationship-building arc.
  mood: MintuMascotState;
  tag: string;             // eyebrow tag, e.g. "01 · AHA"
  title: string;
  // OUTCOME-first sub copy — what the user FEELS, no feature jargon.
  sub: string;
  doodles: string[];
};

const S: Slide[] = [
  {
    // Slide 1 \u2014 the AHA. Opens with the emotional outcome, NOT the
    // feature. Reforge: this is what activation depends on.
    id: '1',
    mood: 'idle',
    tag: '01 \u00b7 THE OUTCOME',
    title: 'Stop guessing\nwhere it went.',
    sub: 'Every rupee, accounted for \u2014 without the spreadsheet. You handle life. Mintu handles the math.',
    doodles: ['\u20b9', '\u2713', '\u25c6', '\u2191'],
  },
  {
    // Slide 2 \u2014 the MISSION. Outcome reframed: the user doesn't have
    // to set a savings goal. We pick one based on their peer cohort.
    id: '2',
    mood: 'thinking',
    tag: '02 \u00b7 YOUR GOAL, PICKED FOR YOU',
    title: 'A goal you\ndidn\'t have to set.',
    sub: 'Mintu picks a peer-anchored monthly savings target the moment you log your income \u2014 then nudges you toward it. Quietly.',
    doodles: ['\u2605', '\u25c7', '\u2192', '\u26a1'],
  },
  {
    // Slide 3 \u2014 the SPLIT outcome. Lead with the social pain killed,
    // not the technical feature ("phone-anchored pending invites").
    id: '3',
    mood: 'success',
    tag: '03 \u00b7 SPLIT, FIXED',
    title: 'Settle with a name.\nNot a Splitwise link.',
    sub: 'Add friends by name even before they sign up. Tap a row to pay over UPI. No DMs, no awkward reminders, no math.',
    doodles: ['\ud83e\udd1d', '\u2713', '\u25c7', '\u2192'],
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

        {/* R101B \u2014 Mascot hero. Replaces the emoji puck. Same chunky
            ink-shadowed orange plate (Brandology consistency) but the
            face of every slide is now Mintu, mood-evolving across the
            arc (curious \u2192 thinking \u2192 celebrating). */}
        <Animated.View style={[s.hero, { transform: [{ scale }, { rotate }] }]}>
          <View style={s.heroInner}>
            <MintuMascot size={150} state={item.mood} />
          </View>
        </Animated.View>

        <View style={s.copy}>
          {/* Outcome eyebrow tag \u2014 brutalist hairline. */}
          <View style={s.eyebrowRow}>
            <View style={s.rule} />
            <Text style={s.eyebrow}>{item.tag}</Text>
          </View>
          <Text style={s.title}>{item.title}</Text>
          <Text style={s.sub}>{item.sub}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <TouchableOpacity
        testID="onboarding-skip-btn"
        style={s.skip}
        onPress={skip}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        accessibilityLabel="Skip onboarding"
        accessibilityRole="button"
      >
        <Text style={s.skipT}>SKIP →</Text>
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

      {/* 🎉 Confetti — one-shot when user lands on the last slide */}
      {burstKey > 0 && <Confetti trigger={burstKey > 0} />}

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
          <Text style={s.ctaT}>{idx === S.length - 1 ? 'MEET MINTU →' : t('next', lang)}</Text>
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.tos}>By continuing you agree to our <Text style={s.tosLink}>Terms</Text> & <Text style={s.tosLink}>Privacy</Text></Text>
      </View>
    </View>
  );
}

