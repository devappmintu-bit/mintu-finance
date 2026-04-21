/**
 * useFocusRefresh — hook to refetch data whenever the parent tab/stack regains focus.
 *
 * Works everywhere expo-router's <Tabs> / <Stack> mounts this hook. Pass any
 * async loader; it runs on:
 *   • initial mount
 *   • every subsequent focus event
 *
 * Handy for profile sub-cards that should always show the latest backend state
 * without the user having to pull-to-refresh.
 *
 *   useFocusRefresh(loadCoinsStatus);
 */
import { useCallback, useEffect, DependencyList } from 'react';
import { useFocusEffect } from 'expo-router';

export default function useFocusRefresh(loader: () => void | Promise<void>, deps: DependencyList = []) {
  const run = useCallback(() => { try { loader(); } catch { /* noop */ } }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  useFocusEffect(useCallback(() => { run(); }, [run]));
}
