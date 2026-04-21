// MintU Design System v3 — Next-gen fintech · ADAPTIVE Theme Engine
//
// Phase 1 infrastructure for full light/dark theme switching.
//
// This file exposes:
//   1. `COLORS` — a module-mutable proxy object. Dozens of StyleSheet.create
//      calls across the app read from this symbol at module-load time. When
//      the user flips themes, we mutate the values IN PLACE + force a full
//      Stack remount at the root so every screen re-reads fresh tokens.
//   2. `applyTheme(mode)` — imperative mutation helper. Call on app boot +
//      whenever the user picks a new theme in Settings.
//   3. `LIGHT_PALETTE` / `DARK_PALETTE` — canonical token sets.
//   4. `useAppColors()` — React hook for components that want reactive tokens
//      (preferred for NEW code; legacy code continues to import `COLORS`).
//
// New v3-only tokens live under: `GLASS`, `GRADIENT`, `GLOW`, `MOTION`, `FONT_FAMILY`.
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

// ══════════════════════════════════════════════════════════════════════
//  LIGHT PALETTE — clean, minimal, financial clarity
// ══════════════════════════════════════════════════════════════════════
const LIGHT_PALETTE = {
  bg: {
    primary:   '#FAFAF9',        // Warm off-white canvas
    secondary: '#FFFFFF',        // Elevated surface
    card:      '#FFFFFF',
    elevated:  '#FFFFFF',
    dark:      '#F3F4F6',        // Softer tier (ironic naming kept for API)
  },
  accent: {
    primary:      '#E84A0C',     // Neon orange, slightly deeper for light-bg contrast
    primaryLight: '#FF6B1A',
    secondary:    '#F59E0B',     // Saffron
    tertiary:     '#A21CAF',     // Premium magenta
    moneyIn:      '#059669',     // Emerald
    moneyOut:     '#DC2626',     // Crimson
    warning:      '#D97706',
  },
  text: {
    primary:   '#111827',        // Near-black
    secondary: '#4B5563',        // Slate
    muted:     '#6B7280',
    tertiary:  '#6B7280',
    inverse:   '#FFFFFF',
  },
  border: {
    subtle: 'rgba(17,24,39,0.08)',
    focus:  '#E84A0C',
    card:   'rgba(17,24,39,0.08)',
  },
  state: {
    success:       '#059669',
    successBg:     'rgba(5,150,105,0.10)',
    successBorder: 'rgba(5,150,105,0.30)',
    warning:       '#D97706',
    warningBg:     'rgba(217,119,6,0.10)',
    warningBorder: 'rgba(217,119,6,0.30)',
    danger:        '#DC2626',
    dangerBg:      'rgba(220,38,38,0.10)',
    dangerBorder:  'rgba(220,38,38,0.30)',
    info:          '#2563EB',
    infoBg:        'rgba(37,99,235,0.10)',
    infoBorder:    'rgba(37,99,235,0.30)',
  },
  gray: {
    50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF',
    500: '#6B7280', 600: '#4B5563', 700: '#374151', 800: '#1F2937', 900: '#111827',
  },
};

// ══════════════════════════════════════════════════════════════════════
//  DARK PALETTE — futuristic, premium, AI-driven feel (default)
// ══════════════════════════════════════════════════════════════════════
const DARK_PALETTE = {
  bg: {
    primary:   '#0B0B12',
    secondary: '#14141C',
    card:      '#1A1A24',
    elevated:  '#20202C',
    dark:      '#070710',
  },
  accent: {
    primary:      '#FF6B1A',
    primaryLight: '#FF8C42',
    secondary:    '#FFB547',
    tertiary:     '#C026D3',
    moneyIn:      '#10E0A0',
    moneyOut:     '#FF5470',
    warning:      '#FFB020',
  },
  text: {
    primary:   '#F5F5F7',
    secondary: '#A1A1AA',
    muted:     '#71717A',
    tertiary:  '#71717A',
    inverse:   '#0B0B12',
  },
  border: {
    subtle: 'rgba(255,255,255,0.08)',
    focus:  '#FF6B1A',
    card:   'rgba(255,255,255,0.08)',
  },
  state: {
    success:       '#10E0A0',
    successBg:     'rgba(16,224,160,0.12)',
    successBorder: 'rgba(16,224,160,0.35)',
    warning:       '#FFB020',
    warningBg:     'rgba(255,176,32,0.14)',
    warningBorder: 'rgba(255,176,32,0.4)',
    danger:        '#FF5470',
    dangerBg:      'rgba(255,84,112,0.14)',
    dangerBorder:  'rgba(255,84,112,0.4)',
    info:          '#60A5FA',
    infoBg:        'rgba(96,165,250,0.14)',
    infoBorder:    'rgba(96,165,250,0.4)',
  },
  gray: {
    50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF',
    500: '#6B7280', 600: '#4B5563', 700: '#374151', 800: '#1F2937', 900: '#111827',
  },
};

