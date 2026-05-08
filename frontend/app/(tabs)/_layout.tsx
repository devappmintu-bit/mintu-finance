// Bottom tab bar — MintU v4 (Apr 2026).
//
// HDFC PayZapp reference match:
//   ┌────────────────────────────────────────────────────────────────┐
//   │                     ●                                          │
//   │                ┌───●●●●●───┐                                    │
//   │                │  ●●●●●●● │ ← raised circular puck               │
//   │                │   ●●●●●   │   (mascot — cream + saffron)       │
//   │                ╰─╮       ╭─╯                                    │
//   │  ╭──────────╯    ╲_____╱    ╰──────────╮                        │
//   │  │  [Pay] [Cards]          [Shop] [Bank]│  ← two arches carved   │
//   │  ╰──────────────────────────────────────╯     out of the bar    │
//   └────────────────────────────────────────────────────────────────┘
//
// The two arch cutouts on either side of the center puck are drawn with SVG
// <Path>. The bar itself is an off-white surface rendered INSIDE the SVG so
// the puck appears to be carved into the bar silhouette (matches the ref).
//
// Colour scheme: in-app cream (#FFFFFF surface) + saffron (#E65100) — NO BLACK.

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, TouchableOpacity, Text, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Defs, LinearGradient as SvgLG, Stop } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
// BlurView removed — Round 89c Brutalist mandate: no glass.
import Mascot from '../../components/Mascot';
import AIQuickSheet from '../../components/AIQuickSheet';
import { COLORS, FONT_FAMILY, GLOW, useAppColors, getActiveMode } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
// Round 100AA — Neo-Brutalism theme palette for the tab bar.
// Replaces the hardcoded #FAFAF7 / #0A0A0A with the active palette
// so the tab chrome (visible on every screen) auto-adapts when the
// user toggles light → dark in Profile > Preferences. Also injects
// the neo accent (lime in light, neon-yellow in dark) on the active
// tab background — much louder than the previous mono ink fill.
import { useNeoPalette } from '../../store/neoTheme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => {
  // Round 50 — light/dark detection via theme engine (was hex-equality check).
  const isLight = getActiveMode() === 'light';
  return ({
    wrap: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      alignItems: 'center',
      justifyContent: 'flex-end',
      backgroundColor: 'transparent',
      paddingBottom: BAR_INSET_B,
    },
    // Round 89 Strike 2 refine — BRUTALIST. Square corners, flat 4px
    // offset stamp (NOT drop-shadow). Hard 2px border. Zero blur, zero
    // gradient. Matches Home's HeroDecision / TodayAction language.
    barContainer: {
      borderRadius: 0,
      borderWidth: 2,
      ...Platform.select({
        ios:     { shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 4, height: 4 } },
        android: { elevation: 0 },
        web:     { boxShadow: '4px 4px 0 0 #0A0A0A' as any },
      }),
    },
    iconsRow: {
      position: 'absolute',
      bottom: BAR_INSET_B,
      left: BAR_INSET_X,
      right: BAR_INSET_X,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
    },
    side: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    sideTab: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      paddingVertical: 4,
      gap: 4,
    },
    // Round 60 — wrapper that lets the halo render BEHIND the icon chip
    // without affecting layout flow. Both children sit on top of each
    // other; halo is absolute-positioned to the centre.
    sideIconStack: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Halo layer removed from visual loop — kept as invisible
    // layout shim so SideTab doesn't crash on existing refs.
    sideHalo: {
      position: 'absolute',
      width: 0, height: 0, opacity: 0,
    },
    // Round 89 — BRUTALIST chip. Inactive = paper + ink border.
    sideIconWrap: {
      width: 42, height: 42, borderRadius: 0,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#FAFAF7',
      borderWidth: 1.5,
      borderColor: '#0A0A0A',
    },
    // R107 — stacked icon layer used by the morphing cross-fade. Both
    // outline + filled glyphs render at the same coords; opacity sells
    // the swap. Centered via flex on the parent.
    sideIconLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Active = solid ink fill, no glow. Icons inside become white.
    sideIconWrapOn: {
      backgroundColor: '#0A0A0A',
      borderColor: '#0A0A0A',
    },
    sideLabel:   { fontSize: 10.5, color: c.text.secondary, fontFamily: FONT_FAMILY.semibold, letterSpacing: 0.2, marginTop: 2 },
    sideLabelOn: { color: c.accent.primary, fontFamily: FONT_FAMILY.bold },

    // RAISED rounded-SQUARE center button (larger + orange accent ring)
    raisedWrap: {
      position: 'absolute',
      bottom: BAR_INSET_B + BAR_HEIGHT - PUCK_SIZE / 2 - 4,
      alignSelf: 'center',
      width: PUCK_SIZE,
      height: PUCK_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
    },
    raisedOuter: {
      width: PUCK_SIZE, height: PUCK_SIZE,
      borderRadius: 0,
      backgroundColor: '#FAFAF7',
      alignItems: 'center', justifyContent: 'center',
      // Round 89 Strike 2 — BRUTALIST puck. Ink border + flat 4px
      // stamp. No orange glow. No soft drop-shadow. Mascot still pops
      // because of the offset stamp + scale vs side tabs.
      borderWidth: 2.5,
      borderColor: '#0A0A0A',
      ...Platform.select({
        ios:     { shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 4, height: 4 } },
        android: { elevation: 0 },
        web:     { boxShadow: '4px 4px 0 0 #0A0A0A' as any },
      }),
    },
    raisedInner: {
      width: PUCK_INNER, height: PUCK_INNER,
      borderRadius: 0,                // rounded-square inner — transparent
      backgroundColor: 'transparent',
      overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    raisedLabel: {
      position: 'absolute',
      bottom: -18,
      fontSize: 9.5,
      fontWeight: '900',
      color: c.accent.primary,
      letterSpacing: 0.6,
      textAlign: 'center',
      fontFamily: FONT_FAMILY.bold,
      // Subtle outline for readability over any background
      ...Platform.select({
        ios:     { textShadowColor: 'rgba(0,0,0,0.08)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
        android: { textShadowColor: 'rgba(0,0,0,0.08)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
        web:     {},
      }),
    },
    raisedMascot: { width: '100%', height: '100%' },
  });
});

