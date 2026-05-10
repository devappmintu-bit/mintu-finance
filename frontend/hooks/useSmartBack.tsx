/**
 * useSmartBack — R114 universal back-navigation engine.
 *
 * Centralised back orchestration for every secondary screen in MintU.
 * Solves seven failure modes that the raw `router.back()` cannot:
 *
 *   1. ✅ Empty-stack deep-link fallback — user lands on `/legal/privacy`
 *      from a push notif, taps back, and Android exits the app instead
 *      of going to `/(tabs)`. We force a `router.replace('/(tabs)')`
 *      when `router.canGoBack()` is false.
 *
 *   2. ✅ Modal-aware back — if a `BottomSheetModal` is open, back
 *      should dismiss the sheet first, NOT pop the screen behind it.
 *      Callers register their open sheets via `registerModalDismiss`.
 *
 *   3. ✅ Unsaved-changes confirmation — forms can register a `dirty`
 *      flag via `registerDirtyGuard`. If dirty, we surface an
 *      `Alert.alert("Discard changes?", ...)` before backing out.
 *
 *   4. ✅ Android hardware back — `BackHandler.addEventListener` is
 *      hooked once in this hook so every screen automatically respects
 *      the same orchestration. Returning `true` from the handler
 *      tells RN to swallow the OS back event.
 *
 *   5. ✅ Crash-safe restoration — if `router.back()` throws (rare
 *      navigator-state corruption on hot reload), we fall back to
 *      `router.replace('/(tabs)')`.
 *
 *   6. ✅ Onboarding interruption — if the user is mid-`/onboarding/income`
 *      we DO NOT let them back out. The `gestureEnabled: false` in
 *      `_layout.tsx` guards swipes; this hook guards Android back.
 *
 *   7. ✅ Auth-locked back — when the app is locked at `/unlock`, the
 *      hardware back is a no-op (cannot escape the lock screen).
 *
 * Usage:
 * ------
 *   In a screen header (preferred path):
 *     <BrutalScreenHeader title="GOALS" />   // already wired
 *
 *   In a custom CTA:
 *     const back = useSmartBack();
 *     <Pressable onPress={back}>...</Pressable>
 *
 *   In a form with unsaved-changes guard:
 *     const back = useSmartBack();
 *     useDirtyGuard(formIsDirty);  // registers + cleans up automatically
 *
 *   In a sheet host:
 *     useModalDismiss(«dismiss-sheet»);    // returns `true` if it dismissed
 *
 * Performance:
 * ------------
 *   - The `BackHandler` listener is registered exactly ONCE per app
 *     lifecycle inside `<SmartBackProvider />` (mounted in _layout).
 *   - Per-screen `back()` is a stable referenced via `useCallback`
 *     so it doesn't trigger re-renders in `BrutalScreenHeader`.
 *   - Modal/dirty registries use refs (no re-render on register/clear).
 */
import { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { router, usePathname } from 'expo-router';

// ---------------------------------------------------------------------------
// Module-level registries (singleton). Refs because we don't want React
// re-renders for register / unregister calls — they're hot paths.
// ---------------------------------------------------------------------------

type DirtyGuard = () => boolean; // returns true if there are unsaved changes
type ModalDismiss = () => boolean; // returns true if a modal was dismissed

const dirtyGuards = new Set<DirtyGuard>();
const modalDismissers = new Set<ModalDismiss>();

// Routes from which we MUST NOT allow back-out (hardware or otherwise).
const BLOCKED_BACK_ROUTES = new Set<string>([
  '/unlock',
  '/onboarding/income',
  '/auth',
]);

// Default fallback when `router.canGoBack()` is false.
const DEFAULT_FALLBACK = '/(tabs)';

// ---------------------------------------------------------------------------
// Public API — hooks consumed by screens / components.
// ---------------------------------------------------------------------------

/**
 * Returns a stable `back()` callback that orchestrates the full back logic.
 * @param fallbackRoute  Optional override of the default `/(tabs)` fallback.
 */
export function useSmartBack(fallbackRoute: string = DEFAULT_FALLBACK): () => void {
  const pathname = usePathname();

  return useCallback(() => {
    // Layer 1: Hard block on certain routes (auth/unlock/onboarding-income).
    if (BLOCKED_BACK_ROUTES.has(pathname)) {
      return;
    }

    // Layer 2: If a modal is open, dismiss it FIRST.
    for (const dismiss of modalDismissers) {
      try {
        if (dismiss()) return; // modal handled it
      } catch { /* ignore */ }
    }

    // Layer 3: If a form is dirty, confirm before navigating away.
    for (const guard of dirtyGuards) {
      try {
        if (guard()) {
          Alert.alert(
            'Discard changes?',
            'Your edits haven\u2019t been saved. Leave anyway?',
            [
              { text: 'Stay', style: 'cancel' },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  // Clear all guards so the alert doesn't refire on re-entry.
                  dirtyGuards.clear();
                  navigateBack(fallbackRoute);
                },
              },
            ],
          );
          return;
        }
      } catch { /* ignore */ }
    }

    // Layer 4: Plain navigation — prefer back, fall back to replace.
    navigateBack(fallbackRoute);
  }, [pathname, fallbackRoute]);
}