// ══════════════════════════════════════════════════════════════════════
//  AMOLED PALETTE — pure-black variant of DARK for OLED screens
//  (saves battery + deeper blacks blend into the bezel)
// ══════════════════════════════════════════════════════════════════════
const AMOLED_PALETTE = {
  bg: {
    primary:   '#000000',        // True black (screen pixels OFF)
    secondary: '#060608',        // Slightly lifted for surface separation
    card:      '#0B0B0F',
    elevated:  '#121219',
    dark:      '#000000',
  },
  accent: {
    primary:      '#FF6B1A',
    primaryLight: '#FF8C42',
    secondary:    '#FFB547',
    tertiary:     '#C026D3',
    moneyIn:      '#10E0A0',
    moneyOut:     '#FF5470',
    warning:      '#FFB020',
  },
  text: {
    primary:   '#FFFFFF',        // Pure white on pure black — max contrast
    secondary: '#A1A1AA',
    muted:     '#71717A',
    tertiary:  '#71717A',
    inverse:   '#000000',
  },
  border: {
    subtle: 'rgba(255,255,255,0.08)',
    focus:  '#FF6B1A',
    card:   'rgba(255,255,255,0.08)',
  },
  state: {
    success:       '#10E0A0',
    successBg:     'rgba(16,224,160,0.12)',
    successBorder: 'rgba(16,224,160,0.35)',
    warning:       '#FFB020',
    warningBg:     'rgba(255,176,32,0.14)',
    warningBorder: 'rgba(255,176,32,0.4)',
    danger:        '#FF5470',
    dangerBg:      'rgba(255,84,112,0.14)',
    dangerBorder:  'rgba(255,84,112,0.4)',
    info:          '#60A5FA',
    infoBg:        'rgba(96,165,250,0.14)',
    infoBorder:    'rgba(96,165,250,0.4)',
  },
  gray: {
    50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF',
    500: '#6B7280', 600: '#4B5563', 700: '#374151', 800: '#1F2937', 900: '#111827',
  },
};

export type ThemeMode = 'light' | 'dark' | 'amoled';
export const PALETTES: Record<ThemeMode, typeof DARK_PALETTE> = {
  light:  LIGHT_PALETTE,
  dark:   DARK_PALETTE,
  amoled: AMOLED_PALETTE,
};

// Current active mode (mutable). Defaults to dark on boot.
let ACTIVE_MODE: ThemeMode = 'dark';
export const getActiveMode = (): ThemeMode => ACTIVE_MODE;

