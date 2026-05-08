/**
 * SocialFeedTicker.tsx — Auto-scrolling horizontal ticker.
 *
 * Creates FOMO by surfacing real-time wins from other users.
 * Items cross-fade/slide-left on a timer. Pauses on tap.
 *
 * Round 50 — migrated to makeStyles + useAppColors. Dark bg now
 * uses c.gray[800] (proper for both themes), live badge uses
 * c.state.danger, gold name color stays literal because amber-gold
 * is intentional brand on the dark ticker (works in both themes).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { makeStyles } from '../../utils/makeStyles';
import { useAppColors } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.gray[800], borderRadius: 0, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.state.danger, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  // White-on-dark-bg works in both themes
  liveDot: { width: 4, height: 4, borderRadius: 4, backgroundColor: c.bg.elevated },
  liveTxt: { fontSize: 8, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.8 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 16 },
  line: { flex: 1, fontSize: 12, color: c.bg.elevated, fontWeight: '700' },
  // Gold accent for the name — intentional brand colour, works on dark bg in both themes.
  name: { fontWeight: '900', color: '#FCD34D' },
  action: { fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
}));

type Item = { name: string; action: string; emoji: string };

export default function SocialFeedTicker({ items }: { items: Item[] }) {
  const s = useStyles();
  const c = useAppColors();

  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!items?.length) return;
    const id = setInterval(() => {
      Animated.parallel([
        Animated.timing(fade,  { toValue: 0,   duration: 240, useNativeDriver: true }),
        Animated.timing(slide, { toValue: -10, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start(() => {
        setIdx((i) => (i + 1) % items.length);
        slide.setValue(10);
        Animated.parallel([
          Animated.timing(fade,  { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]).start();
      });
    }, 3200);
    return () => clearInterval(id);
  }, [items?.length, fade, slide]);

  if (!items?.length) return null;
  const current = items[idx];
  const liveDotOpacity = fade.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={s.wrap}>
      <View style={s.liveBadge}>
        <Animated.View style={[s.liveDot, { opacity: liveDotOpacity }]} />
        <Text style={s.liveTxt}>LIVE</Text>
      </View>
      <Animated.View style={[s.row, { opacity: fade, transform: [{ translateX: slide }] }]}>
        <Text style={s.emoji}>{current.emoji}</Text>
        <Text style={s.line} numberOfLines={1}>
          <Text style={s.name}>{current.name}</Text>
          <Text style={s.action}>  {current.action}</Text>
        </Text>
      </Animated.View>
    </View>
  );
}

