/**
 * EventsBanner.tsx — Time-boxed bonus event carousel.
 *
 * Renders active events (Weekend Mega Spin / Double Rewards Hour) with
 * an animated countdown chip. Always shows Mystery Box teaser last.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

type Event = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  ends_in_seconds: number | null;
  cta: string;
};

function fmtCountdown(sec: number): string {
  if (sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function EventsBanner({ events, onPress }: { events: Event[]; onPress?: (e: Event) => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const hasTimer = events.some(e => typeof e.ends_in_seconds === 'number');
    if (!hasTimer) return;
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [events]);

  if (!events?.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
      {events.map((ev) => {
        const remaining = typeof ev.ends_in_seconds === 'number'
          ? Math.max(0, ev.ends_in_seconds - Math.floor((Date.now() - evMountedAt) / 1000))
          : null;

        return (
          <TouchableOpacity
            key={ev.id}
            activeOpacity={0.9}
            onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} onPress && onPress(ev); }}
            testID={`event-${ev.id}`}
          >
            <LinearGradient colors={[ev.color, shade(ev.color, -0.25)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
              <View style={s.blob} />
              <View style={s.row}>
                <Text style={s.emoji}>{ev.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{ev.title}</Text>
                  <Text style={s.sub}>{ev.subtitle}</Text>
                </View>
              </View>
              <View style={s.footer}>
                {remaining != null && (
                  <View style={s.countdown}>
                    <Ionicons name="timer" size={11} color="#fff" />
                    <Text style={s.countdownTxt}>{fmtCountdown(remaining)}</Text>
                  </View>
                )}
                <View style={s.ctaPill}>
                  <Text style={s.ctaTxt}>{ev.cta}</Text>
                  <Ionicons name="arrow-forward" size={11} color="#fff" />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const evMountedAt = Date.now();

function shade(hex: string, pct: number) {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const adj = (v: number) => Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v * pct : (255 - v) * pct))));
    return `#${[adj(r), adj(g), adj(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  } catch { return hex; }
}

const s = StyleSheet.create({
  card: { width: 240, padding: 12, borderRadius: 16, gap: 10, overflow: 'hidden', position: 'relative', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  blob: { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.14)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 30 },
  title: { fontSize: 12.5, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  sub: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' },
  countdownTxt: { fontSize: 10.5, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  ctaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)' },
  ctaTxt: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
});
