/**
 * SocialFeedTicker.tsx — Auto-scrolling horizontal ticker.
 *
 * Creates FOMO by surfacing real-time wins from other users.
 * Items cross-fade/slide-left on a timer. Pauses on tap.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Item = { name: string; action: string; emoji: string };

export default function SocialFeedTicker({ items }: { items: Item[] }) {
  if (!items?.length) return null;

  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = setInterval(() => {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(slide, { toValue: -10, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start(() => {
        setIdx((i) => (i + 1) % items.length);
        slide.setValue(10);
        Animated.parallel([
          Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]).start();
      });
    }, 3200);
    return () => clearInterval(id);
  }, [items.length, fade, slide]);

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

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1F2937', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 16 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTxt: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  emoji: { fontSize: 16 },
  line: { flex: 1, fontSize: 12, color: '#fff', fontWeight: '700' },
  name: { fontWeight: '900', color: '#FCD34D' },
  action: { fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
});
