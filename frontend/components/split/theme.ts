import { COLORS } from '../../utils/theme';

/**
 * Split-screen color palette — LIVE proxy into the global theme.
 *
 * Previously this was a snapshot taken at module-load time, which meant the
 * Split tab stayed frozen in whatever theme the app booted with (usually
 * dark/AMOLED) even after the user flipped to Light mode. Wrapping it in a
 * getter-based Proxy routes every `C.bg`, `C.accent`, etc. read through the
 * current COLORS proxy so theme switches reflect instantly.
 */
const C_LIVE = {
  get bg()           { return COLORS.bg.primary; },
  get card()         { return COLORS.bg.secondary; },
  get cardBorder()   { return COLORS.border.card; },
  get glass()        { return COLORS.bg.elevated; },
  get glassBorder()  { return COLORS.border.subtle; },
  get accent()       { return COLORS.accent.primary; },
  get accentLight()  { return COLORS.accent.primaryLight; },
  get accentDim()    { return COLORS.accent.primary + '14'; },
  get green()        { return COLORS.accent.moneyIn; },
  get greenDim()     { return COLORS.accent.moneyIn + '14'; },
  get red()          { return COLORS.accent.moneyOut; },
  get redDim()       { return COLORS.accent.moneyOut + '14'; },
  get gold()         { return COLORS.accent.secondary; },
  get goldDim()      { return COLORS.accent.secondary + '20'; },
  get blue()         { return '#1565C0'; },
  get purple()       { return '#6A1B9A'; },
  get text1()        { return COLORS.text.primary; },
  get text2()        { return COLORS.text.secondary; },
  get text3()        { return COLORS.text.muted; },
  get text4()        { return COLORS.text.muted; },
  get border()       { return COLORS.border.subtle; },
  get sheetBg()      { return COLORS.bg.secondary; },
  get inv()          { return COLORS.text.inverse; },
};

// Freeze the object but let its getters run on every read.
export const C = C_LIVE as unknown as {
  bg: string; card: string; cardBorder: string; glass: string; glassBorder: string;
  accent: string; accentLight: string; accentDim: string;
  green: string; greenDim: string; red: string; redDim: string;
  gold: string; goldDim: string; blue: string; purple: string;
  text1: string; text2: string; text3: string; text4: string;
  border: string; sheetBg: string; inv: string;
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

// Splitwise-style split types. Percentage removed per product spec;
// the three remaining modes cover 99% of real-world group bills.
export const SPLIT_TYPES = [
  { id: 'equal', icon: 'people', label: 'Equally' },
  { id: 'custom', icon: 'calculator', label: 'Exact ₹' },
  { id: 'shares', icon: 'stats-chart', label: 'By Shares' },
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
