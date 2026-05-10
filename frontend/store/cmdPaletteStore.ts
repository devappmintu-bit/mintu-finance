/**
 * cmdPaletteStore.ts — R117 Sprint power-user nav.
 *
 * Tiny Zustand store that controls the global Cmd Palette overlay.
 * Anywhere in the app: `useCmdPaletteStore.getState().open()`.
 */
import { create } from 'zustand';

interface CmdPaletteStore {
  visible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCmdPaletteStore = create<CmdPaletteStore>((set) => ({
  visible: false,
  open:   () => set({ visible: true }),
  close:  () => set({ visible: false }),
  toggle: () => set((s) => ({ visible: !s.visible })),
}));

export default useCmdPaletteStore;
