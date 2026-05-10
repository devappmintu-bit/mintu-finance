/**
 * haptics.ts — MintU Unified Haptic Engine (R115 Sprint-1).
 *
 * Semantic, intent-based haptic API. Replaces ~120 scattered
 * `Haptics.impactAsync(...)` / `Haptics.selectionAsync()` calls with a
 * meaning-first interface. Gives us:
 *
 *   • One tunable knob — change the *physical* feel of the entire app
 *     by editing this file alone.
 *   • Web safety — every method is a no-op on web (silent try/catch).
 *   • Reduced-haptics respect — single global toggle (e.g. battery saver).
 *   • Auditability — `grep -R 'haptic\.'` lists every touchpoint and its
 *     intent in one shot.
 *
 * Intent vocabulary
 * -----------------
 *  • select   — tab switch, segment toggle, chip pick, menu pick (LIGHT)
 *  • tap      — generic button press / icon tap                  (LIGHT)
 *  • press    — committed action — FAB open, mascot tap          (MEDIUM)
 *  • navigate — screen push that the user just initiated         (LIGHT)
 *  • success  — save success, optimistic confirm                 (NOTIF SUCCESS)
 *  • warn     — caution / soft error ("can't do that yet")       (NOTIF WARNING)
 *  • error    — actual failure                                   (NOTIF ERROR)
 *  • celebrate— first transaction, milestone reached             (HEAVY)
 *  • settle   — split settled, payment complete                  (NOTIF SUCCESS)
 *  • payment  — money about to leave (haptic right before commit)(MEDIUM)
 *  • reward   — coin earned, achievement                         (NOTIF SUCCESS)
 *
 * Anything that doesn't map to one of the above — re-evaluate the UX,
 * don't add a new haptic intent without a strong reason.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let _disabled = false;

export function setHapticsEnabled(enabled: boolean) { _disabled = !enabled; }
export function areHapticsEnabled() { return !_disabled; }

const _safe = (fn: () => unknown) => {
  if (Platform.OS === 'web' || _disabled) return;
  try { fn(); } catch { /* swallow — haptics are non-critical */ }
};

export const haptic = {
  // ── Selection / Navigation ──────────────────────────────────────────
  select:    () => _safe(() => Haptics.selectionAsync()),
  navigate:  () => _safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  // ── Taps ────────────────────────────────────────────────────────────
  tap:       () => _safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  press:     () => _safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  // ── Outcome feedback ───────────────────────────────────────────────
  success:   () => _safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn:      () => _safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error:     () => _safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),

  // ── Domain-specific ─────────────────────────────────────────────────
  payment:   () => _safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  settle:    () => _safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  reward:    () => _safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  // ── Celebration (heavy / notification combo) ───────────────────────
  celebrate: () => {
    _safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    setTimeout(
      () => _safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
      120,
    );
  },
};

export default haptic;
