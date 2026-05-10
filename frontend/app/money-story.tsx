/**
 * app/money-story.tsx — R118 SLICE A
 *
 * Instagram-style story player for the user's monthly Money Story.
 * Backend (/api/intelligence/money-story) returns 5 panels:
 *   1. HERO          — total moved this month
 *   2. TOP CATEGORY  — favourite spend lane
 *   3. BEST WEEK     — most mindful week
 *   4. SUBSCRIPTIONS — quiet recurring drips
 *   5. SAVINGS DELTA — vs last month
 *
 * UX:
 *   • Tap LEFT third → previous panel
 *   • Tap RIGHT third → next panel
 *   • Auto-advance after 5s per panel (paused on hold)
 *   • Top progress bars show position
 *   • Down chevron / back arrow to dismiss
 *
 * Tone: encouraging, never judgmental. Copy mirrors backend output.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated,
  StatusBar, Platform, ActivityIndicator, Dimensions, Easing,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMoneyStory, type StoryPanel } from '../hooks/useIntelligence';
import { BR_COLORS, BR_SPACE, BR_BORDER, BR_FONT } from '../utils/brutalist';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PANEL_DURATION = 5000;

// Panel-specific palette (Memphis-style Instagram cards)
const VIBE_PALETTES: Record<string, { bg: string; ink: string; accent: string }> = {
  warm:    { bg: '#FFE5B8', ink: '#3A1F00', accent: '#F56E1E' },
  cool:    { bg: '#D6E8FF', ink: '#0A2B5C', accent: '#1865B5' },
  neutral: { bg: '#FFF1D2', ink: '#0A0A0A', accent: '#0A0A0A' },
};

function fmtINR(n?: number, opts: { showZero?: boolean } = {}): string {
  if (n === undefined || n === null) return '—';
  if (!opts.showZero && n === 0) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
}

// ─── Panel renderers ─────────────────────────────────────────

function HeroPanel({ panel }: { panel: StoryPanel }) {
  const palette = VIBE_PALETTES[panel.vibe] || VIBE_PALETTES.neutral;
  return (
    <View style={[styles.panel, { backgroundColor: palette.bg }]}>
      <View style={styles.panelInner}>
        <Text style={[styles.panelKicker, { color: palette.ink }]}>
          {panel.title}
        </Text>
        <View style={styles.heroBigRow}>
          <Text style={[styles.heroBigNum, { color: palette.ink }]}>
            {fmtINR(panel.primary_value, { showZero: true })}
          </Text>
          <Text style={[styles.heroBigLbl, { color: palette.ink }]}>
            {panel.primary_label}
          </Text>
        </View>

        {panel.secondary_value !== undefined && (
          <View style={[styles.divider, { backgroundColor: palette.ink }]} />
        )}

        {panel.secondary_value !== undefined && (
          <View style={styles.heroSecRow}>
            <Text style={[styles.heroSecLbl, { color: palette.ink }]}>
              {panel.secondary_label?.toUpperCase() || 'EARNED'}
            </Text>
            <Text style={[styles.heroSecVal, { color: palette.ink }]}>
              {fmtINR(panel.secondary_value, { showZero: true })}
            </Text>
          </View>
        )}

        <Text style={[styles.panelCopy, { color: palette.ink }]}>
          {panel.copy}
        </Text>
      </View>
    </View>
  );
}

function CategoryPanel({ panel }: { panel: StoryPanel }) {
  const palette = VIBE_PALETTES[panel.vibe] || VIBE_PALETTES.warm;
  return (
    <View style={[styles.panel, { backgroundColor: palette.bg }]}>
      <View style={styles.panelInner}>
        <Text style={[styles.panelKicker, { color: palette.ink }]}>
          {panel.title}
        </Text>
        <Text style={[styles.bigCategory, { color: palette.ink }]}>
          {panel.category}
        </Text>
        <Text style={[styles.bigAmt, { color: palette.ink }]}>
          {fmtINR(panel.amount, { showZero: true })}
        </Text>
        {!!panel.share_pct && (
          <Text style={[styles.sharePct, { color: palette.ink }]}>
            {panel.share_pct}% of this month&apos;s spend
          </Text>
        )}
        <Text style={[styles.panelCopy, { color: palette.ink, marginTop: BR_SPACE.lg }]}>
          {panel.copy}
        </Text>
      </View>
    </View>
  );
}

function BestWeekPanel({ panel }: { panel: StoryPanel }) {
  const palette = VIBE_PALETTES[panel.vibe] || VIBE_PALETTES.cool;
  return (
    <View style={[styles.panel, { backgroundColor: palette.bg }]}>
      <View style={styles.panelInner}>
        <Text style={[styles.panelKicker, { color: palette.ink }]}>
          {panel.title}
        </Text>
        <Text style={[styles.weekLbl, { color: palette.ink }]}>
          {panel.week_label || '—'}
        </Text>
        <Text style={[styles.bigAmt, { color: palette.ink }]}>
          {fmtINR(panel.amount, { showZero: true })}
        </Text>
        <Text style={[styles.panelCopy, { color: palette.ink, marginTop: BR_SPACE.xl }]}>
          {panel.copy}
        </Text>
      </View>
    </View>
  );
}

function SubsPanel({ panel }: { panel: StoryPanel }) {
  const palette = VIBE_PALETTES[panel.vibe] || VIBE_PALETTES.neutral;
  return (
    <View style={[styles.panel, { backgroundColor: palette.bg }]}>
      <View style={styles.panelInner}>
        <Text style={[styles.panelKicker, { color: palette.ink }]}>
          {panel.title}
        </Text>
        <View style={styles.subsRow}>
          <View style={styles.subsCell}>
            <Text style={[styles.subsBig, { color: palette.ink }]}>{panel.count ?? 0}</Text>
            <Text style={[styles.subsLbl, { color: palette.ink }]}>SUBSCRIPTIONS</Text>
          </View>
          <View style={styles.subsCell}>
            <Text style={[styles.subsBig, { color: palette.ink }]}>
              {fmtINR(panel.amount, { showZero: true })}
            </Text>
            <Text style={[styles.subsLbl, { color: palette.ink }]}>TOTAL</Text>
          </View>
        </View>
        <Text style={[styles.panelCopy, { color: palette.ink, marginTop: BR_SPACE.xl }]}>
          {panel.copy}
        </Text>
      </View>
    </View>
  );
}

function DeltaPanel({ panel }: { panel: StoryPanel }) {
  const positive = (panel.delta ?? 0) >= 0;
  const palette = positive ? VIBE_PALETTES.warm : VIBE_PALETTES.cool;
  const arrow = positive ? '▲' : '▼';
  return (
    <View style={[styles.panel, { backgroundColor: palette.bg }]}>
      <View style={styles.panelInner}>
        <Text style={[styles.panelKicker, { color: palette.ink }]}>
          {panel.title}
        </Text>
        <Text style={[styles.deltaArrow, { color: palette.ink }]}>{arrow}</Text>
        <Text style={[styles.bigAmt, { color: palette.ink }]}>
          {fmtINR(panel.delta, { showZero: true })}
        </Text>
        <View style={[styles.divider, { backgroundColor: palette.ink, opacity: 0.4, marginTop: BR_SPACE.lg }]} />
        <View style={styles.deltaPair}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.deltaPairLbl, { color: palette.ink }]}>THIS MONTH NET</Text>
            <Text style={[styles.deltaPairVal, { color: palette.ink }]}>
              {fmtINR(panel.current_net, { showZero: true })}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.deltaPairLbl, { color: palette.ink }]}>LAST MONTH</Text>
            <Text style={[styles.deltaPairVal, { color: palette.ink }]}>
              {fmtINR(panel.previous_net, { showZero: true })}
            </Text>
          </View>
        </View>
        <Text style={[styles.panelCopy, { color: palette.ink, marginTop: BR_SPACE.xl }]}>
          {panel.copy}
        </Text>
      </View>
    </View>
  );
}

function PanelRouter({ panel }: { panel: StoryPanel }) {
  switch (panel.kind) {
    case 'hero': return <HeroPanel panel={panel} />;
    case 'top_category': return <CategoryPanel panel={panel} />;
    case 'best_week': return <BestWeekPanel panel={panel} />;
    case 'subscriptions': return <SubsPanel panel={panel} />;
    case 'savings_delta': return <DeltaPanel panel={panel} />;
    default: return <HeroPanel panel={panel} />;
  }
}

// ─── Top progress bars ───────────────────────────────────────
function ProgressBars({
  count, current, progress, paused,
}: {
  count: number;
  current: number;
  progress: Animated.Value;
  paused: boolean;
}) {
  void paused;
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: i < current
                  ? '100%'
                  : i === current
                    ? progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      })
                    : '0%',
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────
export default function MoneyStoryScreen() {
  const { data, loading, error } = useMoneyStory();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const panels = useMemo(() => data?.panels ?? [], [data]);
  const total = panels.length;

  // Drive auto-advance.
  useEffect(() => {
    if (total === 0) return;
    progress.setValue(0);
    if (paused) return;
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: PANEL_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (!finished) return;
      setIdx(i => {
        if (i + 1 < total) return i + 1;
        // last panel finished → bounce out to home gracefully
        router.back();
        return i;
      });
    });
    return () => { animRef.current?.stop(); };
  }, [idx, paused, total, progress]);

  const next = () => {
    animRef.current?.stop();
    if (idx + 1 < total) setIdx(idx + 1);
    else router.back();
  };
  const prev = () => {
    animRef.current?.stop();
    if (idx > 0) setIdx(idx - 1);
    else progress.setValue(0);
  };

  const onPressIn = () => setPaused(true);
  const onPressOut = () => setPaused(false);

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingTxt}>Building your story…</Text>
      </SafeAreaView>
    );
  }
  if (error || !data || total === 0) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.emptyTitle}>Not enough data yet</Text>
        <Text style={styles.emptyBody}>
          Track a few more transactions and your monthly story will start to take shape.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.emptyBack}>
          <Text style={styles.emptyBackTxt}>BACK</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const panel = panels[idx];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <StatusBar barStyle="light-content" />

      {/* Tap zones for nav */}
      <Pressable
        onPress={prev}
        onLongPress={onPressIn}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        delayLongPress={150}
        style={[styles.tapZone, { left: 0 }]}
      />
      <Pressable
        onPress={next}
        onLongPress={onPressIn}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        delayLongPress={150}
        style={[styles.tapZone, { right: 0 }]}
      />

      {/* Panel */}
      <View pointerEvents="none" style={styles.panelMount}>
        <PanelRouter panel={panel} />
      </View>

      {/* Top header (progress + close) */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <ProgressBars
          count={total}
          current={idx}
          progress={progress}
          paused={paused}
        />
        <View style={styles.topRow}>
          <Text style={styles.topMonth}>{data.month_label.toUpperCase()}</Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Footer hint */}
      <SafeAreaView style={styles.footer} edges={['bottom']} pointerEvents="none">
        <Text style={styles.footHint}>
          TAP &nbsp;◀&nbsp; PREV &nbsp;·&nbsp; ▶ &nbsp;NEXT &nbsp;·&nbsp; HOLD TO PAUSE
        </Text>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingSafe: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: BR_SPACE.xl,
  },
  loadingTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: BR_SPACE.md,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  emptyBody: {
    color: '#C9C9C9',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  emptyBack: {
    marginTop: BR_SPACE.xl,
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  emptyBackTxt: {
    color: '#0A0A0A',
    fontWeight: '900',
    letterSpacing: 1.6,
    fontSize: 12,
  },

  // Panel mount fills screen, panels animate within it (future: PagerView).
  panelMount: {
    position: 'absolute',
    inset: 0 as any,
    top: 0, bottom: 0, left: 0, right: 0,
  },

  panel: {
    flex: 1,
    width: SCREEN_W,
    height: SCREEN_H,
    paddingHorizontal: BR_SPACE.xl,
    paddingVertical: 90,
    justifyContent: 'center',
  },
  panelInner: {
    borderWidth: BR_BORDER.bold,
    borderColor: '#0A0A0A',
    backgroundColor: 'rgba(255,255,255,0.55)',
    padding: BR_SPACE.xl,
  },

  panelKicker: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: BR_SPACE.lg,
  },

  // Hero
  heroBigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BR_SPACE.sm,
  },
  heroBigNum: {
    fontSize: 56,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -2.2,
    lineHeight: 60,
  },
  heroBigLbl: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingBottom: 8,
  },
  heroSecRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: BR_SPACE.lg,
  },
  heroSecLbl: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  heroSecVal: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -0.5,
  },

  // Category
  bigCategory: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginBottom: 10,
  },
  bigAmt: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -2,
    lineHeight: 52,
  },
  sharePct: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    opacity: 0.85,
  },
  weekLbl: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginBottom: 12,
  },

  // Subscriptions
  subsRow: {
    flexDirection: 'row',
    gap: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
  },
  subsCell: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#0A0A0A',
    paddingVertical: BR_SPACE.lg,
    paddingHorizontal: BR_SPACE.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  subsBig: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    letterSpacing: -1,
    lineHeight: 34,
  },
  subsLbl: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginTop: 6,
  },

  // Delta
  deltaArrow: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 4,
  },
  deltaPair: {
    flexDirection: 'row',
    gap: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
  },
  deltaPairLbl: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    opacity: 0.7,
  },
  deltaPairVal: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    marginTop: 4,
    letterSpacing: -0.4,
  },

  // Common
  divider: {
    height: 2,
    width: '100%',
    marginTop: BR_SPACE.lg,
    opacity: 0.85,
  },
  panelCopy: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: BR_SPACE.lg,
  },

  // Top bar (overlay)
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingHorizontal: BR_SPACE.lg,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: BR_SPACE.sm,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: BR_SPACE.sm,
  },
  topMonth: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.0,
  },
  closeBtn: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },

  // Tap zones
  tapZone: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: SCREEN_W * 0.36,
    zIndex: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },

  // Footer hint
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    alignItems: 'center',
  },
  footHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: BR_SPACE.md,
  },
});
