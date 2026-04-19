// MintU Design System v2 — Warm Indian Aesthetic
import { Platform } from 'react-native';

export const COLORS = {
  bg: {
    primary: '#FDF8F5',
    secondary: '#FFFFFF',
    card: '#FFFFFF',
    elevated: '#F3EBE1',
    dark: '#2E1F1A',
  },
  accent: {
    primary: '#E65100',     // Saffron
    primaryLight: '#FF7D33',
    secondary: '#FFB300',   // Marigold
    tertiary: '#880E4F',    // Premium Maroon
    moneyIn: '#2E7D32',     // Tulsi Green
    moneyOut: '#D32F2F',    // Alert Red
    warning: '#F57F17',     // Amber
  },
  text: {
    primary: '#2E1F1A',
    secondary: '#6D554B',
    muted: '#9E8E84',
    inverse: '#FFFFFF',
  },
  border: {
    subtle: '#EEDDCC',
    focus: '#E65100',
    card: '#EEDDCC',
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  card: 28,
  full: 999,
};

export const FONT = {
  h1: { fontSize: 36, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 22, fontWeight: '700' as const },
  h4: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 26 },
  small: { fontSize: 14, fontWeight: '400' as const, lineHeight: 22 },
  tiny: { fontSize: 12, fontWeight: '500' as const },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.5, textTransform: 'uppercase' as const },
};

export const CATEGORIES: Record<string, { icon: string; color: string }> = {
  Food: { icon: 'restaurant', color: '#E65100' },
  Transport: { icon: 'car', color: '#1565C0' },
  Shopping: { icon: 'bag-handle', color: '#880E4F' },
  Bills: { icon: 'flash', color: '#F57F17' },
  Entertainment: { icon: 'film', color: '#6A1B9A' },
  Healthcare: { icon: 'medkit', color: '#D32F2F' },
  Education: { icon: 'school', color: '#00838F' },
  Investment: { icon: 'trending-up', color: '#2E7D32' },
  Groceries: { icon: 'nutrition', color: '#558B2F' },
  Rent: { icon: 'home', color: '#4527A0' },
  Other: { icon: 'ellipsis-horizontal', color: '#6D554B' },
};

export const CATEGORY_LIST = Object.keys(CATEGORIES);

// Onboarding images
export const ONBOARDING_IMAGES = {
  splash: 'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/b0021a8a2b3f6fb6fd10d17d8fc1c6ca3ce16661550d4ae42367e0658ff8cbed.png',
  save: 'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/08cef8bb2a5c1d6cf8de4d5625f5d37b62620544049b4422f1100cd0d67b7a75.png',
  grow: 'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/3b885da80db448d847e1f6c097bc17ef6849177ca6b8a3dfaaf4ac612fcab49c.png',
  welcome: 'https://static.prod-images.emergentagent.com/jobs/6b84bb29-30c5-4f1f-8532-223619c96941/images/e7523de09ef2fe49176945c99e41d56b3e71bc7de9f23f12afdde9f01e568d54.png',
};

// ============== SHADOW PRESETS ==============
// Use these instead of raw shadow* props (deprecated on web per RN 0.76+).
// boxShadow works on web; elevation still required for Android; native iOS ignores boxShadow.
type ShadowStyle = {
  boxShadow?: string;
  elevation?: number;
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
};

const makeShadow = (offsetY: number, blur: number, opacity: number, elev: number, color = '46,31,26'): ShadowStyle => {
  const rgba = `rgba(${color},${opacity})`;
  // iOS: use the native shadow props; Web & Android: use boxShadow + elevation
  if (Platform.OS === 'ios') {
    return {
      shadowColor: `rgb(${color})`,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: blur,
    };
  }
  return {
    boxShadow: `0 ${offsetY}px ${blur}px ${rgba}`,
    elevation: elev,
  };
};

export const SHADOW = {
  none: {} as ShadowStyle,
  xs: makeShadow(1, 4, 0.04, 1),
  sm: makeShadow(2, 8, 0.05, 2),
  md: makeShadow(2, 12, 0.06, 3),
  lg: makeShadow(4, 16, 0.08, 5),
  xl: makeShadow(6, 24, 0.10, 8),
};

// Inline colored shadow helper — replaces deprecated inline shadow* props on web/Android.
// Use as: `...shadowStyle('#00C48A', 4, 12, 0.3, 5)` in any StyleSheet.create block.
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
//  SHARED CONSTANTS — single source of truth for constants used across screens
// ══════════════════════════════════════════════════════════════════════
export const UPI_APPS = [
  { id: 'gpay',    name: 'Google Pay', color: '#4285F4', icon: 'logo-google' },
  { id: 'phonepe', name: 'PhonePe',    color: '#5F259F', icon: 'phone-portrait' },
  { id: 'paytm',   name: 'Paytm',      color: '#00BAF2', icon: 'wallet' },
  { id: 'bhim',    name: 'BHIM UPI',   color: '#00695C', icon: 'shield-checkmark' },
] as const;
