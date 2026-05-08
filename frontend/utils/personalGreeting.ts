/**
 * personalGreeting — a single, honest greeting builder.
 *
 * The home screen used to render whatever was in `user.name` verbatim,
 * which leaked debug placeholders like "Test User" / "User" / "MintU
 * User" onto the user's screen. UX audit P0: this is a creepy /
 * broken-trust moment.
 *
 * Rules:
 *   1) If user.name looks real (not a placeholder), use the FIRST name.
 *   2) Otherwise fall back to last 4 of phone ("*4321").
 *   3) Otherwise generic "there".
 *   4) Time-aware prefix: Good morning / afternoon / evening.
 */

const PLACEHOLDER_NAMES = new Set([
  'test user', 'test', 'user', 'mintu user', 'mintuuser',
  'demo', 'demo user', 'guest', 'unknown',
  'new user', 'new test user',
]);

export function isPlaceholderName(name?: string | null): boolean {
  if (!name) return true;
  const n = String(name).trim().toLowerCase();
  if (!n) return true;
  return PLACEHOLDER_NAMES.has(n);
}

/** First word of a name, safely. */
export function firstName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  if (!first) return null;
  // Title-case the first letter so "akhil" → "Akhil".
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** "*4321" from "+919876543210". Returns null if phone is too short. */
export function phoneTail(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, '');
  if (digits.length < 4) return null;
  return `*${digits.slice(-4)}`;
}

export function timeOfDayPrefix(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5)  return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Hey night owl';
}

export interface PersonalGreeting {
  /** Short ALL-CAPS kicker, e.g. "GOOD MORNING" — for the small label line. */
  kicker: string;
  /** The display name we picked. e.g. "Akhil" or "*4321" or "there". */
  display: string;
  /** Combined headline, e.g. "Hey, Akhil". Use as the bold name line. */
  headline: string;
}

export function buildPersonalGreeting(
  user?: { name?: string | null; phone?: string | null } | null,
  now: Date = new Date(),
): PersonalGreeting {
  const kicker = timeOfDayPrefix(now).toUpperCase();

  if (!isPlaceholderName(user?.name)) {
    const first = firstName(user?.name);
    if (first) return { kicker, display: first, headline: `Hey, ${first}` };
  }
  // R101D — Removed the `*XXXX` phone-tail fallback. Showing the last
  // 4 of someone's phone number on their home screen is a privacy
  // regression (anyone glancing over their shoulder can read it) and
  // it didn't actually feel personal — it felt like a debug placeholder.
  // Better to be warm-and-anonymous than creepily-pseudo-personal.
  return { kicker, display: 'there', headline: 'Hey there 👋' };
}

export default buildPersonalGreeting;
