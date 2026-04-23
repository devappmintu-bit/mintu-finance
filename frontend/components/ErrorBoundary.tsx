/**
 * ErrorBoundary — root-level safety net for unexpected React render errors.
 *
 * Catches any render-time crash anywhere below it, shows a branded recovery
 * screen with a "Try again" button that remounts the subtree, and logs the
 * full error+stack to console for debugging. Without this, a single JSX
 * crash would blank the entire app.
 *
 * Round 30b: migrated to a function component so theme toggles propagate
 * via useAppColors without needing the parent Stack to remount.
 *
 * Does NOT catch:
 *   • Async errors (Promise rejections, setTimeout)
 *   • Errors thrown in event handlers (React by design)
 *   • SSR errors (we render client-side only on Expo web)
 */
import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppColors } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

interface State { hasError: boolean; error: Error | null }

interface ErrorFallbackProps { error: Error | null; reset: () => void }
function ErrorFallback({ error, reset }: ErrorFallbackProps) {
  const c = useAppColors();
  const s = useStyles();
  const msg = error?.message || 'Something went sideways';
  const isDev = __DEV__;
  return (
    <View style={s.wrap}>
      <View style={s.iconWrap}>
        <Ionicons name="alert-circle" size={44} color={c.state.danger} />
      </View>
      <Text style={s.title}>We hit a bump</Text>
      <Text style={s.subtitle}>
        A glitch prevented this screen from loading. Tap below to try again.
      </Text>
      {isDev ? (
        <View style={s.devBox}>
          <Text style={s.devLabel}>DEV — error</Text>
          <Text style={s.devMsg} numberOfLines={5}>{msg}</Text>
        </View>
      ) : null}
      <TouchableOpacity style={s.btn} onPress={reset} activeOpacity={0.85}>
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={s.btnTxt}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[MintU:ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback error={this.state.error} reset={this.reset} />;
  }
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24, backgroundColor: c.bg.primary,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: c.state.dangerBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: '800', color: c.text.primary, letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '500', color: c.text.muted, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  devBox: {
    marginTop: 16, padding: 12, borderRadius: 10,
    backgroundColor: c.bg.secondary,
    borderWidth: 1, borderColor: c.state.dangerBorder,
    maxWidth: 360,
  },
  devLabel: { fontSize: 10, fontWeight: '900', color: c.state.danger, letterSpacing: 1 },
  devMsg: { fontSize: 12, fontWeight: '600', color: c.text.primary, marginTop: 6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.accent.primary,
    paddingHorizontal: 22, paddingVertical: 13,
    borderRadius: 999, marginTop: 22,
  },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
}));
