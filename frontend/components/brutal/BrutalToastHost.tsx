/**
 * BrutalToastHost — global mount-point for celebration banners.
 *
 * Mounted once in `app/_layout.tsx` so any screen can fire toasts via
 * `showBrutalToast(...)` without prop-drilling. Wraps the `BrutalToast`
 * primitive and binds its lifecycle to the Zustand store.
 */
import React from 'react';
import { useBrutalToastStore } from '../../store/brutalToastStore';
import BrutalToast from './BrutalToast';

export default function BrutalToastHost() {
  const { message, tone, hold, hide } = useBrutalToastStore();
  return (
    <BrutalToast
      message={message}
      tone={tone}
      hold={hold}
      onDismiss={hide}
      top={64}
    />
  );
}
