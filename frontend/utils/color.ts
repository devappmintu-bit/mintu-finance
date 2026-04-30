/**
 * Tiny color utilities shared across the app.
 *
 * Keep this module dependency-free (no react imports) so it's cheap to pull
 * into any component without dragging the whole theme graph along.
 */

/**
 * Lighten or darken a hex color by `pct` (-1..+1).
 *   shade('#FF6B1A', -0.2)  →  20% darker
 *   shade('#FF6B1A', +0.15) →  15% lighter
 *
 * Invalid input returns the original string so we never throw in a JSX
 * render path. Previously re-implemented inline in 3 reward components.
 */
export function shade(hex: string, pct: number): string {
  try {
    const c = hex.replace('#', '');
    if (c.length !== 6) return hex;
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const adj = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v * pct : (255 - v) * pct))));
    return `#${[adj(r), adj(g), adj(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return hex;
  }
}

/** Parse `#RRGGBB` to `[r, g, b]` with NaN guards. Returns null on invalid input. */
export function parseHex(hex: string): [number, number, number] | null {
  const c = hex.replace('#', '');
  if (c.length !== 6) return null;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return [r, g, b];
}

/** Wrap a hex color in rgba() with a given alpha (0..1). */
export function withAlpha(hex: string, alpha: number): string {
  const parsed = parseHex(hex);
  if (!parsed) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${parsed[0]}, ${parsed[1]}, ${parsed[2]}, ${a})`;
}