const TAB_META: Record<string, { out: string; fill: string; key: string }> = {
  index:        { out: 'home-outline',       fill: 'home',       key: 'home' },
  transactions: { out: 'receipt-outline',    fill: 'receipt',    key: 'transactions' },
  budget:       { out: 'pie-chart-outline',  fill: 'pie-chart',  key: 'budgets' },
  split:        { out: 'people-outline',     fill: 'people',     key: 'split' },
};

function labelOf(name: string, lang: any): string {
  const k = TAB_META[name]?.key || name;
  const raw = t(k, lang);
  // R100V — Tab label normalization. Was a mix of singular/plural/branded
  // ("Home" / "Transactions" / "MintU-AI" / "Budgets" / "Split"). All
  // singular nouns now; "Transactions" → "Spend" matches what users
  // come there to see, "Budgets" → "Budget" for consistency.
  const fallback: Record<string, string> = { home: 'Home', transactions: 'Spend', budgets: 'Budget', split: 'Split' };
  if (raw === k || !raw) return fallback[k] || name;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─── Geometry constants ────────────────────────────────────────────────────
const PUCK_SIZE  = 74;       // rounded-SQUARE center button (larger than side-tab chips)
const PUCK_INNER = 64;
const BAR_HEIGHT = 88;       // Taller floating pill so chips + labels sit with breathing room
const BAR_INSET_X = 14;      // horizontal gap from screen edges
const BAR_INSET_B = Platform.OS === 'ios' ? 22 : 14; // gap from bottom
const TOP_RADIUS = 32;

// Compatibility stub (keep for call sites that still import it)
function archGeom(screenW: number) {
  return { CUTOUT_W: 80, CUTOUT_DEPTH: 0 };
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Simple rounded-rect (pill) silhouette. No cutouts — the center button
 * is now a separate raised element (Paytm-style floating capsule).
 */
function barPath(w: number, h: number): string {
  const r = TOP_RADIUS;
  // Full rounded rectangle
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}

function SideTab({ icon, iconFilled, label, focused, onPress, testID }:
  { icon: string; iconFilled: string; label: string; focused: boolean; onPress: () => void; testID?: string }) {
  const st = useStyles();
  // Smooth bounce+scale on focus change + halo pulse
  const scale = React.useRef(new Animated.Value(focused ? 1 : 0.92)).current;
  const halo  = React.useRef(new Animated.Value(focused ? 1 : 0)).current;
  const lift  = React.useRef(new Animated.Value(focused ? -2 : 0)).current;
  // R107 — Morphing icon cross-fade. The outline glyph fades to 0 while
  // the filled glyph fades to 1 (and vice-versa). A tiny rotational
  // wiggle keeps the swap from feeling like a re-mount and ties into
  // the brutalist "stamp into existence" language.
  const morph = React.useRef(new Animated.Value(focused ? 1 : 0)).current;
  // Round 60 — soft outer-glow pulse behind the active chip. Loops only
  // while focused, stopping the moment another tab takes focus so we
  // never run a wasted Animated loop on inactive tabs.
  const glowPulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1.05 : 0.92, friction: 6, tension: 160, useNativeDriver: true }),
      Animated.timing(halo,  { toValue: focused ? 1 : 0, duration: 220, useNativeDriver: true }),
      Animated.spring(lift,  { toValue: focused ? -2 : 0, friction: 7, tension: 140, useNativeDriver: true }),
      // R107 — Morph the glyph swap. 260ms is just slow enough to read
      // the change yet quick enough that taps feel responsive.
      Animated.spring(morph, { toValue: focused ? 1 : 0, friction: 7, tension: 180, useNativeDriver: true }),
    ]).start();

    if (focused) {
      // Looping breathing pulse: 0 → 1 → 0 over 1.6s.
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(glowPulse, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      glowPulse.setValue(0);
    }
  }, [focused, scale, halo, lift, glowPulse, morph]);

  // Halo glow scales 1 → 1.35 and fades 0.55 → 0 — a soft breathing aura.
  const glowScale   = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  // R107 — Morph derivatives.
  const filledOpacity = morph;                                    // 0 → 1
  const outlineOpacity = morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const morphRotate = morph.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '-7deg', '0deg'],
  });

  return (
    <TouchableOpacity testID={testID} style={st.sideTab} onPress={onPress} activeOpacity={0.7}>
      <View style={st.sideIconStack}>
        {/* Round 60 — animated pulse halo for the active tab. Renders
            ONLY when focused so unfocused tabs don't paint dead pixels. */}
        {focused && (
          <Animated.View
            pointerEvents="none"
            style={[
              st.sideHalo,
              { transform: [{ scale: glowScale }], opacity: glowOpacity },
            ]}
          />
        )}
        <Animated.View
          style={[
            st.sideIconWrap,
            focused && st.sideIconWrapOn,
            { transform: [{ scale }, { translateY: lift }, { rotate: morphRotate }] },
          ]}
        >
          {/* R107 — Cross-faded glyph stack. Both icons live at the
              same coordinates; opacity drives the swap. The active
              variant always renders white-on-ink, and the outline
              renders ink-on-paper. */}
          <Animated.View style={[st.sideIconLayer, { opacity: outlineOpacity }]} pointerEvents="none">
            <Ionicons name={icon as any} size={20} color={'#0A0A0A'} />
          </Animated.View>
          <Animated.View style={[st.sideIconLayer, { opacity: filledOpacity }]} pointerEvents="none">
            <Ionicons name={iconFilled as any} size={22} color={'#FAFAF7'} />
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.Text
        style={[
          st.sideLabel,
          focused && st.sideLabelOn,
          { opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

function MintUTabBar({ state, navigation }: BottomTabBarProps) {
  const st = useStyles();
  const c = useAppColors();
  const { lang } = useLangStore();
  const screenW = Dimensions.get('window').width;
  // Round 100AA — Neo-Brutal theme awareness. Tab bar now reflects
  // the active palette (light/dark) instead of hard-coded paper/ink.
  const palette = useNeoPalette();
  // Round 89 Strike 2 refine — BRUTALIST tab bar.
  // R100AA: surface + border now derive from neo palette so dark mode
  // shows charcoal bar with white border + neon accents instead of
  // forcing light cream chrome on a dark app.
  const pillBg = palette.surface;
  const pillBorder = palette.ink;

  // Round 59 — AI Quick Prompt sheet visibility (mascot short-tap).
  // Must stay declared at component scope — referenced by the
  // <AIQuickSheet> element further below.
  const [aiSheetVisible, setAiSheetVisible] = React.useState(false);

  const visible = state.routes.filter(r => TAB_META[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2, 4);

  const fire = (route: any, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
  };

  const openAiCoach = () => navigation.navigate('ai-coach' as never);
  // Round 59 — short-tap on mascot opens the AI Quick Sheet (curated
  // prompts + free-text). Long-press still goes straight to the chat
  // for power users. Haptic medium on open for the deliberate feel.
  const onMascotPress = () => {
    try { require('expo-haptics').impactAsync('medium'); } catch { /* noop */ }
    setAiSheetVisible(true);
  };

  const pillW = screenW - BAR_INSET_X * 2;
  const barH = BAR_HEIGHT;

  return (
    <View style={st.wrap} pointerEvents="box-none">
      {/* Round 89 Strike 2 refine — BRUTALIST surface. Solid fill +
          hard 2px ink border + 4px offset stamp. NO BlurView. No
          translucent layers. One system, top-to-bottom. */}
      <View
        style={[
          st.barContainer,
          {
            width: pillW,
            height: barH,
            borderColor: pillBorder,
            backgroundColor: pillBg,
          },
        ]}
        pointerEvents="none"
      />

      {/* Tab icons sit inside the pill with a gap in the middle for the raised button */}
      <View style={[st.iconsRow, { width: pillW, height: barH }]}>
        <View style={st.side}>
          {left.map((route) => {
            const focused = state.index === state.routes.findIndex(r => r.key === route.key);
            const meta = TAB_META[route.name];
            return (
              <SideTab
                key={route.key}
                icon={meta.out}
                iconFilled={meta.fill}
                label={labelOf(route.name, lang)}
                focused={focused}
                onPress={() => fire(route, focused)}
                testID={`tab-${route.name}`}
              />
            );
          })}
        </View>
        {/* Spacer for the raised center button */}
        <View style={{ width: PUCK_SIZE + 18 }} />
        <View style={st.side}>
          {right.map((route) => {
            const focused = state.index === state.routes.findIndex(r => r.key === route.key);
            const meta = TAB_META[route.name];
            return (
              <SideTab
                key={route.key}
                icon={meta.out}
                iconFilled={meta.fill}
                label={labelOf(route.name, lang)}
                focused={focused}
                onPress={() => fire(route, focused)}
                testID={`tab-${route.name}`}
              />
            );
          })}
        </View>
      </View>

      {/* Raised ROUNDED-SQUARE AI Coach button — floats above the pill */}
      <TouchableOpacity
        testID="tab-ai-coach"
        onPress={onMascotPress}
        onLongPress={openAiCoach}
        delayLongPress={350}
        activeOpacity={0.88}
        style={st.raisedWrap}
        accessibilityLabel="Open MintU AI"
      >
        <View style={st.raisedOuter}>
          <View style={st.raisedInner}>
            <Mascot size={PUCK_INNER} variant="auto" />
          </View>
        </View>
        <Text style={st.raisedLabel}>MintU</Text>
      </TouchableOpacity>
      {/* Round 59 — AI Quick Prompt sheet. Mounted at the tab-bar level
          so it's accessible from every screen. */}
      <AIQuickSheet
        visible={aiSheetVisible}
        onClose={() => setAiSheetVisible(false)}
      />
    </View>
  );
}

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Smooth 280ms shift animation when switching tabs — gives a premium cross-fade feel
          animation: 'shift',
          // Freeze inactive tabs to save CPU & keep scroll state
          freezeOnBlur: true,
          lazy: true,
        } as any}
        tabBar={(props) => <MintUTabBar {...(props as unknown as React.ComponentProps<typeof MintUTabBar>)} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="transactions" />
        <Tabs.Screen name="ai-coach" options={{ href: null }} />
        <Tabs.Screen name="budget" />
        <Tabs.Screen name="split" />
        <Tabs.Screen name="rewards"      options={{ href: null }} />
      </Tabs>
    </View>
  );
}

