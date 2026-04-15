// MintU Design System - Theme Constants
import { StyleSheet } from 'react-native';

export const COLORS = {
  bg: {
    primary: '#0A0F1C',
    secondary: '#131B2D',
    glass: 'rgba(19, 27, 45, 0.6)',
    card: '#131B2D',
    elevated: '#1A2338',
  },
  accent: {
    primary: '#10B981',
    primaryLight: '#34D399',
    secondary: '#3B82F6',
    tertiary: '#8B5CF6',
    moneyIn: '#10B981',
    moneyOut: '#F43F5E',
    warning: '#F59E0B',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#94A3B8',
    muted: '#64748B',
    inverse: '#0A0F1C',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',
    focus: '#10B981',
    card: 'rgba(255, 255, 255, 0.05)',
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
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  small: { fontSize: 14, fontWeight: '400' as const },
  tiny: { fontSize: 12, fontWeight: '500' as const },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.5, textTransform: 'uppercase' as const },
};

export const CATEGORIES: Record<string, { icon: string; color: string }> = {
  Food: { icon: 'restaurant', color: '#F59E0B' },
  Transport: { icon: 'car', color: '#3B82F6' },
  Shopping: { icon: 'bag-handle', color: '#EC4899' },
  Bills: { icon: 'flash', color: '#F97316' },
  Entertainment: { icon: 'film', color: '#8B5CF6' },
  Healthcare: { icon: 'medkit', color: '#EF4444' },
  Education: { icon: 'school', color: '#06B6D4' },
  Investment: { icon: 'trending-up', color: '#10B981' },
  Groceries: { icon: 'nutrition', color: '#84CC16' },
  Rent: { icon: 'home', color: '#6366F1' },
  Other: { icon: 'ellipsis-horizontal', color: '#64748B' },
};

export const CATEGORY_LIST = Object.keys(CATEGORIES);
