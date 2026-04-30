/**
 * aiPromptStore — Round 59. Tiny global handoff for the AI Quick
 * Prompt feature. The QuickSheet (or any future surface) sets a
 * pending prompt; AICoachChat consumes it on mount and auto-fires
 * the message, then clears the slot.
 *
 * Why a store and not a router param: the AI coach lives on a tab
 * (`/(tabs)/ai-coach` non-href, mounted from the center mascot
 * button) so we can't reliably pass searchParams across the tab
 * navigator. Zustand is already in the project and gives a clean
 * pub/sub.
 */
import { create } from 'zustand';

interface AIPromptState {
  pending: string | null;
  set: (prompt: string) => void;
  consume: () => string | null;
}

export const useAIPrompt = create<AIPromptState>((set, get) => ({
  pending: null,
  set: (prompt) => set({ pending: prompt }),
  consume: () => {
    const p = get().pending;
    if (p) set({ pending: null });
    return p;
  },
}));