// ══════════════════════════════════════════════════════════════════════
//  CORE PALETTE — mutable proxy that always reflects the active theme
// ══════════════════════════════════════════════════════════════════════
export const COLORS = {
  bg: {
    primary:   '#0B0B12',        // Deep obsidian (app background)
    secondary: '#14141C',        // Elevated surface
    card:      '#1A1A24',        // Solid card fallback (when glass not used)
    elevated:  '#20202C',        // Elevated card (modals/sheets)
    dark:      '#070710',        // Darkest tier (splash, behind glass)
  },
  accent: {
    primary:      '#FF6B1A',     // Neon Orange — hero accent
    primaryLight: '#FF8C42',     // Saffron highlight
    secondary:    '#FFB547',     // Marigold glow
    tertiary:     '#C026D3',     // Premium Magenta
    moneyIn:      '#10E0A0',     // Neon Green (credits)
    moneyOut:     '#FF5470',     // Neon Pink-Red (debits)
    warning:      '#FFB020',     // Amber
  },
  text: {
    primary:   '#F5F5F7',        // Near-white (high contrast on dark bg)
    secondary: '#A1A1AA',        // Slate gray
    muted:     '#71717A',        // Captions
    tertiary:  '#71717A',        // alias of muted (some components use this name)
    inverse:   '#0B0B12',        // Dark on light chips
  },
  border: {
    subtle: 'rgba(255,255,255,0.08)',
    focus:  '#FF6B1A',
    card:   'rgba(255,255,255,0.08)',
  },
  // ── Semantic state colors — tuned for dark bg ───────────────
  state: {
    success:       '#10E0A0',
    successBg:     'rgba(16,224,160,0.12)',
    successBorder: 'rgba(16,224,160,0.35)',
    warning:       '#FFB020',
    warningBg:     'rgba(255,176,32,0.14)',
    warningBorder: 'rgba(255,176,32,0.4)',
    danger:        '#FF5470',
    dangerBg:      'rgba(255,84,112,0.14)',
    dangerBorder:  'rgba(255,84,112,0.4)',
    info:          '#60A5FA',
    infoBg:        'rgba(96,165,250,0.14)',
    infoBorder:    'rgba(96,165,250,0.4)',
  },
  // ── Neutral grays — retained for chart/border drift ─────────
  gray: {
    50:  '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
};

// ══════════════════════════════════════════════════════════════════════
//  GLASS — glassmorphism surface tokens
//  Use with <BlurView tint={GLASS.tint} intensity={GLASS.intensity} …>
// ══════════════════════════════════════════════════════════════════════
export const GLASS = {
  tint: 'dark' as 'dark' | 'light' | 'default',
  intensity: 28,
  // Solid fallback for Android (BlurView cheap there) or web
  solidBg: 'rgba(26,26,36,0.72)',
  borderLight: 'rgba(255,255,255,0.10)',   // top border glint
  borderSoft:  'rgba(255,255,255,0.06)',   // subtle separator
  innerShadow: 'rgba(0,0,0,0.35)',
};

// ══════════════════════════════════════════════════════════════════════
//  GRADIENT — canonical gradient stops reused everywhere
// ══════════════════════════════════════════════════════════════════════
export const GRADIENT = {
  // Hero neon accent (buttons, chips, glows)
  neon:       ['#FF8C42', '#FF6B1A', '#E84A0C'] as const,
  // Reverse for pressed state
  neonSoft:   ['#FFB547', '#FF8C42', '#FF6B1A'] as const,
  // Premium purple-orange (AI bots & premium cards)
  premium:    ['#FF6B1A', '#C026D3', '#7C3AED'] as const,
  // Success green-cyan
  success:    ['#10E0A0', '#0AA88C'] as const,
  // Glass tint on top of hero image (legibility)
  glassShade: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)'] as const,
  // Page background — subtle radial feel using two stops
  pageBg:     ['#0B0B12', '#13131B'] as const,
  // Money-in vs money-out compact pills
  moneyIn:    ['#10E0A0', '#059669'] as const,
  moneyOut:   ['#FF5470', '#E11D48'] as const,
};

// ══════════════════════════════════════════════════════════════════════
//  GLOW — colored shadow helpers for neon borders & buttons
// ══════════════════════════════════════════════════════════════════════
export const GLOW = {
  // Usage: ...GLOW.neon (spread into a StyleSheet entry)
  neon: Platform.select({
    ios: {
      shadowColor: '#FF6B1A',
      shadowOpacity: 0.55,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 10 },
    web: { boxShadow: '0 0 24px rgba(255,107,26,0.55), 0 8px 24px rgba(255,107,26,0.35)' as any },
  }) as any,
  success: Platform.select({
    ios: { shadowColor: '#10E0A0', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 8 },
    web: { boxShadow: '0 0 20px rgba(16,224,160,0.45)' as any },
  }) as any,
  danger: Platform.select({
    ios: { shadowColor: '#FF5470', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 8 },
    web: { boxShadow: '0 0 20px rgba(255,84,112,0.45)' as any },
  }) as any,
  subtle: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 12 } },
    android: { elevation: 12 },
    web: { boxShadow: '0 12px 32px rgba(0,0,0,0.55)' as any },
  }) as any,
};

// ══════════════════════════════════════════════════════════════════════
//  MOTION — unified timing tokens (reuse for all animations → 60fps feel)
// ══════════════════════════════════════════════════════════════════════
export const MOTION = {
  fast:    150,   // hover / chip tint
  base:    220,   // button press, tap ripple
  medium:  280,   // modal fade, screen transition
  slow:    420,   // hero reveal
  // Spring presets for Animated.spring
  spring: {
    quick:  { friction: 6, tension: 140 },
    smooth: { friction: 8, tension: 80  },
    bouncy: { friction: 4, tension: 160 },
  },
};

