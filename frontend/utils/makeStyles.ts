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
 *
 * TYPE NOTE (Round 49 cleanup):
 *   Mirrors React Native's own `StyleSheet.create<T>` signature so that
 *   LITERAL types of style props (e.g. `position: 'absolute'`) are
 *   preserved through the factory call. Using `Record<string, any>`
 *   was the single biggest source of TS2769 errors across the app.
 */
import { useMemo } from 'react';
import { StyleSheet, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { useAppColors, COLORS as SharedColors } from './theme';

type Style = ViewStyle | TextStyle | ImageStyle;
type NamedStyles<T> = { [P in keyof T]: Style };
type Colors = typeof SharedColors;

export function makeStyles<T extends NamedStyles<T> | NamedStyles<unknown>>(
  factory: (c: Colors) => T & NamedStyles<unknown>,
) {
  return function useStyles(): T {
    const c = useAppColors();
    return useMemo(() => StyleSheet.create(factory(c) as any) as T, [c]);
  };
}
