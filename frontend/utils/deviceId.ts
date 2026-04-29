/**
 * utils/deviceId.ts — Round 53g
 *
 * Stable per-device UUID stored in expo-secure-store. Generated once
 * on first launch and persisted across app restarts. The backend uses
 * this (hashed) as a secondary rate-limit key, so multi-account abuse
 * from one device hits the device ceiling instead of trivially
 * rotating user accounts.
 *
 * Privacy:
 *   • Stored in SecureStore (Keychain on iOS, EncryptedSharedPreferences
 *     on Android) — not readable by other apps.
 *   • Backend HASHES it before storing — the rate-limit table never
 *     contains the raw UUID.
 *   • Cleared on app uninstall (per-platform default) so it's not a
 *     long-lived tracking ID; it's a per-install identifier.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'mintu.device_id';

let _cached: string | null = null;
let _inFlight: Promise<string> | null = null;

/** Generate a UUIDv4 without pulling in a heavy dep. */
function uuidv4(): string {
  // RFC4122-compliant v4 UUID using crypto.getRandomValues when available.
  const arr = new Uint8Array(16);
  // Expo's RN environment exposes global.crypto.getRandomValues.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(arr);
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  // Per RFC4122 §4.4
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Get the stable device id, generating + persisting it on first call.
 * Subsequent calls return the cached value (in-memory + SecureStore).
 *
 * Concurrency-safe: parallel callers share the same in-flight promise
 * so the first cold-start doesn't issue two SecureStore writes.
 */
export async function getDeviceId(): Promise<string> {
  if (_cached) return _cached;
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      let id = await SecureStore.getItemAsync(KEY);
      if (!id) {
        id = uuidv4();
        await SecureStore.setItemAsync(KEY, id);
      }
      _cached = id;
      return id;
    } catch {
      // SecureStore can fail on simulator / web; fall back to a session
      // id that's still consistent within the running JS context. Better
      // a degraded fingerprint than zero rate-limit signal.
      const fallback = uuidv4();
      _cached = fallback;
      return fallback;
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

/** For tests / sign-out: forget the cached id. The persistent
 *  SecureStore value is intentionally NOT cleared (we want the same
 *  device to keep the same id across sign-out / sign-in cycles). */
export function _resetDeviceIdCache(): void {
  _cached = null;
  _inFlight = null;
}
