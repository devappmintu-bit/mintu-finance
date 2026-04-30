/**
 * EventsBanner.tsx — Time-boxed bonus event carousel.
 *
 * Renders active events (Weekend Mega Spin / Double Rewards Hour) with
 * an animated countdown chip. Always shows Mystery Box teaser last.
 *
 * Round 50 — migrated to makeStyles. Per-event gradient stays driven
 * by `ev.color` from the backend (each event has its own brand color).
 * White-on-gradient text stays literal (correct for both themes).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { shade } from '../../utils/color';

type Event = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  ends_in_seconds: number | null;
  cta: string;
};

const ON_BRAND = '#FFFFFF';
const ON_BRAND_SOFT = 'rgba(255,255,255,0.9)';
const SCRIM_LIGHT = 'rgba(255,255,255,0.22)';
const SCRIM_DARK = 'rgba(0,0,0,0.24)';

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
  const s = useStyles();
  const [, tick] = useState(0);
  useEffect(() => {
    const hasTimer = events.some(e => typeof e.ends_in_seconds === 'number');
    if (!hasTimer) return;
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [events]);

  if (!events?.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
      {events.map((ev) => {
        const remaining = typeof ev.ends_in_seconds === 'number'
          ? Math.max(0, ev.ends_in_seconds - Math.floor((Date.now() - evMountedAt) / 1000))
          : null;

        return (
          <TouchableOpacity
            key={ev.id}
            activeOpacity={0.9}
            onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ } onPress && onPress(ev); }}
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
                    <Ionicons name="timer" size={12} color={ON_BRAND} />
                    <Text style={s.countdownTxt}>{fmtCountdown(remaining)}</Text>
                  </View>
                )}
                <View style={s.ctaPill}>
                  <Text style={s.ctaTxt}>{ev.cta}</Text>
                  <Ionicons name="arrow-forward" size={12} color={ON_BRAND} />
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


const useStyles = makeStyles((c) => ({
  card: { width: 240, padding: 12, borderRadius: 16, gap: 12, overflow: 'hidden', position: 'relative', shadowColor: c.shadow.medium, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  blob: { position: 'absolute', top: -32, right: -32, width: 100, height: 100, borderRadius: 52, backgroundColor: 'rgba(255,255,255,0.14)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 28 },
  title: { fontSize: 13, fontWeight: '900', color: ON_BRAND, letterSpacing: 0.8 },
  sub: { fontSize: 11, fontWeight: '700', color: ON_BRAND_SOFT, marginTop: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: SCRIM_DARK },
  countdownTxt: { fontSize: 11, fontWeight: '900', color: ON_BRAND, letterSpacing: 0.2 },
  ctaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: SCRIM_LIGHT },
  ctaTxt: { fontSize: 11, fontWeight: '900', color: ON_BRAND, letterSpacing: 0.2 },
}));
