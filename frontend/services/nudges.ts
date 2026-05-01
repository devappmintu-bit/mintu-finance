/**
 * services/nudges.ts — Round 53m Pending Settlement Nudges client.
 *
 * Personality-driven self-reminders, NOT peer-to-peer reminders (those
 * live in services/split.ts).
 *
 *   • fetchActiveNudges()                — list active nudges for caller
 *   • dismissNudge(id, snoozeHours?)     — bump ignore count
 *   • resetNudgeForGroup(group_id)       — re-engagement clears suppress
 *
 * Tone caps + suppression are server-side; the client just renders
 * the chip/banner with the strength the server reports.
 */
import api from '../utils/api';

export type NudgeStrength = 'soft' | 'medium' | 'strong';
export type NudgeStatus = 'active' | 'dismissed' | 'resolved';

export type PendingNudge = {
  id: string;
  user_id: string;
  group_id: string;
  group_name: string;
  amount_paise: number;
  amount: number;
  ignore_count: number;
  strength: NudgeStrength;
  last_nudged_at: string | null;
  suppress_until: string | null;
  status: NudgeStatus;
};

export async function fetchActiveNudges(): Promise<PendingNudge[]> {
  try {
    const r = await api.get('/nudges/list');
    const list = (r.data?.nudges as PendingNudge[]) || [];
    return Array.isArray(list) ? list : [];
  } catch {
    // Self-reminders are non-critical — silently empty on failure.
    return [];
  }
}

export async function dismissNudge(id: string, snoozeHours?: number): Promise<PendingNudge | null> {
  try {
    const r = await api.post(`/nudges/${id}/dismiss`, snoozeHours ? { snooze_hours: snoozeHours } : {});
    return (r.data?.nudge as PendingNudge) || null;
  } catch {
    return null;
  }
}

export async function resetNudgeForGroup(groupId: string): Promise<void> {
  try {
    await api.post(`/nudges/group/${groupId}/reset`, {});
  } catch {
    /* best-effort — re-engagement is a soft signal */
  }
}

/**
 * Pick the most "actionable" nudge for hero placement (e.g. home
 * mascot context). The "strongest" nudge isn't necessarily the loudest
 * — we want the one most likely to resolve cleanly, which is:
 *   1. Highest amount
 *   2. AMONG nudges where strength != 'strong' (strong = recently
 *      ignored, surfacing again would feel naggy).
 */
export function pickHeroNudge(nudges: PendingNudge[]): PendingNudge | null {
  if (!nudges?.length) return null;
  const palatable = nudges.filter((n) => n.strength !== 'strong');
  const pool = palatable.length ? palatable : nudges;
  return pool.slice().sort((a, b) => b.amount_paise - a.amount_paise)[0] || null;
}

/** Map a server-reported strength to UI affordances (color tint, copy). */
export function strengthHints(strength: NudgeStrength): {
  cta: string;
  voice: string;
} {
  switch (strength) {
    case 'medium':
      return {
        cta: 'Settle now',
        voice: 'A small thing still pending here.',
      };
    case 'strong':
      return {
        cta: 'Clear it',
        voice: 'Let\u2019s wrap this up.',
      };
    case 'soft':
    default:
      return {
        cta: 'Settle it',
        voice: 'One small thing left here. Want me to clear it?',
      };
  }
}
