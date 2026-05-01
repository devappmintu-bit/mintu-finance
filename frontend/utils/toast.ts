/**
 * utils/toast.ts — canonical Toast.show wrappers.
 *
 * Why this exists
 * ---------------
 * The same Toast.show({type: 'success'/'error', text1: '…', text2: '…'})
 * shape was repeated across many screens with inconsistent props and
 * missing visibilityTime. Messages like "Error", "Could not share",
 * "Spin failed" were duplicated across 2-5 files each.
 *
 * These wrappers:
 *   • Enforce a consistent visibility time (3s default)
 *   • Guarantee type + position defaults
 *   • Provide semantic helpers (showError, showSuccess, showInfo)
 *   • Let us swap the Toast library in one place later
 *
 * Usage
 * -----
 *   import { showError, showSuccess } from '@/utils/toast';
 *   showSuccess('Done!');
 *   showError('Could not save', 'Please try again in a moment.');
 */
import Toast from 'react-native-toast-message';

const DEFAULTS = {
  position: 'bottom' as const,
  visibilityTime: 3000,
  autoHide: true,
};

export function showSuccess(text1: string, text2?: string): void {
  Toast.show({ type: 'success', text1, text2, ...DEFAULTS });
}

export function showError(text1: string, text2?: string): void {
  Toast.show({ type: 'error', text1, text2, ...DEFAULTS, visibilityTime: 4000 });
}

export function showInfo(text1: string, text2?: string): void {
  Toast.show({ type: 'info', text1, text2, ...DEFAULTS });
}

/** Shortcut for the most-duplicated banner across the app. */
export function showGenericError(text2: string = 'Something went wrong. Please try again.'): void {
  showError('Error', text2);
}

/** Copied-to-clipboard confirmation — 4 sites used the exact same copy. */
export function showCopied(): void {
  showSuccess('Copied to clipboard');
}
