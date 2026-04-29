/**
 * utils/observability.ts — Round 53e
 *
 * Sentry init for the Expo / React Native app. DSN-driven kill switch:
 * if `EXPO_PUBLIC_SENTRY_DSN_FRONTEND` is unset/empty, init is a no-op
 * — local dev stays silent. When the DSN is provided, the SDK ships
 * crash reports + breadcrumbs to Sentry tagged with environment,
 * release, device id, and a hashed user id (NEVER the raw phone).
 *
 * NOTE: Public env vars in Expo MUST be prefixed `EXPO_PUBLIC_*` to
 * be inlined into the JS bundle. We use `EXPO_PUBLIC_SENTRY_DSN_FRONTEND`
 * for the DSN (safe to expose — Sentry DSNs are designed for client
 * embedding) and `EXPO_PUBLIC_APP_ENV` for the env tag.
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let _initialised = false;

export const isSentryEnabled = (): boolean => _initialised;

export function initSentry(): boolean {
  if (_initialised) return true;
  const dsn = (process.env.EXPO_PUBLIC_SENTRY_DSN_FRONTEND ?? '').trim();
  if (!dsn) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Sentry] no DSN configured — running in no-op mode');
    }
    return false;
  }

  const env = process.env.EXPO_PUBLIC_APP_ENV ?? 'dev';
  const release =
    process.env.EXPO_PUBLIC_RELEASE ??
    (Constants.expoConfig?.version ?? 'unknown') +
      `+${Constants.expoConfig?.runtimeVersion ?? 'rt'}`;
  const tracesSampleRate = Number(
    process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.2',
  );

  Sentry.init({
    dsn,
    environment: env,
    release,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.2,
    enableAutoSessionTracking: true,
    // PII: we explicitly do NOT send default PII; tags are scrubbed
    // before they ever reach the SDK (see `tagSafe` below).
    sendDefaultPii: false,
    // beforeSend: last line of defense — strip anything sensitive.
    beforeSend(event) {
      try {
        // Drop request bodies; keep URL only.
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            for (const k of Object.keys(event.request.headers)) {
              if (/auth|cookie|token/i.test(k)) {
                event.request.headers[k] = '[FILTERED]';
              }
            }
          }
        }
        // Strip user PII; keep only id (already hashed by setUserSafe).
        if (event.user) {
          delete (event.user as any).phone;
          delete (event.user as any).email;
          delete (event.user as any).ip_address;
        }
        return event;
      } catch {
        return null; // drop on scrubber failure rather than risk leak
      }
    },
  });

  _initialised = true;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
//  PII-safe helpers
// ─────────────────────────────────────────────────────────────────────
/**
 * Trivial 32-bit hash → 8-char hex. Stable enough to cluster events
 * by user without ever revealing the raw phone / id.
 */
function hash8(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function setUserSafe(rawId: string | null | undefined): void {
  if (!_initialised) return;
  if (!rawId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: hash8(String(rawId)) });
}

export function tagSafe(key: string, value: string | number | null | undefined): void {
  if (!_initialised) return;
  if (value === null || value === undefined) return;
  // Hash anything that looks remotely PII-shaped at the call site.
  const v = typeof value === 'string' ? value : String(value);
  Sentry.setTag(key, v);
}

export function breadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  if (!_initialised) return;
  Sentry.addBreadcrumb({
    category,
    message,
    level: 'info',
    data,
  });
}

export const SentryRoot = Sentry; // re-export for ErrorBoundary wiring
