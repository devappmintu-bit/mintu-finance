/**
 * transactionInsights.ts — Smart tags, recurring detection,
 * and calendar heatmap helpers for the Money Timeline (R117).
 *
 * This file is pure logic. It never calls the network — it consumes the
 * already-loaded transactions list and derives at-a-glance signals.
 *
 * Three primitives:
 *   1. detectRecurring(txns) → Set<txnId>   (looks for same-merchant
 *      same-amount fingerprints repeating monthly).
 *   2. smartTagsFor(txn, ctx) → Tag[]       (e.g. WEEKEND, FIRST TIME,
 *      RECURRING, BIG, IMPULSE, SPLITABLE).
 *   3. heatmapByDay(txns, days=30) → Bucket[]   (30-day intensity ladder
 *      for the calendar strip).
 *
 * All functions are O(N) over the input list.
 */

export type SmartTagId =
  | 'recurring'
  | 'weekend'
  | 'first_time'
  | 'big'
  | 'impulse'
  | 'splitable'
  | 'subscription'
  | 'food';

export interface SmartTag {
  id: SmartTagId;
  label: string;
  emoji: string;
  tone: 'neutral' | 'warm' | 'cool' | 'warn';
}

const TAG_DEFS: Record<SmartTagId, SmartTag> = {
  recurring:    { id: 'recurring',    label: 'RECURRING',    emoji: '↻', tone: 'cool' },
  weekend:      { id: 'weekend',      label: 'WEEKEND',      emoji: '🌴', tone: 'warm' },
  first_time:   { id: 'first_time',   label: 'NEW MERCHANT', emoji: '✦',  tone: 'neutral' },
  big:          { id: 'big',          label: 'BIG SPEND',    emoji: '◆',  tone: 'warn' },
  impulse:      { id: 'impulse',      label: 'LATE NIGHT',   emoji: '🌙', tone: 'warm' },
  splitable:    { id: 'splitable',    label: 'SPLITABLE',    emoji: '⇄',  tone: 'cool' },
  subscription: { id: 'subscription', label: 'SUBSCRIPTION', emoji: '⊡',  tone: 'cool' },
  food:         { id: 'food',         label: 'TREAT',        emoji: '🍕', tone: 'warm' },
};

// ─── RECURRING DETECTION ────────────────────────────────────────────────
// A transaction is "recurring" when (description+amount) appears in a prior
// month within ±10% amount tolerance. We use a normalized merchant key.
export function detectRecurring(txns: any[]): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(txns) || txns.length < 2) return out;

  // Group by normalized merchant key.
  const buckets = new Map<string, any[]>();
  for (const t of txns) {
    if (!t || t.type !== 'debit') continue;
    const desc = String(t.description || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!desc) continue;
    const key = desc.slice(0, 16);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }

  for (const [, items] of buckets) {
    if (items.length < 2) continue;
    // Group by month-year so we know the same merchant fired in distinct months.
    const months = new Set<string>();
    for (const it of items) {
      const d = new Date(it.date);
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    if (months.size >= 2) {
      // Mark every transaction in this merchant cluster as recurring.
      for (const it of items) out.add(it.id);
    }
  }
  return out;
}

// ─── SMART TAGS ─────────────────────────────────────────────────────────
export interface TagContext {
  recurringIds: Set<string>;
  firstTimeMerchants: Set<string>;
  bigThreshold: number;        // amount above which a debit is "big"
}

export function buildTagContext(txns: any[]): TagContext {
  const recurringIds = detectRecurring(txns);
  // first time merchants: debits whose merchant key appears EXACTLY ONCE
  // in the entire history
  const merchantCount = new Map<string, number>();
  for (const t of txns) {
    if (!t || t.type !== 'debit') continue;
    const desc = String(t.description || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!desc) continue;
    const key = desc.slice(0, 16);
    merchantCount.set(key, (merchantCount.get(key) || 0) + 1);
  }
  const firstTimeMerchants = new Set<string>();
  for (const [k, v] of merchantCount) if (v === 1) firstTimeMerchants.add(k);

  // Big-spend threshold = top 10 percentile of debit amounts, floored at 1500.
  const debits = txns.filter((t) => t?.type === 'debit').map((t) => Number(t.amount) || 0);
  debits.sort((a, b) => a - b);
  const p90 = debits.length ? debits[Math.floor(debits.length * 0.9)] : 0;
  const bigThreshold = Math.max(1500, p90 || 0);

  return { recurringIds, firstTimeMerchants, bigThreshold };
}

