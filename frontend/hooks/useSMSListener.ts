/**
 * useSMSListener — R120 Native SMS ingestion hook (Android only).
 *
 * STATUS: STUB / READY-FOR-EAS
 * ════════════════════════════════════════════════════════════════════
 * This hook is the JS-side wiring for the Android-only native SMS
 * receiver that watches the user's inbox for bank / UPI / EMI alerts
 * and forwards them to /api/sms/bulk-parse for deterministic parsing.
 *
 * It currently runs as a NO-OP on the web preview and on iOS, where
 * SMS APIs are not available. It activates only when:
 *   1. Platform.OS === 'android'
 *   2. The native package is bundled into an EAS Build (config plugin
 *      registered in app.json — pending)
 *   3. The user has granted READ_SMS + RECEIVE_SMS via Android 6+
 *      runtime permission flow
 *
 * To activate after EAS Build is configured:
 *   • Install one of:
 *       - `react-native-android-sms-listener` (lightweight)
 *       - `expo-sms-reader` (custom, not yet published)
 *   • Wrap requestPermissions + addListener calls below the
 *     `// EAS-ACTIVATE` line — currently those calls are guarded
 *     behind `try { require(...) }` so the bundle still ships
 *     without the dep installed.
 *
 * Ingestion contract:
 *   For every detected SMS we POST to /api/sms/bulk-parse with a
 *   single-element messages array. The endpoint is idempotent on
 *   raw-text hash so we can re-fire safely. Cap at one fire per
 *   200ms to avoid hammering the server during inbox sync bursts.
 */
import { useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';

// Bank-shaped SMS sender allow-list. We only ingest senders that
// match these regex patterns to avoid OTP / personal SMS spillover.
const BANK_SENDER_PATTERNS = [
  /^[A-Z]{2}-(HDFC|ICICI|SBI|AXIS|KOTAK|PNB|BOB|RBL|YES|IDFC|FED|IOB|CANARA|UNION|INDUS)/i,
  /^[A-Z]{2}-(PAYTM|PHONEPE|GPAY|BHARATPE|CRED|RAZORP)/i,
  /^[A-Z]{2}-(AMZNPAY|FLPKRT|UBER|OLA|ZOMATO|SWIGGY)/i,
];

const BANK_BODY_HINTS = [
  /debited|credited|spent|received|paid|withdrawn|deposited/i,
  /\bUPI\b|\bIMPS\b|\bNEFT\b|\bRTGS\b/i,
  /ref(?:erence)?\s*(?:no|#)/i,
  /a\/c\s*[xX*0-9]+/i,
];

function looksLikeBankSMS(sender: string, body: string): boolean {
  const s = (sender || '').toString();
  const b = (body || '').toString();
  if (!b) return false;
  const senderHit = BANK_SENDER_PATTERNS.some((re) => re.test(s));
  const bodyHit = BANK_BODY_HINTS.some((re) => re.test(b));
  // Require either a known sender pattern OR strong body hint, not
  // both — many small banks use undocumented sender IDs.
  return senderHit || bodyHit;
}

export function useSMSListener() {
  const { token: authToken } = useAuthStore();
  const lastFiredAt = useRef<number>(0);
  const subscriptionRef = useRef<{ remove?: () => void } | null>(null);

  useEffect(() => {
    if (!authToken) return;
    if (Platform.OS !== 'android') return;

    let alive = true;

    (async () => {
      // ── Step 1: ask for runtime permission. The READ_SMS string
      //   may be missing from the bundled PermissionsAndroid enum
      //   on older SDKs; fall through gracefully.
      try {
        const READ = (PermissionsAndroid.PERMISSIONS as any).READ_SMS;
        const RECEIVE = (PermissionsAndroid.PERMISSIONS as any).RECEIVE_SMS;
        if (!READ || !RECEIVE) return; // SDK doesn't expose SMS perms
        const granted = await PermissionsAndroid.requestMultiple([READ, RECEIVE]);
        const ok =
          granted[READ] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[RECEIVE] === PermissionsAndroid.RESULTS.GRANTED;
        if (!ok) return;
      } catch {
        return; // user denied / system blocked
      }

      if (!alive) return;

      // ── Step 2: load the native module if it ships in this build.
      //   Wrapped in try/require so the JS bundle works even when the
      //   native dep isn't installed (web preview, iOS, dev clients).
      let smsListener: any = null;
      try {
        // EAS-ACTIVATE: switch this to the actual installed package
        // once the EAS Build pipeline includes it.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        smsListener = require('react-native-android-sms-listener').default;
      } catch {
        return; // native module not bundled — graceful no-op
      }

      if (!smsListener?.addListener) return;

      // ── Step 3: subscribe.
      const sub = smsListener.addListener(async (message: { originatingAddress?: string; body?: string }) => {
        try {
          const sender = message?.originatingAddress || '';
          const body = message?.body || '';
          if (!looksLikeBankSMS(sender, body)) return;

          // Throttle: cap to 5 fires/sec (200ms minimum gap).
          const now = Date.now();
          if (now - lastFiredAt.current < 200) return;
          lastFiredAt.current = now;

          // Reuse the existing batch endpoint (idempotent on hash).
          await api.post('/sms/bulk-parse', {
            messages: [`${sender ? `[${sender}] ` : ''}${body}`],
          });
        } catch {
          /* ingestion failure — never propagate to UI */
        }
      });

      subscriptionRef.current = sub || null;
    })();

    return () => {
      alive = false;
      try { subscriptionRef.current?.remove?.(); } catch { /* noop */ }
      subscriptionRef.current = null;
    };
  }, [authToken]);
}

export default useSMSListener;
