/**
 * MintU — Universal Share Helper
 * Cross-platform share that never crashes:
 * - Native (iOS/Android): uses React Native Share API
 * - Web: uses navigator.share if available, else clipboard fallback
 * - Fallback: Toast "Link copied to clipboard"
 *
 * Usage:
 *   import { shareSmart } from '../utils/share';
 *   await shareSmart({ message: 'Text', url: 'https://…', title: 'MintU' });
 */
import { Platform, Share as RNShare } from 'react-native';
import Toast from 'react-native-toast-message';

// Native clipboard (RN ships Clipboard but lives in @react-native-clipboard/clipboard community pkg).
// To avoid extra deps, we use platform-specific access:
// - Web: navigator.clipboard.writeText
// - Native: Share API with message only (user copies from share sheet)
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
        return true;
      }
      // Legacy fallback
      if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      }
      return false;
    }
    // Native: use Share API as effective clipboard (user gets a "Copy" option in share sheet)
    const r = await RNShare.share({ message: text });
    return r.action === RNShare.sharedAction;
  } catch {
    return false;
  }
}

export type ShareOpts = {
  message: string;
  url?: string;
  title?: string;
  /** If WhatsApp is preferred, try to open it directly (mobile only). */
  preferWhatsApp?: boolean;
  /** WhatsApp phone in international format digits only (e.g. "9876543210") — if provided, sends to this contact */
  whatsappPhone?: string;
};

const clipboardFallback = async (text: string) => {
  const ok = await writeClipboard(text);
  if (ok) {
    Toast.show({ type: 'success', text1: 'Copied to clipboard', text2: 'Paste it anywhere to share', position: 'bottom' });
    return { success: true, method: 'clipboard' };
  }
  Toast.show({ type: 'error', text1: 'Could not share', text2: 'Please copy the text manually', position: 'bottom' });
  return { success: false, method: 'none' };
};

const tryWhatsApp = async (text: string, phone?: string) => {
  try {
    const { Linking } = await import('react-native');
    const phoneSegment = phone ? phone.replace(/\D/g, '') : '';
    // Mobile scheme
    const mobileUrl = `whatsapp://send?${phoneSegment ? `phone=${phoneSegment}&` : ''}text=${encodeURIComponent(text)}`;
    // Universal wa.me (works on web + mobile)
    const universalUrl = `https://wa.me/${phoneSegment}?text=${encodeURIComponent(text)}`;

    if (Platform.OS !== 'web') {
      const canOpen = await Linking.canOpenURL(mobileUrl);
      if (canOpen) {
        await Linking.openURL(mobileUrl);
        return { success: true, method: 'whatsapp_native' };
      }
    }
    await Linking.openURL(universalUrl);
    return { success: true, method: 'whatsapp_web' };
  } catch {
    return { success: false, method: 'none' };
  }
};

export async function shareSmart(opts: ShareOpts): Promise<{ success: boolean; method: string }> {
  const text = opts.url ? `${opts.message}\n${opts.url}` : opts.message;

  // 1. WhatsApp preference
  if (opts.preferWhatsApp || opts.whatsappPhone) {
    const r = await tryWhatsApp(text, opts.whatsappPhone);
    if (r.success) return r;
  }

  // 2. Web path
  if (Platform.OS === 'web') {
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) {
        await nav.share({
          title: opts.title || 'MintU',
          text: opts.message,
          url: opts.url,
        });
        return { success: true, method: 'navigator_share' };
      }
    } catch (e: any) {
      // User cancelled or browser blocked — fall through to clipboard
      if (e?.name === 'AbortError') return { success: false, method: 'cancelled' };
    }
    return await clipboardFallback(text);
  }

  // 3. Native path
  try {
    const result = await RNShare.share({
      message: opts.message,
      url: opts.url,
      title: opts.title || 'MintU',
    });
    if (result.action === RNShare.sharedAction) return { success: true, method: 'native_share' };
    if (result.action === RNShare.dismissedAction) return { success: false, method: 'dismissed' };
    return { success: true, method: 'native_share' };
  } catch {
    // Native share failed → fall through to clipboard
    return await clipboardFallback(text);
  }
}

/** Quick copy helper — copies a string + shows toast. */
export async function copyToClipboard(text: string, successMsg = 'Copied!'): Promise<boolean> {
  const ok = await writeClipboard(text);
  Toast.show({ type: ok ? 'success' : 'error', text1: ok ? successMsg : 'Could not copy', position: 'bottom' });
  return ok;
}

/**
 * Share an image captured via react-native-view-shot.
 * - Native: uses expo-sharing which opens the OS share sheet (WhatsApp/Instagram/Photos).
 * - Web: tries navigator.share({ files:[pngBlob] }) so WhatsApp Web / Twitter get a
 *   real image; falls back to triggering a PNG download, then last-resort text share.
 * Accepts either a file URI (native) or data URL (web).
 */
export async function shareImageSmart(opts: {
  uri: string;
  fallbackText?: string;
  filename?: string;
}): Promise<{ success: boolean; method: string }> {
  const filename = opts.filename || 'mintu-score.png';

  if (Platform.OS === 'web') {
    // 1) Prefer navigator.share({ files }) — lets WhatsApp Web / Twitter receive
    //    a real PNG instead of just text.
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.canShare && nav?.share && opts.uri.startsWith('data:')) {
        // Convert data URL → Blob → File
        const res = await fetch(opts.uri);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: 'image/png' });
        if (nav.canShare({ files: [file] })) {
          try {
            await nav.share({
              files: [file],
              title: 'My MintU Money Score',
              text: opts.fallbackText || 'Check out my MintU score!',
            });
            return { success: true, method: 'web_share_file' };
          } catch (e: any) {
            if (e?.name === 'AbortError') return { success: false, method: 'cancelled' };
            // fall through to download
          }
        }
      }
    } catch {
      // fall through
    }

    // 2) Trigger a PNG download (user can then upload to WhatsApp/IG).
    try {
      if (opts.uri.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = opts.uri;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        Toast.show({
          type: 'success',
          text1: '✅ Image saved!',
          text2: 'Share it on WhatsApp, Instagram or anywhere',
          position: 'bottom',
        });
        return { success: true, method: 'web_download' };
      }
      if (typeof window !== 'undefined') {
        window.open(opts.uri, '_blank');
        return { success: true, method: 'web_open' };
      }
    } catch {
      // fall through
    }

    // 3) Last-resort text share
    if (opts.fallbackText) {
      return await shareSmart({ message: opts.fallbackText, title: 'MintU' });
    }
    return { success: false, method: 'none' };
  }

  // Native: use expo-sharing for image files
  try {
    const Sharing = await import('expo-sharing');
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(opts.uri, {
        dialogTitle: 'Share your MintU score',
        mimeType: 'image/png',
        UTI: 'public.png',
      });
      return { success: true, method: 'expo_sharing' };
    }
  } catch {
    // fall through
  }

  // Fallback: native text share
  if (opts.fallbackText) {
    return await shareSmart({ message: opts.fallbackText, title: 'MintU' });
  }
  return { success: false, method: 'none' };
}
