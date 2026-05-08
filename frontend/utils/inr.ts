/**
 * inr.ts — single source of truth for Indian-rupee rendering in MintU.
 *
 * Why this file exists
 * ────────────────────
 * Before R101E we had ~30 hand-rolled `₹${n.toLocaleString('en-IN')}`
 * calls scattered across split / transactions / budgets, each one
 * subtly different:
 *   ₹487979      ← bare toString, no commas         (bug)
 *   ₹48,7979     ← toLocaleString('en-US')          (bug)
 *   ₹4,87,979    ← toLocaleString('en-IN')          (correct)
 *   ₹4.88L       ← compact form mixed with precise  (bug for receipts)
 *
 * Money rendering bugs destroy trust faster than any other class of
 * UI bug. Centralised here so every screen of the app reads ₹4,87,979
 * with the same rhythm, the same decimals, the same compact rules.
 *
 * Strict rules
 * ────────────
 *   1. Receipts, settlement amounts, expense totals, single-debt rows
 *      → `inr(n)` — full Indian grouping, no abbreviation, EVER.
 *
 *   2. Dashboard summary tiles, charts, hero "₹X total" headlines
 *      → `inrCompact(n)` — allowed to abbreviate above ₹1L.
 *
 *   3. Settlement math, equal-split previews, paise-precision
 *      → `inrPrecise(n)` — keeps decimals, never rounds silently.
 */

/** True if `n` is a usable finite number we can format. */
const isNum = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/**
 * Format a rupee value with proper Indian grouping (lakh / crore commas).
 *
 *   inr(48_79_979)  → "₹48,79,979"
 *   inr(1_30_000)   → "₹1,30,000"
 *   inr(125)        → "₹125"
 *   inr(0)          → "₹0"
 *   inr(undefined)  → "₹—"   (safe fallback, never NaN)
 *
 * Use for: ALL receipts, ALL settlement amounts, ALL single-debt rows,
 * ALL group balance lines, ALL expense card totals.
 *
 * @param n      The rupee amount (whole rupees, not paise).
 * @param signed When true, prefixes "+" for positive numbers (used for
 *               net-position chips like "+₹1,200"). Negative is always
 *               signed (the "−" is part of money). Default false.
 */
export function inr(n: number | null | undefined, signed: boolean = false): string {
  if (!isNum(n)) return '₹—';
  const rounded = Math.round(n);
  const abs = Math.abs(rounded);
  // 'en-IN' applies the lakh/crore comma grouping (1,23,456 not 123,456).
  const body = abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const sign = rounded < 0 ? '−' : signed ? '+' : '';
  return `${sign}₹${body}`;
}

/**
 * Compact dashboard form. Allowed ONLY in summary tiles / chart
 * legends / hero headlines — never on a transaction row.
 *
 *   inrCompact(48_79_979)  → "₹48.8L"
 *   inrCompact(1_30_000)   → "₹1.3L"
 *   inrCompact(75_000)     → "₹75,000"   (under ₹1L → falls back to inr)
 *   inrCompact(1_25_00_000)→ "₹1.25Cr"
 *
 * Threshold rationale: people read "75K" fine but "₹75,000" reads
 * faster on a small phone, so we don't compact below ₹1,00,000.
 */
export function inrCompact(n: number | null | undefined): string {
  if (!isNum(n)) return '₹—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_00_00_000) {
    return `${sign}₹${(abs / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 0 : 1)}Cr`;
  }
  if (abs >= 1_00_000) {
    return `${sign}₹${(abs / 1_00_000).toFixed(abs >= 10_00_000 ? 0 : 1)}L`;
  }
  return inr(n);
}

/**
 * Precision-preserving form for split-math previews and settlement
 * equal-split breakdowns. Keeps up to 2 decimals, but trims trailing
 * zeros so ₹100.00 still renders as ₹100.
 *
 *   inrPrecise(33.3333)  → "₹33.33"
 *   inrPrecise(100)      → "₹100"
 *   inrPrecise(99.5)     → "₹99.50"  (we keep .50 because money UX)
 */
export function inrPrecise(n: number | null | undefined): string {
  if (!isNum(n)) return '₹—';
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  // Round to 2 decimals to drop float noise; preserve genuine .50 / .25.
  const rounded = Math.round(abs * 100) / 100;
  const body = rounded.toLocaleString('en-IN', {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₹${body}`;
}

/**
 * Lightweight bare body (no ₹) for slot-rendering a number into an
 * input or label that already shows the symbol elsewhere.
 *
 *   inrBody(48_79_979)  → "48,79,979"
 */
export function inrBody(n: number | null | undefined): string {
  if (!isNum(n)) return '—';
  return Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export default inr;
