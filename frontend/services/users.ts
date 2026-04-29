/**
 * services/users.ts — Users domain API wrappers.
 */
import api from '../utils/api';

export type LookupMatch = {
  phone: string;
  user_id: string;
  name: string;
};

/**
 * Round 51n — Batch reverse-lookup phones → MintU user records.
 *
 * Used by the Add-Member contacts picker to flag which device contacts
 * are existing MintU users (so we render the "On MintU" badge instead
 * of the "Invite" CTA). Single round-trip vs N×GET, server enforces a
 * 200-phone-per-call cap.
 *
 * Privacy: only matches are returned — non-matching phones aren't
 * acknowledged in any way.
 */
export async function lookupUsersByPhones(phones: string[]): Promise<LookupMatch[]> {
  // De-dupe + chunk to respect the server's max_batch=100 limit.
  const unique = Array.from(new Set(phones.filter(Boolean)));
  if (unique.length === 0) return [];

  const out: LookupMatch[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const slice = unique.slice(i, i + 100);
    try {
      const r = await api.post('/users/lookup-batch', { phones: slice });
      const matches: LookupMatch[] = r?.data?.matches || [];
      out.push(...matches);
    } catch {
      // Don't fail the whole flow if one chunk errors — Add-Member
      // gracefully falls back to "everyone is invitable".
    }
  }
  return out;
}
