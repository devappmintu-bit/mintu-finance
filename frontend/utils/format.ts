/**
 * Tiny formatting helpers shared across screens.
 *
 * Kept intentionally lean — for fancier currency formatting use Intl
 * directly at the call site.
 */

export const fmtINR = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '₹0';
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};

export const fmtINRDecimal = (n: number | null | undefined, digits = 2): string => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '₹0';
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

export const fmtCount = (n: number, singular: string, plural?: string): string => {
  const word = n === 1 ? singular : (plural || `${singular}s`);
  return `${n} ${word}`;
};