// ══════════════════════════════════════════════════════════════════════
//  SPACING / RADIUS — 8pt grid
// ══════════════════════════════════════════════════════════════════════
export const SPACING = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
};

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  card: 28,
  full: 999,
};

// ══════════════════════════════════════════════════════════════════════
//  TYPOGRAPHY — Inter-powered (loaded in _layout.tsx via useFonts)
// ══════════════════════════════════════════════════════════════════════
export const FONT_FAMILY = {
  regular:  Platform.select({ ios: 'Inter_400Regular',  android: 'Inter_400Regular',  web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }) as string,
  medium:   Platform.select({ ios: 'Inter_500Medium',   android: 'Inter_500Medium',   web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }) as string,
  semibold: Platform.select({ ios: 'Inter_600SemiBold', android: 'Inter_600SemiBold', web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }) as string,
  bold:     Platform.select({ ios: 'Inter_700Bold',     android: 'Inter_700Bold',     web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }) as string,
  black:    Platform.select({ ios: 'Inter_900Black',    android: 'Inter_900Black',    web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }) as string,
};

export const FONT = {
  h1:       { fontSize: 36, fontFamily: FONT_FAMILY.black,    letterSpacing: -0.8 },
  h2:       { fontSize: 28, fontFamily: FONT_FAMILY.bold,     letterSpacing: -0.5 },
  h3:       { fontSize: 22, fontFamily: FONT_FAMILY.bold,     letterSpacing: -0.3 },
  h4:       { fontSize: 18, fontFamily: FONT_FAMILY.semibold, letterSpacing: -0.2 },
  body:     { fontSize: 16, fontFamily: FONT_FAMILY.regular,  lineHeight: 26 },
  small:    { fontSize: 14, fontFamily: FONT_FAMILY.regular,  lineHeight: 22 },
  tiny:     { fontSize: 12, fontFamily: FONT_FAMILY.medium },
  overline: { fontSize: 11, fontFamily: FONT_FAMILY.bold,     letterSpacing: 1.5, textTransform: 'uppercase' as const },
  // Big-number display (balances, coin counts)
  display:  { fontSize: 44, fontFamily: FONT_FAMILY.black,    letterSpacing: -1.2 },
};

// ══════════════════════════════════════════════════════════════════════
//  CATEGORIES — icons + NEON-tuned category colors for dark bg
// ══════════════════════════════════════════════════════════════════════
export const CATEGORIES: Record<string, { icon: string; color: string }> = {
  Food:          { icon: 'restaurant',         color: '#FF8C42' },
  Transport:     { icon: 'car',                color: '#60A5FA' },
  Shopping:      { icon: 'bag-handle',         color: '#E879F9' },
  Bills:         { icon: 'flash',              color: '#FFB020' },
  Entertainment: { icon: 'film',               color: '#A78BFA' },
  Healthcare:    { icon: 'medkit',             color: '#FF5470' },
  Education:     { icon: 'school',             color: '#22D3EE' },
  Investment:    { icon: 'trending-up',        color: '#10E0A0' },
  Groceries:     { icon: 'nutrition',          color: '#84CC16' },
  Rent:          { icon: 'home',               color: '#818CF8' },
  Other:         { icon: 'ellipsis-horizontal',color: '#A1A1AA' },
};

export const CATEGORY_LIST = Object.keys(CATEGORIES);

// ══════════════════════════════════════════════════════════════════════
//  ONBOARDING — unchanged asset URIs
// ══════════════════════════════════════════════════════════════════════
export const ONBOARDING_IMAGES = {
  splash:  'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/b0021a8a2b3f6fb6fd10d17d8fc1c6ca3ce16661550d4ae42367e0658ff8cbed.png',
  save:    'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/08cef8bb2a5c1d6cf8de4d5625f5d37b62620544049b4422f1100cd0d67b7a75.png',
  grow:    'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/3b885da80db448d847e1f6c097bc17ef6849177ca6b8a3dfaaf4ac612fcab49c.png',
  welcome: 'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/e7523de09ef2fe49176945c99e41d56b3e71bc7de9f23f12afdde9f01e568d54.png',
};

