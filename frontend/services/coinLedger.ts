// Round 39 — coin ledger client (cursor pagination + lifetime totals).
import api from '../utils/api';

export type LedgerType = 'all' | 'earn' | 'spend';

export interface LedgerEntry {
  id: string;
  type: 'earn' | 'spend';
  amount: number;          // always positive
  description: string;
  source: string;
  balance_after: number;
  created_at: string;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  next_cursor: string | null;
  total_earned: number;
  total_spent: number;
}

export async function fetchLedgerPage(opts: {
  type?: LedgerType;
  cursor?: string | null;
  limit?: number;
} = {}): Promise<LedgerPage> {
  const params = new URLSearchParams();
  if (opts.type) params.set('type', opts.type);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  const r = await api.get(`/coins/ledger?${params.toString()}`);
  return r.data;
}

// Map source string → emoji for the row icon.
export function sourceEmoji(source: string): string {
  const s = (source || '').toLowerCase();
  if (s.includes('streak'))    return '🔥';
  if (s.includes('reward') || s.includes('marketplace') || s.includes('voucher')) return '🎁';
  if (s.includes('referral') || s.includes('invite')) return '👥';
  if (s.includes('split') || s.includes('settle')) return '💳';
  if (s.includes('transaction') || s.includes('expense')) return '💸';
  if (s.includes('mission') || s.includes('quest'))  return '🎯';
  if (s.includes('spin') || s.includes('wheel'))     return '🎡';
  return '⭐';
}

// Pure-fn relative time (no dayjs dep).
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