export function smartTagsFor(txn: any, ctx: TagContext): SmartTag[] {
  const tags: SmartTag[] = [];
  if (!txn || txn.type !== 'debit') return tags;
  const amt = Number(txn.amount) || 0;
  const d = new Date(txn.date);
  const dow = d.getDay(); // 0 = Sun, 6 = Sat
  const hour = d.getHours();
  const desc = String(txn.description || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
  const cat = String(txn.category || '');

  // 1) Recurring beats everything.
  if (ctx.recurringIds.has(txn.id)) tags.push(TAG_DEFS.recurring);
  // 2) Subscription if recurring AND specific keywords.
  const subKeywords = /netflix|spotify|prime|hotstar|youtube|recharge|jio|airtel|vi/;
  if (ctx.recurringIds.has(txn.id) && subKeywords.test(desc)) tags.push(TAG_DEFS.subscription);
  // 3) First-time merchant.
  if (!ctx.recurringIds.has(txn.id) && ctx.firstTimeMerchants.has(desc)) tags.push(TAG_DEFS.first_time);
  // 4) Big spend.
  if (amt >= ctx.bigThreshold) tags.push(TAG_DEFS.big);
  // 5) Late-night impulse (00:00 – 03:59 weekdays).
  if (hour >= 0 && hour < 4 && dow >= 1 && dow <= 5) tags.push(TAG_DEFS.impulse);
  // 6) Weekend tag (Sat/Sun) — not stacked with subscription/recurring noise.
  if ((dow === 0 || dow === 6) && !ctx.recurringIds.has(txn.id)) tags.push(TAG_DEFS.weekend);
  // 7) Splitable: amount ≥ 800 and category in [Food, Transport, Shopping, Entertainment].
  if (amt >= 800 && /food|dining|transport|shopping|entertainment|travel/i.test(cat)) {
    if (!ctx.recurringIds.has(txn.id)) tags.push(TAG_DEFS.splitable);
  }
  // 8) Treat: small food spends.
  if (amt < 800 && /food|dining/i.test(cat) && !ctx.recurringIds.has(txn.id)) {
    tags.push(TAG_DEFS.food);
  }
  // Cap at 2 tags so the row stays calm.
  return tags.slice(0, 2);
}

// ─── 30-DAY HEATMAP ─────────────────────────────────────────────────────
export interface HeatmapDay {
  date: Date;
  iso: string;       // YYYY-MM-DD
  total: number;
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4;  // 0 = no spend, 4 = peak
  isToday: boolean;
}

export function heatmapByDay(txns: any[], days = 30): HeatmapDay[] {
  const out: HeatmapDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byIso = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (!t || t.type !== 'debit') continue;
    const d = new Date(t.date);
    d.setHours(0, 0, 0, 0);
    const iso = d.toISOString().slice(0, 10);
    const cur = byIso.get(iso) || { total: 0, count: 0 };
    cur.total += Number(t.amount) || 0;
    cur.count += 1;
    byIso.set(iso, cur);
  }

  // Compute intensity scale based on the day with the maximum spend in window.
  let max = 0;
  for (const [, v] of byIso) if (v.total > max) max = v.total;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const stat = byIso.get(iso) || { total: 0, count: 0 };
    let intensity: 0 | 1 | 2 | 3 | 4 = 0;
    if (stat.total > 0 && max > 0) {
      const ratio = stat.total / max;
      if (ratio >= 0.75) intensity = 4;
      else if (ratio >= 0.5) intensity = 3;
      else if (ratio >= 0.25) intensity = 2;
      else intensity = 1;
    }
    out.push({
      date: d,
      iso,
      total: stat.total,
      count: stat.count,
      intensity,
      isToday: i === 0,
    });
  }
  return out;
}

// Friendly labels for tag tone → color resolution at the call site.
export const TAG_TONE_INK: Record<SmartTag['tone'], string> = {
  neutral: '#1A1A1A',
  warm:    '#C2410C',
  cool:    '#0F766E',
  warn:    '#B91C1C',
};
export const TAG_TONE_BG: Record<SmartTag['tone'], string> = {
  neutral: '#F1ECE6',
  warm:    '#FFE8D6',
  cool:    '#D1FAE5',
  warn:    '#FEE2E2',
};
