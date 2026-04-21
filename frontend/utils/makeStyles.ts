/**
 * makeStyles — theme-reactive StyleSheet factory.
 *
 * Phase 2 migration pattern. Replaces the legacy `const styles =
 * StyleSheet.create({...})` at module top-level with a component-level
 * factory driven by `useAppColors()`. Stylesheets now rebuild whenever
 * the user flips light↔dark, so ALL values inside respect the current
 * theme.
 *
 * Usage:
 *   import { makeStyles } from '../../utils/makeStyles';
 *
 *   const useStyles = makeStyles((c) => ({
 *     container: { backgroundColor: c.bg.primary },
 *     title:     { color: c.text.primary, fontSize: 22 },
 *   }));
 *
 *   function Screen() {
 *     const styles = useStyles();
 *     // …
 *   }
 *
 * The returned `useStyles()` hook subscribes to theme changes via
 * `useAppColors()` and memoises the sheet so object identity is stable
 * within a theme.
 */
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useAppColors, COLORS as SharedColors } from './theme';

type StyleObject = Record<string, any>;
type Colors = typeof SharedColors;

export function makeStyles<T extends StyleObject>(factory: (c: Colors) => T) {
  return function useStyles(): T {
    const c = useAppColors();
    return useMemo(() => StyleSheet.create(factory(c)) as unknown as T, [c]);
  };
}
