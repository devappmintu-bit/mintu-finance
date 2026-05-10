/**
 * useNavigationMemory — R114 scroll & filter restoration store.
 *
 * Lightweight, in-memory key-value store that lets any screen save its
 * scroll position, filter state, tab index, etc. when navigating away,
 * then restore it on return. Survives stack pushes & pops within a
 * single app session (cleared on cold start — by design, since
 * cold-start should always show fresh data).
 *
 * Why not zustand persist?
 *   - We do NOT want this to survive cold-start (would leak old state
 *     into a fresh session).
 *   - We do NOT want any disk I/O on every scroll-event throttle.
 *   - Memory only — fastest possible.
 *
 * Usage:
 * ------
 *   // In a list screen:
 *   const { saveScroll, getScroll } = useScrollMemory('transactions');
 *   useEffect(() => {
 *     const offset = getScroll();
 *     if (offset > 0) listRef.current?.scrollToOffset({ offset, animated: false });
 *   }, []);
 *   <FlatList
 *     onScroll={(e) => saveScroll(e.nativeEvent.contentOffset.y)}
 *     scrollEventThrottle={250}
 *   />
 *
 *   // For arbitrary state (e.g. filter chip selection):
 *   const { setMemo, getMemo } = useNavigationMemory();
 *   setMemo('txn:active-filter', { category: 'food', month: '2026-05' });
 *   const filter = getMemo('txn:active-filter');
 */
import { useCallback } from 'react';

// Module-level singleton. Cleared on cold start (module re-evaluation).
const memo = new Map<string, any>();
const scroll = new Map<string, number>();

export function useNavigationMemory() {
  const setMemo = useCallback((key: string, value: any) => {
    memo.set(key, value);
  }, []);
  const getMemo = useCallback(<T = any>(key: string): T | undefined => {
    return memo.get(key) as T | undefined;
  }, []);
  const clearMemo = useCallback((key: string) => {
    memo.delete(key);
  }, []);
  const clearAllMemo = useCallback(() => {
    memo.clear();
    scroll.clear();
  }, []);
  return { setMemo, getMemo, clearMemo, clearAllMemo };
}

export function useScrollMemory(screenKey: string) {
  const saveScroll = useCallback((offset: number) => {
    scroll.set(screenKey, offset);
  }, [screenKey]);
  const getScroll = useCallback((): number => {
    return scroll.get(screenKey) ?? 0;
  }, [screenKey]);
  const clearScroll = useCallback(() => {
    scroll.delete(screenKey);
  }, [screenKey]);
  return { saveScroll, getScroll, clearScroll };
}

/**
 * Clear all scroll + memo entries. Call from `clearSessionState` so a
 * logout doesn't leak state to the next user.
 */
export function clearAllNavigationMemory() {
  memo.clear();
  scroll.clear();
}
