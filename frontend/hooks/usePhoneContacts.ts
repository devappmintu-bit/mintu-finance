/**
 * usePhoneContacts — lazy-loaded, permission-gated, web-safe contacts hook.
 *
 * Behavior:
 *   • Web → permission: 'unavailable', contacts: []   (expo-contacts has no web impl)
 *   • iOS / Android → requestPermissionsAsync() → getContactsAsync() with
 *     only `Name` + `PhoneNumbers` fields for privacy
 *   • Returns deduplicated, normalized list: one entry per unique phone
 *   • Phones are normalized to the last 10 digits (Indian-first) — matches
 *     the normalizePhone() logic in add-member.tsx
 *   • `load()` must be called explicitly — never fires on mount, so we
 *     don't trigger the iOS permission prompt unless the user actually
 *     wants phone contacts (as per Apple HIG / Play store policy)
 *
 * Cache: the normalized list is memoized in-module for the session. The
 * first call reads the OS; subsequent calls are instant.
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

export type PhoneContact = {
  phone: string;      // normalized 10-digit
  name: string;
  avatar?: string;
};

export type ContactsPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

let cachedList: PhoneContact[] | null = null;

const normalizePhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

export function usePhoneContacts() {
  const [permission, setPermission] = useState<ContactsPermission>(
    Platform.OS === 'web' ? 'unavailable' : 'undetermined'
  );
  const [contacts, setContacts] = useState<PhoneContact[]>(cachedList || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermission('unavailable');
      setError('Phone contacts are available only in the mobile app.');
      return { granted: false, count: 0 };
    }
    if (cachedList) {
      setContacts(cachedList);
      setPermission('granted');
      return { granted: true, count: cachedList.length };
    }
    setLoading(true);
    setError(null);
    try {
      // Dynamic import so web bundles never pull native code paths
      const Contacts = await import('expo-contacts');
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setPermission('denied');
        setLoading(false);
        return { granted: false, count: 0 };
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        pageSize: 1000,
      });

      // Normalize + dedupe by phone
      const seen = new Set<string>();
      const out: PhoneContact[] = [];
      for (const c of data) {
        const name = c.name || '';
        for (const pn of c.phoneNumbers || []) {
          const raw = (pn as any).digits || pn.number || '';
          const norm = normalizePhone(raw);
          if (!norm || norm.length !== 10) continue;
          if (seen.has(norm)) continue;
          seen.add(norm);
          out.push({ phone: norm, name: name || `+91 ${norm}` });
        }
      }
      // Alphabetical by name
      out.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      cachedList = out;
      setContacts(out);
      setPermission('granted');
      setLoading(false);
      return { granted: true, count: out.length };
    } catch (e: any) {
      setError(e?.message || 'Could not read contacts');
      setLoading(false);
      setPermission('denied');
      return { granted: false, count: 0 };
    }
  }, []);

  return { permission, contacts, loading, error, load };
}

/**
 * Invalidate the in-memory cache (e.g. after the user returns from system
 * Settings and you want to re-request contacts). Next `load()` call will
 * hit the OS again.
 */
export function resetPhoneContactsCache() {
  cachedList = null;
}