function navigateBack(fallbackRoute: string) {
  try {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as any);
    }
  } catch {
    // Last-ditch fallback if navigator state is corrupted.
    try { router.replace(fallbackRoute as any); } catch { /* noop */ }
  }
}

/**
 * Register a dirty-form guard for the lifetime of the calling screen.
 * The guard fn returns `true` when the form has unsaved changes.
 */
export function useDirtyGuard(isDirty: boolean | (() => boolean)) {
  const ref = useRef<DirtyGuard | null>(null);
  useEffect(() => {
    const guard: DirtyGuard = () =>
      typeof isDirty === 'function' ? isDirty() : !!isDirty;
    ref.current = guard;
    dirtyGuards.add(guard);
    return () => {
      dirtyGuards.delete(guard);
      ref.current = null;
    };
  }, [isDirty]);
}

/**
 * Register a modal dismiss handler for the lifetime of the calling sheet.
 * The handler should dismiss its sheet and return `true` if it did so.
 */
export function useModalDismiss(dismiss: ModalDismiss) {
  const ref = useRef<ModalDismiss | null>(null);
  useEffect(() => {
    ref.current = dismiss;
    modalDismissers.add(dismiss);
    return () => {
      modalDismissers.delete(dismiss);
      ref.current = null;
    };
  }, [dismiss]);
}

// ---------------------------------------------------------------------------
// SmartBackProvider — mounted ONCE inside `<RootLayout />`.
// Hooks the Android hardware-back button into the same orchestration.
// ---------------------------------------------------------------------------

import React from 'react';

export function SmartBackProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Stable ref to the latest pathname — the BackHandler subscription is
  // only registered ONCE so we read the current value via a ref.
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const path = pathRef.current;

      // Hard-block routes (return true to swallow the event).
      if (BLOCKED_BACK_ROUTES.has(path)) return true;

      // Modal first.
      for (const dismiss of modalDismissers) {
        try { if (dismiss()) return true; } catch { /* ignore */ }
      }

      // Dirty form confirmation.
      for (const guard of dirtyGuards) {
        try {
          if (guard()) {
            Alert.alert(
              'Discard changes?',
              'Your edits haven\u2019t been saved. Leave anyway?',
              [
                { text: 'Stay', style: 'cancel' },
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: () => {
                    dirtyGuards.clear();
                    navigateBack(DEFAULT_FALLBACK);
                  },
                },
              ],
            );
            return true;
          }
        } catch { /* ignore */ }
      }

      // Plain back. Returning `false` lets RN handle it (which respects
      // navigator history). Only INTERCEPT (return true) when we have
      // a special case OR when the stack would empty out.
      try {
        if (router.canGoBack()) {
          // Let RN do its thing.
          return false;
        }
        // Stack is empty AND we're outside a tab — force-route to /(tabs)
        // instead of letting Android exit.
        if (!path.startsWith('/(tabs)') && path !== '/' && path !== '/index') {
          router.replace(DEFAULT_FALLBACK as any);
          return true;
        }
      } catch { /* ignore */ }

      return false;
    });

    return () => sub.remove();
  }, []);

  return <>{children}</>;
}

export default useSmartBack;