// ══════════════════════════════════════════════════════════════════════
//  SHADOW PRESETS — tuned for dark theme (shadows need stronger opacity)
// ══════════════════════════════════════════════════════════════════════
type ShadowStyle = {
  boxShadow?: string;
  elevation?: number;
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
};

const makeShadow = (offsetY: number, blur: number, opacity: number, elev: number, color = '0,0,0'): ShadowStyle => {
  const rgba = `rgba(${color},${opacity})`;
  if (Platform.OS === 'ios') {
    return {
      shadowColor: `rgb(${color})`,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: blur,
    };
  }
  return { boxShadow: `0 ${offsetY}px ${blur}px ${rgba}`, elevation: elev };
};

export const SHADOW = {
  none: {} as ShadowStyle,
  xs: makeShadow(1, 4,  0.18, 1),
  sm: makeShadow(2, 8,  0.25, 2),
  md: makeShadow(2, 12, 0.32, 3),
  lg: makeShadow(4, 16, 0.40, 5),
  xl: makeShadow(6, 24, 0.50, 8),
};

const hexToRgba = (hex: string, opacity: number) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
};
export const shadowStyle = (color: string, offsetY: number, blur: number, opacity: number, elev = 0): ShadowStyle => {
  if (Platform.OS === 'ios') {
    return {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: blur,
    };
  }
  const rgba = color.startsWith('#') ? hexToRgba(color, opacity) : color;
  return { boxShadow: `0px ${offsetY}px ${blur}px ${rgba}`, elevation: elev };
};

// ══════════════════════════════════════════════════════════════════════
//  SHARED CONSTANTS
// ══════════════════════════════════════════════════════════════════════
export const UPI_APPS = [
  { id: 'gpay',    name: 'Google Pay', color: '#4285F4', icon: 'logo-google' },
  { id: 'phonepe', name: 'PhonePe',    color: '#5F259F', icon: 'phone-portrait' },
  { id: 'paytm',   name: 'Paytm',      color: '#00BAF2', icon: 'wallet' },
  { id: 'bhim',    name: 'BHIM UPI',   color: '#00695C', icon: 'shield-checkmark' },
] as const;

// ══════════════════════════════════════════════════════════════════════
//  THEME ENGINE — imperative apply + React hook subscription
// ══════════════════════════════════════════════════════════════════════
const themeListeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  themeListeners.add(cb);
  return () => {
    themeListeners.delete(cb);
  };
};

/**
 * Mutate the shared COLORS object in-place to match the target palette.
 * Because StyleSheet.create captures token VALUES at module-load time,
 * callers MUST ALSO remount the Stack (via a `key` change on root) for the
 * change to propagate into cached stylesheets.
 */
export function applyTheme(mode: ThemeMode) {
  if (mode === ACTIVE_MODE) return;
  ACTIVE_MODE = mode;
  const next = PALETTES[mode];
  // Mutate each leaf in place so the exported `COLORS` object retains identity.
  Object.assign(COLORS.bg,     next.bg);
  Object.assign(COLORS.accent, next.accent);
  Object.assign(COLORS.text,   next.text);
  Object.assign(COLORS.border, next.border);
  Object.assign(COLORS.state,  next.state);
  Object.assign(COLORS.gray,   next.gray);
  // Notify all subscribers (useAppColors hook)
  themeListeners.forEach(cb => cb());
}

/** Snapshot getter for useSyncExternalStore. */
const getSnapshot = () => ACTIVE_MODE;

/**
 * useAppColors — reactive React hook returning the active palette.
 *
 * Preferred for NEW components. Legacy components that `import { COLORS }`
 * still work because we mutate `COLORS` in-place + remount the Stack on
 * theme change.
 */
export function useAppColors() {
  // Re-render on theme change so consumers get fresh references.
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return COLORS;
}

/**
 * useAppTheme — same as useAppColors but also exposes mode + all tokens.
 * Useful for components needing gradients, glows, etc.
 */
export function useAppTheme() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    mode: ACTIVE_MODE,
    colors: COLORS,
    glass: GLASS,
    gradient: GRADIENT,
    glow: GLOW,
    motion: MOTION,
    font: FONT,
    fontFamily: FONT_FAMILY,
    radius: RADIUS,
    spacing: SPACING,
  };
}

