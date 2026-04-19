import { COLORS } from '../../utils/theme';

export const C = {
  bg: COLORS.bg.primary,
  card: 'rgba(255,255,255,0.92)',
  cardBorder: 'rgba(238,221,204,0.7)',
  glass: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(230,81,0,0.06)',
  accent: COLORS.accent.primary,
  accentLight: COLORS.accent.primaryLight,
  accentDim: 'rgba(230,81,0,0.08)',
  green: COLORS.accent.moneyIn,
  greenDim: 'rgba(46,125,50,0.08)',
  red: COLORS.accent.moneyOut,
  redDim: 'rgba(211,47,47,0.08)',
  gold: COLORS.accent.secondary,
  goldDim: 'rgba(255,179,0,0.12)',
  blue: '#1565C0',
  purple: '#6A1B9A',
  text1: COLORS.text.primary,
  text2: COLORS.text.secondary,
  text3: COLORS.text.muted,
  text4: '#C5B5A8',
  border: COLORS.border.subtle,
  sheetBg: '#FFFFFF',
  inv: '#FFFFFF',
};

export const MEMBER_COLORS = ['#E65100', '#FFB300', '#2E7D32', '#D32F2F', '#6A1B9A', '#C62828', '#1565C0', '#F57F17'];

// Chat stickers used in group chat messages. Single source of truth.
export const STICKERS = ['😂', '🔥', '💰', '🎉', '👍', '❤️', '😭', '🤑', '💸', '🙏', '👏', '🍕', '🛒', '✈️', '🏠', '🎯', '💪', '🤝', '😎', '🥳', '☕', '🍺', '🎬', '⛽'];

export const GROUP_ICONS: Record<string, { emoji: string; colors: string[] }> = {
  trip: { emoji: '\u2708\uFE0F', colors: ['#0EA5E9', '#6366F1'] },
  goa: { emoji: '\uD83C\uDFD6\uFE0F', colors: ['#F59E0B', '#EF4444'] },
  flat: { emoji: '\uD83C\uDFE0', colors: ['#8B5CF6', '#6366F1'] },
  office: { emoji: '\uD83D\uDCBC', colors: ['#3B82F6', '#6366F1'] },
  food: { emoji: '\uD83C\uDF55', colors: ['#EF4444', '#F97316'] },
  dinner: { emoji: '\uD83C\uDF7D\uFE0F', colors: ['#EC4899', '#F43F5E'] },
  rent: { emoji: '\uD83C\uDFE1', colors: ['#10B981', '#059669'] },
  party: { emoji: '\uD83C\uDF89', colors: ['#F97316', '#EF4444'] },
  team: { emoji: '\uD83D\uDC65', colors: ['#3B82F6', '#0EA5E9'] },
  family: { emoji: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66', colors: ['#059669', '#10B981'] },
  default: { emoji: '\uD83D\uDCB0', colors: ['#E65100', '#FF7D33'] },
};

export const getGA = (n: string) => {
  const l = (n || '').toLowerCase();
  for (const [k, v] of Object.entries(GROUP_ICONS)) {
    if (k !== 'default' && l.includes(k)) return v;
  }
  return GROUP_ICONS.default;
};

// UPI_APPS is now the single source of truth in /utils/theme.ts — re-export for back-compat
export { UPI_APPS } from '../../utils/theme';

export const SPLIT_TYPES = [
  { id: 'equal', icon: 'git-compare', label: 'Equal' },
  { id: 'custom', icon: 'calculator', label: '\u20B9 Amt' },
  { id: 'shares', icon: 'add-circle-outline', label: 'Shares' },
  { id: 'percentage', icon: 'pie-chart', label: '%' },
];

export type DebtRow = {
  group_id: string;
  group_name: string;
  group_emoji: string;
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  amount: number;
  direction: 'i_owe' | 'owed_to_me';
};
