/**
 * groupTransactionsByDate — transforms a flat list of transactions into an
 * interleaved array of section headers + transaction rows for FlashList /
 * SectionList style rendering.
 *
 * Buckets:
 *   • Today
 *   • Yesterday
 *   • This Week (within the last 7 days, excluding Today + Yesterday)
 *   • <Month YYYY>  for everything older
 *
 * Output shape:
 *   [
 *     { type: 'header', key: 'h-Today',     label: 'Today',     count: 3, total: 1240 },
 *     { type: 'txn',    key: 'txn-<id>',    data: txnObj },
 *     ...
 *   ]
 *
 * Why this signature?
 *   FlashList performs best when each row has a stable `type` discriminator
 *   (passed through `getItemType`) and a stable `key`. We pre-compute both
 *   so the render path stays branch-free.
 */
import { format } from 'date-fns';

export type TxnRowItem = { type: 'header'; key: string; label: string; count: number; total: number }
                       | { type: 'txn'; key: string; data: any };

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function groupTransactionsByDate(txns: any[]): TxnRowItem[] {
  if (!Array.isArray(txns) || txns.length === 0) return [];

  const today = startOfDay(new Date());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 6 * 86_400_000); // last 7 days incl. today

  // Sort newest first so the visual list reads top-down latest → oldest.
  const sorted = [...txns].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    return tb - ta;
  });

  // Bucket map: preserves insertion order so output respects sort.
  const buckets: { label: string; rows: any[] }[] = [];
  const ensureBucket = (label: string): any[] => {
    let b = buckets.find((x) => x.label === label);
    if (!b) {
      b = { label, rows: [] };
      buckets.push(b);
    }
    return b.rows;
  };

  for (const t of sorted) {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) {
      ensureBucket('Earlier').push(t);
      continue;
    }
    const dayStart = startOfDay(d);
    if (dayStart.getTime() === today.getTime()) {
      ensureBucket('Today').push(t);
    } else if (dayStart.getTime() === yesterday.getTime()) {
      ensureBucket('Yesterday').push(t);
    } else if (dayStart >= weekAgo && dayStart < yesterday) {
      ensureBucket('This Week').push(t);
    } else {
      // Group older entries by month label e.g. "Apr 2026"
      ensureBucket(format(d, 'MMM yyyy')).push(t);
    }
  }

  // Flatten into header + row stream.
  const out: TxnRowItem[] = [];
  for (const b of buckets) {
    const total = b.rows.reduce((acc, r) => {
      const amt = Number(r?.amount) || 0;
      // Net daily impact: credit adds, debit subtracts.
      return r?.type === 'credit' ? acc + amt : acc - amt;
    }, 0);
    out.push({
      type: 'header',
      key: `h-${b.label}`,
      label: b.label,
      count: b.rows.length,
      total,
    });
    for (const r of b.rows) {
      out.push({ type: 'txn', key: `txn-${r.id ?? r._id ?? Math.random().toString(36).slice(2)}`, data: r });
    }
  }
  return out;
}
